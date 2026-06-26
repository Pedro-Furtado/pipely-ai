import OpenAI from "openai";
import { prisma } from "../lib/prisma.js";
import { log } from "../lib/logger.js";
import { TOOLS } from "../tools/definitions.js";
import { executeTool } from "../tools/executor.js";

const MAX_STEPS = 5;

interface ReplyEvent {
  remoteJid: string;
  message: string;
  ownerServerUrl: string;
  ownerInstanceToken: string;
}

export async function processReply(event: ReplyEvent): Promise<void> {
  const { remoteJid, message } = event;

  log.info("REPLY", `Message from ${remoteJid.substring(0, 6)}...: "${message.substring(0, 80)}"`);

  // Find user by remoteJid — try exact match, then with/without 9 after country+DDD
  const digits = remoteJid.replace("@s.whatsapp.net", "");
  const jidVariants = [remoteJid];

  // BR numbers: Evolution may strip or add the 9 after DDD (55XX9... vs 55XX...)
  if (digits.startsWith("55") && digits.length === 12) {
    // Missing 9: 5541XXXXXXXX → add 9 after DDD: 55419XXXXXXXX
    jidVariants.push(`${digits.slice(0, 4)}9${digits.slice(4)}@s.whatsapp.net`);
  } else if (digits.startsWith("55") && digits.length === 13) {
    // Has 9: 55419XXXXXXXX → remove 9: 5541XXXXXXXX
    jidVariants.push(`${digits.slice(0, 4)}${digits.slice(5)}@s.whatsapp.net`);
  }

  const user = await prisma.user.findFirst({
    where: { remoteJid: { in: jidVariants } },
  });

  if (!user) {
    log.warn("REPLY", `No user found for jid ${remoteJid} (tried ${jidVariants.length} variants)`);
    return;
  }

  // Verify user is a team member of at least one owner
  const membership = await prisma.teamMember.findFirst({
    where: { userId: user.id, status: "accepted" },
  });

  if (!membership) {
    log.info("REPLY", `User ${user.name} is not a team member, ignoring`);
    return;
  }

  // Find tasks assigned to this user in dynamic blocks that expect a response (have branches)
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: user.id,
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
                  phases: {
                    include: { blocks: true },
                  },
                },
              },
            },
          },
        },
      },
      creator: {
        include: { aiConfig: true },
      },
    },
  });

  // Filter: only tasks in blocks that expect a response (have branches or prompt with no_reply)
  const actionableTasks = tasks.filter((t) => {
    const config = (t.block?.config || {}) as Record<string, unknown>;
    const hasBranches = Array.isArray(config.branches) && (config.branches as unknown[]).length > 0;
    const hasNoReply = !!(config.no_reply_minutes);
    return hasBranches || hasNoReply;
  });

  if (actionableTasks.length === 0) {
    log.info("REPLY", `No actionable tasks (no branches/no_reply configured) for user ${user.name}`);
    return;
  }

  // ─── ONE TASK AT A TIME ────────────────────────────────────────────────
  // Only process the oldest processed task (the one the user is replying to).
  // Sort by processedAt ASC — the first processed task is the one that was sent first.
  const sorted = [...actionableTasks].sort((a, b) => {
    const aTime = (a as unknown as Record<string, unknown>).processedAt as Date | null;
    const bTime = (b as unknown as Record<string, unknown>).processedAt as Date | null;
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });

  // Take only the first (oldest processed) task
  const activeTask = sorted[0];
  const singleTaskList = [activeTask];

  if (actionableTasks.length > 1) {
    log.info("REPLY", `User ${user.name} has ${actionableTasks.length} actionable tasks — processing oldest: "${activeTask.title}"`);
  }

  // Group tasks by creator (owner) to use their OpenAI key
  const byCreator = new Map<string, typeof actionableTasks>();
  for (const task of singleTaskList) {
    const cid = task.creatorId;
    if (!byCreator.has(cid)) byCreator.set(cid, []);
    byCreator.get(cid)!.push(task);
  }

  for (const [creatorId, creatorTasks] of byCreator) {
    const creator = creatorTasks[0].creator;
    const apiKey = creator.aiConfig?.openaiApiKey;

    if (!apiKey) {
      log.warn("REPLY", `No OpenAI key for creator ${creatorId}`);
      continue;
    }

    // Build context for LLM
    const taskDetails = creatorTasks.map((t) => {
      const config = (t.block?.config || {}) as Record<string, unknown>;
      const allBlocks = t.block?.phase.pipeline.phases.flatMap((p) =>
        p.blocks.map((b) => ({ id: b.id, name: b.name, phaseName: p.name }))
      ) || [];

      const branches = (config.branches as Array<Record<string, unknown>>) || [];
      const branchInfo = branches.length > 0
        ? `\nROTEAMENTO CONDICIONAL:\n${branches.map((b, i) => {
            const retryMin = Number(b.retry_minutes) || 0;
            if (retryMin > 0) {
              return `  Caminho ${i + 1}: "${b.label}" → REPETIR apos ${retryMin} minutos (condicao: ${b.condition}). Use retry_task com retry_minutes=${retryMin}`;
            }
            return `  Caminho ${i + 1}: "${b.label}" → bloco ${b.nextSlug} (condicao: ${b.condition})`;
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

    const tasksList = taskDetails.map((t) =>
      `  - "${t.title}" (id: ${t.taskId}, prioridade: ${t.priority}, bloco: ${t.blockName})
    Prompt do bloco: "${t.blockPrompt}"${t.branchInfo}`
    ).join("\n");

    const systemPrompt = `Voce e o agente de automacao do Pipely AI.
Um membro do time respondeu uma mensagem no WhatsApp. Analise a resposta e decida o que fazer.

MEMBRO: ${user.name} (${user.email}, remoteJid: ${remoteJid})
RESPOSTA DO MEMBRO: "${message}"

TAREFAS ATIVAS DESTE MEMBRO EM BLOCOS DINAMICOS:
${tasksList}

BLOCOS DISPONIVEIS:
${allBlocksList}

REGRAS:
1. Analise a resposta do membro no contexto das tarefas e prompts dos blocos.
2. Se houver roteamento condicional (branches) configurado, avalie qual caminho se encaixa na resposta.
3. SOMENTE use move_task se existir um branch configurado cuja condicao bate com a resposta do membro.
4. Se NAO houver branches configurados no bloco, NUNCA mova a tarefa. Apenas responda ao membro.
5. NUNCA invente destinos. Use APENAS os block IDs listados nos branches configurados.
6. Se precisa responder ao membro, use send_whatsapp_message com mensagem curta.
7. Se a resposta nao se encaixa em nenhum roteamento, responda seguindo o prompt do bloco.
8. Use EXATAMENTE o remoteJid: ${remoteJid}. NUNCA invente numeros.
9. Se o envio falhar, NAO tente novamente. Use log_action e siga em frente.
10. RETRY: Se um caminho indica "REPETIR apos X minutos", use retry_task em vez de move_task. O agente vai perguntar de novo apos o tempo configurado.

REGRAS DE COMUNICACAO (OBRIGATORIO):
- NUNCA mencione pipeline, blocos, estagios, fluxo, sistema ou qualquer termo tecnico interno.
- NUNCA use frases genericas de chatbot. Lista de frases PROIBIDAS:
  "Se precisar de algo", "estou a disposicao", "qualquer coisa me avise", "estou aqui para ajudar",
  "fico a disposicao", "conte comigo", "aguardo sua resposta", "obrigado pela confirmacao".
- Use emojis para deixar a conversa dinamica: 👍 ✅ 📋 🔥 💪 👊 ✍️
- Ao mencionar prioridade, SEMPRE use o formato: "Prioridade: alta 🟡" (texto + emoji).
  Mapeamento: baixa 🟢, media 🔵, alta 🟡, urgente 🔴.
- Seja DIRETO e CURTO. Sem enrolacao.
- Confirmacoes: max 1 mensagem. Ex: "Anotado ✅", "Show 👍", "Blz, valeu! 👊"
- Voce e um colega de trabalho, NAO um assistente virtual.
- Tom informal e profissional. Como se fosse um amigo do trabalho no WhatsApp.
- Use o PRIMEIRO NOME da pessoa de vez em quando (nao em toda mensagem, alterne).
- Ao mencionar tarefas, SEMPRE inclua a prioridade com emoji (🟢🔵🟡🔴).`;

    const openai = new OpenAI({ apiKey });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `O membro respondeu: "${message}". Analise e execute as acoes necessarias.` },
    ];

    log.info("REPLY", `Processing reply for ${creatorTasks.length} task(s) of user ${user.name}`);

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
        }
        break;
      }

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        log.info("REPLY", `Tool: ${toolCall.function.name}`, args);

        const result = await executeTool(
          { name: toolCall.function.name, arguments: args },
          {
            ownerId: creatorId,
            evolutionUrl: event.ownerServerUrl,
            instanceToken: event.ownerInstanceToken,
          }
        );

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }
    }
  }
}
