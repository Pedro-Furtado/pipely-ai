import { Clock, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineTask } from '@/services/pipeline'

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-zinc-400',
  medium: 'bg-blue-400',
  high: 'bg-amber-400',
  urgent: 'bg-red-400',
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

interface TaskCardProps {
  task: PipelineTask
  isDragging?: boolean
  onRemove?: () => void
}

export default function TaskCard({ task, isDragging, onRemove }: TaskCardProps) {
  return (
    <div
      className={cn(
        'group relative rounded-lg border border-zinc-800 bg-zinc-950 p-2 transition-shadow hover:shadow-lg hover:shadow-black/20',
        isDragging && 'rotate-1 scale-105 shadow-xl shadow-black/30'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority] || 'bg-zinc-400')} />
            {task.priority === 'urgent' && <AlertTriangle size={10} className="shrink-0 text-red-400" />}
            <p className="truncate text-[11px] font-medium text-zinc-200">
              {task.title}
            </p>
          </div>
          {task.description && (
            <p className="mt-0.5 truncate text-[9px] text-zinc-500">
              {task.description}
            </p>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded p-0.5 text-zinc-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <X size={10} />
          </button>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[9px] text-zinc-600">
          <Clock size={9} />
          <span>{timeAgo(task.enteredAt)}</span>
        </div>
        {task.assignee && (
          <div className="flex items-center gap-1">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[8px] text-zinc-400">
              {task.assignee.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-[9px] text-zinc-500">{task.assignee.name.split(' ')[0]}</span>
          </div>
        )}
      </div>
    </div>
  )
}
