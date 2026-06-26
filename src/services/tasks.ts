import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

export interface Task {
  id: string
  creatorId: string
  assigneeId: string | null
  blockId: string | null
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'done'
  enteredAt: string
  createdAt: string
  assignee: {
    id: string
    name: string
    email: string
  } | null
  block: {
    id: string
    name: string
    phase: { name: string; color: string }
  } | null
}

export const taskService = {
  async list(): Promise<ApiResponse & { data?: Task[] }> {
    const res = await api.get('/api/tasks')
    return res.data
  },

  async create(data: { title: string; description?: string; priority?: string; assigneeId?: string; blockId?: string }): Promise<ApiResponse & { data?: Task }> {
    const res = await api.post('/api/tasks', data)
    return res.data
  },

  async update(id: string, data: Partial<{ title: string; description: string; priority: string; assigneeId: string; blockId: string; status: string }>): Promise<ApiResponse & { data?: Task }> {
    const res = await api.patch(`/api/tasks/${id}`, data)
    return res.data
  },

  async remove(id: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/tasks/${id}`)
    return res.data
  },
}
