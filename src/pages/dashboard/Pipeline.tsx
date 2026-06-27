import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Workflow, Trash2, MoreHorizontal, Pencil, Download, Upload } from 'lucide-react'
import { pipelineService, type Pipeline as PipelineType } from '@/services/pipeline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import PipelineBoard from '@/components/pipeline/PipelineBoard'

export default function Pipeline() {
  const [pipelines, setPipelines] = useState<PipelineType[]>([])
  const [activePipeline, setActivePipeline] = useState<PipelineType | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const activePipelineIdRef = useRef<string | null>(null)
  const pausePollingRef = useRef(false)

  useEffect(() => {
    loadPipelines()
  }, [])

  // Silent poll — refresh active pipeline every 5s without flash
  useEffect(() => {
    const interval = setInterval(() => {
      if (activePipelineIdRef.current && !pausePollingRef.current) {
        silentRefresh(activePipelineIdRef.current)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const silentRefresh = useCallback(async (id: string) => {
    try {
      const res = await pipelineService.get(id)
      if (res.success && res.data) {
        setActivePipeline(res.data)
      }
    } catch { /* silent */ }
  }, [])

  async function loadPipelines() {
    try {
      const res = await pipelineService.list()
      if (res.success && res.data) {
        setPipelines(res.data)
        if (res.data.length > 0 && !activePipeline) {
          loadPipeline(res.data[0].id)
        }
      }
    } catch {
      toast.error('Erro ao carregar pipelines')
    } finally {
      setLoading(false)
    }
  }

  async function loadPipeline(id: string) {
    activePipelineIdRef.current = id
    try {
      const res = await pipelineService.get(id)
      if (res.success && res.data) {
        setActivePipeline(res.data)
      }
    } catch {
      toast.error('Erro ao carregar pipeline')
    }
  }

  function openRename() {
    if (!activePipeline) return
    setRenameName(activePipeline.name)
    setShowRename(true)
  }

  async function handleRename() {
    if (!activePipeline || !renameName.trim()) return
    setRenaming(true)
    try {
      await pipelineService.update(activePipeline.id, renameName.trim())
      toast.success('Pipeline renomeado')
      setShowRename(false)
      await loadPipelines()
      loadPipeline(activePipeline.id)
    } catch {
      toast.error('Erro ao renomear')
    } finally {
      setRenaming(false)
    }
  }

  function handleExport() {
    if (!activePipeline) return
    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      name: activePipeline.name,
      phases: activePipeline.phases.map((p) => ({
        name: p.name,
        color: p.color,
        position: p.position,
        blocks: p.blocks.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          blockType: b.blockType,
          config: b.config,
          position: b.position,
          isLocked: b.isLocked,
        })),
      })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pipeline-${activePipeline.name.toLowerCase().replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Pipeline exportado')
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.phases || !Array.isArray(data.phases)) {
        toast.error('Arquivo invalido — sem fases')
        return
      }

      // Create pipeline
      const name = data.name || file.name.replace('.json', '')
      const pipelineRes = await pipelineService.create(name)
      if (!pipelineRes.success || !pipelineRes.data) {
        toast.error('Erro ao criar pipeline')
        return
      }

      const pipelineId = pipelineRes.data.id

      // Create phases and blocks, tracking old→new ID mapping
      const blockIdMap = new Map<string, string>()
      const blocksToUpdate: { newId: string; config: Record<string, unknown> }[] = []

      for (const phase of data.phases) {
        const phaseRes = await pipelineService.createPhase(pipelineId, phase.name, phase.color)
        if (!phaseRes.success || !phaseRes.data) continue

        for (const block of phase.blocks || []) {
          const blockRes = await pipelineService.createBlock(phaseRes.data.id, block.name, block.blockType)
          if (blockRes.success && blockRes.data) {
            // Map old block ID (from slug or config references) to new ID
            if (block.slug) blockIdMap.set(block.slug, blockRes.data.id)
            // Also map by old block id if present in config references
            if (block.id) blockIdMap.set(block.id, blockRes.data.id)

            if (block.config) {
              blocksToUpdate.push({ newId: blockRes.data.id, config: block.config })
            }
          }
        }
      }

      // Update configs with remapped block IDs
      for (const { newId, config } of blocksToUpdate) {
        const remapped = { ...config }

        if (remapped.next_block_id && blockIdMap.has(remapped.next_block_id as string)) {
          remapped.next_block_id = blockIdMap.get(remapped.next_block_id as string)
        }
        if (remapped.no_reply_block_id && blockIdMap.has(remapped.no_reply_block_id as string)) {
          remapped.no_reply_block_id = blockIdMap.get(remapped.no_reply_block_id as string)
        }
        if (Array.isArray(remapped.branches)) {
          remapped.branches = (remapped.branches as Array<Record<string, unknown>>).map(b => ({
            ...b,
            nextSlug: b.nextSlug && blockIdMap.has(b.nextSlug as string)
              ? blockIdMap.get(b.nextSlug as string)
              : b.nextSlug
          }))
        }

        await pipelineService.updateBlock(newId, { config: remapped })
      }

      toast.success('Pipeline importado')
      setShowImport(false)
      await loadPipelines()
      loadPipeline(pipelineId)
    } catch {
      toast.error('Erro ao importar — verifique o arquivo')
    } finally {
      setImporting(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.json')) handleImportFile(file)
    else toast.error('Arraste um arquivo .json')
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleImportFile(file)
  }

  async function handleDelete() {
    if (!activePipeline) return
    try {
      await pipelineService.remove(activePipeline.id)
      toast.success('Pipeline excluido')
      setShowDelete(false)
      setActivePipeline(null)
      await loadPipelines()
    } catch {
      toast.error('Erro ao excluir pipeline')
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return

    setCreating(true)
    try {
      const res = await pipelineService.create(newName.trim())
      if (res.success && res.data) {
        setShowCreate(false)
        setNewName('')
        toast.success('Pipeline criado')
        await loadPipelines()
        loadPipeline(res.data.id)
      }
    } catch {
      toast.error('Erro ao criar pipeline')
    } finally {
      setCreating(false)
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {pipelines.length > 1 && (
            <div className="flex gap-1">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => loadPipeline(p.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activePipeline?.id === p.id
                      ? 'bg-zinc-800 text-zinc-50'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-50'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {pipelines.length <= 1 && activePipeline && (
            <h1 className="text-xl font-semibold text-zinc-50">{activePipeline.name}</h1>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCreate(true)} size="sm" variant="outline">
            <Plus size={16} />
            Novo pipeline
          </Button>
          {activePipeline && (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-md border border-zinc-700 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50">
                <MoreHorizontal size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={openRename}>
                  <Pencil size={14} />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}>
                  <Download size={14} />
                  Exportar JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowImport(true)}>
                  <Upload size={14} />
                  Importar JSON
                </DropdownMenuItem>
                <DropdownMenuItem destructive onClick={() => setShowDelete(true)}>
                  <Trash2 size={14} />
                  Excluir pipeline
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Board or Empty */}
      {!activePipeline ? (
        <EmptyState
          icon={Workflow}
          title="Nenhum pipeline criado"
          description="Crie seu primeiro pipeline para organizar o fluxo do seu time."
        >
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={16} />
            Criar pipeline
          </Button>
        </EmptyState>
      ) : (
        <PipelineBoard
          pipeline={activePipeline}
          setPipeline={setActivePipeline}
          onUpdate={() => loadPipeline(activePipeline.id)}
          onModalOpen={() => { pausePollingRef.current = true }}
          onModalClose={() => { pausePollingRef.current = false }}
        />
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo pipeline</DialogTitle>
            <DialogDescription>
              Crie um pipeline para organizar o fluxo de trabalho do seu time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pipeline-name">Nome</Label>
            <Input
              id="pipeline-name"
              placeholder="Ex: Vendas, Onboarding, Suporte..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              disabled={creating}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Spinner size="sm" /> : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={showRename} onOpenChange={setShowRename}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear pipeline</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-pipeline">Nome</Label>
            <Input
              id="rename-pipeline"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              disabled={renaming}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowRename(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRename} disabled={renaming || !renameName.trim()}>
              {renaming ? <Spinner size="sm" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar pipeline</DialogTitle>
            <DialogDescription>Selecione ou arraste um arquivo JSON exportado.</DialogDescription>
          </DialogHeader>

          {importing ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 px-4 transition-colors cursor-pointer ${
                dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 hover:border-zinc-500'
              }`}
              onClick={() => document.getElementById('import-file')?.click()}
            >
              <Upload size={32} className="mb-3 text-zinc-500" />
              <p className="text-sm text-zinc-300">Clique ou arraste o arquivo aqui</p>
              <p className="mt-1 text-xs text-zinc-500">Apenas arquivos .json</p>
              <input
                id="import-file"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pipeline "{activePipeline?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as fases, blocos e cards serao excluidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 text-white hover:bg-red-600">
              <Trash2 size={14} />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
