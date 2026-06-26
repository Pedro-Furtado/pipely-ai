import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Configuracoes</h1>
        <p className="text-sm text-zinc-400">
          Gerencie as configuracoes da sua conta.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Geral</CardTitle>
          <CardDescription>
            Configuracoes gerais da aplicacao.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400">
            Em breve novas configuracoes serao adicionadas aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
