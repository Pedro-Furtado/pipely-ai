import { api } from '@/services/api'
import type { ApiResponse } from '@/types/auth'

export interface AiConfig {
  id: string
  hasKey: boolean
  keyPreview: string
}

export const aiService = {
  async getConfig(): Promise<ApiResponse & { data?: AiConfig | null }> {
    const res = await api.get('/api/ai/config')
    return res.data
  },

  async saveKey(openaiApiKey: string): Promise<ApiResponse> {
    const res = await api.post('/api/ai/config', { openaiApiKey })
    return res.data
  },

  async removeKey(): Promise<ApiResponse> {
    const res = await api.delete('/api/ai/config')
    return res.data
  },
}
