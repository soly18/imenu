import { create } from 'zustand'
import axios from 'axios'

interface User {
  id: number
  name: string
  role: string
  permissions: string[]
  terminalId?: number
}

interface AuthState {
  user: User | null
  token: string | null
  login: (credentials: { username?: string; password?: string; pin?: string; terminalId?: number }) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: () => boolean
  hasRole: (...roles: string[]) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: JSON.parse(sessionStorage.getItem('imenu_user') || 'null'),
  token: sessionStorage.getItem('imenu_token'),

  login: async (credentials) => {
    const { data } = await axios.post('/api/auth/login', credentials)
    sessionStorage.setItem('imenu_token', data.token)
    sessionStorage.setItem('imenu_user', JSON.stringify(data.user))
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
    set({ user: data.user, token: data.token })
  },

  logout: async () => {
    try { await axios.post('/api/auth/logout') } catch {}
    sessionStorage.removeItem('imenu_token')
    sessionStorage.removeItem('imenu_user')
    delete axios.defaults.headers.common['Authorization']
    set({ user: null, token: null })
  },

  isAuthenticated: () => !!get().token,
  hasRole: (...roles) => roles.includes(get().user?.role || '')
}))

// Set axios auth header on page reload
const savedToken = sessionStorage.getItem('imenu_token')
if (savedToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`
}
