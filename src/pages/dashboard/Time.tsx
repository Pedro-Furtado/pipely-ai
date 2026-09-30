import { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Trash2, Users, Phone, Plus, User, MessageCircle } from 'lucide-react'
import { teamService, type TeamMember } from '@/services/team'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

const COUNTRY_CODES = [
  { value: '55', label: '+55' },
  { value: '1', label: '+1' },
  { value: '351', label: '+351' },
  { value: '54', label: '+54' },
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Membro',
  viewer: 'Visualizador',
}

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function Time() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  // Form
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('55')
  const [creating, setCreating] = useState(false)

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

  function resetForm() {
    setName('')
    setPhone('')
    setCountryCode('55')
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return

    setCreating(true)
    try {
      const res = await teamService.create({
        name: name.trim(),
        phone: phone.trim(),
        countryCode,
      })
      if (res.success && res.data) {
        setMembers((prev) => [...prev, res.data!])
        resetForm()
        setShowCreate(false)
        toast.success('Membro adicionado')
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao adicionar membro')
    } finally {
      setCreating(false)
    }
  }

  async function handleRemove(id: string) {
    try {
      await teamService.remove(id)
      setMembers((prev) => prev.filter((m) => m.id !== id))
      setRemoving(null)
      toast.success('Membro removido')
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Time</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {members.length} {members.length === 1 ? 'membro' : 'membros'} no time
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={16} />
          Adicionar
        </Button>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum membro no time"
          description="Adicione membros com nome e telefone. Eles serao contatados via WhatsApp pelo agente."
        >
          <Button onClick={() => setShowCreate(true)} size="sm" variant="outline">
            <Plus size={16} />
            Adicionar membro
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => {
            const color = getAvatarColor(member.name)
            const initials = getInitials(member.name)
            const removingMember = members.find((m) => m.id === removing)

            return (
              <div
                key={member.id}
                className="group relative flex flex-col overflow-hidden rounded-xl ring-1 ring-zinc-800 hover:ring-zinc-700 transition-all duration-200 hover:shadow-lg bg-zinc-950"
              >
                {/* Header band */}
                <div
                  className="relative h-16 w-full shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${color}30 0%, ${color}08 100%)`,
                    borderBottom: `1px solid ${color}15`,
                  }}
                >
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => setRemoving(member.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-900/90 text-zinc-500 hover:text-red-400 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Avatar overlapping header */}
                <div className="px-4 -mt-6">
                  <div
                    className="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold shadow-lg ring-2 ring-zinc-950"
                    style={{ backgroundColor: color + '20', color }}
                  >
                    {initials}
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 pt-2.5 pb-4 flex-1 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{member.name}</p>
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1"
                      style={{ backgroundColor: color + '12', color }}
                    >
                      <User className="h-2.5 w-2.5" />
                      {ROLE_LABELS[member.role] || member.role}
                    </span>
                  </div>

                  <div className="space-y-1.5 mt-auto">
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <Phone size={11} className="shrink-0" />
                      <span className="font-mono">{member.phone}</span>
                    </div>
                    {member.remoteJid && (
                      <div className="flex items-center gap-2 text-[11px] text-zinc-600">
                        <MessageCircle size={11} className="shrink-0" />
                        <span className="font-mono truncate">{member.remoteJid.split('@')[0]}</span>
                      </div>
                    )}
                  </div>
                </div>

                {removingMember && null}
              </div>
            )
          })}

          {/* Add card */}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="group flex flex-col items-center justify-center gap-3 min-h-[200px] rounded-xl border-2 border-dashed border-zinc-800 bg-transparent hover:border-zinc-600 hover:bg-zinc-900/30 transition-all duration-200 cursor-pointer"
          >
            <div className="h-10 w-10 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
              <Plus className="h-5 w-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
            </div>
            <p className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors">
              Adicionar membro
            </p>
          </button>
        </div>
      )}

      {/* Create member dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar membro</DialogTitle>
            <DialogDescription>
              Adicione um membro ao time com nome e telefone. Ele sera contatado via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="member-name" className="text-xs">Nome</Label>
                <Input
                  id="member-name"
                  placeholder="Nome do membro"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={creating}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Telefone</Label>
                <div className="flex gap-2">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_CODES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="41999999999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={creating}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating || !name.trim() || !phone.trim()}>
                {creating ? <Spinner size="sm" /> : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removing} onOpenChange={() => setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              O membro sera removido do time. Tarefas atribuidas a ele ficarao sem responsavel.
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
