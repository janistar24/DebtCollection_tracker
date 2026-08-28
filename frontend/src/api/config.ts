function normalizeApiUrl(value: string | undefined): string {
  const raw = value?.trim()
  if (!raw) return 'http://127.0.0.1:8000/api'

  const markdownUrl = raw.match(/^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/i)?.[1]
  let normalized = markdownUrl ?? raw

  if (normalized.startsWith('//')) normalized = `https:${normalized}`
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`

  return normalized.replace(/\/+$/, '')
}

export const API_URL = normalizeApiUrl(import.meta.env.VITE_API_URL)

export async function readApiJson(response: Response): Promise<any> {
  const text = await response.text()
  if (!text) return { detail: `ระบบไม่ส่งข้อมูลตอบกลับ (HTTP ${response.status})` }
  try {
    return JSON.parse(text)
  } catch {
    return { detail: `รูปแบบข้อมูลตอบกลับไม่ถูกต้อง (HTTP ${response.status})` }
  }
}
