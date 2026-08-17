import type { Taxpayer, Group } from '../types'

interface TaxAssessmentsApi {
  year_record_id: number
  taxpayer_id: number
  tax_year: number
  note: string | null

  land_amount: number
  sign_amount: number
  prev_land_amount: number
  prev_sign_amount: number
}

interface TaxAssessment {
  yearRecordId: string
  taxpayerId: string

  year: number
  landAmount: number
  signAmount: number
  prevLandAmount: number
  prevSignAmount: number

  note: string
}

interface TaxAssessmentsResponse {
  success: boolean
  count: number
  data: TaxAssessmentsApi[]
}

const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

export async function getTaxAssessments(): Promise<TaxAssessment[]> {
  const response = await fetch(`${API_URL}/tax-assessments`)

  if (!response.ok) {
    throw new Error(
      `โหลดข้อมูลการประเมินภาษีไม่สำเร็จ: ${response.status}`
    )
  }

  const result = (await response.json()) as TaxAssessmentsResponse

  if (!result.success) {
    throw new Error('API ไม่สามารถส่งข้อมูลการประเมินภาษีได้')
  }

  return result.data.map((tax_assessment) => ({
    yearRecordId: String(tax_assessment.year_record_id),
    taxpayerId: String(tax_assessment.taxpayer_id),

    year: tax_assessment.tax_year,

    landAmount: Number(tax_assessment.land_amount),
    signAmount: Number(tax_assessment.sign_amount),

    prevLandAmount: Number(tax_assessment.prev_land_amount),
    prevSignAmount: Number(tax_assessment.prev_sign_amount),

    note: tax_assessment.note ?? '',
  }))
}
