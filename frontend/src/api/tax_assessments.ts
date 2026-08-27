import type { Taxpayer, Group } from '../types'
import { API_URL } from './config'

interface TaxAssessmentsApi {
  year_record_id: number
  taxpayer_id: number
  tax_year: number
  note: string | null
  
  land_assessment_id: number | null
  sign_assessment_id: number | null

  land_amount: number
  sign_amount: number
  prev_land_amount: number
  prev_sign_amount: number
}

interface TaxAssessment {
  yearRecordId: string
  taxpayerId: string

  landAssessmentId: string
  signAssessmentId: string

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

// READ ALL
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

    landAssessmentId:
    tax_assessment.land_assessment_id !== null
      ? String(tax_assessment.land_assessment_id)
      : '',

    signAssessmentId:
    tax_assessment.sign_assessment_id !== null
      ? String(tax_assessment.sign_assessment_id)
      : '',

    year: tax_assessment.tax_year,

    landAmount: Number(tax_assessment.land_amount),
    signAmount: Number(tax_assessment.sign_amount),

    prevLandAmount: Number(tax_assessment.prev_land_amount),
    prevSignAmount: Number(tax_assessment.prev_sign_amount),

    note: tax_assessment.note ?? '',
  }))
}

// CREATE
interface TaxAssessmentCreate {
  year_record_id: number
  tax_type: 'LAND_BUILDING' | 'SIGN'
  assessed_amount: number
  previous_amount: number
  change_reason: string | null
  assessment_date: string | null
  annual_due_date: string | null
  created_by: number | null
}

export async function createTaxAssessment(
  data: TaxAssessmentCreate
) {
  const response = await fetch(
    `${API_URL}/tax-assessments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  )

  const result = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(
      typeof result.detail === 'string'
        ? result.detail
        : result.detail?.message ??
          result.message ??
          'เพิ่มข้อมูลการประเมินภาษีไม่สำเร็จ'
    )
  }

  return result
}

//UPDATE
interface TaxAssessmentUpdate {
  assessed_amount: number
  previous_amount: number
  change_reason: string | null
  assessment_date: string | null
  annual_due_date: string | null
  updated_by: number | null
}
export async function updateTaxAssessment(
  assessmentId: number,
  data: TaxAssessmentUpdate
) {
  const response = await fetch(
    `${API_URL}/tax-assessments/${assessmentId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  )

  const result = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(
      typeof result.detail === 'string'
        ? result.detail
        : result.detail?.message ??
          result.message ??
          'แก้ไขข้อมูลการประเมินภาษีไม่สำเร็จ'
    )
  }

  return result
}
