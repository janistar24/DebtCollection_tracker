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
