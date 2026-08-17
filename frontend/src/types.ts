export type UserRole = 'officer' | 'director' | 'admin'

export interface User {
  id: string
  code: string
  name: string
  role: UserRole
  group?: string
  active: boolean
}

export type TaxType = 'land' | 'sign' | 'both'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'
export type FollowStatus = 'none' | 'followed' | 'promised' | 'dispute' | 'closed'
export type CallResult = 'no_answer' | 'reached' | 'callback' | 'promised' | 'dispute' | 'wrong_number' | 'other'
export type ContactType = 'phone' | 'line' | 'in_person' | 'letter' | 'other'
export type PayMethod = 'transfer' | 'cash'

export type TaxpayerType = 'individual' | 'company'
export type Group = 'ก-น' | 'บ-ล' | 'ส-ศ' | 'ว-ฮ และบริษัท'

export interface TaxAssessment {
  year: number
  landAmount: number
  signAmount: number
  prevLandAmount: number
  prevSignAmount: number
}

export interface Payment {
  id: string
  taxpayerId: string
  amount: number
  date: string
  method: PayMethod
  refNo?: string
  receiptNo?: string
  allocatedLand: number
  allocatedSign: number
  recordedBy: string
}

export interface FollowUp {
  id: string
  taxpayerId: string
  type: ContactType
  date: string
  result?: CallResult
  detail?: string
  promiseDate?: string
  promiseAmount?: number
  nextFollowDate?: string
  recordedBy: string
}

export interface Taxpayer {
  id: string
  ownerCode: string
  type: TaxpayerType
  firstName: string
  lastName: string
  companyName?: string
  phone: string
  address: string
  group: Group
  responsibleOfficer: string
  assessments: TaxAssessment[]
  payments: Payment[]
  followUps: FollowUp[]
  notes?: string
  active: boolean
}

export interface TimelineEvent {
  date: string
  type: 'assessment' | 'notice' | 'call' | 'promise' | 'payment' | 'followup'
  title: string
  detail?: string
  amount?: number
  status?: string
}
