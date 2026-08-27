import type { User, UserRole, Group } from '../types'

interface LoginResponse {
  success: boolean
  access_token: string
  token_type: 'bearer'
  user: {
  id: string
  code: string
  name: string
  role: 'OFFICER' | 'DIRECTOR' | 'ADMIN'
  group: Group | null
  active: boolean
  }
}

const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

export async function login(
  username: string,
  password: string
): Promise<User> {

  const response = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    if (response.status === 403) {
      throw new Error('บัญชีผู้ใช้งานถูกปิดใช้งาน')
    }

    throw new Error('ไม่สามารถเข้าสู่ระบบได้')
  }

  const result = (await response.json()) as LoginResponse

  const user: User = {
    id: result.user.id,
    code: result.user.code,
    name: result.user.name,
    role: result.user.role.toLowerCase() as UserRole,
    group: result.user.group ?? undefined,
    active: result.user.active,
  }
  localStorage.setItem('tax_access_token', result.access_token)
  localStorage.setItem('tax_current_user', JSON.stringify(user))
  return user
}

export function getStoredUser(): User | null {
  try {
    const value = localStorage.getItem('tax_current_user')
    return value ? JSON.parse(value) as User : null
  } catch {
    return null
  }
}

export function clearAuthSession() {
  localStorage.removeItem('tax_access_token')
  localStorage.removeItem('tax_current_user')
}

export function installAuthenticatedFetch() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const token = localStorage.getItem('tax_access_token')
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
    if (token && url.includes('/api/') && !url.endsWith('/api/login')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const response = await originalFetch(input, { ...init, headers })
    if (response.status === 401 && !url.endsWith('/api/login')) {
      clearAuthSession()
      window.location.hash = '#/login'
    }
    return response
  }
}
