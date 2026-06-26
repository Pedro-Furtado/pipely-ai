import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function VerifyEmail() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Email verificado!</CardTitle>
          <CardDescription>
            Seu email foi verificado com sucesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-zinc-400">
            Agora voce pode fazer login na sua conta.
          </p>
          <Button className="w-full" onClick={() => navigate('/login')}>
            Ir para o login
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
