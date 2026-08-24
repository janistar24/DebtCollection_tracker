const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

export interface SlipReadResult {
  amount: number | null
  amount_candidates: number[]
  ocr_text: string
}

export async function readPaymentSlip(file: File): Promise<SlipReadResult> {
  const response = await fetch(`${API_URL}/slips/read`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  })

  const result = await response.json()

  if (!response.ok || !result.success) {
    const message = typeof result.detail === 'string'
      ? result.detail
      : result.detail?.message ?? result.message ?? 'อ่านสลิปไม่สำเร็จ'
    throw new Error(message)
  }

  return result.data as SlipReadResult
}
