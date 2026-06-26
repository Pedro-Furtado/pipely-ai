import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Zap,
  Layers,
  MessageCircle,
  Clock,
  GitBranch,
  Bell,
  AlertTriangle,
  Plus,
  Trash2,
  RotateCcw,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { pipelineService, type PipelineBlock, type Pipeline } from '@/services/pipeline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Combobox } from '@/components/ui/combobox'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface BlockConfigModalProps {
  block: PipelineBlock
  pipeline: Pipeline
  open: boolean
  onClose: () => void
  onSaved: () => void
}

interface Branch {
  label: string
  nextSlug: string
  condition: string
  retry_minutes?: number
}

function minutesToDaysTime(totalMinutes: number): { days: string; time: string } {
  const d = Math.floor(totalMinutes / 1440)
  const remaining = totalMinutes % 1440
  const h = Math.floor(remaining / 60)
  const m = remaining % 60
  return { days: String(d), time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
}

function daysTimeToMinutes(days: string, time: string): number {
  const d = parseInt(days) || 0
  const [h, m] = time.split(':').map((v) => parseInt(v) || 0)
  return d * 1440 + h * 60 + m
}

export default function BlockConfigModal({ block, pipeline, open, onClose, onSaved }: BlockConfigModalProps) {
  const [blockType, setBlockType] = useState(block.blockType)
  const [sendMessage, setSendMessage] = useState(false)
  const [message, setMessage] = useState('')
  const [msgDelayDays, setMsgDelayDays] = useState('0')
  const [msgDelayTime, setMsgDelayTime] = useState('00:00')
  const [delayDays, setDelayDays] = useState('0')
  const [delayTime, setDelayTime] = useState('00:00')
  const [nextBlockId, setNextBlockId] = useState('')
  const [noReplyDays, setNoReplyDays] = useState('0')
  const [noReplyTime, setNoReplyTime] = useState('00:00')
  const [noReplyBlockId, setNoReplyBlockId] = useState('')
  const [notifyOnEntry, setNotifyOnEntry] = useState(false)
  const [autoStatus, setAutoStatus] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [saving, setSaving] = useState(false)

  // All blocks except current for destination selectors
  const allBlocks = pipeline.phases.flatMap((p) =>
    p.blocks.filter((b) => b.id !== block.id).map((b) => ({
      id: b.id,
      name: b.name,
      phaseName: p.name,
    }))
  )

  const blockOptions = allBlocks.map((b) => ({
    value: b.id,
    label: b.name,
    group: b.phaseName,
  }))

  // Load existing config
  useEffect(() => {
    const c = block.config as Record<string, unknown>
    setBlockType(block.blockType)
    const hasPrompt = !!(c.prompt || c.message)
    setSendMessage(hasPrompt)
    setMessage((c.prompt as string) || (c.message as string) || '')
    const msgDelay = minutesToDaysTime(Number(c.msg_delay_minutes) || 0)
    setMsgDelayDays(msgDelay.days)
    setMsgDelayTime(msgDelay.time)
    const delay = minutesToDaysTime(Number(c.delay_minutes) || 0)
    setDelayDays(delay.days)
    setDelayTime(delay.time)
    setNextBlockId((c.next_block_id as string) || '')
    const noReply = minutesToDaysTime(Number(c.no_reply_minutes) || 0)
    setNoReplyDays(noReply.days)
    setNoReplyTime(noReply.time)
    setNoReplyBlockId((c.no_reply_block_id as string) || '')
    setNotifyOnEntry(!!(c.notify_on_entry))
    setAutoStatus((c.auto_status as string) || '')
    setBranches((c.branches as Branch[]) || [])
  }, [block])

  async function handleSave() {
    setSaving(true)
    try {
      const config: Record<string, unknown> = {}

      if (blockType === 'message') {
        if (sendMessage && message.trim()) {
          config.prompt = message.trim()
          const msgDelayMin = daysTimeToMinutes(msgDelayDays, msgDelayTime)
          if (msgDelayMin > 0) config.msg_delay_minutes = msgDelayMin
        }
        const delayMin = daysTimeToMinutes(delayDays, delayTime)
        if (delayMin > 0) {
          config.delay_minutes = delayMin
          if (nextBlockId) config.next_block_id = nextBlockId
        }
        const noReplyMin = daysTimeToMinutes(noReplyDays, noReplyTime)
        if (noReplyMin > 0) {
          config.no_reply_minutes = noReplyMin
          if (noReplyBlockId) config.no_reply_block_id = noReplyBlockId
        }
        const validBranches = branches
          .filter((b) => b.label.trim() && b.condition.trim())
          .map((b) => {
            const isRetry = (b.retry_minutes ?? 0) > 0
            return {
              label: b.label,
              nextSlug: isRetry ? '' : b.nextSlug,
              condition: b.condition,
              ...(isRetry ? { retry_minutes: b.retry_minutes } : {}),
            }
          })
        if (validBranches.length > 0) config.branches = validBranches
        if (autoStatus) config.auto_status = autoStatus
      }

      if (notifyOnEntry) config.notify_on_entry = true

      if (notifyOnEntry) config.notify_on_entry = true

      await pipelineService.updateBlock(block.id, { blockType, config })
      toast.success('Bloco configurado')
      onSaved()
      onClose()
    } catch {
      toast.error('Erro ao salvar configuracao')
    } finally {
      setSaving(false)
    }
  }

  function addBranch() {
    setBranches((prev) => [...prev, { label: '', nextSlug: '', condition: '' }])
  }

  function updateBranch(index: number, field: keyof Branch, value: string) {
    setBranches((prev) => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
  }

  function removeBranch(index: number) {
    setBranches((prev) => prev.filter((_, i) => i !== index))
  }


  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {blockType === 'message' ? <Zap size={18} className="text-amber-400" /> : <Layers size={18} className="text-zinc-400" />}
            Configurar bloco: {block.name}
          </DialogTitle>
          <DialogDescription>
            Defina o comportamento e automacoes deste bloco.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Tipo do bloco ── */}
          <Section icon={Layers} title="Tipo do bloco">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBlockType('stage')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  blockType === 'stage'
                    ? 'border-zinc-500 bg-zinc-800'
                    : 'border-zinc-800 hover:border-zinc-700'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers size={14} className="text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-200">Simples</span>
                </div>
                <p className="text-[10px] text-zinc-500">Tarefas ficam aqui ate serem movidas manualmente.</p>
              </button>
              <button
                type="button"
                onClick={() => setBlockType('message')}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  blockType === 'message'
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'border-zinc-800 hover:border-zinc-700'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={14} className="text-amber-400" />
                  <span className="text-xs font-medium text-zinc-200">Dinamico</span>
                </div>
                <p className="text-[10px] text-zinc-500">Envia mensagem e executa automacoes ao receber tarefa.</p>
              </button>
            </div>
          </Section>

          {blockType === 'message' && (
            <>
              {/* ── Enviar mensagem ── */}
              <Section icon={MessageCircle} title="Mensagem ao entrar no bloco">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-300">Enviar mensagem via WhatsApp</p>
                    <p className="text-[10px] text-zinc-500">O agente envia uma mensagem ao responsavel quando a tarefa chegar neste bloco</p>
                  </div>
                  <Switch
                    checked={sendMessage}
                    onCheckedChange={(checked) => {
                      setSendMessage(checked)
                      if (checked && !message.trim()) {
                        setMessage(`Avise que a tarefa chegou em ${block.name}`)
                      }
                    }}
                  />
                </div>

                {sendMessage && (
                  <>
                    <Textarea
                      placeholder="Ex: notifique o responsavel sobre a nova tarefa..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="mt-3 min-h-[80px] text-xs"
                    />

                    <div className="mt-3 space-y-1.5">
                      <Label className="text-[10px] text-zinc-400">Enviar apos (0 = imediato)</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Dias</Label>
                          <Input
                            type="number"
                            min="0"
                            max="365"
                            value={msgDelayDays}
                            onChange={(e) => setMsgDelayDays(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Hora</Label>
                          <Input
                            type="time"
                            value={msgDelayTime}
                            onChange={(e) => setMsgDelayTime(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 rounded-md bg-zinc-800/50 px-3 py-2">
                      <p className="text-[10px] text-zinc-400">
                        💡 O agente gera a mensagem com base neste prompt. Se o timer estiver configurado, envia somente apos o tempo.
                      </p>
                    </div>
                  </>
                )}
              </Section>

              {/* ── Notificação ── */}
              <Section icon={Bell} title="Notificacao">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyOnEntry}
                    onChange={(e) => setNotifyOnEntry(e.target.checked)}
                    className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-xs text-zinc-300">Notificar membro atribuido quando tarefa entrar neste bloco</span>
                </label>
              </Section>

              {/* ── Status automático ── */}
              <Section icon={Zap} title="Status automatico da tarefa">
                <p className="text-[10px] text-zinc-500 mb-2">
                  Alterar o status da tarefa automaticamente ao entrar neste bloco.
                </p>
                <Select value={autoStatus || "_none"} onValueChange={(v) => setAutoStatus(v === "_none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Nao alterar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nao alterar</SelectItem>
                    <SelectItem value="todo">📋 A fazer</SelectItem>
                    <SelectItem value="in_progress">⏳ Em andamento</SelectItem>
                    <SelectItem value="done">✅ Concluida</SelectItem>
                  </SelectContent>
                </Select>
              </Section>

              {/* ── Auto-avanço ── */}
              <Section icon={Clock} title="Avanco automatico">
                <div className="space-y-3">
                  <p className="text-[10px] text-zinc-500">Mover tarefa para outro bloco apos um tempo.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Dias</Label>
                      <Input
                        type="number"
                        min="0"
                        max="365"
                        value={delayDays}
                        onChange={(e) => setDelayDays(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Hora</Label>
                      <Input
                        type="time"
                        value={delayTime}
                        onChange={(e) => setDelayTime(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Mover para</Label>
                    <Combobox
                      value={nextBlockId}
                      onValueChange={setNextBlockId}
                      options={blockOptions}
                      placeholder="Buscar bloco..."
                      searchPlaceholder="Filtrar..."
                      disabled={daysTimeToMinutes(delayDays, delayTime) === 0}
                      className="h-8 text-xs"
                    />
                  </div>
                  {daysTimeToMinutes(delayDays, delayTime) > 0 && !nextBlockId && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle size={10} /> Selecione o bloco de destino
                    </p>
                  )}
                </div>
              </Section>

              {/* ── Sem resposta ── */}
              <Section
                icon={Clock}
                title="Se nao responder"
                highlight={daysTimeToMinutes(noReplyDays, noReplyTime) > 0 ? 'amber' : undefined}
              >
                <div className="space-y-3">
                  <p className="text-[10px] text-zinc-500">Mover tarefa se o responsavel nao responder no WhatsApp.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Dias</Label>
                      <Input
                        type="number"
                        min="0"
                        max="365"
                        value={noReplyDays}
                        onChange={(e) => setNoReplyDays(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Hora</Label>
                      <Input
                        type="time"
                        value={noReplyTime}
                        onChange={(e) => setNoReplyTime(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Mover para</Label>
                    <Combobox
                      value={noReplyBlockId}
                      onValueChange={setNoReplyBlockId}
                      options={blockOptions}
                      placeholder="Buscar bloco..."
                      searchPlaceholder="Filtrar..."
                      disabled={daysTimeToMinutes(noReplyDays, noReplyTime) === 0}
                      className="h-8 text-xs"
                    />
                  </div>
                  {daysTimeToMinutes(noReplyDays, noReplyTime) > 0 && !noReplyBlockId && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle size={10} /> Selecione o bloco de destino
                    </p>
                  )}
                </div>
              </Section>

              {/* ── Roteamento condicional ── */}
              <Section
                icon={GitBranch}
                title="Roteamento condicional"
                highlight={branches.length > 0 ? 'purple' : undefined}
              >
                <p className="text-[10px] text-zinc-500 mb-2">
                  Crie caminhos diferentes baseados na resposta do responsavel.
                </p>

                {branches.length === 0 ? (
                  <p className="text-[10px] text-zinc-600 py-3 text-center">Nenhum caminho configurado</p>
                ) : (
                  <div className="space-y-3">
                    {branches.map((branch, i) => {
                      const isRetry = (branch.retry_minutes ?? 0) > 0
                      const retryDaysTime = minutesToDaysTime(branch.retry_minutes || 0)

                      return (
                        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="secondary" className="text-[9px]">Caminho {i + 1}</Badge>
                            <button
                              type="button"
                              onClick={() => removeBranch(i)}
                              className="text-zinc-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <Input
                            placeholder="Nome do caminho"
                            value={branch.label}
                            onChange={(e) => updateBranch(i, 'label', e.target.value)}
                            className="h-7 text-[11px]"
                          />

                          {/* Action type: move vs retry */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setBranches((prev) => prev.map((b, j) => j === i ? { ...b, retry_minutes: undefined, nextSlug: b.nextSlug } : b))}
                              className={cn(
                                'flex items-center justify-center gap-1.5 rounded-md border p-1.5 text-[10px] transition-colors',
                                !isRetry
                                  ? 'border-purple-500/50 bg-purple-500/10 text-purple-300'
                                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'
                              )}
                            >
                              <ArrowRight size={10} />
                              Mover para bloco
                            </button>
                            <button
                              type="button"
                              onClick={() => setBranches((prev) => prev.map((b, j) => j === i ? { ...b, retry_minutes: b.retry_minutes || 60, nextSlug: '' } : b))}
                              className={cn(
                                'flex items-center justify-center gap-1.5 rounded-md border p-1.5 text-[10px] transition-colors',
                                isRetry
                                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'
                              )}
                            >
                              <RotateCcw size={10} />
                              Repetir apos tempo
                            </button>
                          </div>

                          {isRetry ? (
                            <div className="space-y-1.5">
                              <Label className="text-[10px] text-zinc-400">Perguntar novamente apos</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Dias</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="365"
                                    value={retryDaysTime.days}
                                    onChange={(e) => {
                                      const mins = daysTimeToMinutes(e.target.value, retryDaysTime.time)
                                      setBranches((prev) => prev.map((b, j) => j === i ? { ...b, retry_minutes: mins } : b))
                                    }}
                                    className="h-7 text-[11px]"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Hora</Label>
                                  <Input
                                    type="time"
                                    value={retryDaysTime.time}
                                    onChange={(e) => {
                                      const mins = daysTimeToMinutes(retryDaysTime.days, e.target.value)
                                      setBranches((prev) => prev.map((b, j) => j === i ? { ...b, retry_minutes: mins } : b))
                                    }}
                                    className="h-7 text-[11px]"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Combobox
                              value={branch.nextSlug}
                              onValueChange={(v) => updateBranch(i, 'nextSlug', v)}
                              options={blockOptions}
                              placeholder="Bloco de destino..."
                              searchPlaceholder="Filtrar..."
                              className="h-7 text-[11px]"
                            />
                          )}

                          <Textarea
                            placeholder="Condicao (ex: responsavel confirmou que a tarefa esta pronta)"
                            value={branch.condition}
                            onChange={(e) => updateBranch(i, 'condition', e.target.value)}
                            className="min-h-[50px] text-[11px]"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={addBranch} className="mt-2 w-full text-xs">
                  <Plus size={12} />
                  Adicionar caminho
                </Button>
              </Section>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helper Components ───────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  highlight,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  highlight?: 'amber' | 'purple' | 'blue'
  children: React.ReactNode
}) {
  const highlightColors = {
    amber: 'border-l-amber-500/50',
    purple: 'border-l-purple-500/50',
    blue: 'border-l-blue-500/50',
  }

  return (
    <div className={cn(
      'space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3',
      highlight && `border-l-2 ${highlightColors[highlight]}`
    )}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-zinc-400" />
        <span className="text-xs font-medium text-zinc-300">{title}</span>
      </div>
      {children}
    </div>
  )
}

