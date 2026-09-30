import { useState, useEffect, useMemo, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ClipboardList, AlertTriangle, CircleDot, Clock, CheckCircle2, Search, Filter, User } from 'lucide-react'
import { taskService, type Task } from '@/services/tasks'
import { teamService, type TeamMember } from '@/services/team'
import { pipelineService, type Pipeline } from '@/services/pipeline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const PRIORITIES = [
  { value: 'low', label: 'Baixa', color: '#22c55e' },
  { value: 'medium', label: 'Media', color: '#3b82f6' },
  { value: 'high', label: 'Alta', color: '#eab308' },
  { value: 'urgent', label: 'Urgente', color: '#ef4444' },
]

const STATUSES = [
  { value: 'todo', label: 'A fazer', icon: CircleDot, color: '#a1a1aa' },
  { value: 'in_progress', label: 'Em andamento', icon: Clock, color: '#3b82f6' },
  { value: 'done', label: 'Concluida', icon: CheckCircle2, color: '#22c55e' },
]

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function Tarefas() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')

  // Form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const [blockId, setBlockId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [tasksRes, membersRes, pipelinesRes] = await Promise.all([
        taskService.list(),
        teamService.list(),
        pipelineService.list(),
      ])
      if (tasksRes.success && tasksRes.data) setTasks(tasksRes.data)
      if (membersRes.success && membersRes.data) setMembers(membersRes.data)
      if (pipelinesRes.success && pipelinesRes.data) setPipelines(pipelinesRes.data)
    } catch {
      toast.error('Erro ao carregar tarefas')
    } finally {
      setLoading(false)
    }
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      return true
    })
  }, [tasks, searchQuery, filterStatus, filterPriority])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length }
    for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1
    return counts
  }, [tasks])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setCreating(true)
    try {
      const res = await taskService.create({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeId: assigneeId || undefined,
        blockId: blockId || undefined,
      })
      if (res.success && res.data) {
        setTasks((prev) => [res.data!, ...prev])
        resetForm()
        setShowCreate(false)
        toast.success('Tarefa criada')
      }
    } catch {
      toast.error('Erro ao criar tarefa')
    } finally {
      setCreating(false)
    }
  }

  async function handleChangeStatus(taskId: string, newStatus: string) {
    try {
      const res = await taskService.update(taskId, { status: newStatus })
      if (res.success && res.data) {
        setTasks((prev) => prev.map((t) => t.id === taskId ? res.data! : t))
      }
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  async function handleChangeBlock(taskId: string, newBlockId: string) {
    const value = newBlockId === '_none' ? '' : newBlockId
    try {
      const res = await taskService.update(taskId, { blockId: value })
      if (res.success && res.data) {
        setTasks((prev) => prev.map((t) => t.id === taskId ? res.data! : t))
      }
    } catch {
      toast.error('Erro ao atualizar bloco')
    }
  }

  async function handleDelete(id: string) {
    try {
      await taskService.remove(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
      setDeleting(null)
      toast.success('Tarefa excluida')
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  function resetForm() {
    setTitle('')
    setDescription('')
    setPriority('medium')
    setAssigneeId('')
    setSelectedPipelineId('')
    setBlockId('')
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId)
  const pipelineBlocks = selectedPipeline
    ? selectedPipeline.phases.flatMap((phase) =>
        phase.blocks.map((block) => ({
          id: block.id,
          name: block.name,
          phaseName: phase.name,
        }))
      )
    : []

  const allBlocks = pipelines.flatMap((p) =>
    p.phases.flatMap((phase) =>
      phase.blocks.map((block) => ({
        id: block.id,
        name: block.name,
        phaseName: phase.name,
        phaseColor: phase.color,
        pipelineName: p.name,
      }))
    )
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Tarefas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {tasks.length} {tasks.length === 1 ? 'tarefa' : 'tarefas'} no total
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={16} />
          Nova tarefa
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma tarefa"
          description="Crie tarefas e atribua a blocos do pipeline."
        >
          <Button onClick={() => setShowCreate(true)} size="sm" variant="outline">
            <Plus size={16} />
            Criar tarefa
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Status pills */}
            <div className="flex items-center gap-1.5">
              {[
                { value: 'all', label: 'Todas' },
                ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
              ].map((f) => {
                const isActive = filterStatus === f.value
                const count = statusCounts[f.value] || 0
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFilterStatus(f.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-zinc-100 text-zinc-900'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                    }`}
                  >
                    {f.label}
                    <span className={`text-[10px] tabular-nums ${isActive ? 'text-zinc-600' : 'text-zinc-600'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search + Priority filter */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-40 rounded-lg bg-zinc-900 pl-7 pr-2 text-xs text-zinc-300 ring-1 ring-zinc-800 focus:ring-zinc-600 focus:outline-none placeholder:text-zinc-600 transition-all"
                />
              </div>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-8 w-auto gap-1 border-0 bg-zinc-900 ring-1 ring-zinc-800 text-xs px-2.5">
                  <Filter size={12} className="text-zinc-500" />
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Task list */}
          <div className="space-y-2">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Search size={20} className="text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-500">Nenhuma tarefa encontrada</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const pri = PRIORITIES.find((p) => p.value === task.priority) || PRIORITIES[1]
                const st = STATUSES.find((s) => s.value === task.status) || STATUSES[0]
                const isDone = task.status === 'done'
                const assigneeColor = task.assignee ? getAvatarColor(task.assignee.name) : '#71717a'

                return (
                  <div
                    key={task.id}
                    className="group flex items-center gap-3 rounded-xl p-3 ring-1 ring-zinc-800/60 hover:ring-zinc-700 bg-zinc-950 hover:bg-zinc-900/50 transition-all duration-150"
                  >
                    {/* Status icon (clickable) */}
                    <Select value={task.status} onValueChange={(v) => handleChangeStatus(task.id, v)}>
                      <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 shrink-0">
                        <div
                          className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ backgroundColor: st.color + '15' }}
                        >
                          <st.icon size={14} style={{ color: st.color }} />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            <span className="flex items-center gap-2">
                              <s.icon size={14} style={{ color: s.color }} />
                              {s.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
                          {task.title}
                        </p>
                        {task.priority === 'urgent' && (
                          <AlertTriangle size={12} className="text-red-400 shrink-0" />
                        )}
                      </div>
                      {task.description && (
                        <p className="text-[11px] text-zinc-600 truncate mt-0.5">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {task.assignee && (
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                              style={{ backgroundColor: assigneeColor + '20', color: assigneeColor }}
                            >
                              {task.assignee.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[11px] text-zinc-500">{task.assignee.name}</span>
                          </div>
                        )}
                        {task.block && (
                          <span className="text-[10px] text-zinc-600 truncate">
                            {task.block.phase.name} / {task.block.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Priority pill */}
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: pri.color + '15', color: pri.color }}
                      >
                        {pri.label}
                      </span>

                      {/* Block selector */}
                      <Select
                        value={task.blockId || '_none'}
                        onValueChange={(v) => handleChangeBlock(task.id, v)}
                      >
                        <SelectTrigger className="h-6 w-auto min-w-0 gap-1 border-0 bg-zinc-800/50 hover:bg-zinc-800 px-2 py-0 text-[10px] shadow-none focus-visible:ring-0 rounded-full text-zinc-500 transition-colors">
                          <SelectValue placeholder="Sem bloco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Sem bloco</SelectItem>
                          {allBlocks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.phaseName} / {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => setDeleting(task.id)}
                        className="p-1 rounded-lg text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-400/10 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Crie uma tarefa e atribua a um bloco do pipeline.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-title" className="text-xs">Titulo</Label>
                <Input
                  id="task-title"
                  placeholder="O que precisa ser feito?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={creating}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-desc" className="text-xs">Descricao</Label>
                <Textarea
                  id="task-desc"
                  placeholder="Detalhes da tarefa (opcional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={creating}
                  className="min-h-[60px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Membro</Label>
                  <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v === '_none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ninguem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Ninguem</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Pipeline</Label>
                  <Select value={selectedPipelineId || '_none'} onValueChange={(v) => { setSelectedPipelineId(v === '_none' ? '' : v); setBlockId('') }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum</SelectItem>
                      {pipelines.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bloco</Label>
                  <Combobox
                    value={blockId}
                    onValueChange={setBlockId}
                    placeholder={selectedPipelineId ? 'Buscar bloco...' : 'Escolha um pipeline'}
                    searchPlaceholder="Filtrar blocos..."
                    disabled={!selectedPipelineId}
                    options={[
                      { value: '', label: 'Nenhum' },
                      ...pipelineBlocks.map((b) => ({
                        value: b.id,
                        label: b.name,
                        group: b.phaseName,
                      })),
                    ]}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating || !title.trim()}>
                {creating ? <Spinner size="sm" /> : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>A tarefa sera excluida permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && handleDelete(deleting)} className="bg-red-500 text-white hover:bg-red-600">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
