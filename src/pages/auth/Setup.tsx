import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { api } from '@/services/api'
import { useSetup } from '@/contexts/SetupContext'
import { COUNTRY_CODES } from '@/lib/country-codes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Setup() {
  const navigate = useNavigate()
  const { markSetupDone } = useSetup()
  const [checking, setChecking] = useState(true)
  const [setupKey, setSetupKey] = useState('')
  const [name, setName] = useState('')
  const [countryCode, setCountryCode] = useState('55')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    api.get('/api/auth/setup-status').then((res) => {
      if (res.data.data?.hasOwner) {
        navigate('/login', { replace: true })
      }
      setChecking(false)
    }).catch(() => setChecking(false))
  }, [navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!setupKey.trim()) return toast.error('Informe a chave de configuracao')
    if (!name.trim()) return toast.error('Informe seu nome')
    if (!email.trim()) return toast.error('Informe seu email')
    if (password.length < 6) return toast.error('Senha deve ter no minimo 6 caracteres')
    if (password !== confirmPassword) return toast.error('Senhas nao coincidem')

    setIsSubmitting(true)
    try {
      await api.post('/api/auth/setup', {
        setupKey: setupKey.trim(),
        email: email.trim(),
        password,
        name: name.trim(),
        phone: phone || undefined,
        countryCode: phone ? countryCode : undefined,
      })
      toast.success('Conta de proprietario criada! Faca login.')
      markSetupDone()
      navigate('/login')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      toast.error(axiosErr.response?.data?.message || 'Erro ao configurar')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <Shield className="h-6 w-6 text-zinc-300" />
          </div>
          <CardTitle className="text-2xl">Configuracao inicial</CardTitle>
          <CardDescription>
            Crie sua conta de proprietario para comecar a usar o Pipely AI
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setupKey">Chave de configuracao</Label>
              <Input
                id="setupKey"
                type="password"
                placeholder="OWNER_SETUP_KEY do .env"
                value={setupKey}
                onChange={(e) => setSetupKey(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-[10px] text-zinc-500">
                Encontre esta chave no arquivo server/.env (OWNER_SETUP_KEY)
              </p>
            </div>

            <div className="h-px bg-zinc-800" />

            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <div className="flex gap-2">
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_CODES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} +{c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="tel"
                  placeholder="11999999999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-50 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Spinner size="sm" /> : 'Criar conta de proprietario'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
