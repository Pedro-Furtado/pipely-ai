import { prisma } from "./prisma.js";

export async function saveAgentLog(
  ownerId: string,
  type: string,
  title: string,
  detail?: string,
  taskId?: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.agentLog.create({
      data: {
        ownerId,
        taskId: taskId || null,
        type,
        title,
        detail: detail || null,
        data: data || {},
      },
    });
  } catch {
    // Don't crash the agent if logging fails
  }
}
