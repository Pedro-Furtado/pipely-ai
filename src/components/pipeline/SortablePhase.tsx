import { useState } from 'react'
import { toast } from 'sonner'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, MoreHorizontal, Pencil, Trash2, GripVertical, Palette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pipelineService, type PipelinePhase, type Pipeline } from '@/services/pipeline'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import SortableBlock from '@/components/pipeline/SortableBlock'

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  cyan: 'bg-cyan-500',
  green: 'bg-green-500',
  teal: 'bg-teal-500',
  rose: 'bg-rose-500',
  indigo: 'bg-indigo-500',
  pink: 'bg-pink-500',
}

interface SortablePhaseProps {
  phase: PipelinePhase
  pipelineId: string
  pipeline: Pipeline
  onUpdate: () => void
  onAddTask: (blockId: string) => void
  onModalOpen?: () => void
  onModalClose?: () => void
}

export default function SortablePhase({ phase, pipeline, onUpdate, onAddTask, onModalOpen, onModalClose }: SortablePhaseProps) {
  const [addingBlock, setAddingBlock] = useState(false)
  const [newBlockName, setNewBlockName] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(phase.name)
  const [showColors, setShowColors] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: phase.id,
    data: { type: 'phase' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const blockIds = phase.blocks.map((b) => b.id)

  const totalTasks = phase.blocks.reduce(
    (sum, b) => sum + (b.tasks?.length || 0),
    0
  )

  async function handleAddBlock() {
    if (!newBlockName.trim()) return
    try {
      await pipelineService.createBlock(phase.id, newBlockName.trim())
      setNewBlockName('')
      setAddingBlock(false)
      onUpdate()
    } catch {
      toast.error('Erro ao criar bloco')
    }
  }

  async function handleRename() {
    if (!editName.trim() || editName.trim() === phase.name) {
      setEditing(false)
      return
    }
    try {
      await pipelineService.updatePhase(phase.id, { name: editName.trim() })
      setEditing(false)
      onUpdate()
    } catch {
      toast.error('Erro ao renomear fase')
    }
  }

  async function handleChangeColor(color: string) {
    try {
      await pipelineService.updatePhase(phase.id, { color })
      setShowColors(false)
      onUpdate()
    } catch {
      toast.error('Erro ao mudar cor')
    }
  }

  async function handleDelete() {
    try {
      await pipelineService.removePhase(phase.id)
      onUpdate()
      toast.success('Fase removida')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao remover fase')
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex-none flex flex-col',
        isDragging && 'opacity-40'
      )}
    >
      {/* Phase header */}
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          className="cursor-grab text-zinc-600 hover:text-zinc-400 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
        <div className={cn('h-2.5 w-2.5 rounded-full', COLOR_MAP[phase.color] || 'bg-zinc-500')} />
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
            className="h-6 w-28 text-xs"
          />
        ) : (
          <span className="text-xs font-medium text-zinc-300">{phase.name}</span>
        )}
        <span className="text-[10px] text-zinc-600">{totalTasks}</span>

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400">
            <MoreHorizontal size={12} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setEditing(true)}>
              <Pencil size={14} />
              Renomear
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAddingBlock(true)}>
              <Plus size={14} />
              Adicionar bloco
            </DropdownMenuItem>
            <DropdownMenuItem keepOpen onClick={() => setShowColors(!showColors)}>
              <Palette size={14} />
              Cor
            </DropdownMenuItem>
            {showColors && (
              <div className="flex flex-wrap gap-1.5 px-3 py-2">
                {Object.entries(COLOR_MAP).map(([key, bg]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleChangeColor(key)}
                    className={cn(
                      'h-5 w-5 rounded-full transition-all hover:scale-110',
                      bg,
                      phase.color === key && 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900'
                    )}
                  />
                ))}
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={handleDelete}>
              <Trash2 size={14} />
              Remover fase
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Blocks — horizontal layout */}
      <SortableContext items={blockIds} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-3 items-start">
          {phase.blocks.map((block) => (
            <SortableBlock
              key={block.id}
              block={block}
              phaseId={phase.id}
              phaseColor={phase.color}
              pipeline={pipeline}
              onUpdate={onUpdate}
              onAddTask={() => onAddTask(block.id)}
              onModalOpen={onModalOpen}
              onModalClose={onModalClose}
            />
          ))}

          {/* Add block */}
          {addingBlock ? (
            <div className="flex-none w-48 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 p-2">
              <Input
                placeholder="Nome do bloco"
                value={newBlockName}
                onChange={(e) => setNewBlockName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddBlock()
                  if (e.key === 'Escape') setAddingBlock(false)
                }}
                autoFocus
                className="mb-2 h-6 text-[11px]"
              />
              <div className="flex gap-1">
                <Button size="sm" onClick={handleAddBlock} disabled={!newBlockName.trim()} className="h-5 text-[10px]">
                  Criar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingBlock(false)} className="h-5 text-[10px]">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingBlock(true)}
              className="flex-none flex min-h-[128px] w-10 items-center justify-center rounded-lg border border-dashed border-zinc-800 text-zinc-600 transition-colors hover:border-zinc-600 hover:text-zinc-400"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </SortableContext>

    </div>
  )
}
