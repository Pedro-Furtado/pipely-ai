import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

export interface AgentLog {
  id: string
  ownerId: string
  taskId: string | null
  type: string
  title: string
  detail: string | null
  data: Record<string, unknown>
  createdAt: string
}

export interface AgentLogPagination {
  page: number
  limit: number
  total: number
  pages: number
}

export const agentLogService = {
  async list(page = 1, limit = 50, type?: string): Promise<ApiResponse & { data?: AgentLog[]; pagination?: AgentLogPagination }> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (type) params.set('type', type)
    const res = await api.get(`/api/agent-logs?${params}`)
    return res.data
  },

  async clear(): Promise<ApiResponse> {
    const res = await api.delete('/api/agent-logs')
    return res.data
  },
}
