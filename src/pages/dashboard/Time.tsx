import { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Trash2, Users, Phone, Plus } from 'lucide-react'
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

const COUNTRY_CODES = [
  { value: '55', label: '🇧🇷 +55' },
  { value: '1', label: '🇺🇸 +1' },
  { value: '351', label: '🇵🇹 +351' },
  { value: '54', label: '🇦🇷 +54' },
]

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
          <p className="text-sm text-zinc-400">
            {members.length} {members.length === 1 ? 'membro' : 'membros'}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={16} />
          Adicionar membro
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <Card key={member.id} className="group relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-sm">{member.name}</CardTitle>
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
                  <Phone size={12} />
                  <span>{member.phone}</span>
                </div>
              </CardContent>
            </Card>
          ))}
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
                    <SelectTrigger className="w-[110px]">
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
