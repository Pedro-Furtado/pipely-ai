import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Wifi,
  WifiOff,
  QrCode,
  ExternalLink,
  Settings,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Plus,
  MessageCircle,
  AlertTriangle,
  Loader2,
  Smartphone,
} from 'lucide-react'
import { whatsappService, type WhatsAppConfig, type EvolutionInstance } from '@/services/whatsapp'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface InstanceStats {
  profileName: string | null
  ownerJid: string | null
  avatar: string | null
}

const statusConfig = {
  open: { label: 'Conectado', icon: Wifi, color: 'text-emerald-500', statusColor: '#22c55e' },
  connecting: { label: 'Aguardando QR', icon: Loader2, color: 'text-amber-500', statusColor: '#f59e0b' },
  close: { label: 'Desconectado', icon: WifiOff, color: 'text-zinc-400', statusColor: '#a1a1aa' },
}

function InstanceAvatar({ src, name }: { src: string | null; name: string }) {
  const [imgErr, setImgErr] = useState(false)
  const initials = name.slice(0, 2).toUpperCase()

  if (src && !imgErr) {
    return (
      <div className="relative h-10 w-10 rounded-full overflow-hidden border border-zinc-700 shrink-0">
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgErr(true)}
        />
      </div>
    )
  }

  return (
    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
      <span className="text-xs font-semibold text-emerald-400">{initials}</span>
    </div>
  )
}

