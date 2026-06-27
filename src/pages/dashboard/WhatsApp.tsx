import { useState, useEffect, type FormEvent } from 'react'
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

  // Delete instance
  const [deletingInstance, setDeletingInstance] = useState<EvolutionInstance | null>(null)

  // QR / Status per instance
  const [activeQr, setActiveQr] = useState<{ instanceId: string; qrcode: string } | null>(null)
  const [loadingQr, setLoadingQr] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, { state: string; name: string }>>({})
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null)
  // Webhook (global, not per instance)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [settingWebhook, setSettingWebhook] = useState(false)
  const [webhookInput, setWebhookInput] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const res = await whatsappService.getConfig()
      if (res.success) {
        setIsBundled(!!(res as Record<string, unknown>).isBundled)
        if (res.data) {
          setConfig(res.data)
          loadInstances()
          if (!res.data.isBundled) loadWebhook()
        }
      }
    } catch { /* silent */ }
    finally {
      setLoading(false)
    }
  }

  async function loadInstances() {
    setLoadingInstances(true)
    try {
      const res = await whatsappService.listInstances()
      if (res.success && res.data) {
        setInstances(res.data)
        for (const inst of res.data) checkStatus(inst.id)
      }
    } catch {
      toast.error('Erro ao buscar instancias')
    } finally {
      setLoadingInstances(false)
    }
  }

  async function loadWebhook() {
    try {
      const res = await whatsappService.getWebhook()
      if (res.success && res.data) {
        setWebhookUrl(res.data.url || '')
      }
    } catch { /* silent */ }
  }

  async function handleSaveWebhook() {
    if (!webhookInput.trim()) return
    setSettingWebhook(true)
    try {
      const res = await whatsappService.setWebhook(webhookInput.trim())
      if (res.success) {
        toast.success('Webhook salvo')
        setWebhookUrl(webhookInput.trim())
        setWebhookInput('')
      } else {
        toast.error(res.message || 'Erro ao salvar webhook')
      }
    } catch {
      toast.error('Erro ao salvar webhook')
    } finally {
      setSettingWebhook(false)
    }
  }

  async function checkStatus(instanceId: string) {
    setCheckingStatus(instanceId)
    try {
      const res = await whatsappService.getStatus(instanceId)
      if (res.success && res.data) {
        const state = res.data.state || 'close'
        setStatuses((prev) => ({
          ...prev,
          [instanceId]: { state, name: res.data!.name || '' },
        }))
        // Clear QR if connected
        if (state === 'open' && activeQr?.instanceId === instanceId) {
          setActiveQr(null)
        }
      } else {
        setStatuses((prev) => ({ ...prev, [instanceId]: { state: 'close', name: '' } }))
      }
    } catch {
      setStatuses((prev) => ({ ...prev, [instanceId]: { state: 'close', name: '' } }))
    } finally {
      setCheckingStatus(null)
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

  function getWebhookUrl(): string | undefined {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (isLocal) return undefined
    // In production, agent webhook runs on port 3335 or same origin
    return `${window.location.origin.replace(/:\d+$/, ':3335')}/webhook`
  }

  async function handleCreateInstance(e: FormEvent) {
    e.preventDefault()
    if (!newInstanceName.trim()) return

    setCreating(true)
    try {
      const res = await whatsappService.createInstance(newInstanceName.trim(), getWebhookUrl())
      if (res.success) {
        toast.success('Instancia criada')
        setShowCreate(false)
        setNewInstanceName('')
        loadInstances()
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao criar instancia')
    } finally {
      setCreating(false)
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
    setLoadingQr(instanceId)
    setActiveQr(null)
    try {
      await whatsappService.connect(instanceId)
      const res = await whatsappService.getQr(instanceId)
      if (res.success && res.data?.qrcode) {
        setActiveQr({ instanceId, qrcode: String(res.data.qrcode) })
      }
    } catch {
      toast.error('Erro ao gerar QR Code')
    } finally {
      setLoadingQr(null)
    }
  }

  async function handleDisconnect(instanceId: string) {
    try {
      await whatsappService.disconnect(instanceId)
      setStatuses((prev) => ({ ...prev, [instanceId]: { state: 'close', name: prev[instanceId]?.name || '' } }))
      setActiveQr(null)
      toast.success('Desconectado')
    } catch {
      toast.error('Erro ao desconectar')
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
      // Bundled mode but no config — shouldn't happen, reload
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

  // Has config — show instances from Evolution
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
          <Button variant="outline" size="sm" onClick={loadInstances} disabled={loadingInstances}>
            {loadingInstances ? <Spinner size="sm" /> : <RefreshCw size={14} />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            Nova instancia
          </Button>
          {!isBundled && (
            <>
              <a href={`${config.serverUrl}/manager`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink size={14} />
                  Manager
                </Button>
              </a>
              <Button variant="outline" size="sm" onClick={openEditConfig} className="text-zinc-400">
                <Settings size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Webhook config — only show in non-bundled mode */}
      {!isBundled && !webhookUrl ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium text-amber-400">
              <AlertCircle size={14} className="inline mr-1.5" />
              Webhook nao configurado
            </p>
            <p className="text-xs text-zinc-400">
              O agente precisa do webhook para receber respostas do WhatsApp. Cole a URL do webhook na Evolution Go e aqui.
            </p>
            {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <p className="text-xs text-zinc-500">
                Em localhost, use{' '}
                <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">ngrok</a>
                {' '}para expor a porta do agent:
                <code className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">ngrok http 3335</code>
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <Input
                placeholder="https://seu-dominio.com/webhook"
                value={webhookInput}
                onChange={(e) => setWebhookInput(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8" onClick={handleSaveWebhook} disabled={settingWebhook || !webhookInput.trim()}>
                {settingWebhook ? <Spinner size="sm" className="h-3 w-3" /> : 'Salvar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <CheckCircle2 size={12} className="text-green-500" />
          <span>Webhook: {webhookUrl}</span>
          <button
            type="button"
            onClick={() => { setWebhookInput(webhookUrl); setWebhookUrl('') }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            (alterar)
          </button>
        </div>
      )}

      {instances.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="Nenhuma instancia"
          description="Crie uma instancia para conectar seu WhatsApp."
        >
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            Criar instancia
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {instances.map((inst) => {
            const status = statuses[inst.id]
            const isConnected = status?.state === 'open'
            const isChecking = checkingStatus === inst.id
            const qr = activeQr?.instanceId === inst.id ? activeQr.qrcode : null
            const isLoadingQr = loadingQr === inst.id

            return (
              <Card key={inst.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                      <div>
                        <CardTitle className="text-sm">{inst.name}</CardTitle>
                        <p className="text-[10px] text-zinc-600 font-mono">{inst.id.substring(0, 8)}...</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={isConnected ? 'default' : 'outline'}
                        className={isConnected ? 'bg-green-500/20 text-green-400 text-[10px]' : 'text-[10px]'}
                      >
                        {isChecking ? (
                          <Spinner size="sm" className="h-3 w-3" />
                        ) : isConnected ? (
                          <><CheckCircle2 size={10} className="mr-0.5" /> Online</>
                        ) : (
                          <><AlertCircle size={10} className="mr-0.5" /> Offline</>
                        )}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => setDeletingInstance(inst)}
                        className="rounded p-1 text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {qr && (
                    <div className="flex flex-col items-center gap-2">
                      {qr.startsWith('data:') ? (
                        <img src={qr} alt="QR Code" className="h-48 w-48 rounded-lg bg-white p-2" />
                      ) : (
                        <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                          <p className="break-all text-center text-[10px] text-zinc-400 font-mono">{qr}</p>
                        </div>
                      )}
                      <p className="text-[10px] text-zinc-500">Escaneie com seu WhatsApp</p>
                    </div>
                  )}

                  {isConnected ? (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => checkStatus(inst.id)} className="flex-1" disabled={isChecking}>
                        <RefreshCw size={12} /> Atualizar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDisconnect(inst.id)} className="flex-1">
                        <WifiOff size={12} /> Desconectar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleGetQr(inst.id)} disabled={isLoadingQr} className="flex-1">
                        {isLoadingQr ? <Spinner size="sm" /> : <><QrCode size={12} /> QR Code</>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => checkStatus(inst.id)} className="flex-1" disabled={isChecking}>
                        <RefreshCw size={12} /> Status
                      </Button>
                    </div>
                  )}

                  {status?.name && (
                    <p className="text-[10px] text-zinc-500">
                      <Wifi size={10} className="inline mr-1" />{status.name}
                    </p>
                  )}

                </CardContent>
              </Card>
            )
          })}
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

      {/* Create instance */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova instancia</DialogTitle>
            <DialogDescription>Crie uma instancia para conectar um numero de WhatsApp.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInstance}>
            <div className="space-y-1.5">
              <Label htmlFor="inst-name" className="text-xs">Nome</Label>
              <Input id="inst-name" placeholder="Ex: Atendimento, Vendas, Suporte..." value={newInstanceName} onChange={(e) => setNewInstanceName(e.target.value)} disabled={creating} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit" disabled={creating || !newInstanceName.trim()}>
                {creating ? <Spinner size="sm" /> : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
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
