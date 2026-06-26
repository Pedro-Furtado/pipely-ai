import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  data: Record<string, unknown>
  read: boolean
  createdAt: string
}

export const notificationService = {
  async list(): Promise<ApiResponse & { data?: Notification[] }> {
    const res = await api.get('/api/notifications')
    return res.data
  },

  async unreadCount(): Promise<ApiResponse & { data?: { count: number } }> {
    const res = await api.get('/api/notifications/unread-count')
    return res.data
  },

  async markRead(id: string): Promise<ApiResponse> {
    const res = await api.patch(`/api/notifications/${id}/read`)
    return res.data
  },

  async markAllRead(): Promise<ApiResponse> {
    const res = await api.patch('/api/notifications/read-all')
    return res.data
  },

  async remove(id: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/notifications/${id}`)
    return res.data
  },
}
