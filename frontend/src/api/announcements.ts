import { API_URL, readApiJson } from './config'

export interface SystemAnnouncement {
  announcement_id: number
  title: string
  content: string
  starts_at: string
  is_active: boolean
  created_by: number | null
  created_at: string
}

export interface AnnouncementSnapshot {
  serverTime: string
  announcements: SystemAnnouncement[]
}

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options)
  const result = await readApiJson(response)
  if (!response.ok || !result.success) {
    const message = typeof result.detail === 'string' ? result.detail : result.detail?.message
    throw new Error(message ?? `ดำเนินการไม่สำเร็จ (HTTP ${response.status})`)
  }
  return result
}

export async function getAnnouncements(): Promise<AnnouncementSnapshot> {
  const result = await request(`${API_URL}/announcements`, { cache: 'no-store' })
  return { serverTime: result.server_time, announcements: result.data ?? [] }
}

export async function createAnnouncement(data: { title: string; content: string; starts_at: string }) {
  const result = await request(`${API_URL}/announcements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return result.data as SystemAnnouncement
}

export async function closeAnnouncement(id: number) {
  await request(`${API_URL}/announcements/${id}`, { method: 'DELETE' })
}

export async function getReleaseId(): Promise<string> {
  const root = API_URL.replace(/\/api\/?$/i, '')
  const response = await fetch(`${root}/health`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Backend ยังไม่พร้อมใช้งาน')
  const result = await response.json()
  return String(result.release_id ?? '')
}
