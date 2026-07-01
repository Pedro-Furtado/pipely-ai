import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

export interface TeamMember {
  id: string
  ownerId: string
  name: string
  phone: string
  remoteJid: string | null
  role: string
  createdAt: string
}

export const teamService = {
  async list(): Promise<ApiResponse & { data?: TeamMember[] }> {
    const res = await api.get('/api/team')
    return res.data
  },

  async create(data: { name: string; phone: string; countryCode?: string }): Promise<ApiResponse & { data?: TeamMember }> {
    const res = await api.post('/api/team', data)
    return res.data
  },

  async update(memberId: string, data: { name?: string; phone?: string; countryCode?: string; role?: string }): Promise<ApiResponse & { data?: TeamMember }> {
    const res = await api.patch(`/api/team/${memberId}`, data)
    return res.data
  },

  async remove(memberId: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/team/${memberId}`)
    return res.data
  },
}
