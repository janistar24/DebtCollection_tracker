import type { Taxpayer, User, Payment, FollowUp } from '../types'

export const CURRENT_YEAR = 2569

export const mockUsers: User[] = [
  { id: 'u1', code: 'EMP001', name: 'สมชาย ใจดี', role: 'officer', group: 'ก-น', active: true },
  { id: 'u2', code: 'EMP002', name: 'วาสนา ศรีสุข', role: 'officer', group: 'บ-ล', active: true },
  { id: 'u3', code: 'EMP003', name: 'ประสิทธิ์ มานะ', role: 'officer', group: 'ส-ศ', active: true },
  { id: 'u4', code: 'EMP004', name: 'นิตยา พรหมมา', role: 'officer', group: 'ว-ฮ และบริษัท', active: true },
  { id: 'u6', code: 'DIR001', name: 'อำพล วิชัยกุล', role: 'director', active: true },
  { id: 'u7', code: 'ADM001', name: 'ระวี สิทธิพร', role: 'admin', active: true },
]

export const mockTaxpayers: Taxpayer[] = [
  {
    id: 'tp001', ownerCode: 'กน-00101', type: 'individual',
    firstName: 'กมล', lastName: 'แสนดี',
    phone: '081-234-5678', address: '12/3 ถ.สุขุมวิท ต.กลางเมือง อ.เมือง จ.ขอนแก่น 40000',
    group: 'ก-น', responsibleOfficer: 'u1',
    assessments: [
      { year: 2569, landAmount: 2500, signAmount: 1200, prevLandAmount: 2000, prevSignAmount: 1200 },
      { year: 2568, landAmount: 2000, signAmount: 1200, prevLandAmount: 1800, prevSignAmount: 1000 },
    ],
    payments: [
      { id: 'pay001', taxpayerId: 'tp001', amount: 1200, date: '2569-03-03', method: 'transfer', refNo: 'TRF20690303001', allocatedLand: 0, allocatedSign: 1200, recordedBy: 'u1' }
    ],
    followUps: [
      { id: 'fu001', taxpayerId: 'tp001', type: 'phone', date: '2569-02-20T10:30', result: 'no_answer', detail: 'โทรไม่รับ', nextFollowDate: '2569-02-22', recordedBy: 'u1' },
      { id: 'fu002', taxpayerId: 'tp001', type: 'phone', date: '2569-02-22T14:10', result: 'promised', detail: 'แจ้งว่าจะชำระวันที่ 28 ก.พ.', promiseDate: '2569-02-28', promiseAmount: 3700, nextFollowDate: '2569-03-01', recordedBy: 'u1' },
      { id: 'fu003', taxpayerId: 'tp001', type: 'phone', date: '2569-03-01T09:00', result: 'reached', detail: 'แจ้งว่าจะโอนภาษีป้ายก่อน ยังไม่มีเงินจ่ายที่ดิน', recordedBy: 'u1' },
    ],
    notes: 'เจ้าของร้านค้า ขอผ่อนชำระ', active: true
  },
  {
    id: 'tp002', ownerCode: 'กน-00215', type: 'individual',
    firstName: 'กิตติ', lastName: 'นาคสุวรรณ',
    phone: '089-876-5432', address: '45 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000',
    group: 'ก-น', responsibleOfficer: 'u1',
    assessments: [
      { year: 2569, landAmount: 5800, signAmount: 0, prevLandAmount: 5800, prevSignAmount: 0 },
    ],
    payments: [
      { id: 'pay002', taxpayerId: 'tp002', amount: 5800, date: '2569-01-25', method: 'cash', receiptNo: 'RC2569-0124', allocatedLand: 5800, allocatedSign: 0, recordedBy: 'u1' }
    ],
    followUps: [],
    active: true
  },
  {
    id: 'tp003', ownerCode: 'กน-00332', type: 'individual',
    firstName: 'จันทร์เพ็ญ', lastName: 'ดาวเรือง',
    phone: '062-111-3344', address: '78/2 ซ.นาคำ ต.บ้านทุ่ม อ.เมือง จ.ขอนแก่น 40000',
    group: 'ก-น', responsibleOfficer: 'u1',
    assessments: [
      { year: 2569, landAmount: 3200, signAmount: 800, prevLandAmount: 3000, prevSignAmount: 800 },
    ],
    payments: [],
    followUps: [
      { id: 'fu010', taxpayerId: 'tp003', type: 'phone', date: '2569-02-15T09:30', result: 'no_answer', detail: 'โทรไม่รับ ครั้งที่ 1', recordedBy: 'u1' },
      { id: 'fu011', taxpayerId: 'tp003', type: 'phone', date: '2569-02-18T14:00', result: 'no_answer', detail: 'โทรไม่รับ ครั้งที่ 2', recordedBy: 'u1' },
    ],
    active: true
  },
  {
    id: 'tp004', ownerCode: 'กน-00450', type: 'individual',
    firstName: 'ดำรง', lastName: 'คงเดช',
    phone: '065-999-0011', address: '15 ถ.ชาตะผดุง ต.พระลับ อ.เมือง จ.ขอนแก่น 40000',
    group: 'ก-น', responsibleOfficer: 'u1',
    assessments: [
      { year: 2569, landAmount: 1500, signAmount: 600, prevLandAmount: 1500, prevSignAmount: 0 },
    ],
    payments: [],
    followUps: [],
    notes: 'ย้ายที่อยู่ใหม่ ต้องตรวจสอบ', active: true
  },
  {
    id: 'tp005', ownerCode: 'กน-00512', type: 'individual',
    firstName: 'เกษร', lastName: 'ใจงาม',
    phone: '093-445-6677', address: '3/4 ถ.หน้าเมือง ต.กลางเมือง อ.เมือง จ.ขอนแก่น 40000',
    group: 'ก-น', responsibleOfficer: 'u1',
    assessments: [
      { year: 2569, landAmount: 4200, signAmount: 2400, prevLandAmount: 3500, prevSignAmount: 2000 },
    ],
    payments: [
      { id: 'pay005', taxpayerId: 'tp005', amount: 3000, date: '2569-02-10', method: 'transfer', refNo: 'TRF20690210005', allocatedLand: 3000, allocatedSign: 0, recordedBy: 'u1' }
    ],
    followUps: [
      { id: 'fu020', taxpayerId: 'tp005', type: 'phone', date: '2569-03-05T11:00', result: 'promised', detail: 'แจ้งว่าจะชำระส่วนที่เหลือวันที่ 15 มี.ค.', promiseDate: '2569-03-15', promiseAmount: 3600, recordedBy: 'u1' },
    ],
    active: true
  },
  {
    id: 'tp006', ownerCode: 'บล-00103', type: 'individual',
    firstName: 'บุญมี', lastName: 'ลือชา',
    phone: '087-321-0099', address: '22/1 ถ.โนนม่วง ต.โนนม่วง อ.เมือง จ.ขอนแก่น 40000',
    group: 'บ-ล', responsibleOfficer: 'u2',
    assessments: [
      { year: 2569, landAmount: 6500, signAmount: 1800, prevLandAmount: 6000, prevSignAmount: 1800 },
    ],
    payments: [],
    followUps: [
      { id: 'fu030', taxpayerId: 'tp006', type: 'phone', date: '2569-02-20T08:30', result: 'dispute', detail: 'โต้แย้งยอดภาษีที่ดิน บอกว่าพื้นที่ลดลงแล้ว', recordedBy: 'u2' },
    ],
    active: true
  },
  {
    id: 'tp007', ownerCode: 'บล-00245', type: 'individual',
    firstName: 'ลดาวัลย์', lastName: 'มีชัย',
    phone: '098-111-2233', address: '9/9 ถ.ดำรงสุข ต.พระลับ อ.เมือง จ.ขอนแก่น 40000',
    group: 'บ-ล', responsibleOfficer: 'u2',
    assessments: [
      { year: 2569, landAmount: 2800, signAmount: 0, prevLandAmount: 2800, prevSignAmount: 0 },
    ],
    payments: [
      { id: 'pay007', taxpayerId: 'tp007', amount: 2800, date: '2569-02-05', method: 'transfer', refNo: 'TRF20690205007', allocatedLand: 2800, allocatedSign: 0, recordedBy: 'u2' }
    ],
    followUps: [],
    active: true
  },
  {
    id: 'tp008', ownerCode: 'สศ-00178', type: 'individual',
    firstName: 'สมหมาย', lastName: 'ศรีพงษ์',
    phone: '084-567-8901', address: '60 ถ.สุขภาพ ต.บ้านทุ่ม อ.เมือง จ.ขอนแก่น 40000',
    group: 'ส-ศ', responsibleOfficer: 'u3',
    assessments: [
      { year: 2569, landAmount: 9200, signAmount: 3400, prevLandAmount: 8000, prevSignAmount: 3000 },
    ],
    payments: [],
    followUps: [],
    active: true
  },
  {
    id: 'tp009', ownerCode: 'วฮ-00055', type: 'individual',
    firstName: 'วิมล', lastName: 'อ่อนโยน',
    phone: '091-234-5566', address: '33/7 ถ.กสิกรทุ่งสร้าง ต.กลางเมือง อ.เมือง จ.ขอนแก่น 40000',
    group: 'ว-ฮ และบริษัท', responsibleOfficer: 'u4',
    assessments: [
      { year: 2569, landAmount: 3700, signAmount: 900, prevLandAmount: 3700, prevSignAmount: 900 },
    ],
    payments: [
      { id: 'pay009', taxpayerId: 'tp009', amount: 4600, date: '2569-01-30', method: 'cash', receiptNo: 'RC2569-0081', allocatedLand: 3700, allocatedSign: 900, recordedBy: 'u4' }
    ],
    followUps: [],
    active: true
  },
  {
    id: 'tp010', ownerCode: 'BC-00012', type: 'company',
    firstName: '', lastName: '', companyName: 'บริษัท ค้าส่งไทย จำกัด',
    phone: '043-222-3344', address: '111 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000',
    group: 'ว-ฮ และบริษัท', responsibleOfficer: 'u4',
    assessments: [
      { year: 2569, landAmount: 48000, signAmount: 12500, prevLandAmount: 45000, prevSignAmount: 11000 },
    ],
    payments: [],
    followUps: [
      { id: 'fu050', taxpayerId: 'tp010', type: 'phone', date: '2569-02-28T13:00', result: 'reached', detail: 'ฝ่ายบัญชีแจ้งว่ากำลังดำเนินการขออนุมัติงบประมาณ', nextFollowDate: '2569-03-10', recordedBy: 'u5' },
    ],
    active: true
  },
  {
    id: 'tp011', ownerCode: 'BC-00025', type: 'company',
    firstName: '', lastName: '', companyName: 'ห้างหุ้นส่วนจำกัด มิ่งขวัญ',
    phone: '043-333-5566', address: '88 ถ.ประชาสำราญ ต.กลางเมือง อ.เมือง จ.ขอนแก่น 40000',
    group: 'ว-ฮ และบริษัท', responsibleOfficer: 'u4',
    assessments: [
      { year: 2569, landAmount: 15000, signAmount: 4800, prevLandAmount: 15000, prevSignAmount: 4200 },
    ],
    payments: [
      { id: 'pay011', taxpayerId: 'tp011', amount: 19800, date: '2569-02-14', method: 'transfer', refNo: 'TRF20690214011', allocatedLand: 15000, allocatedSign: 4800, recordedBy: 'u5' }
    ],
    followUps: [],
    active: true
  },
]

