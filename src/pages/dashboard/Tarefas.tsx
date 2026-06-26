import { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, ClipboardList, AlertTriangle, CircleDot, Clock, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { taskService, type Task } from '@/services/tasks'
import { teamService, type TeamMember } from '@/services/team'
import { pipelineService, type Pipeline } from '@/services/pipeline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Combobox } from '@/components/ui/combobox'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  { value: 'low', label: 'Baixa', dot: 'bg-zinc-400' },
  { value: 'medium', label: 'Media', dot: 'bg-blue-400' },
  { value: 'high', label: 'Alta', dot: 'bg-amber-400' },
  { value: 'urgent', label: 'Urgente', dot: 'bg-red-400' },
]

const STATUSES = [
  { value: 'todo', label: 'A fazer', icon: CircleDot, color: 'text-zinc-400' },
  { value: 'in_progress', label: 'Em andamento', icon: Clock, color: 'text-blue-400' },
  { value: 'done', label: 'Concluida', icon: CheckCircle2, color: 'text-green-400' },
]

export default function Tarefas() {
  const { user } = useAuth()
  const { isOwner } = useWorkspace()
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

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
      if (tasksRes.success && tasksRes.data) {
        // Member only sees tasks assigned to them
        const filtered = isOwner
          ? tasksRes.data
          : tasksRes.data.filter((t: Task) => t.assigneeId === user?.id)
        setTasks(filtered)
      }
      if (membersRes.success && membersRes.data) setMembers(membersRes.data)
      if (pipelinesRes.success && pipelinesRes.data) setPipelines(pipelinesRes.data)
    } catch {
      toast.error('Erro ao carregar tarefas')
    } finally {
      setLoading(false)
    }
  }

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

  // Blocks from selected pipeline only
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

  // All blocks (for inline select on task cards)
  // Build flat list of blocks from all pipelines
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Tarefas</h1>
          <p className="text-sm text-zinc-400">
            {tasks.length} {tasks.length === 1 ? 'tarefa' : 'tarefas'}
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={16} />
            Nova tarefa
          </Button>
        )}
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
        <div className="space-y-2">
          {tasks.map((task) => {
            const pri = PRIORITIES.find((p) => p.value === task.priority) || PRIORITIES[1]
            const st = STATUSES.find((s) => s.value === task.status) || STATUSES[0]

            return (
              <Card key={task.id} className="group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Select value={task.status} onValueChange={(v) => handleChangeStatus(task.id, v)}>
                        <SelectTrigger className="mt-0.5 h-auto w-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0">
                          <st.icon size={16} className={st.color} />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              <span className="flex items-center gap-2">
                                <s.icon size={14} className={s.color} />
                                {s.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="min-w-0">
                        <CardTitle className={`text-sm ${task.status === 'done' ? 'line-through text-zinc-500' : ''}`}>{task.title}</CardTitle>
                        {task.description && (
                          <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{task.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.priority === 'urgent' && <AlertTriangle size={12} className="text-red-400" />}
                      <Badge variant="outline" className="text-[10px]">
                        {pri.label}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => setDeleting(task.id)}
                        className="text-zinc-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3">
                  <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                    {task.assignee && (
                      <div className="flex items-center gap-1">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[8px] text-zinc-400">
                          {task.assignee.name.charAt(0).toUpperCase()}
                        </div>
                        {task.assignee.name}
                      </div>
                    )}
                    <Select
                      value={task.blockId || '_none'}
                      onValueChange={(v) => handleChangeBlock(task.id, v)}
                    >
                      <SelectTrigger className="h-5 w-auto min-w-0 gap-1 border-0 bg-transparent px-1 py-0 text-[10px] shadow-none focus-visible:ring-0">
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
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
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
                            <span className={`h-2 w-2 rounded-full ${p.dot}`} />
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
                        <SelectItem key={m.id} value={m.user.id}>{m.user.name}</SelectItem>
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
