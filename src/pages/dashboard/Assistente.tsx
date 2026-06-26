import { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Key, Eye, EyeOff, CheckCircle2, Trash2 } from 'lucide-react'
import { aiService, type AiConfig } from '@/services/ai'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
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

export default function Assistente() {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showRemove, setShowRemove] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const res = await aiService.getConfig()
      if (res.success) setConfig(res.data || null)
    } catch { /* silent */ }
    finally {
      setLoading(false)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Assistente de IA</h1>
        <p className="text-sm text-zinc-400">
          Configure seu assistente de inteligencia artificial.
        </p>
      </div>

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

      {/* Remove confirmation */}
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
    </div>
  )
}
