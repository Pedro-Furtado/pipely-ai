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
  Activity,
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
  accentColor,
}: {
  title: string
  value: string | number
  description: string
  icon: React.ElementType
  trend?: { value: number; label: string }
  accentColor: string
}) {
  return (
    <Card className="relative overflow-hidden border-0 ring-1 ring-zinc-800 hover:ring-zinc-700 transition-all duration-200 group">
      {/* Subtle gradient accent */}
      <div
        className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity"
        style={{ background: `linear-gradient(135deg, ${accentColor} 0%, transparent 60%)` }}
      />
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{title}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-zinc-50 tabular-nums">{value}</span>
              {trend && trend.value > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
                  <TrendingUp className="h-3 w-3" />
                  +{trend.value}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">
              {trend && trend.value > 0 ? trend.label : description}
            </p>
          </div>
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: accentColor + '15' }}
          >
            <Icon className="h-5 w-5" style={{ color: accentColor }} />
          </div>
        </div>
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

    const donePercent = tasks.length > 0 ? Math.round((byStatus.done / tasks.length) * 100) : 0

    return {
      total: tasks.length,
      byStatus,
      statusData,
      priorityData,
      timelineData,
      newThisWeek,
      donePercent,
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
    tarefas: { label: 'Tarefas criadas', color: '#6366f1' },
  }

  const firstName = user?.name?.split(' ')[0] || user?.name || ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Visao geral do seu workspace
          </p>
        </div>
        {stats.total > 0 && (
          <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500">
            <Activity className="h-3.5 w-3.5" />
            {stats.total} tarefa{stats.total !== 1 ? 's' : ''} no total
          </div>
        )}
      </div>

      {/* Urgent alert — top position for visibility */}
      {stats.byStatus.todo > 0 && tasks.some((t) => t.priority === 'urgent' && t.status !== 'done') && (
        <button
          type="button"
          onClick={() => navigate('/tarefas')}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-red-500/[0.06] ring-1 ring-red-500/20 hover:ring-red-500/40 transition-all group"
        >
          <div className="h-8 w-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-zinc-100">
              {tasks.filter((t) => t.priority === 'urgent' && t.status !== 'done').length} tarefa(s) urgente(s)
            </p>
            <p className="text-[11px] text-zinc-500">Aguardando acao</p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-red-400 transition-colors shrink-0" />
        </button>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total de tarefas"
          value={stats.total}
          description="No workspace"
          icon={ListTodo}
          accentColor="#6366f1"
          trend={stats.newThisWeek > 0 ? { value: stats.newThisWeek, label: `nova${stats.newThisWeek !== 1 ? 's' : ''} esta semana` } : undefined}
        />
        <KpiCard
          title="Em andamento"
          value={stats.byStatus.in_progress}
          description="Tarefas ativas"
          icon={Clock}
          accentColor="#3b82f6"
        />
        <KpiCard
          title="Concluidas"
          value={stats.byStatus.done}
          description={stats.total > 0 ? `${stats.donePercent}% do total` : 'Nenhuma tarefa'}
          icon={CheckCircle2}
          accentColor="#22c55e"
        />
        {isOwner ? (
          <KpiCard
            title="Membros do time"
            value={members.length + 1}
            description="Incluindo voce"
            icon={Users}
            accentColor="#f59e0b"
          />
        ) : (
          <KpiCard
            title="Pipelines"
            value={pipelines.length}
            description="No workspace"
            icon={Layers}
            accentColor="#f59e0b"
          />
        )}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Timeline - Area Chart */}
        <Card className="lg:col-span-4 border-0 ring-1 ring-zinc-800">
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
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="tarefas"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#fillTarefas)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#6366f1' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Status - Pie Chart */}
        <Card className="lg:col-span-3 border-0 ring-1 ring-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Por status</CardTitle>
            <CardDescription>Distribuicao atual</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.total === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-sm text-zinc-600">
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
        <Card className="lg:col-span-3 border-0 ring-1 ring-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Por prioridade</CardTitle>
            <CardDescription>Distribuicao das tarefas</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.priorityData.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-zinc-600">
                Nenhuma tarefa criada
              </div>
            ) : (
              <ChartContainer config={priorityChartConfig} className="aspect-auto h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.priorityData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
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
        <Card className="lg:col-span-4 border-0 ring-1 ring-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Tarefas recentes</CardTitle>
              <CardDescription>Ultimas tarefas criadas</CardDescription>
            </div>
            {tasks.length > 0 && (
              <button
                onClick={() => navigate('/tarefas')}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Ver todas <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-zinc-600">
                Nenhuma tarefa criada
              </div>
            ) : (
              <div className="space-y-2">
                {recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-3 rounded-xl p-3 ring-1 ring-zinc-800/60 hover:ring-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/60 transition-all duration-150"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[task.status] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.assignee && (
                            <span className="text-[11px] text-zinc-500 truncate">
                              {task.assignee.name}
                            </span>
                          )}
                          {task.block && (
                            <span className="text-[11px] text-zinc-600 truncate">
                              {task.block.phase.name} / {task.block.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: PRIORITY_COLORS[task.priority] + '15',
                          color: PRIORITY_COLORS[task.priority],
                        }}
                      >
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: STATUS_COLORS[task.status] + '15',
                          color: STATUS_COLORS[task.status],
                        }}
                      >
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