export default function WhatsApp() {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null)
  const [isBundled, setIsBundled] = useState(false)
  const [instances, setInstances] = useState<EvolutionInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingInstances, setLoadingInstances] = useState(false)

  // Config form
  const [showConfig, setShowConfig] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  // Create instance
  const [showCreate, setShowCreate] = useState(false)
  const [newInstanceName, setNewInstanceName] = useState('')
  const [creating, setCreating] = useState(false)
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseError, setLicenseError] = useState<string | null>(null)
  const [createQr, setCreateQr] = useState<string | null>(null)
  const [createdInstanceId, setCreatedInstanceId] = useState<string | null>(null)
  const [refreshingCreateQr, setRefreshingCreateQr] = useState(false)

  // Delete instance
  const [deletingInstance, setDeletingInstance] = useState<EvolutionInstance | null>(null)

  // Status + Stats per instance
  const [statuses, setStatuses] = useState<Record<string, { state: string; name: string }>>({})
  const [stats, setStats] = useState<Record<string, InstanceStats>>({})

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookInput, setWebhookInput] = useState('')
  const [editingWebhook, setEditingWebhook] = useState(false)
  const [savingWebhook, setSavingWebhook] = useState(false)

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isLocalWebhook = webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')

  // --- Data loading ---

  const checkStatus = useCallback(async (instanceId: string) => {
    try {
      const res = await whatsappService.getStatus(instanceId)
      if (res.success && res.data) {
        const state = res.data.state || 'close'
        setStatuses((prev) => ({
          ...prev,
          [instanceId]: { state, name: res.data!.name || '' },
        }))
        return state
      }
    } catch { /* silent */ }
    return 'close'
  }, [])

  const fetchStats = useCallback(async (instanceId: string) => {
    try {
      const res = await whatsappService.getInstanceStats(instanceId)
      if (res.success && res.data) {
        setStats((prev) => ({ ...prev, [instanceId]: res.data! }))
      }
    } catch { /* silent */ }
  }, [])

  const loadInstances = useCallback(async () => {
    setLoadingInstances(true)
    try {
      const res = await whatsappService.listInstances()
      if (res.success && res.data) {
        setInstances(res.data)
        for (const inst of res.data) {
          checkStatus(inst.id).then((state) => {
            if (state === 'open') fetchStats(inst.id)
          })
        }
        return res.data
      }
    } catch {
      toast.error('Erro ao buscar instancias')
    } finally {
      setLoadingInstances(false)
    }
    return []
  }, [checkStatus, fetchStats])

  async function loadConfig() {
    try {
      const res = await whatsappService.getConfig()
      if (res.success) {
        setIsBundled(!!(res as Record<string, unknown>).isBundled)
        if (res.data) {
          setConfig(res.data)
        }
      }
    } catch { /* silent */ }
    finally {
      setLoading(false)
    }
  }

  async function loadWebhook() {
    try {
      const res = await whatsappService.getWebhook()
      if (res.success && res.data?.url) {
        setWebhookUrl(res.data.url)
      } else {
        const defaultUrl = isBundled ? 'http://app:3335/webhook' : ''
        setWebhookUrl(defaultUrl)
        if (!defaultUrl) setEditingWebhook(true)
      }
    } catch { /* silent */ }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  // Load instances + webhook once config is available
  useEffect(() => {
    if (config) {
      loadInstances()
      loadWebhook()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  // --- Polling: auto-refresh while QR is active or instances are connecting ---
  useEffect(() => {
    const hasActiveQr = !!createQr
    const hasConnecting = Object.values(statuses).some((s) => s.state === 'connecting')

    if ((hasActiveQr || hasConnecting) && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        for (const inst of instances) {
          const prevState = statuses[inst.id]?.state
          const newState = await checkStatus(inst.id)

          // Only react to transition from non-open → open
          if (newState === 'open' && prevState !== 'open') {
            fetchStats(inst.id)
            // If this was the instance with active QR, close dialog
            if (createdInstanceId === inst.id && createQr) {
              setCreateQr(null)
              setCreatedInstanceId(null)
              setShowCreate(false)
              setNewInstanceName('')
              toast.success('WhatsApp conectado!')
            }
          }
        }
      }, 3000)
    } else if (!hasActiveQr && !hasConnecting && pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, createQr, instances, createdInstanceId])

  // --- Actions ---

  async function handleSaveWebhook() {
    if (!webhookInput.trim()) return
    setSavingWebhook(true)
    try {
      const res = await whatsappService.setWebhook(webhookInput.trim())
      if (res.success) {
        toast.success('Webhook salvo')
        setWebhookUrl(webhookInput.trim())
        setEditingWebhook(false)
      } else {
        toast.error(res.message || 'Erro ao salvar webhook')
      }
    } catch {
      toast.error('Erro ao salvar webhook')
    } finally {
      setSavingWebhook(false)
    }
  }

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault()
    if (!serverUrl.trim() || !apiKey.trim()) return

    setSavingConfig(true)
    try {
      const res = await whatsappService.saveConfig(serverUrl.trim(), apiKey.trim())
      if (res.success) {
        toast.success('Credenciais salvas')
        setShowConfig(false)
        loadConfig()
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao salvar')
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleRemoveConfig() {
    try {
      await whatsappService.removeConfig()
      setConfig(null)
      setInstances([])
      setStatuses({})
      setStats({})
      setShowConfig(false)
      toast.success('Credenciais removidas')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  function openEditConfig() {
    setServerUrl(config?.serverUrl || '')
    setApiKey('')
    setShowConfig(true)
  }

  async function handleCreateInstance(e?: FormEvent) {
    if (e) e.preventDefault()
    if (!newInstanceName.trim()) return

    setCreating(true)
    setLicenseError(null)
    try {
      const res = await whatsappService.createInstance(newInstanceName.trim(), webhookUrl || undefined)
      if (res.success && res.data) {
        // Instance created — now connect + get QR in one flow
        const instanceId = res.data.id || (res.data as Record<string, unknown>).name
        if (instanceId) {
          try {
            await whatsappService.connect(String(instanceId))
            // Small delay to let Evolution Go generate the QR
            await new Promise((r) => setTimeout(r, 1500))
            const qrRes = await whatsappService.getQr(String(instanceId))
            if (qrRes.success && qrRes.data?.qrcode) {
              setCreateQr(String(qrRes.data.qrcode))
              setCreatedInstanceId(String(instanceId))
              // Mark this instance as "connecting" so polling doesn't close dialog prematurely
              setStatuses((prev) => ({ ...prev, [String(instanceId)]: { state: 'connecting', name: '' } }))
            }
          } catch { /* QR will be fetched via card button */ }
        }
        // Refresh instance list without checking statuses (avoid premature "open" detection)
        try {
          const listRes = await whatsappService.listInstances()
          if (listRes.success && listRes.data) setInstances(listRes.data)
        } catch { /* silent */ }
        toast.success('Instancia criada')
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; licenseRequired?: boolean } } }
      if (axiosErr.response?.data?.licenseRequired) {
        // License not activated — trigger activation flow
        setLicenseLoading(true)
        setLicenseError('Ativando licenca...')
        try {
          const licRes = await whatsappService.getLicenseStatus()
          if (licRes.active) {
            setLicenseLoading(false)
            setLicenseError(null)
            handleCreateInstance()
            return
          }
          if (licRes.registerUrl) {
            setLicenseError('Registre-se para ativar. Uma janela sera aberta...')
            const popup = window.open(licRes.registerUrl, 'evo-license', 'width=600,height=700,scrollbars=yes')
            const checkInterval = setInterval(async () => {
              try {
                const statusRes = await whatsappService.getLicenseStatus()
                if (statusRes.active) {
                  clearInterval(checkInterval)
                  if (popup && !popup.closed) popup.close()
                  setLicenseLoading(false)
                  setLicenseError(null)
                  handleCreateInstance()
                }
              } catch { /* keep polling */ }
            }, 3000)
            setTimeout(() => {
              clearInterval(checkInterval)
              setLicenseLoading(false)
              setCreating(false)
              setLicenseError('Tempo esgotado. Tente novamente.')
            }, 120000)
            return
          }
          setLicenseError('Nao foi possivel iniciar ativacao da licenca')
          setLicenseLoading(false)
        } catch {
          setLicenseError('Erro ao verificar licenca')
          setLicenseLoading(false)
        }
        setCreating(false)
        return
      }
      toast.error(axiosErr.response?.data?.message || 'Erro ao criar instancia')
    } finally {
      if (!licenseLoading) setCreating(false)
    }
  }

  async function handleDeleteInstance() {
    if (!deletingInstance) return
    try {
      await whatsappService.deleteInstance(deletingInstance.id)
      toast.success('Instancia excluida')
      setDeletingInstance(null)
      loadInstances()
    } catch {
      toast.error('Erro ao excluir instancia')
    }
  }

  async function handleGetQr(instanceId: string) {
    try {
      await whatsappService.connect(instanceId)
      const res = await whatsappService.getQr(instanceId)
      if (res.success && res.data?.qrcode) {
        setCreateQr(String(res.data.qrcode))
        setCreatedInstanceId(instanceId)
        setShowCreate(true)
        setNewInstanceName(instances.find((i) => i.id === instanceId)?.name || '')
      }
    } catch {
      toast.error('Erro ao gerar QR Code')
    }
  }

  async function handleRefreshCreateQr() {
    if (!createdInstanceId) return
    setRefreshingCreateQr(true)
    try {
      const res = await whatsappService.getQr(createdInstanceId)
      if (res.success && res.data?.qrcode) {
        setCreateQr(String(res.data.qrcode))
      }
    } catch {
      toast.error('Erro ao atualizar QR')
    } finally {
      setRefreshingCreateQr(false)
    }
  }

  async function handleDisconnect(instanceId: string) {
    try {
      await whatsappService.disconnect(instanceId)
      setStatuses((prev) => ({ ...prev, [instanceId]: { state: 'close', name: prev[instanceId]?.name || '' } }))
      toast.success('Desconectado')
    } catch {
      toast.error('Erro ao desconectar')
    }
  }

  function handleCreateDialogClose(open: boolean) {
    if (!open) {
      setShowCreate(false)
      setNewInstanceName('')
      setCreateQr(null)
      setCreatedInstanceId(null)
      setLicenseError(null)
      setLicenseLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  // No config — setup
  if (!config) {
    if (isBundled) {
      return (
        <EmptyState
          icon={MessageCircle}
          title="Configurando WhatsApp..."
          description="A conexao com Evolution Go sera configurada automaticamente. Recarregue a pagina."
        >
          <Button size="sm" onClick={() => window.location.reload()}>
            <RefreshCw size={14} />
            Recarregar
          </Button>
        </EmptyState>
      )
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">WhatsApp</h1>
          <p className="text-sm text-zinc-400">Conecte sua instancia Evolution Go.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conectar servidor</CardTitle>
            <CardDescription>Cole a URL e API Key do seu servidor Evolution Go.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="setup-url" className="text-xs">URL do servidor</Label>
                <Input id="setup-url" placeholder="http://localhost:8080" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} disabled={savingConfig} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-key" className="text-xs">API Key (Global)</Label>
                <Input id="setup-key" type="password" placeholder="Sua chave de API" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={savingConfig} />
              </div>
              <Button type="submit" className="w-full" disabled={savingConfig || !serverUrl.trim() || !apiKey.trim()}>
                {savingConfig ? <Spinner size="sm" /> : 'Conectar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Has config — show instances
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">WhatsApp</h1>
          <p className="text-sm text-zinc-400">
            {isBundled ? 'Evolution Go integrado' : config.serverUrl}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadInstances()} disabled={loadingInstances}>
            {loadingInstances ? <Spinner size="sm" /> : <RefreshCw size={14} />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} disabled={!webhookUrl}>
            <Plus size={14} />
            Nova instancia
          </Button>
          <a href={config.managerUrl || `${config.serverUrl}/manager`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink size={14} />
              Manager
            </Button>
          </a>
          {!isBundled && (
            <Button variant="outline" size="sm" onClick={openEditConfig} className="text-zinc-400">
              <Settings size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Webhook config */}
      <Card className={!webhookUrl || editingWebhook ? 'border-amber-500/30 bg-amber-500/5' : ''}>
        <CardContent className="p-4 space-y-2">
          {editingWebhook || !webhookUrl ? (
            <>
              <p className="text-sm font-medium text-amber-400">
                <AlertCircle size={14} className="inline mr-1.5" />
                {webhookUrl ? 'Alterar webhook' : 'Webhook nao configurado'}
              </p>
              <p className="text-xs text-zinc-400">
                URL onde o agente recebe respostas do WhatsApp. Necessario para criar instancias.
              </p>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="https://seu-dominio.com:3335/webhook"
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8" onClick={handleSaveWebhook} disabled={savingWebhook || !webhookInput.trim()}>
                  {savingWebhook ? <Spinner size="sm" className="h-3 w-3" /> : 'Salvar'}
                </Button>
                {webhookUrl && (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setEditingWebhook(false)}>
                    Cancelar
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                <span className="truncate">Webhook: {webhookUrl}</span>
                <button
                  type="button"
                  onClick={() => { setWebhookInput(webhookUrl); setEditingWebhook(true) }}
                  className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  (alterar)
                </button>
              </div>
              {isLocalWebhook && (
                <p className="text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle size={10} />
                  Webhook em localhost nao recebe mensagens externas. Use um dominio ou ngrok para expor.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {instances.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Nenhuma instancia"
          description={webhookUrl ? 'Crie uma instancia para conectar seu WhatsApp.' : 'Configure o webhook primeiro para criar instancias.'}
        >
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={!webhookUrl}>
            <Plus size={14} />
            Criar instancia
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {instances.map((inst) => {
            const status = statuses[inst.id]
            const state = status?.state || 'close'
            const cfg = statusConfig[state as keyof typeof statusConfig] || statusConfig.close
            const isConnected = state === 'open'
            const instStats = stats[inst.id]
            const sc = cfg.statusColor

            return (
              <Card
                key={inst.id}
                className="group relative flex flex-col overflow-hidden border-0 shadow-sm ring-1 ring-zinc-800 transition-all duration-200 hover:shadow-lg hover:ring-zinc-700 p-0"
              >
                {/* Colored header band */}
                <div
                  className="relative h-20 w-full shrink-0 flex items-end px-4 pb-3"
                  style={{
                    background: `linear-gradient(135deg, ${sc}33 0%, ${sc}11 100%)`,
                    borderBottom: `1px solid ${sc}22`,
                  }}
                >
                  {isConnected && instStats?.avatar ? (
                    <InstanceAvatar src={instStats.avatar} name={inst.name} />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: sc + '22', border: `1.5px solid ${sc}55` }}
                    >
                      <Smartphone className="h-5 w-5" style={{ color: sc }} />
                    </div>
                  )}

                  {isConnected && (
                    <span
                      className="absolute top-3 left-4 h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: sc }}
                    />
                  )}

                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setDeletingInstance(inst)}
                      className="rounded-lg p-1.5 bg-zinc-900/60 hover:bg-zinc-900/90 text-red-400 backdrop-blur-sm transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-2.5">
                  <div>
                    <p className="font-semibold text-sm leading-tight text-zinc-100">
                      {isConnected && instStats?.profileName ? instStats.profileName : inst.name}
                    </p>
                    {isConnected && instStats?.profileName && instStats.profileName !== inst.name && (
                      <p className="text-[11px] text-zinc-500 mt-0.5">{inst.name}</p>
                    )}
                  </div>

                  {/* Status + phone badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: sc + '18', color: sc }}
                    >
                      {state === 'connecting' ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <cfg.icon className="h-2.5 w-2.5" />
                      )}
                      {cfg.label}
                    </span>
                    {isConnected && instStats?.ownerJid && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                        {instStats.ownerJid.split('@')[0]}
                      </span>
                    )}
                  </div>

                  {/* Connecting message */}
                  {state === 'connecting' && (
                    <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                      <QrCode className="h-3 w-3" />
                      Aguardando leitura do QR Code
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-1">
                    {isConnected ? (
                      <Button variant="outline" size="sm" onClick={() => handleDisconnect(inst.id)} className="flex-1 text-xs h-8">
                        <WifiOff size={12} /> Desconectar
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleGetQr(inst.id)} className="flex-1 text-xs h-8">
                        <QrCode size={12} /> Conectar
                      </Button>
                    )}
                  </div>

                  {/* Instance ID */}
                  <span className="text-[10px] text-zinc-600 font-mono truncate">
                    {inst.id.substring(0, 12)}...
                  </span>
                </div>
              </Card>
            )
          })}

          {/* Create card */}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={!webhookUrl}
            className="group flex flex-col items-center justify-center gap-3 min-h-[200px] rounded-xl border-2 border-dashed border-zinc-800 bg-transparent hover:border-zinc-600 hover:bg-zinc-900/30 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="h-10 w-10 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
              <Plus className="h-5 w-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            </div>
            <p className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors">
              Nova instancia
            </p>
          </button>
        </div>
      )}

      {/* Edit config */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credenciais Evolution Go</DialogTitle>
            <DialogDescription>URL e API Key do seu servidor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveConfig}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-url" className="text-xs">URL do servidor</Label>
                <Input id="edit-url" placeholder="https://seu-app.railway.app" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} disabled={savingConfig} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-key" className="text-xs">API Key (Global)</Label>
                <Input id="edit-key" type="password" placeholder="Sua chave de API" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={savingConfig} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={handleRemoveConfig} className="mr-auto text-red-400 hover:text-red-300">
                <Trash2 size={14} /> Desconectar servidor
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowConfig(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingConfig || !serverUrl.trim() || !apiKey.trim()}>
                {savingConfig ? <Spinner size="sm" /> : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create instance + QR Code dialog */}
      <Dialog open={showCreate} onOpenChange={handleCreateDialogClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {createQr ? 'Escanear QR Code' : 'Nova instancia'}
            </DialogTitle>
            <DialogDescription>
              {createQr
                ? 'Abra o WhatsApp no celular e escaneie o QR Code abaixo.'
                : 'Crie uma instancia para conectar um numero de WhatsApp.'}
            </DialogDescription>
          </DialogHeader>

          {!createQr ? (
            <form onSubmit={handleCreateInstance}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inst-name" className="text-xs">Nome</Label>
                  <Input
                    id="inst-name"
                    placeholder="Ex: Atendimento, Vendas, Suporte..."
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    disabled={creating}
                    autoFocus
                  />
                </div>
                {licenseError && (
                  <div className="flex items-center gap-2 text-xs">
                    {licenseLoading && <Loader2 className="h-3 w-3 animate-spin text-amber-400" />}
                    <p className={licenseLoading ? 'text-amber-400' : 'text-red-400'}>{licenseError}</p>
                  </div>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => handleCreateDialogClose(false)}>Cancelar</Button>
                <Button type="submit" disabled={creating || !newInstanceName.trim()}>
                  {creating ? <Spinner size="sm" /> : <><QrCode size={14} /> Criar e gerar QR</>}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="rounded-xl border border-zinc-700 p-3 bg-white">
                {createQr.startsWith('data:') ? (
                  <img src={createQr} alt="QR Code" className="h-48 w-48 rounded" />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded bg-zinc-100 p-3">
                    <p className="break-all text-center text-[10px] text-zinc-500 font-mono">{createQr}</p>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 text-center">
                WhatsApp &rarr; Dispositivos vinculados &rarr; Vincular dispositivo
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRefreshCreateQr} disabled={refreshingCreateQr}>
                  {refreshingCreateQr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Atualizar QR
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando conexao...
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete instance */}
      <AlertDialog open={!!deletingInstance} onOpenChange={() => setDeletingInstance(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instancia "{deletingInstance?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>A instancia sera excluida permanentemente da Evolution Go.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInstance} className="bg-red-500 text-white hover:bg-red-600">
              <Trash2 size={14} /> Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