export function getTaxpayerName(tp: Taxpayer): string {
  return tp.type === 'company' ? (tp.companyName ?? '') : `${tp.firstName} ${tp.lastName}`
}

export function getAssessment(tp: Taxpayer, year: number) {
  return tp.assessments.find(a => a.year === year)
}

export function getTotalAssessed(tp: Taxpayer, year: number): number {
  const a = getAssessment(tp, year)
  if (!a) return 0
  return a.landAmount + a.signAmount
}

export function getTotalPaid(tp: Taxpayer, year?: number): number {
  return tp.payments.filter(p => !year || p.date.startsWith(String(year - 543))).reduce((s, p) => s + p.amount, 0)
}

export function getLandPaid(tp: Taxpayer): number {
  return tp.payments.reduce((s, p) => s + p.allocatedLand, 0)
}

export function getSignPaid(tp: Taxpayer): number {
  return tp.payments.reduce((s, p) => s + p.allocatedSign, 0)
}

export function getLandRemaining(tp: Taxpayer, year: number): number {
  const a = getAssessment(tp, year)
  if (!a) return 0
  return Math.max(0, a.landAmount - getLandPaid(tp))
}

export function getSignRemaining(tp: Taxpayer, year: number): number {
  const a = getAssessment(tp, year)
  if (!a) return 0
  return Math.max(0, a.signAmount - getSignPaid(tp))
}

