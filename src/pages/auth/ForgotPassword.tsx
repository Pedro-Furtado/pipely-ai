import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authService } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const [sent, setSent] = useState(false)

  function validate(): boolean {
    if (!email.trim()) {
      toast.error('Informe seu email')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast.error('Informe um email valido')
      return false
    }
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await authService.forgotPassword({ email })
      setSent(true)
      toast.success('Se o email existir, enviamos um link de recuperacao')
    } catch {
      toast.success('Se o email existir, enviamos um link de recuperacao')
      setSent(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Recuperar senha</CardTitle>
          <CardDescription>
            Informe seu email para receber o link de recuperacao
          </CardDescription>
        </CardHeader>
        {sent ? (
          <CardContent className="space-y-4 text-center">
            <p className="text-zinc-400">
              Se o email existir, enviamos um link de recuperacao. Verifique sua
              caixa de entrada.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate('/login')}>
              Voltar ao login
            </Button>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Spinner size="sm" /> : 'Enviar link'}
              </Button>
              <Link
                to="/login"
                className="text-sm text-zinc-400 hover:text-zinc-50 transition-colors"
              >
                Voltar ao login
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
