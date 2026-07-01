import OpenAI from "openai";
import { prisma } from "../lib/prisma.js";
import { log } from "../lib/logger.js";
import { saveAgentLog } from "../lib/agent-log.js";
import { TOOLS } from "../tools/definitions.js";
import { executeTool } from "../tools/executor.js";

const MAX_STEPS = 5;

const PRIORITY_LABELS: Record<string, string> = {
  low: "baixa 🟢",
  medium: "media 🔵",
  high: "alta 🟡",
  urgent: "urgente 🔴",
};

interface ReplyEvent {
  remoteJid: string;
  message: string;
  ownerServerUrl: string;
  ownerInstanceToken: string;
}

export async function processReply(event: ReplyEvent): Promise<void> {
  const { remoteJid, message } = event;

  log.info("REPLY", `Message from ${remoteJid.substring(0, 6)}...: "${message.substring(0, 80)}"`);

  // Find team member by remoteJid — try exact match, then with/without 9 after country+DDD
  const digits = remoteJid.replace("@s.whatsapp.net", "");
  const jidVariants = [remoteJid];

  // BR numbers: Evolution may strip or add the 9 after DDD (55XX9... vs 55XX...)
  if (digits.startsWith("55") && digits.length === 12) {
    jidVariants.push(`${digits.slice(0, 4)}9${digits.slice(4)}@s.whatsapp.net`);
  } else if (digits.startsWith("55") && digits.length === 13) {
    jidVariants.push(`${digits.slice(0, 4)}${digits.slice(5)}@s.whatsapp.net`);
  }

  const member = await prisma.teamMember.findFirst({
    where: { remoteJid: { in: jidVariants } },
  });

  if (!member) {
    log.warn("REPLY", `No team member found for jid ${remoteJid} (tried ${jidVariants.length} variants)`);
    return;
  }

  // Find tasks assigned to this member in dynamic blocks that expect a response (have branches)
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: member.id,
      blockId: { not: null },
      block: { blockType: "message" },
    },
    include: {
      block: {
        include: {
          phase: {
            include: {
              pipeline: {
                include: {
                  owner: { include: { aiConfig: true } },
                  phases: {
                    include: { blocks: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Filter: only tasks in blocks that expect a response (have branches or prompt with no_reply)
  // AND that have been processed (message was sent by agent) — ignore if agent hasn't spoken yet
  const actionableTasks = tasks.filter((t) => {
    const config = (t.block?.config || {}) as Record<string, unknown>;
    const hasBranches = Array.isArray(config.branches) && (config.branches as unknown[]).length > 0;
    const hasNoReply = !!(config.no_reply_minutes);
    if (!hasBranches && !hasNoReply) return false;

    // Only respond if agent already sent a message (processedAt is set and >= enteredAt)
    const tRaw = t as unknown as Record<string, unknown>;
    const processedAt = tRaw.processedAt as Date | null;
    if (!processedAt) return false; // Agent hasn't sent message yet — ignore reply
    if (new Date(processedAt).getTime() < new Date(t.enteredAt).getTime()) return false; // Re-entered block, not yet processed

    return true;
  });

  if (actionableTasks.length === 0) {
    log.info("REPLY", `No actionable tasks (no branches/no_reply configured) for member ${member.name}`);
    return;
  }

  // ─── ONE TASK AT A TIME ────────────────────────────────────────────────
  const sorted = [...actionableTasks].sort((a, b) => {
    const aTime = (a as unknown as Record<string, unknown>).processedAt as Date | null;
    const bTime = (b as unknown as Record<string, unknown>).processedAt as Date | null;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });

  const activeTask = sorted[0];
  const singleTaskList = [activeTask];

  if (actionableTasks.length > 1) {
    log.info("REPLY", `Member ${member.name} has ${actionableTasks.length} actionable tasks — processing oldest: "${activeTask.title}"`);
  }

  // Group tasks by pipeline owner to use their OpenAI key
  const byOwner = new Map<string, typeof actionableTasks>();
  for (const task of singleTaskList) {
    const ownerId = task.block!.phase.pipeline.ownerId;
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, []);
    byOwner.get(ownerId)!.push(task);
  }

  for (const [ownerId, ownerTasks] of byOwner) {
    const pipeline = ownerTasks[0].block!.phase.pipeline;
    const apiKey = pipeline.owner.aiConfig?.openaiApiKey;

    if (!apiKey) {
      log.warn("REPLY", `No OpenAI key for owner ${ownerId}`);
      continue;
    }

    // Build context for LLM
    const taskDetails = ownerTasks.map((t) => {
      const config = (t.block?.config || {}) as Record<string, unknown>;
      const allBlocks = t.block?.phase.pipeline.phases.flatMap((p) =>
        p.blocks.map((b) => ({ id: b.id, name: b.name, phaseName: p.name }))
      ) || [];

      const branches = (config.branches as Array<Record<string, unknown>>) || [];
      const branchInfo = branches.length > 0
        ? `\nROTEAMENTO CONDICIONAL (escolha UM caminho baseado na resposta):\n${branches.map((b, i) => {
            const retryMin = Number(b.retry_minutes) || 0;
            if (retryMin > 0) {
              return `  Caminho ${i + 1}: "${b.label}" — condicao: "${b.condition}" — acao: retry_task(retry_minutes=${retryMin})`;
            }
            return `  Caminho ${i + 1}: "${b.label}" — condicao: "${b.condition}" — acao: move_task(target_block_id="${b.nextSlug}")`;
          }).join("\n")}`
        : "";

      return {
        taskId: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        blockName: t.block?.name || "",
        blockPrompt: (config.prompt as string) || (config.message as string) || "",
        delayMinutes: config.delay_minutes as number || 0,
        nextBlockId: config.next_block_id as string || "",
        branches,
        branchInfo,
        allBlocks,
      };
    });

    const allBlocksList = taskDetails[0]?.allBlocks.map((b) =>
      `  - "${b.phaseName} / ${b.name}" (id: ${b.id})`
    ).join("\n") || "";

    const tasksList = taskDetails.map((t) => {
      const pri = PRIORITY_LABELS[t.priority] || t.priority;
      return `  - "${t.title}" (id: ${t.taskId}, prioridade: ${pri}, bloco: ${t.blockName})
    Prompt do bloco: "${t.blockPrompt}"${t.branchInfo}`;
    }).join("\n");

    // Load agent messages sent for this task since it was last processed (current cycle)
    const activeTaskForHistory = ownerTasks[0];
    const processedAt = (activeTaskForHistory as unknown as Record<string, unknown>).processedAt as Date | null;
    const recentLogs = await prisma.agentLog.findMany({
      where: {
        ownerId,
        taskId: activeTaskForHistory?.id,
        type: { in: ["message_sent", "buttons_sent", "poll_sent", "list_sent"] },
        ...(processedAt ? { createdAt: { gte: new Date(processedAt) } } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    const conversationHistory = recentLogs.length > 0
      ? `\nMENSAGENS ENVIADAS PELO AGENTE NESTE CICLO (ordem cronologica):\n${recentLogs.map((l) => `  Agente: "${l.detail || l.title}"`).join("\n")}\n`
      : "";

    const systemPrompt = `Voce e o agente de automacao do Pipely AI.
Um membro do time respondeu uma mensagem no WhatsApp. Analise a resposta e decida o que fazer.

MEMBRO: ${member.name} (telefone: ${member.phone}, remoteJid: ${remoteJid})
RESPOSTA DO MEMBRO: "${message}"
${conversationHistory}
TAREFAS ATIVAS DESTE MEMBRO EM BLOCOS DINAMICOS:
${tasksList}

BLOCOS DISPONIVEIS:
${allBlocksList}

REGRAS DE ROTEAMENTO (PRIORIDADE MAXIMA):
1. Leia as MENSAGENS ENVIADAS PELO AGENTE para entender o que foi perguntado ao membro.
2. Leia a RESPOSTA DO MEMBRO e interprete no contexto da pergunta feita pelo agente.
3. Compare a resposta com CADA condicao dos branches. Escolha o branch cuja condicao MELHOR se encaixa na resposta, considerando o contexto completo da conversa.
4. Se o branch escolhido tem "REPETIR apos X minutos", use retry_task. Senao, use move_task.
5. SOMENTE use move_task/retry_task se existir um branch configurado. NUNCA invente destinos.
6. Se a resposta nao se encaixa em NENHUM branch, responda seguindo o prompt do bloco. NAO mova.
7. Se NAO houver branches configurados no bloco, NUNCA mova a tarefa.

REGRAS TECNICAS:
9. Use EXATAMENTE o remoteJid: ${remoteJid}. NUNCA invente numeros.
10. Se o envio falhar, NAO tente novamente. Use log_action e siga em frente.
11. Responda ao membro com UMA mensagem curta confirmando a acao tomada.

REGRAS DE COMUNICACAO:
- NUNCA mencione pipeline, blocos, estagios, fluxo, sistema ou qualquer termo tecnico interno.
- NUNCA use frases genericas de chatbot ou assistente virtual.
- Seja direto, curto e natural. Tom de colega de trabalho no WhatsApp.
- Use emojis com moderacao para deixar a conversa dinamica.
- Ao mencionar prioridade, use o formato: "Prioridade: [nivel] [emoji]" (baixa 🟢, media 🔵, alta 🟡, urgente 🔴).
- Use o primeiro nome da pessoa ocasionalmente.`;

    const openai = new OpenAI({ apiKey });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `O membro respondeu: "${message}".

PROCESSO OBRIGATORIO:
1. O que o agente perguntou? (releia MENSAGENS ENVIADAS)
2. O que "${message}" significa como resposta a essa pergunta?
3. Qual condicao dos branches corresponde a essa interpretacao?
4. Execute SOMENTE a acao do branch escolhido e responda ao membro.

IMPORTANTE: A resposta deve ser interpretada como resposta direta a pergunta feita. Se a pergunta foi "ja finalizou?" e a resposta foi afirmativa, a condicao correspondente e a de finalizacao, NAO a de "ainda nao".` },
    ];

    log.info("REPLY", `Processing reply for ${ownerTasks.length} task(s) of member ${member.name}`);
    const activeTaskId = ownerTasks[0]?.id;
    await saveAgentLog(ownerId, "reply_received", `Resposta recebida — ${member.name}`, `"${message}" | Tarefa: ${ownerTasks[0]?.title || "?"}`, activeTaskId);

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          tools: TOOLS,
          temperature: 0.3,
        });

        const choice = response.choices[0];
        if (!choice) break;

        messages.push(choice.message);

        if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
          if (choice.message.content) {
            log.info("REPLY", `Agent: ${choice.message.content.substring(0, 200)}`);
            await saveAgentLog(ownerId, "reply_processed", `Resposta processada — ${member.name}`, choice.message.content, activeTaskId);
          }
          break;
        }

        for (const toolCall of choice.message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          log.info("REPLY", `Tool: ${toolCall.function.name}`, args);

          const result = await executeTool(
            { name: toolCall.function.name, arguments: args },
            {
              ownerId,
              evolutionUrl: event.ownerServerUrl,
              instanceToken: event.ownerInstanceToken,
            }
          );

          // Log tool calls from replies
          const toolResult = JSON.parse(result);
          if (toolCall.function.name === "send_whatsapp_message") {
            const msgs = args.messages || [args.message];
            await saveAgentLog(ownerId, toolResult.success ? "message_sent" : "message_error", toolResult.success ? `Resposta enviada — ${member.name}` : `Erro ao responder — ${member.name}`, msgs.join(" | "), activeTaskId, args);
          } else if (toolCall.function.name === "move_task") {
            await saveAgentLog(ownerId, toolResult.success ? "task_moved" : "move_error", toolResult.success ? `Tarefa movida — "${ownerTasks[0]?.title}"` : `Erro ao mover — "${ownerTasks[0]?.title}"`, args.reason || toolResult.error, activeTaskId, args);
          } else if (toolCall.function.name === "retry_task") {
            await saveAgentLog(ownerId, toolResult.success ? "task_retry" : "retry_error", toolResult.success ? `Retry agendado — "${ownerTasks[0]?.title}"` : `Erro no retry — "${ownerTasks[0]?.title}"`, `${args.retry_minutes}min`, activeTaskId, args);
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }
    } catch (err) {
      log.error("REPLY", `Error processing reply from ${member.name}`, err);
      await saveAgentLog(ownerId, "error", `Erro ao processar resposta — ${member.name}`, String(err), activeTaskId);
    }
  }
}
