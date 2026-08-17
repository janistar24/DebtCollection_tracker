import type { User, UserRole, Group } from '../types'

interface LoginResponse {
  success: boolean
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

  return {
    id: result.user.id,
    code: result.user.code,
    name: result.user.name,
    role: result.user.role.toLowerCase() as UserRole,
    group: result.user.group ?? undefined,
    active: result.user.active,
  }
}