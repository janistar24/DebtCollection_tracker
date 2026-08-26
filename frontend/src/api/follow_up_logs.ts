import type { FollowUp } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

interface FollowUpApi {
  follow_up_id: number
  taxpayer_id: number
  tax_year: number
  contact_type: string
  contacted_at: string
  result: string
  detail: string | null
  promise_date: string | null
  promise_amount: number | null
  next_follow_date: string | null
  recorded_by: number | null
}

export interface CreateFollowUpInput {
  taxpayer_id: number
  tax_year: number
  tax_scope: 'LAND_BUILDING' | 'SIGN' | 'BOTH'
  contact_type: string
  contacted_at: string
  result: string
  detail: string | null
  promise_date: string | null
  promise_amount: number | null
  next_follow_date: string | null
  recorded_by: number | null
}

const resultName = (value: string) =>
  (value === 'CALL_BACK' ? 'callback' : value.toLowerCase()) as FollowUp['result']

export async function getFollowUpLogs(): Promise<FollowUp[]> {
  const response = await fetch(`${API_URL}/follow-up-logs`)
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.detail?.message ?? 'โหลดประวัติการติดต่อไม่สำเร็จ')
  }
  return (result.data as FollowUpApi[]).map(row => ({
    id: String(row.follow_up_id),
    taxpayerId: String(row.taxpayer_id),
    type: row.contact_type.toLowerCase() as FollowUp['type'],
    date: row.contacted_at,
    result: resultName(row.result),
    detail: row.detail ?? undefined,
    promiseDate: row.promise_date ?? undefined,
    promiseAmount: row.promise_amount === null ? undefined : Number(row.promise_amount),
    nextFollowDate: row.next_follow_date ?? undefined,
    recordedBy: row.recorded_by === null ? '' : String(row.recorded_by),
    taxYear: Number(row.tax_year),
  }))
}

export async function createFollowUpLog(data: CreateFollowUpInput): Promise<string> {
  const response = await fetch(`${API_URL}/follow-up-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    const message = typeof result.detail === 'string'
      ? result.detail : result.detail?.message
    throw new Error(message ?? 'บันทึกการติดต่อไม่สำเร็จ')
  }
  return String(result.data.follow_up_id)
}
