import { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Key, Eye, EyeOff, CheckCircle2, Trash2, RefreshCw, ChevronLeft, ChevronRight, Send, ArrowRightLeft, MessageSquare, Clock, AlertTriangle, Bot, Activity, Shield } from 'lucide-react'
import { aiService, type AiConfig } from '@/services/ai'
import { agentLogService, type AgentLog } from '@/services/agent-logs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
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

const LOG_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Send }> = {
  processing: { label: 'Processando', color: '#3b82f6', bg: '#3b82f620', icon: Bot },
  message_sent: { label: 'Mensagem', color: '#22c55e', bg: '#22c55e20', icon: Send },
  message_error: { label: 'Erro envio', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
  task_moved: { label: 'Movida', color: '#a855f7', bg: '#a855f720', icon: ArrowRightLeft },
  move_error: { label: 'Erro mover', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
  task_retry: { label: 'Retry', color: '#f59e0b', bg: '#f59e0b20', icon: Clock },
  retry_error: { label: 'Erro retry', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
  task_processed: { label: 'Processada', color: '#22c55e', bg: '#22c55e20', icon: CheckCircle2 },
  agent_response: { label: 'Resumo', color: '#06b6d4', bg: '#06b6d420', icon: Bot },
  reply_received: { label: 'Resposta', color: '#3b82f6', bg: '#3b82f620', icon: MessageSquare },
  reply_processed: { label: 'Resp. processada', color: '#22c55e', bg: '#22c55e20', icon: CheckCircle2 },
  auto_advance: { label: 'Auto-avanco', color: '#a855f7', bg: '#a855f720', icon: ArrowRightLeft },
  no_reply: { label: 'Sem resposta', color: '#f59e0b', bg: '#f59e0b20', icon: Clock },
  status_changed: { label: 'Status', color: '#06b6d4', bg: '#06b6d420', icon: RefreshCw },
  notification_sent: { label: 'Notificacao', color: '#22c55e', bg: '#22c55e20', icon: Send },
  notification_error: { label: 'Erro notif.', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
  buttons_sent: { label: 'Botoes', color: '#22c55e', bg: '#22c55e20', icon: Send },
  buttons_error: { label: 'Erro botoes', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
  poll_sent: { label: 'Enquete', color: '#22c55e', bg: '#22c55e20', icon: Send },
  poll_error: { label: 'Erro enquete', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
  list_sent: { label: 'Lista', color: '#22c55e', bg: '#22c55e20', icon: Send },
  list_error: { label: 'Erro lista', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
  error: { label: 'Erro', color: '#ef4444', bg: '#ef444420', icon: AlertTriangle },
}

function getLogConfig(type: string) {
  return LOG_TYPE_CONFIG[type] || { label: type, color: '#a1a1aa', bg: '#a1a1aa20', icon: Bot }
}

function timeAgo(dateStr: string) {
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Assistente() {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showRemove, setShowRemove] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showClearLogs, setShowClearLogs] = useState(false)

  // Logs
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalLogs, setTotalLogs] = useState(0)
  const [filterType, setFilterType] = useState('')
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    loadLogs()
  }, [page, filterType])

  // Auto-refresh logs every 30s
  useEffect(() => {
    const interval = setInterval(() => { if (page === 1) loadLogs() }, 30000)
    return () => clearInterval(interval)
  }, [page, filterType])

  async function loadConfig() {
    try {
      const res = await aiService.getConfig()
      if (res.success) setConfig(res.data || null)
    } catch { /* silent */ }
    finally {
      setLoading(false)
    }
  }

  async function loadLogs() {
    setLogsLoading(true)
    try {
      const res = await agentLogService.list(page, 20, filterType || undefined)
      if (res.success) {
        setLogs(res.data || [])
        setTotalPages(res.pagination?.pages || 1)
        setTotalLogs(res.pagination?.total || 0)
      }
    } catch { /* silent */ }
    finally {
      setLogsLoading(false)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) return

    setSaving(true)
    try {
      const res = await aiService.saveKey(apiKey.trim())
      if (res.success) {
        toast.success('API Key salva')
        setApiKey('')
        setEditing(false)
        loadConfig()
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    try {
      await aiService.removeKey()
      setConfig(null)
      setShowRemove(false)
      toast.success('API Key removida')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  async function handleClearLogs() {
    try {
      await agentLogService.clear()
      setShowClearLogs(false)
      setLogs([])
      setTotalLogs(0)
      setPage(1)
      toast.success('Logs limpos')
    } catch {
      toast.error('Erro ao limpar logs')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  const filterTypes = [
    { value: '', label: 'Todos' },
    { value: 'message_sent', label: 'Mensagens' },
    { value: 'task_moved', label: 'Movidas' },
    { value: 'reply_received', label: 'Respostas' },
    { value: 'error', label: 'Erros' },
    { value: 'auto_advance', label: 'Auto-avanco' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Assistente de IA</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Configure e acompanhe a atividade do agente.
          </p>
        </div>
        {config && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Agente ativo
          </div>
        )}
      </div>

      {/* API Key Card */}
      <div className="max-w-lg">
        <div className="rounded-xl ring-1 ring-zinc-800 overflow-hidden">
          {/* Card header with gradient */}
          <div className="relative px-5 pt-5 pb-4" style={{ background: 'linear-gradient(135deg, #6366f115 0%, transparent 60%)' }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-indigo-500/15">
                  <Key size={18} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">OpenAI API Key</h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Chave para o agente funcionar</p>
                </div>
              </div>
              {config && !editing && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                  <Shield size={10} />
                  Configurada
                </span>
              )}
            </div>
          </div>

          {/* Card body */}
          <div className="px-5 pb-5">
            {config && !editing ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg bg-zinc-900/50 ring-1 ring-zinc-800 px-3 py-2.5">
                  <span className="text-sm text-zinc-400 font-mono flex-1">{config.keyPreview}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="flex-1 text-xs h-8">
                    Alterar chave
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowRemove(true)} className="text-red-400 hover:text-red-300 h-8">
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="openai-key" className="text-xs">API Key</Label>
                  <div className="relative">
                    <Input
                      id="openai-key"
                      type={showKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      disabled={saving}
                      autoFocus
                      className="pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={saving || !apiKey.trim()} className="flex-1 h-8 text-xs">
                    {saving ? <Spinner size="sm" /> : 'Salvar'}
                  </Button>
                  {editing && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); setApiKey('') }} className="h-8 text-xs">
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Agent Activity */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-50">Atividade do agente</h2>
            {totalLogs > 0 && (
              <span className="text-[11px] text-zinc-600 tabular-nums">{totalLogs}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setPage(1); loadLogs() }} disabled={logsLoading} className="h-7 w-7 p-0">
              {logsLoading ? <Spinner size="sm" className="h-3 w-3" /> : <RefreshCw size={13} />}
            </Button>
            {totalLogs > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowClearLogs(true)} className="h-7 text-xs text-zinc-500">
                <Trash2 size={12} />
                Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5">
          {filterTypes.map(f => {
            const isActive = filterType === f.value
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => { setFilterType(f.value); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Log entries */}
        {logs.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Nenhum log registrado"
            description="Os logs do agente aparecerao aqui quando ele processar tarefas."
          />
        ) : (
          <>
            <div className="space-y-1.5">
              {logs.map(log => {
                const cfg = getLogConfig(log.type)
                const Icon = cfg.icon
                const isExpanded = expandedLog === log.id
                const hasDetail = !!log.detail

                return (
                  <div
                    key={log.id}
                    onClick={() => hasDetail && setExpandedLog(isExpanded ? null : log.id)}
                    className={`group rounded-xl p-3 ring-1 ring-zinc-800/60 hover:ring-zinc-700 bg-zinc-950 transition-all duration-150 ${hasDetail ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div
                        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: cfg.bg }}
                      >
                        <Icon size={13} style={{ color: cfg.color }} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: cfg.bg, color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                          <span className="text-[10px] text-zinc-600 font-mono" title={formatDate(log.createdAt)}>
                            {timeAgo(log.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-200 mt-1 leading-snug">{log.title}</p>
                        {isExpanded && log.detail && (
                          <p className="text-xs text-zinc-500 mt-1.5 whitespace-pre-wrap break-words leading-relaxed bg-zinc-900/50 rounded-lg px-3 py-2 ring-1 ring-zinc-800/50">
                            {log.detail}
                          </p>
                        )}
                        {!isExpanded && log.detail && (
                          <p className="text-[11px] text-zinc-600 mt-0.5 truncate">{log.detail}</p>
                        )}
                      </div>

                      {/* Time (right) */}
                      <span className="text-[10px] text-zinc-700 font-mono shrink-0 hidden sm:block">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
              <span>{totalLogs} log{totalLogs !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 w-7 rounded-lg ring-1 ring-zinc-800 flex items-center justify-center hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="tabular-nums">{page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 w-7 rounded-lg ring-1 ring-zinc-800 flex items-center justify-center hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Remove API Key confirmation */}
      <AlertDialog open={showRemove} onOpenChange={setShowRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              O assistente de IA deixara de funcionar ate uma nova chave ser configurada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} className="bg-red-500 text-white hover:bg-red-600">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear logs confirmation */}
      <AlertDialog open={showClearLogs} onOpenChange={setShowClearLogs}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todos os logs?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os registros de atividade do agente serao removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearLogs} className="bg-red-500 text-white hover:bg-red-600">
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
