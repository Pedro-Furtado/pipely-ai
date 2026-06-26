import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-6xl font-bold">404</CardTitle>
          <CardDescription className="text-lg">
            Pagina nao encontrada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-zinc-400">
            A pagina que voce esta procurando nao existe ou foi removida.
          </p>
          <Button onClick={() => navigate('/')}>
            Voltar ao inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
