interface TaxpayerYearRecordCreate {
  taxpayer_id: number
  tax_year: number
  note: string | null
  added_by: number | null
}


interface TaxpayerYearRecordUpdate {
  note: string | null
  is_included: boolean
}

const API_URL =
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8000/api'

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
interface TaxpayerYearRecordUpdate {
 note: string | null
 is_included: boolean
}

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