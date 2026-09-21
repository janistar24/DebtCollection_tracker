import type { FollowUp, Taxpayer } from '../types'

// ปีภาษีของหน่วยงานเริ่มวันที่ 1 ตุลาคม และสิ้นสุดวันที่ 30 กันยายน
// เช่น 1 ต.ค. 2569 ถึง 30 ก.ย. 2570 ถือเป็นปีภาษี 2570
export const getCurrentTaxYear = (date = new Date()) => {
  const buddhistCalendarYear = date.getFullYear() + 543
  return date.getMonth() >= 9
    ? buddhistCalendarYear + 1
    : buddhistCalendarYear
}

export const CURRENT_YEAR = getCurrentTaxYear()

export const getTaxpayerName = (tp: Taxpayer) => tp.type === 'company'
  ? (tp.companyName ?? '') : `${tp.title ?? ''}${tp.firstName} ${tp.lastName}`.trim()

export const getAssessment = (tp: Taxpayer, year: number) =>
  tp.assessments.find(item => item.year === year)

export const getTotalAssessed = (tp: Taxpayer, year: number) => {
  const item = getAssessment(tp, year)
  return item ? item.landAmount + item.signAmount : 0
}

export const getTotalPaid = (tp: Taxpayer, year?: number) => tp.payments
  .filter(item => year === undefined || item.taxYear === year)
  .reduce((sum, item) => sum + item.allocatedLand + item.allocatedSign, 0)

export const getInstallmentCount = (tp: Taxpayer) =>
  new Set(tp.payments.map(item => item.id)).size

export const getOutstandingYears = (tp: Taxpayer, throughYear?: number) =>
  tp.assessments
    .filter(item => throughYear === undefined || item.year <= throughYear)
    .map(item => ({
      assessment: item,
      landRemaining: getLandRemaining(tp, item.year),
      signRemaining: getSignRemaining(tp, item.year),
    }))
    .filter(item => item.landRemaining + item.signRemaining > 0)
    .sort((a, b) => a.assessment.year - b.assessment.year)

export const getLandPaid = (tp: Taxpayer, year?: number) => tp.payments
  .filter(item => year === undefined || item.taxYear === year)
  .reduce((sum, item) => sum + item.allocatedLand, 0)

export const getSignPaid = (tp: Taxpayer, year?: number) => tp.payments
  .filter(item => year === undefined || item.taxYear === year)
  .reduce((sum, item) => sum + item.allocatedSign, 0)

export const getLandRemaining = (tp: Taxpayer, year: number) => {
  const item = getAssessment(tp, year)
  return item ? Math.max(0, item.landAmount - getLandPaid(tp, year)) : 0
}

export const getSignRemaining = (tp: Taxpayer, year: number) => {
  const item = getAssessment(tp, year)
  return item ? Math.max(0, item.signAmount - getSignPaid(tp, year)) : 0
}

export const getTotalRemaining = (tp: Taxpayer, year: number) =>
  getLandRemaining(tp, year) + getSignRemaining(tp, year)

export function getPaymentStatus(tp: Taxpayer, year: number): 'paid' | 'partial' | 'unpaid' {
  const assessed = getTotalAssessed(tp, year)
  if (assessed === 0) return 'paid'
  const remaining = getTotalRemaining(tp, year)
  if (remaining === 0) return 'paid'
  return remaining < assessed ? 'partial' : 'unpaid'
}

export function getLastFollowUp(tp: Taxpayer, year?: number): FollowUp | undefined {
  return tp.followUps.filter(item => year === undefined || item.taxYear === year)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

export function getFollowStatus(tp: Taxpayer, year?: number): 'none' | 'followed' | 'promised' | 'dispute' | 'closed' {
  const last = getLastFollowUp(tp, year)
  if (!last) return 'none'
  if (last.result === 'dispute') return 'dispute'
  if (last.result === 'promised') return 'promised'
  return 'followed'
}

export const groupTaxpayers = (items: Taxpayer[], group: string) =>
  items.filter(item => item.group === group)

export const formatCurrency = (value: number) => value.toLocaleString('th-TH', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export function formatDate(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(value: string): string {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function getGroupForCode(ownerCode: string): string {
  const prefix = ownerCode.split('-')[0]
  if (prefix === 'BC') return 'ว-ฮ และบริษัท'
  if (['กน','ก','ข','ค','ง','จ','ช','ซ','ญ','ด','ต','ถ','ท','ธ','น'].some(v => prefix.startsWith(v))) return 'ก-น'
  if (['บล','บ','ป','ผ','ฝ','พ','ฟ','ภ','ม','ย','ร','ล'].some(v => prefix.startsWith(v))) return 'บ-ล'
  if (['สศ','ส','ศ','ษ'].some(v => prefix.startsWith(v))) return 'ส-ศ'
  return 'ว-ฮ และบริษัท'
}
