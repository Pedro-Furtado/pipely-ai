export interface User {
  id: string
  email: string
  name: string
  phone: string | null
  isOwner: boolean
}

export interface LoginRequest {
  email: string
  password: string
}

export interface ResetPasswordRequest {
  setupKey: string
  password: string
}

export interface AuthResponse {
  success: boolean
  message: string
  data?: {
    user: User
    accessToken: string
  }
}

export interface ApiResponse {
  success: boolean
  message: string
  data?: any
}
