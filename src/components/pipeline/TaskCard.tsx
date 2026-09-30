import { Clock, X, AlertTriangle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineTask } from '@/services/pipeline'

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  low: { color: '#22c55e', label: 'Baixa' },
  medium: { color: '#3b82f6', label: 'Media' },
  high: { color: '#eab308', label: 'Alta' },
  urgent: { color: '#ef4444', label: 'Urgente' },
}

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
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
  const pri = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  const assigneeColor = task.assignee ? getAvatarColor(task.assignee.name) : '#71717a'

  return (
    <div
      className={cn(
        'group relative rounded-xl ring-1 ring-zinc-800/60 bg-zinc-950 p-3 transition-all duration-150 hover:ring-zinc-700 hover:shadow-lg hover:shadow-black/20 overflow-hidden',
        isDragging && 'rotate-1 scale-105 shadow-xl shadow-black/30 ring-zinc-600'
      )}
    >
      {/* Priority glow — radial light from top center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 60% 50px at 50% 0%, ${pri.color}18 0%, ${pri.color}08 40%, transparent 70%)` }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            {task.priority === 'urgent' && <AlertTriangle size={12} className="shrink-0 text-red-400" />}
            <p className="truncate text-xs font-medium text-zinc-200 leading-snug">
              {task.title}
            </p>
          </div>
          {task.description && (
            <p className="mt-1 text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
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
            className="rounded-lg p-1 text-zinc-700 opacity-0 transition-all hover:text-red-400 hover:bg-red-400/10 group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Priority pill */}
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: pri.color + '15', color: pri.color }}
          >
            {pri.label}
          </span>
          {/* Time */}
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <Clock size={10} />
            {timeAgo(task.enteredAt)}
          </span>
        </div>
        {task.assignee && (
          <div className="flex items-center gap-1.5">
            <div
              className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: assigneeColor + '20', color: assigneeColor }}
            >
              {task.assignee.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] text-zinc-500 max-w-[60px] truncate">{task.assignee.name.split(' ')[0]}</span>
          </div>
        )}
      </div>
    </div>
  )
}
