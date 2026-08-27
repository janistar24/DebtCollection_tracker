import { API_URL } from './config'

export interface MonthlyPaymentReport {
  month: number
  landAmount: number
  signAmount: number
  taxpayerCount: number
}

export async function getMonthlyPaymentReport(taxYear: number, groupCode?: string): Promise<MonthlyPaymentReport[]> {
  const params = new URLSearchParams({ tax_year: String(taxYear) })
  if (groupCode && groupCode !== 'all') params.set('group_code', groupCode)

  const response = await fetch(`${API_URL}/reports/monthly-payments?${params}`)
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(typeof result.detail === 'string' ? result.detail : result.detail?.message ?? 'โหลดรายงานรายเดือนไม่สำเร็จ')
  }

  return result.data.map((item: any) => ({
    month: Number(item.month),
    landAmount: Number(item.land_amount),
    signAmount: Number(item.sign_amount),
    taxpayerCount: Number(item.taxpayer_count),
  }))
}
