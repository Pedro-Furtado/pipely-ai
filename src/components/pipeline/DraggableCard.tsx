import { useDraggable } from '@dnd-kit/core'
import type { PipelineTask } from '@/services/pipeline'
import TaskCard from '@/components/pipeline/TaskCard'

interface DraggableCardProps {
  task: PipelineTask
  onRemove: () => void
}

export default function DraggableCard({ task, onRemove }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { type: 'card', blockId: task.blockId },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1, cursor: 'grab' }}
      className="touch-none"
    >
      <TaskCard task={task} onRemove={onRemove} />
    </div>
  )
}
