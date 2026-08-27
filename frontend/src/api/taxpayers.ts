import type { Taxpayer, Group } from '../types'
import { API_URL } from './config'

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

export interface TaxpayerCreate {
  taxpayer_type: 'INDIVIDUAL' | 'COMPANY'
  owner_code: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  address: string | null
  group_code: string
  is_active: boolean
}

export async function updateTaxpayerMaster(id: number, data: TaxpayerCreate) {
  return taxpayerMutation(`${API_URL}/taxpayers/${id}`, 'PUT', data)
}

export async function setTaxpayerActive(id: number, active: boolean) {
  return taxpayerMutation(
    `${API_URL}/taxpayers/${id}/${active ? 'reactivate' : 'deactivate'}`,
    'PUT'
  )
}

export async function deleteTaxpayerMaster(id: number) {
  return taxpayerMutation(`${API_URL}/taxpayers/${id}`, 'DELETE')
}

async function taxpayerMutation(url: string, method: string, data?: unknown) {
  const response = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(typeof result.detail === 'string' ? result.detail : result.detail?.message ?? result.message ?? 'ดำเนินการไม่สำเร็จ')
  }
  return result
}

export async function createTaxpayer(
  data: TaxpayerCreate
) {
  const response = await fetch(
    `${API_URL}/taxpayers`,
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
          'เพิ่มผู้เสียภาษีไม่สำเร็จ'
    )
  }

  return result
}

export interface CompleteTaxpayerCreate extends TaxpayerCreate {
  tax_year: number
  land_amount: number
  sign_amount: number
  added_by: number | null
}

export async function createCompleteTaxpayer(
  data: CompleteTaxpayerCreate
) {
  const response = await fetch(`${API_URL}/taxpayers/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

  const result = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(
      typeof result.detail === 'string'
        ? result.detail
        : result.detail?.message ??
          result.message ??
          'เพิ่มผู้เสียภาษีไม่สำเร็จ'
    )
  }

  return result
}
