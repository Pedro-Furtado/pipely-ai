import OpenAI from "openai";
import { prisma } from "../lib/prisma.js";
import { log } from "../lib/logger.js";
import { TOOLS } from "../tools/definitions.js";
import { executeTool } from "../tools/executor.js";
import type { BlockContext, OwnerContext } from "./pipeline-scanner.js";

const MAX_STEPS = 5;

function buildSystemPrompt(blockCtx: BlockContext): string {
  const { block, tasks, pipeline, allBlocks } = blockCtx;
  const config = block.config;

  const blockList = allBlocks
    .map((b) => `  - "${b.phaseName} / ${b.name}" (id: ${b.id})`)
    .join("\n");

  const taskList = tasks
    .map((t) => {
      const assignee = t.assignee
        ? `responsavel: ${t.assignee.name} (${t.assignee.email}, jid: ${t.assignee.remoteJid || "nao configurado"})`
        : "sem responsavel";
      const desc = t.description ? `, descricao: "${t.description}"` : "";
      return `  - "${t.title}" (id: ${t.id}, prioridade: ${t.priority}${desc}, ${assignee}, ${t.minutesInBlock} min no bloco)`;
    })
    .join("\n");

  let prompt = `Voce e o agente de automacao do Pipely AI.
Seu trabalho e processar blocos dinamicos do pipeline e executar as automacoes configuradas.

PIPELINE: ${pipeline.name}
BLOCO ATUAL: ${block.phaseName} / ${block.name} (tipo: dinamico)
CONFIG DO BLOCO:
${JSON.stringify(config, null, 2)}

TAREFAS NESTE BLOCO:
${taskList}

BLOCOS DISPONIVEIS NO PIPELINE:
${blockList}

REGRAS:
1. Analise a configuracao do bloco e as tarefas.
2. Execute as acoes necessarias usando as tools disponiveis.
3. Respeite os tempos configurados (delay_minutes, no_reply_minutes).
4. Siga o prompt do bloco para gerar a mensagem.
5. So envie mensagem via WhatsApp se o responsavel tiver remoteJid configurado.
6. So mova tarefas se o tempo configurado ja passou (verifique minutesInBlock) E se next_block_id esta configurado.
7. NUNCA mova tarefas para blocos que nao estao configurados no delay ou branches. Nao invente destinos.
8. Nao faca nada se nao houver acao pendente.
9. UMA TAREFA POR VEZ: Voce recebe apenas UMA tarefa para processar. Foque nela. Nao mencione outras tarefas.
10. MENSAGENS SEPARADAS: Use o array "messages" para enviar 2-3 mensagens curtas sequenciais.
11. Emojis de prioridade: 🟢 baixa, 🔵 media, 🟡 alta, 🔴 urgente.

REGRAS DE COMUNICACAO (OBRIGATORIO):
- NUNCA mencione pipeline, blocos, estagios, fluxo, sistema ou qualquer termo tecnico interno.
- NUNCA use frases genericas de chatbot. Lista de frases PROIBIDAS:
  "Se precisar de algo", "estou a disposicao", "qualquer coisa me avise", "estou aqui para ajudar",
  "fico a disposicao", "conte comigo", "aguardo sua resposta", "obrigado pela confirmacao".
- Use emojis para deixar a conversa dinamica: 👍 ✅ 📋 🔥 💪 👊 ✍️
- Ao mencionar prioridade, SEMPRE use o formato: "Prioridade: alta 🟡" (texto + emoji).
  Mapeamento: baixa 🟢, media 🔵, alta 🟡, urgente 🔴.
- Seja DIRETO e CURTO. Sem enrolacao.
- Voce e um colega de trabalho, NAO um assistente virtual.
- Tom informal e profissional. Como se fosse um amigo do trabalho no WhatsApp.
- Use o PRIMEIRO NOME da pessoa de vez em quando (nao em toda mensagem, alterne).
- SEMPRE mostre a prioridade da tarefa com o emoji correspondente (🟢🔵🟡🔴).
`;

  // Prompt do agente
  const blockPrompt = (config.prompt as string) || (config.message as string) || "notifique o responsavel sobre a tarefa";
  prompt += `
INSTRUCAO DO USUARIO PARA ESTE BLOCO: "${blockPrompt}"

Siga esta instrucao para gerar as mensagens via WhatsApp.
Gere mensagens naturais, amigaveis e profissionais.
Foque APENAS na tarefa atual. Nao mencione outras tarefas pendentes.
Quebre em 2-4 mensagens curtas no array "messages" para simular conversa natural.
Use formatacao WhatsApp: *negrito* para titulos, _italico_ para detalhes.
`;

  if (config.branches && Array.isArray(config.branches)) {
    prompt += `
ROTEAMENTO CONDICIONAL:
${(config.branches as Array<Record<string, unknown>>).map((b, i) => {
  const retryMin = Number(b.retry_minutes) || 0;
  if (retryMin > 0) {
    return `  Caminho ${i + 1}: "${b.label}" → REPETIR apos ${retryMin} minutos (condicao: ${b.condition}). Use retry_task com retry_minutes=${retryMin}`;
  }
  return `  Caminho ${i + 1}: "${b.label}" → bloco ${b.nextSlug} (condicao: ${b.condition})`;
}).join("\n")}
`;
  }

  return prompt;
}

