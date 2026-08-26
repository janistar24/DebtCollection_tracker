import type { Payment, PayMethod } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

interface CompletePaymentInput {
  payment_amount: number
  payment_date: string
  payment_datetime?: string
  payment_method: PayMethod
  reference_no: string | null
  receipt_no: string | null
  recorded_by: number | null
  allocations: { assessment_id: number; allocated_amount: number }[]
}

interface AllocationApi {
  payment_id: number
  taxpayer_id: number
  tax_year: number
  allocated_amount: number
  tax_type: 'LAND_BUILDING' | 'SIGN'
  payment_amount: number
  payment_date: string
  paid_at: string | null
  payment_method: string
  reference_no: string | null
  receipt_no: string | null
  recorded_by: number | null
}

function errorMessage(result: any, fallback: string) {
  if (Array.isArray(result?.detail)) {
    return result.detail.map((item: any) => {
      const field = Array.isArray(item.loc) ? item.loc.slice(1).join('.') : 'ข้อมูล'
      return `${field}: ${item.msg}`
    }).join('\n')
  }
  const message = typeof result?.detail === 'string'
    ? result.detail
    : result?.detail?.message ?? result?.message ?? fallback
  const databaseError = result?.detail?.error
  return databaseError ? `${message}\nรายละเอียด: ${databaseError}` : message
}

export async function createCompletePayment(data: CompletePaymentInput): Promise<string> {
  if (!Number.isFinite(data.payment_amount) || data.payment_amount <= 0) {
    throw new Error('ยอดชำระไม่ถูกต้อง')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.payment_date)) {
    throw new Error('วันที่ชำระไม่ถูกต้อง')
  }
  if (!data.allocations.length) {
    throw new Error('กรุณาเลือกประเภทภาษีที่ต้องการชำระ')
  }
  if (data.allocations.some(item =>
    !Number.isInteger(item.assessment_id) || item.assessment_id <= 0 ||
    !Number.isFinite(item.allocated_amount) || item.allocated_amount <= 0
  )) {
    throw new Error('ข้อมูลการประเมินภาษีไม่ถูกต้อง กรุณารีเฟรชหน้าแล้วลองใหม่')
  }

  const response = await fetch(`${API_URL}/payments/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(errorMessage(result, 'บันทึกการชำระไม่สำเร็จ'))
  }
  return String(result.data.payment_id)
}

export async function getAllocatedPayments(): Promise<Payment[]> {
  const response = await fetch(`${API_URL}/payment-allocations`)
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(errorMessage(result, 'โหลดข้อมูลการชำระไม่สำเร็จ'))
  }

  const grouped = new Map<string, Payment>()
  for (const row of result.data as AllocationApi[]) {
    const id = String(row.payment_id)
    const payment = grouped.get(id) ?? {
      id,
      taxpayerId: String(row.taxpayer_id),
      amount: Number(row.payment_amount),
      date: row.paid_at ?? row.payment_date,
      method: row.payment_method.toLowerCase() as PayMethod,
      refNo: row.reference_no ?? undefined,
      receiptNo: row.receipt_no ?? undefined,
      allocatedLand: 0,
      allocatedSign: 0,
      recordedBy: row.recorded_by === null ? '' : String(row.recorded_by),
      taxYear: Number(row.tax_year),
    }
    if (row.tax_type === 'LAND_BUILDING') payment.allocatedLand += Number(row.allocated_amount)
    if (row.tax_type === 'SIGN') payment.allocatedSign += Number(row.allocated_amount)
    grouped.set(id, payment)
  }
  return [...grouped.values()]
}
