import { prisma } from "../lib/prisma.js";
import { log } from "../lib/logger.js";
import { sendWhatsAppMessage } from "../lib/evolution.js";

interface ToolCall {
  name: string;
  arguments: Record<string, string>;
}

interface ExecutionContext {
  ownerId: string;
  evolutionUrl?: string;
  instanceToken?: string;
}

export async function executeTool(
  tool: ToolCall,
  ctx: ExecutionContext
): Promise<string> {
  const { name, arguments: args } = tool;

  switch (name) {
    case "send_whatsapp_message": {
      if (!ctx.evolutionUrl || !ctx.instanceToken) {
        return JSON.stringify({ success: false, error: "WhatsApp not configured" });
      }
      // Support both single message and array of messages
      const messages: string[] = args.messages || [args.message];
      let allSent = true;
      for (const msg of messages.slice(0, 15)) {
        const sent = await sendWhatsAppMessage(
          args.remote_jid,
          msg,
          ctx.evolutionUrl,
          ctx.instanceToken
        );
        if (!sent) allSent = false;
      }
      return JSON.stringify({ success: allSent, sent: messages.length });
    }

    case "move_task": {
      try {
        // Close previous log
        await prisma.taskLog.updateMany({
          where: { taskId: args.task_id, leftAt: null },
          data: { leftAt: new Date() },
        });

        // Move task — reset processedAt/retryAt so agent processes again in new block
        await prisma.task.update({
          where: { id: args.task_id },
          data: { blockId: args.target_block_id, enteredAt: new Date(), processedAt: null, retryAt: null },
        });

        // Create new log
        await prisma.taskLog.create({
          data: { taskId: args.task_id, blockId: args.target_block_id },
        });

        log.info("TOOL", `Task moved: ${args.reason}`, {
          taskId: args.task_id,
          to: args.target_block_id,
        });

        return JSON.stringify({ success: true });
      } catch (err) {
        log.error("TOOL", "Move task failed", err);
        return JSON.stringify({ success: false, error: String(err) });
      }
    }

    case "update_task_status": {
      try {
        await prisma.task.update({
          where: { id: args.task_id },
          data: { status: args.status },
        });
        log.info("TOOL", `Task status → ${args.status}`, { taskId: args.task_id });
        return JSON.stringify({ success: true });
      } catch (err) {
        log.error("TOOL", "Update status failed", err);
        return JSON.stringify({ success: false, error: String(err) });
      }
    }

    case "create_notification": {
      try {
        await prisma.notification.create({
          data: {
            userId: args.user_id,
            type: "agent_notification",
            title: args.title,
            message: args.message,
            data: { source: "pipely-agent" },
          },
        });
        return JSON.stringify({ success: true });
      } catch (err) {
        log.error("TOOL", "Create notification failed", err);
        return JSON.stringify({ success: false, error: String(err) });
      }
    }

    case "retry_task": {
      try {
        const retryMinutes = Number(args.retry_minutes) || 60;
        const retryAt = new Date(Date.now() + retryMinutes * 60000);

        await prisma.task.update({
          where: { id: args.task_id },
          data: { processedAt: null, retryAt },
        });

        log.info("TOOL", `Task retry scheduled in ${retryMinutes}min (${retryAt.toISOString()})`, {
          taskId: args.task_id,
          reason: args.reason,
        });

        return JSON.stringify({ success: true, retryAt: retryAt.toISOString() });
      } catch (err) {
        log.error("TOOL", "Retry task failed", err);
        return JSON.stringify({ success: false, error: String(err) });
      }
    }

    case "log_action": {
      log.info(args.context || "AGENT", args.message);
      return JSON.stringify({ success: true });
    }

    default:
      return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
  }
}
