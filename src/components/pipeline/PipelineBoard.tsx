import { useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { pipelineService, type Pipeline, type PipelineTask } from '@/services/pipeline'
import { taskService, type Task } from '@/services/tasks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import SortablePhase from '@/components/pipeline/SortablePhase'
import TaskCard from '@/components/pipeline/TaskCard'

const PHASE_COLORS = [
  'blue', 'purple', 'amber', 'orange', 'cyan',
  'green', 'teal', 'rose', 'indigo', 'pink',
]

interface PipelineBoardProps {
  pipeline: Pipeline
  setPipeline: (p: Pipeline) => void
  onUpdate: () => void
  onModalOpen?: () => void
  onModalClose?: () => void
}

export default function PipelineBoard({ pipeline, setPipeline, onUpdate, onModalOpen, onModalClose }: PipelineBoardProps) {
  const [activeTask, setActiveCard] = useState<PipelineTask | null>(null)
  const [activeDragType, setActiveDragType] = useState<string | null>(null)
  const [addingPhase, setAddingPhase] = useState(false)
  const [newPhaseName, setNewPhaseName] = useState('')
  const [addTaskBlockId, setAddTaskBlockId] = useState<string | null>(null)
  const [availableTasks, setAvailableTasks] = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [searchTask, setSearchTask] = useState('')
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const phaseIds = pipeline.phases.map((p) => p.id)

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const type = (active.data.current as Record<string, unknown>)?.type as string
    setActiveDragType(type)

    if (type === 'card') {
      const card = findTask(active.id as string)
      if (card) setActiveCard(card)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCard(null)
    setActiveDragType(null)
    if (!over || active.id === over.id) return

    const activeType = (active.data.current as Record<string, unknown>)?.type as string

    if (activeType === 'phase') {
      const oldIdx = pipeline.phases.findIndex((p) => p.id === active.id)
      const newIdx = pipeline.phases.findIndex((p) => p.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return

      const reordered = arrayMove(pipeline.phases, oldIdx, newIdx)
      const order = reordered.map((p, idx) => ({ id: p.id, position: idx }))

      // Optimistic update
      setPipeline({ ...pipeline, phases: reordered.map((p, idx) => ({ ...p, position: idx })) })

      try {
        await pipelineService.reorderPhases(pipeline.id, order)
      } catch {
        toast.error('Erro ao reordenar fases')
        onUpdate()
      }
    } else if (activeType === 'block') {
      const phaseId = (active.data.current as Record<string, unknown>)?.phaseId as string
      const phase = pipeline.phases.find((p) => p.id === phaseId)
      if (!phase) return

      const oldIdx = phase.blocks.findIndex((b) => b.id === active.id)
      const newIdx = phase.blocks.findIndex((b) => b.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return

      const reordered = arrayMove(phase.blocks, oldIdx, newIdx)
      const order = reordered.map((b, idx) => ({ id: b.id, position: idx }))

      // Optimistic update
      setPipeline({
        ...pipeline,
        phases: pipeline.phases.map((p) =>
          p.id === phaseId
            ? { ...p, blocks: reordered.map((b, idx) => ({ ...b, position: idx })) }
            : p
        ),
      })

      try {
        await pipelineService.reorderBlocks(phaseId, order)
      } catch {
        toast.error('Erro ao reordenar blocos')
        onUpdate()
      }
    } else if (activeType === 'card') {
      const overId = String(over.id)
      let targetBlockId: string | null = null

      if (overId.startsWith('drop-col-')) {
        targetBlockId = overId.replace('drop-col-', '')
      } else {
        // Dropped on a block sortable
        const overType = (over.data.current as Record<string, unknown>)?.type as string
        if (overType === 'block') {
          targetBlockId = over.id as string
        }
      }

      const task = findTask(active.id as string)
      if (!task || !targetBlockId || task.blockId === targetBlockId) return

      // Optimistic update — move task in local state immediately
      const updated = {
        ...pipeline,
        phases: pipeline.phases.map((phase) => ({
          ...phase,
          blocks: phase.blocks.map((block) => ({
            ...block,
            tasks: block.id === targetBlockId
              ? [...(block.tasks || []), { ...task, blockId: targetBlockId, enteredAt: new Date().toISOString() }]
              : (block.tasks || []).filter((t) => t.id !== task.id),
          })),
        })),
      }
      setPipeline(updated)

      try {
        await pipelineService.moveTask(active.id as string, targetBlockId)
      } catch {
        toast.error('Erro ao mover tarefa')
        onUpdate() // Rollback on error
      }
    }
  }

  function findTask(taskId: string): PipelineTask | null {
    for (const phase of pipeline.phases) {
      for (const block of phase.blocks) {
        const task = block.tasks?.find((t) => t.id === taskId)
        if (task) return task
      }
    }
    return null
  }

  async function openAddTask(blockId: string) {
    setAddTaskBlockId(blockId)
    setSearchTask('')
    setLoadingTasks(true)
    try {
      const res = await taskService.list()
      if (res.success && res.data) {
        // Show tasks not in any block or not in this pipeline
        const tasksInPipeline = new Set<string>()
        for (const phase of pipeline.phases) {
          for (const block of phase.blocks) {
            for (const t of block.tasks || []) tasksInPipeline.add(t.id)
          }
        }
        setAvailableTasks(res.data.filter((t: Task) => !tasksInPipeline.has(t.id)))
      }
    } catch {
      toast.error('Erro ao carregar tarefas')
    } finally {
      setLoadingTasks(false)
    }
  }

  async function handleAddTaskToBlock(taskId: string) {
    if (!addTaskBlockId) return
    setAddingTaskId(taskId)
    try {
      await taskService.update(taskId, { blockId: addTaskBlockId })
      setAddTaskBlockId(null)
      onUpdate()
      toast.success('Tarefa adicionada ao bloco')
    } catch {
      toast.error('Erro ao adicionar tarefa')
    } finally {
      setAddingTaskId(null)
    }
  }

  async function handleAddPhase() {
    if (!newPhaseName.trim()) return

    try {
      const colorIndex = pipeline.phases.length % PHASE_COLORS.length
      await pipelineService.createPhase(pipeline.id, newPhaseName.trim(), PHASE_COLORS[colorIndex])
      setNewPhaseName('')
      setAddingPhase(false)
      onUpdate()
      toast.success('Fase criada')
    } catch {
      toast.error('Erro ao criar fase')
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 min-h-0 overflow-x-auto pb-4 w-full">
        <SortableContext items={phaseIds} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-8 min-w-max items-start">
            {pipeline.phases.map((phase) => (
              <SortablePhase
                key={phase.id}
                phase={phase}
                pipelineId={pipeline.id}
                pipeline={pipeline}
                onUpdate={onUpdate}
                onAddTask={openAddTask}
                onModalOpen={onModalOpen}
                onModalClose={onModalClose}
              />
            ))}

            {/* Add phase */}
            <div className="flex-none">
              {addingPhase ? (
                <div className="w-52 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-3">
                  <Input
                    placeholder="Nome da fase"
                    value={newPhaseName}
                    onChange={(e) => setNewPhaseName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddPhase()
                      if (e.key === 'Escape') setAddingPhase(false)
                    }}
                    autoFocus
                    className="mb-2 h-7 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAddPhase} disabled={!newPhaseName.trim()} className="h-6 text-[10px]">
                      Criar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingPhase(false)} className="h-6 text-[10px]">
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingPhase(true)}
                  className="flex h-10 w-40 items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 text-xs text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                >
                  <Plus size={14} />
                  Nova fase
                </button>
              )}
            </div>
          </div>
        </SortableContext>
      </div>

      <DragOverlay>
        {activeTask && activeDragType === 'card' && (
          <div className="rotate-1 opacity-90 shadow-xl w-48 pointer-events-none">
            <TaskCard task={activeTask} isDragging />
          </div>
        )}
      </DragOverlay>

      {/* Add existing task to block */}
      <Dialog open={!!addTaskBlockId} onOpenChange={() => setAddTaskBlockId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar tarefa</DialogTitle>
            <DialogDescription>Selecione uma tarefa existente para adicionar neste bloco.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Buscar tarefa..."
            value={searchTask}
            onChange={(e) => setSearchTask(e.target.value)}
            autoFocus
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {loadingTasks ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : availableTasks.filter((t) => {
              const q = searchTask.toLowerCase()
              return !q || t.title.toLowerCase().includes(q) || t.assignee?.name.toLowerCase().includes(q)
            }).length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                {availableTasks.length === 0 ? 'Todas as tarefas ja estao no pipeline.' : 'Nenhum resultado.'}
              </p>
            ) : (
              availableTasks
                .filter((t) => {
                  const q = searchTask.toLowerCase()
                  return !q || t.title.toLowerCase().includes(q) || t.assignee?.name.toLowerCase().includes(q)
                })
                .map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleAddTaskToBlock(task.id)}
                    disabled={addingTaskId === task.id}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-200">{task.title}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {task.assignee?.name || 'Sem membro'}
                        {task.blockId && ' · Ja em outro bloco'}
                      </p>
                    </div>
                    {addingTaskId === task.id ? <Spinner size="sm" /> : <Plus size={14} className="shrink-0 text-zinc-600" />}
                  </button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DndContext>
  )
}
