import { API_URL } from './config'

export interface TaxpayerYearRecordCreate {
  taxpayer_id: number
  tax_year: number
  note: string | null
  added_by: number | null
}

export interface TaxpayerYearRecordUpdate {
  note: string | null
  is_included: boolean
}

export async function bulkSaveTaxpayerYearRecords(data: unknown) {
  const response = await fetch(`${API_URL}/taxpayer-year-records/bulk-save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    const message = typeof result.detail === 'string'
      ? result.detail
      : result.detail?.message ?? 'บันทึกข้อมูลรายปีไม่สำเร็จ'
    throw new Error(result.detail?.error ? `${message}\nรายละเอียด: ${result.detail.error}` : message)
  }
  return result.data as any[]
}

export async function getTaxpayerYearRecord(
  taxpayerId: number,
  taxYear: number
) {
  const response = await fetch(
    `${API_URL}/taxpayer-year-records/by-taxpayer/${taxpayerId}/${taxYear}`
  )
  const result = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(
      result.detail?.message ?? 'โหลดข้อมูลปีภาษีเดิมไม่สำเร็จ'
    )
  }

  if (!result.data) return null

  return {
    yearRecordId: String(result.data.year_record_id),
    landAssessmentId: result.data.land_assessment_id
      ? String(result.data.land_assessment_id) : '',
    signAssessmentId: result.data.sign_assessment_id
      ? String(result.data.sign_assessment_id) : '',
    year: taxYear,
    landAmount: Number(result.data.land_amount),
    signAmount: Number(result.data.sign_amount),
    prevLandAmount: Number(result.data.prev_land_amount),
    prevSignAmount: Number(result.data.prev_sign_amount)
  }
}

// CREATE
export async function createTaxpayerYearRecord(
  data: TaxpayerYearRecordCreate
) {
  const response = await fetch(
    `${API_URL}/taxpayer-year-records`,
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
          'เพิ่มผู้เสียภาษีเข้าปีภาษีไม่สำเร็จ'
    )
  }

  return result
}

// UPDATE
export async function updateTaxpayerYearRecord(
 yearRecordId: number,
 data: TaxpayerYearRecordUpdate
) {
 const response = await fetch(
 `${API_URL}/taxpayer-year-records/${yearRecordId}`,
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
 'แก้ไขข้อมูลประจำปีไม่สำเร็จ'
 )
 }

 return result
}

// REMOVE FROM YEAR
export async function removeTaxpayerFromYear(
  yearRecordId: number
) {
  const response = await fetch(
    `${API_URL}/taxpayer-year-records/${yearRecordId}/remove`,
    {
      method: 'PUT'
    }
  )

  const result = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(
      typeof result.detail === 'string'
        ? result.detail
        : result.detail?.error ??
          result.detail?.message ??
          result.message ??
          'นำผู้เสียภาษีออกจากปีภาษีไม่สำเร็จ'
    )
  }

  return result
}
