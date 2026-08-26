import type { User, UserRole, Group } from '../types'

interface UserApi {
  user_id: number
  employee_code: string
  first_name: string
  last_name: string
  username: string
  role: 'OFFICER' | 'DIRECTOR' | 'ADMIN'
  is_active: boolean
  created_at: string
  updated_at: string
  group_code: Group | null
}

interface UsersResponse {
  success: boolean
  count: number
  data: UserApi[]
}

const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

export async function getUsers(): Promise<User[]> {
  const response = await fetch(`${API_URL}/users`)

  if (!response.ok) {
    throw new Error(`โหลดข้อมูลผู้ใช้งานไม่สำเร็จ: ${response.status}`)
  }

  const result = (await response.json()) as UsersResponse

  if (!result.success) {
    throw new Error('API ไม่สามารถส่งข้อมูลผู้ใช้งานได้')
  }

  return result.data.map((user) => ({
    id: String(user.user_id),
    code: user.employee_code,
    name: `${user.first_name} ${user.last_name}`,
    role: user.role.toLowerCase() as UserRole,
    group: user.group_code ?? undefined,
    active: user.is_active,
    username: user.username,
  }))
}

export interface SaveUserInput {
  employee_code: string
  first_name: string
  last_name: string
  username: string
  password?: string
  role: string
  group_code: string | null
  is_active: boolean
}

async function userMutation(url: string, method: string, data?: unknown) {
  const response = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(typeof result.detail === 'string' ? result.detail : result.detail?.message ?? 'บันทึกผู้ใช้งานไม่สำเร็จ')
  }
  return result
}

export async function createUser(data: SaveUserInput): Promise<string> {
  const result = await userMutation(`${API_URL}/users`, 'POST', data)
  return String(result.data.user_id)
}

export async function updateUserRecord(userId: number, data: SaveUserInput) {
  return userMutation(`${API_URL}/users/${userId}`, 'PUT', data)
}

export async function setUserActive(userId: number, active: boolean) {
  return userMutation(`${API_URL}/users/${userId}/active?is_active=${active}`, 'PUT')
}
