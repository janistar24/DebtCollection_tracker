import type { User, UserRole, Group } from '../types'
import { API_URL } from './config'

interface UserApi {
  user_id: number
  employee_code: string
  first_name: string
  last_name: string
  username: string
  email: string | null
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
    email: user.email ?? undefined,
  }))
}

export interface SaveUserInput {
  employee_code: string
  first_name: string
  last_name: string
  username: string
  email?: string | null
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

export async function resetUserPassword(userId: number, password: string) {
  return userMutation(`${API_URL}/users/${userId}/password`, 'PUT', { password })
}

export async function deleteUser(userId: number) {
  return userMutation(`${API_URL}/users/${userId}`, 'DELETE')
}

export interface InviteUserInput {
  employee_code: string
  first_name: string
  last_name: string
  email: string
  role: string
  group_code: string | null
}

export async function createUserInvitation(data: InviteUserInput): Promise<string> {
  const result = await userMutation(`${API_URL}/users/invitations`, 'POST', data)
  return String(result.data.invitation_url)
}

export interface InvitationDetails {
  email: string
  name: string
  role: string
  expires_at: string
}

export async function validateInvitation(token: string): Promise<InvitationDetails> {
  const result = await userMutation(`${API_URL}/user-invitations/validate`, 'POST', { token })
  return result.data as InvitationDetails
}

export async function acceptInvitation(token: string, username: string, password: string) {
  return userMutation(`${API_URL}/user-invitations/accept`, 'POST', { token, username, password })
}