function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export async function processBlock(
  blockCtx: BlockContext,
  ownerCtx: OwnerContext
): Promise<void> {
  const { block, tasks } = blockCtx;
  const config = block.config;
  const prompt = (config.prompt as string) || (config.message as string) || "";

  // Auto-status: change task status on block entry
  const autoStatus = config.auto_status as string | undefined;
  if (autoStatus) {
    const taskIds = tasks.map((t) => t.id);
    await prisma.task.updateMany({
      where: { id: { in: taskIds }, status: { not: autoStatus } },
      data: { status: autoStatus },
    });
    log.info("PROCESSOR", `Auto-status → ${autoStatus} for ${taskIds.length} task(s)`);
  }

  // No-reply timer: move tasks that have been processed but got no response
  const noReplyMinutes = (config.no_reply_minutes as number) || 0;
  const noReplyBlockId = (config.no_reply_block_id as string) || "";
  if (noReplyMinutes > 0 && noReplyBlockId) {
    for (const task of tasks) {
      // Only check tasks that were already processed (message was sent)
      if (!task.processedAt) continue; // Not processed yet — skip no-reply check

      if (task.minutesInBlock >= noReplyMinutes) {
        await prisma.taskLog.updateMany({
          where: { taskId: task.id, leftAt: null },
          data: { leftAt: new Date() },
        });
        await prisma.task.update({
          where: { id: task.id },
          data: { blockId: noReplyBlockId, enteredAt: new Date(), processedAt: null },
        });
        await prisma.taskLog.create({
          data: { taskId: task.id, blockId: noReplyBlockId },
        });
        log.info("PROCESSOR", `No-reply: task "${task.title}" moved after ${task.minutesInBlock}min`);
      }
    }
  }

  // No prompt = silent block (only timer/auto-advance, no LLM)
  if (!prompt.trim()) {
    // Check auto-advance timer
    const delayMinutes = (config.delay_minutes as number) || 0;
    const nextBlockId = (config.next_block_id as string) || "";

    if (delayMinutes > 0 && nextBlockId) {
      const movedIds: string[] = [];
      const waitingIds: string[] = [];

      for (const task of tasks) {
        if (task.minutesInBlock >= delayMinutes) {
          await prisma.taskLog.updateMany({
            where: { taskId: task.id, leftAt: null },
            data: { leftAt: new Date() },
          });
          await prisma.task.update({
            where: { id: task.id },
            data: { blockId: nextBlockId, enteredAt: new Date(), processedAt: null },
          });
          await prisma.taskLog.create({
            data: { taskId: task.id, blockId: nextBlockId },
          });
          movedIds.push(task.id);
          log.info("PROCESSOR", `Auto-advanced task "${task.title}" after ${task.minutesInBlock}min`);
        } else {
          waitingIds.push(task.id);
          log.info("PROCESSOR", `Task "${task.title}" waiting — ${task.minutesInBlock}/${delayMinutes}min`);
        }
      }

      // Only mark moved tasks as processed — waiting tasks stay unprocessed for next tick
      if (movedIds.length > 0) {
        log.info("PROCESSOR", `Silent block "${block.name}" — ${movedIds.length} moved, ${waitingIds.length} waiting`);
      }
      return;
    }

    // No timer configured — mark all as processed
    const taskIds = tasks.map((t) => t.id);
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { processedAt: new Date() },
    });

    log.info("PROCESSOR", `Silent block "${block.name}" — ${tasks.length} task(s) processed (no timer)`);
    return;
  }

  // Check message delay — only send after configured time
  const msgDelayMinutes = (config.msg_delay_minutes as number) || 0;
  if (msgDelayMinutes > 0) {
    const readyTasks = tasks.filter((t) => t.minutesInBlock >= msgDelayMinutes);
    const waitingTasks = tasks.filter((t) => t.minutesInBlock < msgDelayMinutes);

    if (readyTasks.length === 0) {
      for (const t of waitingTasks) {
        log.info("PROCESSOR", `Task "${t.title}" msg waiting — ${t.minutesInBlock}/${msgDelayMinutes}min`);
      }
      return;
    }

    // Only process ready tasks, re-assign blockCtx tasks
    blockCtx = { ...blockCtx, tasks: readyTasks };
  }

  // Verify tasks still in this block before sending (may have moved since scan)
  const verifiedTasks: typeof tasks = [];
  for (const task of blockCtx.tasks) {
    const current = await prisma.task.findUnique({ where: { id: task.id }, select: { blockId: true } });
    if (current?.blockId === block.id) {
      verifiedTasks.push(task);
    } else {
      log.info("PROCESSOR", `Task "${task.title}" moved away, skipping`);
    }
  }

  if (verifiedTasks.length === 0) return;

  if (!ownerCtx.openaiApiKey) {
    log.warn("PROCESSOR", `No OpenAI key for owner ${ownerCtx.ownerId}, skipping block ${block.name}`);
    return;
  }

  // ─── ONE TASK AT A TIME PER ASSIGNEE ────────────────────────────────────
  // Pick only the oldest unprocessed task per assignee to avoid sending
  // multiple tasks at once. After the user responds and the task moves,
  // the next tick will pick the next unprocessed task.
  const hasBranches = Array.isArray(config.branches) && (config.branches as unknown[]).length > 0;
  const hasNoReply = !!(config.no_reply_minutes);
  const needsResponse = hasBranches || hasNoReply;

  let tasksToProcess: typeof verifiedTasks;

  if (needsResponse) {
    // Block expects a response — process one task per assignee
    const seenAssignees = new Set<string>();
    tasksToProcess = [];

    // Sort by priority (urgent first), then enteredAt ASC
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...verifiedTasks].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 9;
      const pb = priorityOrder[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return new Date(a.enteredAt).getTime() - new Date(b.enteredAt).getTime();
    });

    for (const task of sorted) {
      // Skip already processed tasks (waiting for response)
      if (task.processedAt && task.processedAt >= task.enteredAt) continue;

      const assigneeKey = task.assignee?.id || "__unassigned__";

      // Check if this assignee already has a processed task waiting for response
      const hasWaiting = verifiedTasks.some(
        (t) =>
          (t.assignee?.id || "__unassigned__") === assigneeKey &&
          t.processedAt &&
          t.processedAt >= t.enteredAt
      );

      if (hasWaiting) {
        log.info("PROCESSOR", `Task "${task.title}" queued — assignee "${task.assignee?.name}" has a task waiting for response`);
        continue;
      }

      if (seenAssignees.has(assigneeKey)) continue;
      seenAssignees.add(assigneeKey);
      tasksToProcess.push(task);
    }

    if (tasksToProcess.length === 0) {
      log.info("PROCESSOR", `Block "${block.name}" — all assignees have tasks waiting for response`);
      return;
    }
  } else {
    // Block doesn't expect response — process all unprocessed tasks at once
    tasksToProcess = verifiedTasks.filter(
      (t) => !t.processedAt || t.processedAt < t.enteredAt
    );
    if (tasksToProcess.length === 0) return;
  }

  const openai = new OpenAI({ apiKey: ownerCtx.openaiApiKey });

  // Process each task individually when response is expected
  for (const task of tasksToProcess) {
    const singleTaskCtx: BlockContext = {
      ...blockCtx,
      tasks: needsResponse ? [task] : tasksToProcess,
    };

    const systemPrompt = buildSystemPrompt(singleTaskCtx);

    const llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: needsResponse
          ? `Processe esta tarefa e execute as automacoes necessarias. Responda com um resumo curto do que foi feito.`
          : `Analise as ${tasksToProcess.length} tarefa(s) neste bloco e execute as automacoes necessarias. Responda com um resumo curto do que foi feito.`,
      },
    ];

    log.info("PROCESSOR", `Processing block "${block.name}" — task "${task.title}"${needsResponse ? " (1-at-a-time)" : ""}`);

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: llmMessages,
        tools: TOOLS,
        temperature: 0.3,
      });

      const choice = response.choices[0];
      if (!choice) break;

      llmMessages.push(choice.message);

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        if (choice.message.content) {
          log.info("PROCESSOR", `Agent: ${choice.message.content.substring(0, 200)}`);
        }
        break;
      }

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);

        log.info("PROCESSOR", `Tool: ${toolCall.function.name}`, args);

        const result = await executeTool(
          { name: toolCall.function.name, arguments: args },
          {
            ownerId: ownerCtx.ownerId,
            evolutionUrl: ownerCtx.evolutionUrl || undefined,
            instanceToken: ownerCtx.whatsappToken || undefined,
          }
        );

        llmMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }
    }

    // Mark this task as processed and clear any pending retry
    await prisma.task.update({
      where: { id: task.id },
      data: { processedAt: new Date(), retryAt: null },
    });

    log.info("PROCESSOR", `Marked task "${task.title}" as processed`);

    // If not response-based, all tasks were sent together — break after first iteration
    if (!needsResponse) break;
  }
}
