import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { taskService, type Task } from '@/services/tasks'
import { pipelineService, type Pipeline } from '@/services/pipeline'
import { teamService, type TeamMember } from '@/services/team'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts'
import {
  CheckCircle2,
  Clock,
  ListTodo,
  Users,
  TrendingUp,
  Layers,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// ─── PRIORITY / STATUS MAPS ──────────────────────────────────────────────────

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Concluido',
}

const STATUS_COLORS: Record<string, string> = {
  todo: '#a1a1aa',
  in_progress: '#3b82f6',
  done: '#22c55e',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#eab308',
  urgent: '#ef4444',
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
}: {
  title: string
  value: string | number
  description: string
  icon: React.ElementType
  trend?: { value: number; label: string }
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-zinc-400" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-zinc-50">{value}</div>
        <p className="text-xs text-zinc-400 mt-1">
          {trend ? (
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-emerald-500">{trend.value}</span>
              {' '}{trend.label}
            </span>
          ) : (
            description
          )}
        </p>
      </CardContent>
    </Card>
  )
}

// ─── CHART CONFIGS ────────────────────────────────────────────────────────────

const statusChartConfig: ChartConfig = {
  todo: { label: 'A fazer', color: STATUS_COLORS.todo },
  in_progress: { label: 'Em andamento', color: STATUS_COLORS.in_progress },
  done: { label: 'Concluido', color: STATUS_COLORS.done },
}

const priorityChartConfig: ChartConfig = {
  low: { label: 'Baixa', color: PRIORITY_COLORS.low },
  medium: { label: 'Media', color: PRIORITY_COLORS.medium },
  high: { label: 'Alta', color: PRIORITY_COLORS.high },
  urgent: { label: 'Urgente', color: PRIORITY_COLORS.urgent },
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const { isOwner } = useWorkspace()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState<Task[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [tasksRes, pipelinesRes, membersRes] = await Promise.all([
        taskService.list(),
        pipelineService.list(),
        teamService.list(),
      ])

      if (tasksRes.success && tasksRes.data) setTasks(tasksRes.data)
      if (pipelinesRes.success && pipelinesRes.data) setPipelines(pipelinesRes.data)
      if (membersRes.success && membersRes.data) setMembers(membersRes.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  // ─── Computed stats ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const byStatus = { todo: 0, in_progress: 0, done: 0 }
    const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 }
    const byDay: Record<string, number> = {}

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1

      const day = new Date(task.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      })
      byDay[day] = (byDay[day] || 0) + 1
    }

    const statusData = Object.entries(byStatus).map(([key, value]) => ({
      name: key,
      label: STATUS_LABELS[key],
      value,
      fill: STATUS_COLORS[key],
    }))

    const priorityData = Object.entries(byPriority)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        name: key,
        label: PRIORITY_LABELS[key],
        value,
        fill: PRIORITY_COLORS[key],
      }))

    // Last 14 days timeline
    const timelineData: Array<{ date: string; tarefas: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      timelineData.push({ date: key, tarefas: byDay[key] || 0 })
    }

    // New this week
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const newThisWeek = tasks.filter((t) => new Date(t.createdAt) >= weekAgo).length

    return {
      total: tasks.length,
      byStatus,
      statusData,
      priorityData,
      timelineData,
      newThisWeek,
    }
  }, [tasks])

  const recentTasks = useMemo(
    () => tasks.slice(0, 5),
    [tasks]
  )

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  const timelineConfig: ChartConfig = {
    tarefas: { label: 'Tarefas criadas', color: 'var(--color-primary)' },
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">
          Bem-vindo, {user?.name}!
        </h1>
        <p className="text-sm text-zinc-400">
          Visao geral do seu workspace
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total de tarefas"
          value={stats.total}
          description="No workspace"
          icon={ListTodo}
          trend={stats.newThisWeek > 0 ? { value: stats.newThisWeek, label: 'esta semana' } : undefined}
        />
        <KpiCard
          title="Em andamento"
          value={stats.byStatus.in_progress}
          description="Tarefas ativas"
          icon={Clock}
        />
        <KpiCard
          title="Concluidas"
          value={stats.byStatus.done}
          description={stats.total > 0 ? `${Math.round((stats.byStatus.done / stats.total) * 100)}% do total` : 'Nenhuma tarefa'}
          icon={CheckCircle2}
        />
        {isOwner ? (
          <KpiCard
            title="Membros do time"
            value={members.length + 1}
            description="Incluindo voce"
            icon={Users}
          />
        ) : (
          <KpiCard
            title="Pipelines"
            value={pipelines.length}
            description="No workspace"
            icon={Layers}
          />
        )}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Timeline - Area Chart */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Tarefas criadas</CardTitle>
            <CardDescription>Ultimos 14 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={timelineConfig} className="aspect-auto h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.timelineData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillTarefas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-tarefas)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-tarefas)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="tarefas"
                    stroke="var(--color-tarefas)"
                    strokeWidth={2}
                    fill="url(#fillTarefas)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Status - Pie Chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Por status</CardTitle>
            <CardDescription>Distribuicao atual</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.total === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-zinc-500">
                Nenhuma tarefa criada
              </div>
            ) : (
              <ChartContainer config={statusChartConfig} className="aspect-auto h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Pie
                      data={stats.statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      strokeWidth={2}
                      stroke="hsl(0 0% 3.9%)"
                    >
                      {stats.statusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Legend content={<ChartLegendContent nameKey="name" />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Priority - Bar Chart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Por prioridade</CardTitle>
            <CardDescription>Distribuicao das tarefas</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.priorityData.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-zinc-500">
                Nenhuma tarefa criada
              </div>
            ) : (
              <ChartContainer config={priorityChartConfig} className="aspect-auto h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.priorityData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {stats.priorityData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Tarefas recentes</CardTitle>
              <CardDescription>Ultimas tarefas criadas</CardDescription>
            </div>
            {tasks.length > 0 && (
              <button
                onClick={() => navigate('/tarefas')}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Ver todas <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-zinc-500">
                Nenhuma tarefa criada
              </div>
            ) : (
              <div className="space-y-3">
                {recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {task.assignee && (
                          <span className="text-xs text-zinc-500 truncate">
                            {task.assignee.name}
                          </span>
                        )}
                        {task.block && (
                          <span className="text-xs text-zinc-600">
                            {task.block.phase.name} / {task.block.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5"
                        style={{
                          borderColor: PRIORITY_COLORS[task.priority],
                          color: PRIORITY_COLORS[task.priority],
                        }}
                      >
                        {PRIORITY_LABELS[task.priority]}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5"
                        style={{ backgroundColor: STATUS_COLORS[task.status] + '20', color: STATUS_COLORS[task.status] }}
                      >
                        {STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Urgent alert */}
      {stats.byStatus.todo > 0 && tasks.some((t) => t.priority === 'urgent' && t.status !== 'done') && (
        <Card className="border-red-900/50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-zinc-100">
                Tarefas urgentes pendentes
              </p>
              <p className="text-xs text-zinc-400">
                {tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length} tarefa(s)
                urgente(s) aguardando acao
              </p>
            </div>
            <button
              onClick={() => navigate('/tarefas')}
              className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors shrink-0"
            >
              Ver tarefas
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
