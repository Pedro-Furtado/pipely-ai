import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface PipelineAutomation {
  id: string
  blockId: string
  type: string
  config: Record<string, unknown>
  isActive: boolean
}

export interface PipelineTask {
  id: string
  title: string
  description: string | null
  priority: string
  blockId: string | null
  enteredAt: string
  createdAt: string
  assignee: {
    id: string
    name: string
    email: string
  } | null
}

export interface PipelineBlock {
  id: string
  phaseId: string
  name: string
  slug: string
  blockType: 'stage' | 'message'
  config: Record<string, unknown>
  position: number
  isLocked: boolean
  tasks?: PipelineTask[]
  automations?: PipelineAutomation[]
  _count?: { tasks: number }
}

export interface PipelinePhase {
  id: string
  pipelineId: string
  name: string
  color: string
  position: number
  blocks: PipelineBlock[]
}

export interface Pipeline {
  id: string
  ownerId: string
  name: string
  createdAt: string
  phases: PipelinePhase[]
}

// ─── SERVICE ─────────────────────────────────────────────────────────────────

export const pipelineService = {
  // Pipelines
  async list(): Promise<ApiResponse & { data?: Pipeline[] }> {
    const res = await api.get('/api/pipeline')
    return res.data
  },

  async get(id: string): Promise<ApiResponse & { data?: Pipeline }> {
    const res = await api.get(`/api/pipeline/${id}`)
    return res.data
  },

  async create(name: string): Promise<ApiResponse & { data?: Pipeline }> {
    const res = await api.post('/api/pipeline', { name })
    return res.data
  },

  async update(id: string, name: string): Promise<ApiResponse> {
    const res = await api.patch(`/api/pipeline/${id}`, { name })
    return res.data
  },

  async remove(id: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/pipeline/${id}`)
    return res.data
  },

  // Phases
  async createPhase(pipelineId: string, name: string, color?: string): Promise<ApiResponse & { data?: PipelinePhase }> {
    const res = await api.post(`/api/pipeline/${pipelineId}/phases`, { name, color })
    return res.data
  },

  async updatePhase(phaseId: string, data: Partial<{ name: string; color: string; position: number }>): Promise<ApiResponse> {
    const res = await api.patch(`/api/pipeline/phases/${phaseId}`, data)
    return res.data
  },

  async removePhase(phaseId: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/pipeline/phases/${phaseId}`)
    return res.data
  },

  async reorderPhases(pipelineId: string, order: Array<{ id: string; position: number }>): Promise<ApiResponse> {
    const res = await api.patch(`/api/pipeline/${pipelineId}/phases/reorder`, { order })
    return res.data
  },

  // Blocks
  async createBlock(phaseId: string, name: string, blockType?: string): Promise<ApiResponse & { data?: PipelineBlock }> {
    const res = await api.post(`/api/pipeline/phases/${phaseId}/blocks`, { name, blockType })
    return res.data
  },

  async updateBlock(blockId: string, data: Partial<{ name: string; blockType: string; config: Record<string, unknown>; position: number; phaseId: string }>): Promise<ApiResponse> {
    const res = await api.patch(`/api/pipeline/blocks/${blockId}`, data)
    return res.data
  },

  async removeBlock(blockId: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/pipeline/blocks/${blockId}`)
    return res.data
  },

  async reorderBlocks(phaseId: string, order: Array<{ id: string; position: number }>): Promise<ApiResponse> {
    const res = await api.patch(`/api/pipeline/phases/${phaseId}/blocks/reorder`, { order })
    return res.data
  },

  // Task movement in pipeline
  async moveTask(taskId: string, blockId: string): Promise<ApiResponse> {
    const res = await api.patch(`/api/pipeline/tasks/${taskId}/move`, { blockId })
    return res.data
  },

  // Automations
  async createAutomation(blockId: string, type: string, config?: Record<string, unknown>): Promise<ApiResponse & { data?: PipelineAutomation }> {
    const res = await api.post(`/api/pipeline/blocks/${blockId}/automations`, { type, config })
    return res.data
  },

  async updateAutomation(automationId: string, data: Partial<{ type: string; config: Record<string, unknown>; isActive: boolean }>): Promise<ApiResponse> {
    const res = await api.patch(`/api/pipeline/automations/${automationId}`, data)
    return res.data
  },

  async removeAutomation(automationId: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/pipeline/automations/${automationId}`)
    return res.data
  },
}
