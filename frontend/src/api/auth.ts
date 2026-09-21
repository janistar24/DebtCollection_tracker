import type { User, UserRole, Group } from '../types'
import { API_URL } from './config'

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

// เก็บ Session เฉพาะหน่วยความจำของแท็บปัจจุบันเท่านั้น
// การเปิดแท็บใหม่ ทำสำเนาแท็บ หรือรีเฟรชหน้าจะต้องเข้าสู่ระบบใหม่
let accessToken: string | null = null
let signedInUser: User | null = null
localStorage.removeItem('tax_access_token')
localStorage.removeItem('tax_current_user')

const RETRYABLE_STATUS = new Set([500, 502, 503, 504])
const wait = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds))

export async function login(
  username: string,
  password: string
): Promise<User> {
  let response: Response | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        cache: 'no-store',
      })
      if (!RETRYABLE_STATUS.has(response.status) || attempt === 2) break
    } catch {
      if (attempt === 2) {
        throw new Error('ไม่สามารถเชื่อมต่อระบบเข้าสู่ระบบได้ กรุณารอสักครู่แล้วลองใหม่')
      }
    }
    await wait(700 * (attempt + 1))
  }

  if (!response) throw new Error('ไม่สามารถเชื่อมต่อระบบเข้าสู่ระบบได้ กรุณารอสักครู่แล้วลองใหม่')

  if (!response.ok) {
    let serverDetail = ''
    try {
      const body = await response.json() as { detail?: string }
      if (typeof body.detail === 'string') serverDetail = body.detail
    } catch {
      // ใช้ข้อความมาตรฐานเมื่อ response ไม่ใช่ JSON
    }

    if (response.status === 401) {
      throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }

    if (response.status === 403) {
      throw new Error(serverDetail || 'บัญชีผู้ใช้งานถูกปิดใช้งาน')
    }

    if (response.status === 429) {
      throw new Error(serverDetail || 'เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอสักครู่')
    }

    throw new Error(serverDetail || `ไม่สามารถเข้าสู่ระบบได้ (HTTP ${response.status})`)
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
  accessToken = result.access_token
  signedInUser = user
  return user
}

export function getStoredUser(): User | null {
  return signedInUser
}

export function clearAuthSession() {
  accessToken = null
  signedInUser = null
  localStorage.removeItem('tax_access_token')
  localStorage.removeItem('tax_current_user')
}

export function installAuthenticatedFetch() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const publicRequest = url.endsWith('/api/login') || url.includes('/api/user-invitations/')
    const token = accessToken
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
    if (token && url.includes('/api/') && !publicRequest) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const isReadRequest = method === 'GET' || method === 'HEAD'
    const requestInit: RequestInit = {
      ...init,
      headers,
      ...(isReadRequest ? { cache: 'no-store' as RequestCache } : {}),
    }
    let response: Response | null = null
    let lastNetworkError: unknown = null
    const attempts = isReadRequest && url.includes('/api/') ? 3 : 1

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        response = await originalFetch(input, requestInit)
        if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts - 1) break
        await response.body?.cancel().catch(() => undefined)
      } catch (error) {
        lastNetworkError = error
        if (attempt === attempts - 1) throw error
      }
      await wait(700 * (attempt + 1))
    }

    if (!response) throw lastNetworkError ?? new Error('ไม่สามารถเชื่อมต่อ Backend ได้')
    if (response.status === 401 && !publicRequest) {
      clearAuthSession()
      window.location.hash = '#/login'
    }
    return response
  }
}
