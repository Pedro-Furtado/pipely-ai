import axios from 'axios'
import type {
  AuthResponse,
  ApiResponse,
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '@/types/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const workspaceOwner = localStorage.getItem('workspaceOwnerId')
  if (workspaceOwner) {
    config.headers['X-Workspace-Owner'] = workspaceOwner
  }
  return config
})

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error)
    } else {
      promise.resolve(token!)
    }
  })
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    const skipRefreshRoutes = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
    ]
    const isAuthRoute = skipRefreshRoutes.some(
      (route) => originalRequest?.url === route
    )

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(api(originalRequest))
            },
            reject,
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post<AuthResponse>(
          `${api.defaults.baseURL}/api/auth/refresh-token`,
          {},
          { withCredentials: true }
        )

        if (data.success && data.data) {
          const { accessToken } = data.data
          localStorage.setItem('accessToken', accessToken)
          api.defaults.headers.common.Authorization = `Bearer ${accessToken}`
          processQueue(null, accessToken)
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return api(originalRequest)
        }

        throw new Error('Falha ao renovar token')
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.removeItem('accessToken')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/auth/login', data)
    return response.data
  },

  async register(data: RegisterRequest): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>('/api/auth/register', data)
    return response.data
  },

  async forgotPassword(data: ForgotPasswordRequest): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>(
      '/api/auth/forgot-password',
      data
    )
    return response.data
  },

  async resetPassword(
    token: string,
    data: ResetPasswordRequest
  ): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>('/api/auth/reset-password', {
      token,
      password: data.password,
    })
    return response.data
  },

  async logout(): Promise<ApiResponse> {
    const response = await api.post<ApiResponse>('/api/auth/logout')
    return response.data
  },

  async refreshToken(): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/api/auth/refresh-token')
    return response.data
  },

  async getMe(): Promise<AuthResponse> {
    const response = await api.get<AuthResponse>('/api/auth/me')
    return response.data
  },
}

export { api }
