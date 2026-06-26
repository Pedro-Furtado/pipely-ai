import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

export interface TeamMember {
  id: string
  ownerId: string
  userId: string
  role: string
  status: string
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    phone: string | null
  }
}

export const teamService = {
  async list(): Promise<ApiResponse & { data?: TeamMember[] }> {
    const res = await api.get('/api/team')
    return res.data
  },

  async listPending(): Promise<ApiResponse & { data?: TeamMember[] }> {
    const res = await api.get('/api/team/pending')
    return res.data
  },

  async invite(email: string): Promise<ApiResponse> {
    const res = await api.post('/api/team/invite', { email })
    return res.data
  },

  async respond(ownerId: string, accept: boolean): Promise<ApiResponse> {
    const res = await api.post('/api/team/respond', { ownerId, accept })
    return res.data
  },

  async updateRole(memberId: string, role: string): Promise<ApiResponse & { data?: TeamMember }> {
    const res = await api.patch(`/api/team/${memberId}`, { role })
    return res.data
  },

  async remove(memberId: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/team/${memberId}`)
    return res.data
  },

  async generateInviteLink(expiresInHours?: number): Promise<ApiResponse & { data?: { token: string; expiresAt: string } }> {
    const res = await api.post('/api/team/invite-link', { expiresInHours })
    return res.data
  },

  async listInviteLinks(): Promise<ApiResponse & { data?: Array<{ id: string; token: string; expiresAt: string; usedAt: string | null; usedBy: string | null; createdAt: string }> }> {
    const res = await api.get('/api/team/invite-links')
    return res.data
  },

  async revokeInviteLink(id: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/team/invite-link/${id}`)
    return res.data
  },
}
