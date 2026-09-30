import { useState } from 'react'
import { toast } from 'sonner'
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { MoreHorizontal, Plus, Pencil, Trash2, Zap, GripHorizontal, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pipelineService, type PipelineBlock } from '@/services/pipeline'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import DraggableCard from '@/components/pipeline/DraggableCard'
import BlockConfigModal from '@/components/pipeline/BlockConfigModal'

const COLOR_HEX: Record<string, string> = {
  blue: '#3b82f6',
  purple: '#a855f7',
  amber: '#f59e0b',
  orange: '#f97316',
  cyan: '#06b6d4',
  green: '#22c55e',
  teal: '#14b8a6',
  rose: '#f43f5e',
  indigo: '#6366f1',
  pink: '#ec4899',
}

const COLOR_ICON: Record<string, string> = {
  blue: 'text-blue-400/60',
  purple: 'text-purple-400/60',
  amber: 'text-amber-400/60',
  orange: 'text-orange-400/60',
  cyan: 'text-cyan-400/60',
  green: 'text-green-400/60',
  teal: 'text-teal-400/60',
  rose: 'text-rose-400/60',
  indigo: 'text-indigo-400/60',
  pink: 'text-pink-400/60',
}

interface SortableBlockProps {
  block: PipelineBlock
  phaseId: string
  phaseColor: string
  pipeline: import('@/services/pipeline').Pipeline
  onUpdate: () => void
  onAddTask: () => void
  onModalOpen?: () => void
  onModalClose?: () => void
}

export default function SortableBlock({ block, phaseId, phaseColor, pipeline, onUpdate, onAddTask, onModalOpen, onModalClose }: SortableBlockProps) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(block.name)
  const [showConfig, setShowConfig] = useState(false)

  // Sortable (for reordering blocks)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isSortDragging,
  } = useSortable({
    id: block.id,
    data: { type: 'block', phaseId },
  })

  // Droppable (for receiving tasks)
  const { setNodeRef: setDropRef, isOver: isCardOver } = useDroppable({
    id: `drop-col-${block.id}`,
    data: { type: 'column', blockId: block.id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const tasks = block.tasks || []

  async function handleRename() {
    if (!editName.trim() || editName.trim() === block.name) {
      setEditing(false)
      return
    }
    try {
      await pipelineService.updateBlock(block.id, { name: editName.trim() })
      setEditing(false)
      onUpdate()
    } catch {
      toast.error('Erro ao renomear bloco')
    }
  }

  async function handleDelete() {
    try {
      await pipelineService.removeBlock(block.id)
      onUpdate()
      toast.success('Bloco removido')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao remover bloco')
    }
  }

  async function handleRemoveTask(taskId: string) {
    try {
      const { taskService } = await import('@/services/tasks')
      await taskService.update(taskId, { blockId: '' })
      onUpdate()
    } catch {
      toast.error('Erro ao remover tarefa do bloco')
    }
  }

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={cn(
        'flex-none w-56 sm:w-64 flex flex-col',
        isSortDragging && 'opacity-40'
      )}
    >
      {/* Block container */}
      {(() => {
        const hex = COLOR_HEX[phaseColor] || '#71717a'
        return (
          <div className="rounded-xl ring-1 ring-zinc-800 hover:ring-zinc-700 transition-all duration-200">
            {/* Header with radial glow */}
            <div className="relative px-3 py-2.5 rounded-t-xl" style={{ background: `linear-gradient(135deg, ${hex}10 0%, transparent 60%)` }}>
              {/* Top glow spot */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse 70% 30px at 50% 0%, ${hex}15 0%, transparent 70%)` }}
              />
              <div className="relative flex items-center gap-1.5">
                <button
                  type="button"
                  className={cn("cursor-grab hover:text-zinc-400 touch-none", COLOR_ICON[phaseColor] || "text-zinc-600")}
                  {...attributes}
                  {...listeners}
                >
                  <GripHorizontal size={14} />
                </button>

                {editing ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') setEditing(false)
                    }}
                    autoFocus
                    className="h-6 flex-1 text-xs"
                  />
                ) : (
                  <>
                    <span className="flex-1 truncate text-xs font-semibold text-zinc-200">
                      {block.name}
                    </span>
                    {block.blockType === 'message' && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: hex + '18', color: hex }}
                      >
                        <Zap size={8} />
                        auto
                      </span>
                    )}
                  </>
                )}

                <span
                  className="text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: hex + '12', color: hex }}
                >
                  {tasks.length}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded-lg p-1 text-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-400 transition-colors">
                    <MoreHorizontal size={13} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={onAddTask}>
                      <Plus size={14} />
                      Adicionar tarefa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setShowConfig(true); onModalOpen?.() }}>
                      <Settings size={14} />
                      Configurar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditing(true)}>
                      <Pencil size={14} />
                      Renomear
                    </DropdownMenuItem>
                    {!block.isLocked && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onClick={handleDelete}>
                          <Trash2 size={14} />
                          Remover bloco
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Cards droppable zone */}
            <div
              ref={setDropRef}
              className={cn(
                'flex-1 flex flex-col gap-2 p-2 min-h-[120px] max-h-[calc(100vh-240px)] overflow-y-auto transition-colors',
                isCardOver ? 'bg-blue-500/5' : 'bg-zinc-900/20'
              )}
            >
              {tasks.map((task) => (
                <DraggableCard
                  key={task.id}
                  task={task}
                  onRemove={() => handleRemoveTask(task.id)}
                />
              ))}

              {tasks.length === 0 && (
                <button
                  type="button"
                  onClick={onAddTask}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-800/60 py-6 text-[11px] text-zinc-600 transition-colors hover:border-zinc-600 hover:text-zinc-400"
                >
                  <Plus size={12} />
                  Tarefa
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {showConfig && (
        <BlockConfigModal
          block={block}
          pipeline={pipeline}
          open={showConfig}
          onClose={() => { setShowConfig(false); onModalClose?.() }}
          onSaved={onUpdate}
        />
      )}
    </div>
  )
}
