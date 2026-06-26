export interface User {
  id: string
  email: string
  name: string
  phone: string | null
  remoteJid: string | null
  isOwner: boolean
  emailVerified: boolean
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  name: string
  phone?: string
  countryCode?: string
  confirmPassword: string
  inviteToken?: string
}

export interface ForgotPasswordRequest {
  email: string
}

export interface ResetPasswordRequest {
  password: string
  confirmPassword: string
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
