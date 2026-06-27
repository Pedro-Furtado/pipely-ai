import { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Key, Eye, EyeOff, CheckCircle2, Trash2, RefreshCw, ChevronLeft, ChevronRight, Send, ArrowRightLeft, MessageSquare, Clock, AlertTriangle, Bot } from 'lucide-react'
import { aiService, type AiConfig } from '@/services/ai'
import { agentLogService, type AgentLog } from '@/services/agent-logs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

const LOG_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Send }> = {
  processing: { label: 'Processando', color: 'text-blue-400 bg-blue-500/10', icon: Bot },
  message_sent: { label: 'Mensagem', color: 'text-green-400 bg-green-500/10', icon: Send },
  message_error: { label: 'Erro envio', color: 'text-red-400 bg-red-500/10', icon: AlertTriangle },
  task_moved: { label: 'Movida', color: 'text-purple-400 bg-purple-500/10', icon: ArrowRightLeft },
  move_error: { label: 'Erro mover', color: 'text-red-400 bg-red-500/10', icon: AlertTriangle },
  task_retry: { label: 'Retry', color: 'text-amber-400 bg-amber-500/10', icon: Clock },
  retry_error: { label: 'Erro retry', color: 'text-red-400 bg-red-500/10', icon: AlertTriangle },
  task_processed: { label: 'Processada', color: 'text-green-400 bg-green-500/10', icon: CheckCircle2 },
  agent_response: { label: 'Resumo', color: 'text-cyan-400 bg-cyan-500/10', icon: Bot },
  reply_received: { label: 'Resposta', color: 'text-blue-400 bg-blue-500/10', icon: MessageSquare },
  reply_processed: { label: 'Resp. processada', color: 'text-green-400 bg-green-500/10', icon: CheckCircle2 },
  auto_advance: { label: 'Auto-avanco', color: 'text-purple-400 bg-purple-500/10', icon: ArrowRightLeft },
  no_reply: { label: 'Sem resposta', color: 'text-amber-400 bg-amber-500/10', icon: Clock },
  status_changed: { label: 'Status', color: 'text-cyan-400 bg-cyan-500/10', icon: RefreshCw },
  notification_sent: { label: 'Notificacao', color: 'text-green-400 bg-green-500/10', icon: Send },
  notification_error: { label: 'Erro notif.', color: 'text-red-400 bg-red-500/10', icon: AlertTriangle },
  error: { label: 'Erro', color: 'text-red-400 bg-red-500/10', icon: AlertTriangle },
}

function getLogConfig(type: string) {
  return LOG_TYPE_CONFIG[type] || { label: type, color: 'text-zinc-400 bg-zinc-500/10', icon: Bot }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Assistente de IA</h1>
        <p className="text-sm text-zinc-400">
          Configure seu assistente e acompanhe a atividade do agente.
        </p>
      </div>

      {/* API Key Card */}
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Key size={16} />
            OpenAI API Key
          </CardTitle>
          <CardDescription>
            Sua chave de API da OpenAI para o assistente funcionar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config && !editing ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <span className="text-sm text-zinc-300 font-mono">{config.keyPreview}</span>
                </div>
                <Badge className="bg-green-500/20 text-green-400">
                  <CheckCircle2 size={10} className="mr-1" />
                  Configurada
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="flex-1">
                  Alterar chave
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowRemove(true)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-50 transition-colors"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving || !apiKey.trim()} className="flex-1">
                  {saving ? <Spinner size="sm" /> : 'Salvar'}
                </Button>
                {editing && (
                  <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); setApiKey('') }}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Agent Logs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-50">Atividade do agente</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setPage(1); loadLogs() }} disabled={logsLoading}>
              {logsLoading ? <Spinner size="sm" className="h-3 w-3" /> : <RefreshCw size={14} />}
            </Button>
            {totalLogs > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowClearLogs(true)} className="text-zinc-400">
                <Trash2 size={14} />
                Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 flex-wrap">
          {filterTypes.map(f => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setFilterType(f.value); setPage(1) }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filterType === f.value
                  ? 'bg-zinc-700 text-zinc-50'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {logs.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="Nenhum log registrado"
            description="Os logs do agente aparecerao aqui quando ele processar tarefas."
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-zinc-400">Data</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-zinc-400">Tipo</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-zinc-400">Evento</th>
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-zinc-400">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const cfg = getLogConfig(log.type)
                    const Icon = cfg.icon
                    const isExpanded = expandedLog === log.id
                    const hasDetail = !!log.detail

                    return (
                      <tr
                        key={log.id}
                        onClick={() => hasDetail && setExpandedLog(isExpanded ? null : log.id)}
                        className={`border-b border-zinc-800/50 transition-colors ${hasDetail ? 'cursor-pointer hover:bg-zinc-800/30' : ''}`}
                      >
                        <td className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap font-mono">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                            <Icon size={10} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-200 max-w-[300px] truncate">
                          {log.title}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-400 max-w-[400px]">
                          {isExpanded ? (
                            <span className="whitespace-pre-wrap break-words">{log.detail}</span>
                          ) : (
                            <span className="truncate block">{log.detail || '—'}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{totalLogs} log{totalLogs !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft size={14} />
                </Button>
                <span>{page} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <ChevronRight size={14} />
                </Button>
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