export function getTotalRemaining(tp: Taxpayer, year: number): number {
  return getLandRemaining(tp, year) + getSignRemaining(tp, year)
}

export function getPaymentStatus(tp: Taxpayer, year: number): 'paid' | 'partial' | 'unpaid' {
  const total = getTotalAssessed(tp, year)
  if (total === 0) return 'paid'
  const remaining = getTotalRemaining(tp, year)
  if (remaining === 0) return 'paid'
  if (remaining < total) return 'partial'
  return 'unpaid'
}

export function getFollowStatus(tp: Taxpayer): 'none' | 'followed' | 'promised' | 'dispute' | 'closed' {
  if (tp.followUps.length === 0) return 'none'
  const last = [...tp.followUps].sort((a, b) => b.date.localeCompare(a.date))[0]
  if (last.result === 'dispute') return 'dispute'
  if (last.result === 'promised') return 'promised'
  return 'followed'
}

export function getLastFollowUp(tp: Taxpayer): FollowUp | undefined {
  return [...tp.followUps].sort((a, b) => b.date.localeCompare(a.date))[0]
}

export function groupTaxpayers(tps: Taxpayer[], group: string): Taxpayer[] {
  return tps.filter(tp => tp.group === group)
}

export function formatCurrency(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const parts = dateStr.split('T')[0].split('-')
  if (parts.length < 3) return dateStr
  const [y, m, d] = parts
  const thaiYear = parseInt(y)
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${thaiYear}`
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  const [date, time] = dateStr.split('T')
  return `${formatDate(date)} ${time ? time.substring(0,5) : ''}`
}

export function getUserById(id: string): User | undefined {
  return mockUsers.find(u => u.id === id)
}

export function getGroupForCode(ownerCode: string): string {
  const prefix = ownerCode.split('-')[0]
  if (prefix === 'BC') return 'ว-ฮ และบริษัท'
  if (['กน', 'ก', 'ข', 'ค', 'ง', 'จ', 'ช', 'ซ', 'ญ', 'ด', 'ต', 'ถ', 'ท', 'ธ', 'น'].some(p => prefix.startsWith(p))) return 'ก-น'
  if (['บล', 'บ', 'ป', 'ผ', 'ฝ', 'พ', 'ฟ', 'ภ', 'ม', 'ย', 'ร', 'ล'].some(p => prefix.startsWith(p))) return 'บ-ล'
  if (['สศ', 'ส', 'ศ', 'ษ'].some(p => prefix.startsWith(p))) return 'ส-ศ'
  return 'ว-ฮ และบริษัท'
}
