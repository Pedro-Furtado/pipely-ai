import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Trash2, Users, Mail, Phone, Clock, Link2, Copy, Check, X } from 'lucide-react'
import { teamService, type TeamMember } from '@/services/team'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
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

interface InviteLink {
  id: string
  token: string
  expiresAt: string
  usedAt: string | null
  usedBy: string | null
  createdAt: string
}

export default function Time() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expiresHours, setExpiresHours] = useState('48')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const res = await teamService.list()
      if (res.success && res.data) setMembers(res.data)
    } catch {
      toast.error('Erro ao carregar time')
    } finally {
      setLoading(false)
    }
  }

  async function loadLinks() {
    setLoadingLinks(true)
    try {
      const res = await teamService.listInviteLinks()
      if (res.success && res.data) setInviteLinks(res.data)
    } catch { /* silent */ }
    finally { setLoadingLinks(false) }
  }

  function openInviteDialog() {
    setShowInvite(true)
    loadLinks()
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await teamService.generateInviteLink(Number(expiresHours) || 48)
      if (res.success && res.data) {
        const link = `${window.location.origin}/register?invite=${res.data.token}`
        await navigator.clipboard.writeText(link)
        toast.success('Link gerado e copiado!')
        loadLinks()
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao gerar link')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopy(token: string) {
    const link = `${window.location.origin}/register?invite=${token}`
    await navigator.clipboard.writeText(link)
    setCopiedToken(token)
    toast.success('Link copiado!')
    setTimeout(() => setCopiedToken(null), 2000)
  }

  async function handleRevokeLink(id: string) {
    try {
      await teamService.revokeInviteLink(id)
      setInviteLinks((prev) => prev.filter((l) => l.id !== id))
      toast.success('Link revogado')
    } catch {
      toast.error('Erro ao revogar')
    }
  }

  async function handleRemove(id: string) {
    try {
      await teamService.remove(id)
      setMembers((prev) => prev.filter((m) => m.id !== id))
      setRemoving(null)
      toast.success('Removido')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  function formatExpiry(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    if (d < now) return 'Expirado'
    const diffMs = d.getTime() - now.getTime()
    const hours = Math.floor(diffMs / 3600000)
    if (hours < 1) return `${Math.floor(diffMs / 60000)}min`
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d ${hours % 24}h`
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Time</h1>
          <p className="text-sm text-zinc-400">
            {members.length} {members.length === 1 ? 'membro' : 'membros'}
          </p>
        </div>
        <Button onClick={openInviteDialog} size="sm">
          <Link2 size={16} />
          Convidar
        </Button>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum membro no time"
          description="Gere um link de convite para adicionar membros ao seu time."
        >
          <Button onClick={openInviteDialog} size="sm" variant="outline">
            <Link2 size={16} />
            Gerar link de convite
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <Card key={member.id} className="group relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300">
                      {member.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-sm">{member.user.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoving(member.id)}
                    className="text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <Mail size={12} />
                  <span className="truncate">{member.user.email}</span>
                </div>
                {member.user.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={12} />
                    <span>{member.user.phone}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Convidar para o time</DialogTitle>
            <DialogDescription>
              Gere um link de convite e envie para o membro. Ele cria a conta e ja entra no time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Expira em (horas)</Label>
                <Input
                  type="number"
                  min="1"
                  max="720"
                  value={expiresHours}
                  onChange={(e) => setExpiresHours(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Button onClick={handleGenerate} disabled={generating} size="sm">
                {generating ? <Spinner size="sm" /> : 'Gerar link'}
              </Button>
            </div>

            {loadingLinks ? (
              <div className="flex justify-center py-4">
                <Spinner size="sm" />
              </div>
            ) : inviteLinks.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Links gerados</Label>
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                  {inviteLinks.map((link) => {
                    const expired = new Date(link.expiresAt) < new Date()
                    const used = !!link.usedAt

                    return (
                      <div
                        key={link.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-zinc-300 font-mono truncate">
                            ...{link.token.slice(-12)}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {used ? (
                              <Badge variant="secondary" className="text-[9px] text-emerald-400">Usado</Badge>
                            ) : expired ? (
                              <Badge variant="secondary" className="text-[9px] text-red-400">Expirado</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] text-blue-400">
                                <Clock size={8} className="mr-0.5" />
                                {formatExpiry(link.expiresAt)}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!used && !expired && (
                            <button
                              type="button"
                              onClick={() => handleCopy(link.token)}
                              className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                              title="Copiar link"
                            >
                              {copiedToken === link.token ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            </button>
                          )}
                          {!used && (
                            <button
                              type="button"
                              onClick={() => handleRevokeLink(link.id)}
                              className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                              title="Revogar"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removing} onOpenChange={() => setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover?</AlertDialogTitle>
            <AlertDialogDescription>
              O membro sera removido do time e de todos os pipelines.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removing && handleRemove(removing)}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
