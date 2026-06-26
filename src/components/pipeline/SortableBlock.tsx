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

const COLOR_BORDER: Record<string, string> = {
  blue: 'border-t-blue-500',
  purple: 'border-t-purple-500',
  amber: 'border-t-amber-500',
  orange: 'border-t-orange-500',
  cyan: 'border-t-cyan-500',
  green: 'border-t-green-500',
  teal: 'border-t-teal-500',
  rose: 'border-t-rose-500',
  indigo: 'border-t-indigo-500',
  pink: 'border-t-pink-500',
}

const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500/5',
  purple: 'bg-purple-500/5',
  amber: 'bg-amber-500/5',
  orange: 'bg-orange-500/5',
  cyan: 'bg-cyan-500/5',
  green: 'bg-green-500/5',
  teal: 'bg-teal-500/5',
  rose: 'bg-rose-500/5',
  indigo: 'bg-indigo-500/5',
  pink: 'bg-pink-500/5',
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
        'flex-none w-48 sm:w-52 flex flex-col',
        isSortDragging && 'opacity-40'
      )}
    >
      {/* Block header */}
      <div
        className={cn(
          'rounded-t-lg border-t-2 border border-zinc-800 px-2 py-1.5',
          COLOR_BORDER[phaseColor] || 'border-t-zinc-500',
          COLOR_BG[phaseColor] || 'bg-zinc-900'
        )}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn("cursor-grab hover:text-zinc-400 touch-none", COLOR_ICON[phaseColor] || "text-zinc-600")}
            {...attributes}
            {...listeners}
          >
            <GripHorizontal size={12} />
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
              className="h-5 flex-1 text-[11px]"
            />
          ) : (
            <>
              <span className="flex-1 truncate text-[11px] font-medium text-zinc-300">
                {block.name}
              </span>
              {block.blockType === 'message' && (
                <Badge variant="secondary" className="h-3.5 px-1 text-[8px]">
                  <Zap size={7} className="mr-0.5" />
                  auto
                </Badge>
              )}
            </>
          )}

          <span className={cn("text-[10px]", COLOR_ICON[phaseColor] || "text-zinc-600")}>{tasks.length}</span>

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400">
              <MoreHorizontal size={11} />
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
          'flex-1 flex flex-col gap-1.5 rounded-b-lg border border-t-0 border-zinc-800 p-1.5 min-h-[100px] max-h-[calc(100vh-240px)] overflow-y-auto transition-colors',
          isCardOver ? 'bg-blue-500/5' : 'bg-zinc-900/30'
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
            className="flex flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-zinc-800 py-4 text-[10px] text-zinc-600 transition-colors hover:border-zinc-600 hover:text-zinc-400"
          >
            <Plus size={10} />
            Tarefa
          </button>
        )}
      </div>

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
