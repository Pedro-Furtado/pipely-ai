import { prisma } from "../lib/prisma.js";
import { log } from "../lib/logger.js";

export interface BlockContext {
  block: {
    id: string;
    name: string;
    slug: string;
    blockType: string;
    config: Record<string, unknown>;
    phaseName: string;
    phaseColor: string;
  };
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    priority: string;
    enteredAt: Date;
    processedAt: Date | null;
    retryAt: Date | null;
    minutesInBlock: number;
    assignee: {
      id: string;
      name: string;
      phone: string;
      remoteJid: string | null;
    } | null;
  }>;
  pipeline: {
    id: string;
    name: string;
    ownerId: string;
  };
  allBlocks: Array<{
    id: string;
    name: string;
    phaseName: string;
  }>;
}

export interface OwnerContext {
  ownerId: string;
  openaiApiKey: string | null;
  evolutionUrl: string | null;
  whatsappToken: string | null;
  dynamicBlocks: BlockContext[];
}

export async function scanPipelines(): Promise<OwnerContext[]> {
  const owners: OwnerContext[] = [];

  // Find all users who have pipelines with dynamic blocks containing tasks
  const pipelines = await prisma.pipeline.findMany({
    include: {
      owner: {
        include: {
          aiConfig: true,
          whatsapp: true,
        },
      },
      phases: {
        orderBy: { position: "asc" },
        include: {
          blocks: {
            orderBy: { position: "asc" },
            include: {
              tasks: {
                include: {
                  assignee: {
                    select: { id: true, name: true, phone: true, remoteJid: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const ownerMap = new Map<string, OwnerContext>();

  for (const pipeline of pipelines) {
    const ownerId = pipeline.ownerId;

    if (!ownerMap.has(ownerId)) {
      // Get WhatsApp instance token (first instance)
      let whatsappToken: string | null = null;
      if (pipeline.owner.whatsapp) {
        try {
          const res = await fetch(`${pipeline.owner.whatsapp.serverUrl}/instance/all`, {
            headers: { apikey: pipeline.owner.whatsapp.globalApiKey },
          });
          const data = await res.json();
          const instances = (data as Record<string, unknown>)?.data as Array<Record<string, unknown>> | undefined;
          if (instances?.[0]?.token) {
            whatsappToken = String(instances[0].token);
          }
        } catch {
          // silent — no whatsapp configured
        }
      }

      ownerMap.set(ownerId, {
        ownerId,
        openaiApiKey: pipeline.owner.aiConfig?.openaiApiKey || null,
        evolutionUrl: pipeline.owner.whatsapp?.serverUrl || null,
        whatsappToken,
        dynamicBlocks: [],
      });
    }

    const ownerCtx = ownerMap.get(ownerId)!;

    // Build flat list of all blocks for reference
    const allBlocks = pipeline.phases.flatMap((p) =>
      p.blocks.map((b) => ({
        id: b.id,
        name: b.name,
        phaseName: p.name,
      }))
    );

    for (const phase of pipeline.phases) {
      for (const block of phase.blocks) {
        // Only process dynamic blocks with tasks
        if (block.blockType !== "message" || block.tasks.length === 0) continue;

        const config = block.config as Record<string, unknown>;
        const hasTimer = !!(config.delay_minutes && config.next_block_id);
        const hasMsgDelay = !!(config.msg_delay_minutes);
        const hasNoReply = !!(config.no_reply_minutes && config.no_reply_block_id);
        const hasPrompt = !!((config.prompt as string)?.trim() || (config.message as string)?.trim());
        const hasSchedule = !!(config.schedule && config.next_block_id);

        // Filter tasks:
        // - With timer/no_reply/msg_delay: ALL tasks (check each tick)
        // - With prompt only: only unprocessed tasks
        const pendingTasks = block.tasks.filter((t) => {
          const tRaw = t as unknown as Record<string, unknown>;

          // Skip tasks with a future retryAt (waiting to be reprocessed)
          const retryAt = tRaw.retryAt as Date | null;
          if (retryAt && new Date(retryAt).getTime() > Date.now()) return false;

          if (hasTimer && !hasPrompt) return true;
          if (hasMsgDelay) return true;
          if (hasNoReply) return true; // Need to check no-reply timer each tick
          if (hasSchedule) return true; // Need to check schedule each tick
          const processed = tRaw.processedAt as Date | null;
          if (!processed) return true;
          return processed < t.enteredAt;
        });

        if (pendingTasks.length === 0) continue;

        const now = Date.now();

        const tasks = pendingTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          enteredAt: t.enteredAt,
          processedAt: (t as unknown as Record<string, unknown>).processedAt as Date | null,
          retryAt: (t as unknown as Record<string, unknown>).retryAt as Date | null,
          minutesInBlock: Math.floor((now - t.enteredAt.getTime()) / 60000),
          assignee: t.assignee
            ? {
                id: t.assignee.id,
                name: t.assignee.name,
                phone: t.assignee.phone,
                remoteJid: t.assignee.remoteJid,
              }
            : null,
        }));

        ownerCtx.dynamicBlocks.push({
          block: {
            id: block.id,
            name: block.name,
            slug: block.slug,
            blockType: block.blockType,
            config,
            phaseName: phase.name,
            phaseColor: phase.color,
          },
          tasks,
          pipeline: {
            id: pipeline.id,
            name: pipeline.name,
            ownerId,
          },
          allBlocks,
        });
      }
    }
  }

  owners.push(...ownerMap.values());

  // Filter to only owners with dynamic blocks to process
  const active = owners.filter((o) => o.dynamicBlocks.length > 0);

  if (active.length > 0) {
    const totalBlocks = active.reduce((sum, o) => sum + o.dynamicBlocks.length, 0);
    const totalTasks = active.reduce(
      (sum, o) => sum + o.dynamicBlocks.reduce((s, b) => s + b.tasks.length, 0),
      0
    );
    log.info("SCANNER", `Found ${active.length} owner(s), ${totalBlocks} dynamic block(s), ${totalTasks} task(s)`);
  }

  return active;
}
