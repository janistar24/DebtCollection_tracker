import type { User, UserRole, Group } from '../types'
import { API_URL, readApiJson } from './config'

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
  let response: Response
  try {
    response = await fetch(`${API_URL}/users`)
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อระบบจัดการผู้ใช้งานได้ กรุณาตรวจสอบ Backend และลองใหม่อีกครั้ง')
  }
  const result = (await readApiJson(response)) as UsersResponse & { detail?: string | { message?: string }; request_id?: string }

  if (!response.ok || !result.success) {
    const message = typeof result.detail === 'string' ? result.detail : result.detail?.message
    const requestId = result.request_id ? ` (Request ID: ${result.request_id})` : ''
    throw new Error(`${message ?? `โหลดข้อมูลผู้ใช้งานไม่สำเร็จ (HTTP ${response.status})`}${requestId}`)
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
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    })
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อ Backend ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง')
  }
  const result = await readApiJson(response)
  if (!response.ok || !result.success) {
    const message = typeof result.detail === 'string' ? result.detail : result.detail?.message
    const requestId = result.request_id ? ` (Request ID: ${result.request_id})` : ''
    throw new Error(`${message ?? `ดำเนินการไม่สำเร็จ (HTTP ${response.status})`}${requestId}`)
  }
  return result
}

export async function createUser(data: SaveUserInput): Promise<{ id: string; code: string }> {
  const result = await userMutation(`${API_URL}/users`, 'POST', data)
  return { id: String(result.data.user_id), code: String(result.data.employee_code) }
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
  first_name: string
  last_name: string
  email: string
  role: string
  group_code: string | null
}

export async function createUserInvitation(data: InviteUserInput): Promise<string> {
  const result = await userMutation(`${API_URL}/users/invitations`, 'POST', data)
  const token = String(result.data.invitation_token ?? '')
  if (token) {
    const base = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '')
    return `${base}/#/accept-invite?token=${encodeURIComponent(token)}`
  }
  if (result.data.invitation_url) return String(result.data.invitation_url)
  throw new Error('ระบบสร้างคำเชิญแล้ว แต่ไม่พบข้อมูลสำหรับสร้างลิงก์')
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
