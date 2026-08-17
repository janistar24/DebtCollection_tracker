import type { Taxpayer, Group } from '../types'

interface TaxpayerApi {
  taxpayer_id: number
  owner_code: string | null
  taxpayer_type: 'INDIVIDUAL' | 'COMPANY'
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  address: string | null
  group_code: Group
  is_active: boolean
  created_at: string
  updated_at: string
  responsible_officer_id: number | null
}

interface TaxpayersResponse {
  success: boolean
  count: number
  data: TaxpayerApi[]
}

const API_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

export async function getTaxpayers(): Promise<Taxpayer[]> {
  const response = await fetch(`${API_URL}/taxpayers`)

  if (!response.ok) {
    throw new Error(
      `โหลดข้อมูลผู้เสียภาษีไม่สำเร็จ: ${response.status}`
    )
  }

  const result = (await response.json()) as TaxpayersResponse

  if (!result.success) {
    throw new Error('API ไม่สามารถส่งข้อมูลผู้เสียภาษีได้')
  }

  return result.data.map((taxpayer) => ({
    id: String(taxpayer.taxpayer_id),

    ownerCode: taxpayer.owner_code ?? '',

    type:
      taxpayer.taxpayer_type === 'COMPANY'
        ? 'company'
        : 'individual',

    firstName: taxpayer.first_name ?? '',
    lastName: taxpayer.last_name ?? '',
    companyName: taxpayer.company_name ?? undefined,

    phone: taxpayer.phone ?? '',
    address: taxpayer.address ?? '',

    group: taxpayer.group_code,

    responsibleOfficer:
      taxpayer.responsible_officer_id !== null
        ? String(taxpayer.responsible_officer_id)
        : '',

    assessments: [],
    payments: [],
    followUps: [],
    notes: '',

    active: taxpayer.is_active,
  }))
}