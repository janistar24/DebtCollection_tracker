import type { Payment, PayMethod } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

interface CompletePaymentInput {
  payment_amount: number
  payment_date: string
  payment_method: PayMethod
  reference_no: string | null
  receipt_no: string | null
  recorded_by: number | null
  allocations: { assessment_id: number; allocated_amount: number }[]
}

interface AllocationApi {
  payment_id: number
  taxpayer_id: number
  allocated_amount: number
  tax_type: 'LAND_BUILDING' | 'SIGN'
  payment_amount: number
  payment_date: string
  payment_method: string
  reference_no: string | null
  receipt_no: string | null
  recorded_by: number | null
}

function errorMessage(result: any, fallback: string) {
  return typeof result?.detail === 'string'
    ? result.detail
    : result?.detail?.message ?? result?.message ?? fallback
}

export async function createCompletePayment(data: CompletePaymentInput): Promise<string> {
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
      date: row.payment_date,
      method: row.payment_method.toLowerCase() as PayMethod,
      refNo: row.reference_no ?? undefined,
      receiptNo: row.receipt_no ?? undefined,
      allocatedLand: 0,
      allocatedSign: 0,
      recordedBy: row.recorded_by === null ? '' : String(row.recorded_by),
    }
    if (row.tax_type === 'LAND_BUILDING') payment.allocatedLand += Number(row.allocated_amount)
    if (row.tax_type === 'SIGN') payment.allocatedSign += Number(row.allocated_amount)
    grouped.set(id, payment)
  }
  return [...grouped.values()]
}
