import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

export interface WhatsAppConfig {
  id: string
  serverUrl: string
}

export interface EvolutionInstance {
  id: string
  name: string
  token: string
  connected: boolean
  jid: string
  createdAt: string
  [key: string]: unknown
}

export const whatsappService = {
  // Config (credentials only)
  async getConfig(): Promise<ApiResponse & { data?: WhatsAppConfig | null }> {
    const res = await api.get('/api/whatsapp/config')
    return res.data
  },

  async saveConfig(serverUrl: string, globalApiKey: string): Promise<ApiResponse> {
    const res = await api.post('/api/whatsapp/config', { serverUrl, globalApiKey })
    return res.data
  },

  async removeConfig(): Promise<ApiResponse> {
    const res = await api.delete('/api/whatsapp/config')
    return res.data
  },

  // Instances (fetched from Evolution in real-time)
  async listInstances(): Promise<ApiResponse & { data?: EvolutionInstance[] }> {
    const res = await api.get('/api/whatsapp/instances')
    return res.data
  },

  async createInstance(name: string): Promise<ApiResponse & { data?: EvolutionInstance }> {
    const res = await api.post('/api/whatsapp/instances', { name })
    return res.data
  },

  async deleteInstance(instanceId: string): Promise<ApiResponse> {
    const res = await api.delete(`/api/whatsapp/instances/${instanceId}`)
    return res.data
  },

  async getStatus(instanceId: string): Promise<ApiResponse & { data?: { state: string; name: string; connected: boolean } }> {
    const res = await api.get(`/api/whatsapp/instances/${instanceId}/status`)
    return res.data
  },

  async getQr(instanceId: string): Promise<ApiResponse & { data?: { qrcode: string } }> {
    const res = await api.get(`/api/whatsapp/instances/${instanceId}/qr`)
    return res.data
  },

  async connect(instanceId: string): Promise<ApiResponse> {
    const res = await api.post(`/api/whatsapp/instances/${instanceId}/connect`)
    return res.data
  },

  async disconnect(instanceId: string): Promise<ApiResponse> {
    const res = await api.post(`/api/whatsapp/instances/${instanceId}/disconnect`)
    return res.data
  },

  async getWebhook(instanceId: string): Promise<ApiResponse & { data?: { url: string; enabled: boolean } }> {
    const res = await api.get(`/api/whatsapp/instances/${instanceId}/webhook`)
    return res.data
  },

  async setWebhook(instanceId: string, url: string): Promise<ApiResponse> {
    const res = await api.post(`/api/whatsapp/instances/${instanceId}/webhook`, { url })
    return res.data
  },
}
