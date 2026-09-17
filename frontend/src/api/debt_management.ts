import { API_URL, readApiJson } from './config'

export interface HistoricalDebtInput {
  tax_year: number
  land_amount: number
  sign_amount: number
  note: string | null
}

export async function createHistoricalDebt(taxpayerId: number, data: HistoricalDebtInput) {
  const response = await fetch(`${API_URL}/taxpayers/${taxpayerId}/historical-debts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const result = await readApiJson(response)
  if (!response.ok || !result.success) {
    throw new Error(typeof result.detail === 'string' ? result.detail : result.detail?.message ?? 'บันทึกยอดหนี้ยกมาไม่สำเร็จ')
  }
  return result.data
}

export interface CrossGroupMatch {
  taxpayer_id: number
  owner_code: string
  taxpayer_type: 'INDIVIDUAL' | 'COMPANY'
  first_name: string | null
  last_name: string | null
  company_name: string | null
  group_code: string
  tax_year: number
  match_type: 'LAND_BUILDING' | 'SIGN' | 'BOTH'
  match_amount: number
  difference: number
}

export async function getCrossGroupPaymentMatches(amount: number, taxYear: number): Promise<CrossGroupMatch[]> {
  const params = new URLSearchParams({ amount: String(amount), tax_year: String(taxYear) })
  const response = await fetch(`${API_URL}/payment-match/cross-group?${params}`)
  const result = await readApiJson(response)
  if (!response.ok || !result.success) {
    throw new Error(typeof result.detail === 'string' ? result.detail : result.detail?.message ?? 'ค้นหายอดจากกลุ่มอื่นไม่สำเร็จ')
  }
  return (result.data ?? []).map((item: CrossGroupMatch) => ({
    ...item,
    match_amount: Number(item.match_amount),
    difference: Number(item.difference),
  }))
}
