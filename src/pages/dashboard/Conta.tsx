import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Conta() {
  const { user } = useAuth()

  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Nome e obrigatorio')
      return
    }

    setSavingProfile(true)
    try {
      const res = await api.patch('/api/auth/me', { name: name.trim(), phone: phone.trim() || null })
      if (res.data.success) {
        toast.success('Dados atualizados')
        window.location.reload()
      }
    } catch {
      toast.error('Erro ao atualizar')
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (!currentPassword) {
      toast.error('Informe a senha atual')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Nova senha deve ter no minimo 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas nao coincidem')
      return
    }

    setSavingPassword(true)
    try {
      const res = await api.patch('/api/auth/me', { currentPassword, newPassword })
      if (res.data.success) {
        toast.success('Senha alterada')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao alterar senha')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Minha conta</h1>
        <p className="text-sm text-zinc-400">Gerencie seus dados pessoais.</p>
      </div>

      <div className="grid gap-6 max-w-lg">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dados pessoais</CardTitle>
            <CardDescription>Atualize seu nome e telefone.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="account-email" className="text-xs">Email</Label>
                <Input
                  id="account-email"
                  value={user?.email || ''}
                  disabled
                  className="opacity-50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-name" className="text-xs">Nome</Label>
                <Input
                  id="account-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={savingProfile}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-phone" className="text-xs">Telefone</Label>
                <Input
                  id="account-phone"
                  type="tel"
                  placeholder="11999999999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={savingProfile}
                />
              </div>
              <Button type="submit" size="sm" disabled={savingProfile}>
                {savingProfile ? <Spinner size="sm" /> : 'Salvar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Alterar senha</CardTitle>
            <CardDescription>Informe a senha atual para definir uma nova.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-pw" className="text-xs">Senha atual</Label>
                <div className="relative">
                  <Input
                    id="current-pw"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={savingPassword}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-50 transition-colors"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-pw" className="text-xs">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="new-pw"
                    type={showNew ? 'text' : 'password'}
                    placeholder="Minimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={savingPassword}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-50 transition-colors"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pw" className="text-xs">Confirmar nova senha</Label>
                <Input
                  id="confirm-pw"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={savingPassword}
                />
              </div>
              <Button type="submit" size="sm" disabled={savingPassword || !currentPassword || !newPassword}>
                {savingPassword ? <Spinner size="sm" /> : 'Alterar senha'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
