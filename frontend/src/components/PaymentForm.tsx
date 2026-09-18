import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { createCompletePayment } from '../api/payments'
import { formatCurrency, getInstallmentCount, getOutstandingYears, getTaxpayerName, getTotalAssessed } from '../data/taxData'
import type { PayMethod, Taxpayer } from '../types'
import BuddhistDateInput from './BuddhistDateInput'

type Scope = 'land' | 'sign' | 'both'
type AllocationRow = { assessmentId: number; year: number; taxType: 'land' | 'sign'; label: string; remaining: number }
type Props = { taxpayer: Taxpayer; year: number; initialAmount?: number; initialMethod?: PayMethod; initialScope?: Scope; onCancel: () => void; onSuccess?: () => void }

const localDateTimeNow = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function PaymentForm({ taxpayer, year, initialAmount, initialMethod = 'transfer', initialScope, onCancel, onSuccess }: Props) {
  const { currentUser, addPayment, refreshData } = useApp()
  const outstandingYears = useMemo(() => getOutstandingYears(taxpayer, year), [taxpayer, year])
  const rows = useMemo<AllocationRow[]>(() => outstandingYears.flatMap(({ assessment, landRemaining, signRemaining }) => [
    ...(landRemaining > 0 && assessment.landAssessmentId ? [{ assessmentId: Number(assessment.landAssessmentId), year: assessment.year, taxType: 'land' as const, label: 'ภาษีที่ดินและสิ่งปลูกสร้าง', remaining: landRemaining }] : []),
    ...(signRemaining > 0 && assessment.signAssessmentId ? [{ assessmentId: Number(assessment.signAssessmentId), year: assessment.year, taxType: 'sign' as const, label: 'ภาษีป้าย', remaining: signRemaining }] : []),
  ]), [outstandingYears])
  const totalOutstanding = rows.reduce((sum, row) => sum + row.remaining, 0)
  const installmentCount = getInstallmentCount(taxpayer)
  const nextInstallment = installmentCount + 1
  const initialPayment = initialAmount ?? totalOutstanding
  const [amount, setAmount] = useState(initialPayment > 0 ? String(initialPayment) : '')
  const [dateTime, setDateTime] = useState(localDateTimeNow())
  const [allocations, setAllocations] = useState<Record<number, string>>({})
  const hasLand = rows.some(row => row.taxType === 'land')
  const hasSign = rows.some(row => row.taxType === 'sign')
  const defaultScope: Scope = initialScope && (initialScope !== 'land' || hasLand) && (initialScope !== 'sign' || hasSign) && (initialScope !== 'both' || (hasLand && hasSign)) ? initialScope : hasLand && hasSign ? 'both' : hasLand ? 'land' : 'sign'
  const [scope, setScope] = useState<Scope>(defaultScope)
  const [method, setMethod] = useState<PayMethod>(initialMethod)
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const paymentAmount = Number(amount) || 0
  const eligibleRows = useMemo(
    () => rows.filter(row => scope === 'both' || row.taxType === scope),
    [rows, scope],
  )
  const allocatedTotal = eligibleRows.reduce((sum, row) => sum + (Number(allocations[row.assessmentId]) || 0), 0)
  const overpayment = Math.max(0, paymentAmount - totalOutstanding)
  const unallocatedAmount = Math.max(0, paymentAmount - allocatedTotal - overpayment)

  useEffect(() => {
    let remainingPayment = paymentAmount
    const automatic: Record<number, string> = {}
    // rows เรียงปีเก่าไปปีใหม่ และภายในปีเรียงภาษีที่ดินก่อนภาษีป้าย
    eligibleRows.forEach(row => {
      const value = Math.max(0, Math.min(remainingPayment, row.remaining))
      automatic[row.assessmentId] = value > 0 ? value.toFixed(2) : ''
      remainingPayment = Math.max(0, remainingPayment - value)
    })
    setAllocations(automatic)
  }, [paymentAmount, scope, rows])

  const setAllocation = (row: AllocationRow, raw: string) => {
    if (!raw) return setAllocations(current => ({ ...current, [row.assessmentId]: '' }))
    const value = Math.max(0, Math.min(Number(raw) || 0, row.remaining, paymentAmount))
    setAllocations(current => ({ ...current, [row.assessmentId]: String(value) }))
  }

  const save = async () => {
    if (paymentAmount <= 0) return alert('กรุณากรอกยอดเงินที่รับชำระ')
    if (unallocatedAmount > 0.009) return alert('ยังมียอดเงินที่ไม่ได้จัดสรร กรุณาเลือกทั้งสองประเภทภาษีหรือตรวจสอบยอดอีกครั้ง')
    if (Math.abs(allocatedTotal + overpayment - paymentAmount) > 0.009) return alert('ผลรวมยอดที่จัดสรรและยอดชำระเกินต้องเท่ากับยอดเงินที่ได้รับ')
    const selected = rows.filter(row => scope === 'both' || row.taxType === scope).map(row => ({ ...row, allocatedAmount: Number(allocations[row.assessmentId]) || 0 })).filter(row => row.allocatedAmount > 0)
    try {
      setSaving(true)
      const paymentId = await createCompletePayment({
        payment_amount: paymentAmount,
        payment_date: dateTime.slice(0, 10),
        payment_datetime: new Date(dateTime).toISOString(),
        payment_method: method,
        reference_no: method === 'transfer' ? reference || null : null,
        receipt_no: method === 'cash' ? receipt || null : null,
        recorded_by: currentUser?.id ? Number(currentUser.id) : null,
        allocations: selected.map(row => ({ assessment_id: row.assessmentId, allocated_amount: row.allocatedAmount })),
      })
      const byYear = new Map<number, { land: number; sign: number }>()
      selected.forEach(row => {
        const current = byYear.get(row.year) ?? { land: 0, sign: 0 }
        current[row.taxType] += row.allocatedAmount
        byYear.set(row.year, current)
      })
      byYear.forEach((allocated, taxYear) => addPayment({
        id: paymentId, taxpayerId: taxpayer.id, amount: allocated.land + allocated.sign,
        date: dateTime.slice(0, 10), method,
        refNo: method === 'transfer' ? reference || undefined : undefined,
        receiptNo: method === 'cash' ? receipt || undefined : undefined,
        allocatedLand: allocated.land, allocatedSign: allocated.sign,
        recordedBy: currentUser?.id ?? '', taxYear,
      }))
      void refreshData().catch(error => console.error('รีเฟรชข้อมูลหลังบันทึกการชำระไม่สำเร็จ:', error))
      setSaved(true)
      setTimeout(() => onSuccess?.(), 900)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'บันทึกการชำระไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (saved) return <div style={{ textAlign: 'center', padding: '28px 0' }}><div style={{ fontSize: 42 }}>✅</div><div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: '#1a8f5a' }}>บันทึกการชำระงวดที่ {nextInstallment} เรียบร้อยแล้ว</div></div>

  return <>
    <div style={PROFILE}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#2d2545' }}>{getTaxpayerName(taxpayer)}</div>
      <div style={{ fontSize: 12, color: '#a89cc8', marginTop: 2 }}>{taxpayer.ownerCode || 'นิติบุคคล'} · ปีภาษีปัจจุบัน {year}</div>
      <div style={SUMMARY_GRID}><Summary label="ยอดประเมินภาษีปีปัจจุบัน" value={`฿${formatCurrency(getTotalAssessed(taxpayer, year))}`} /><Summary label="ยอดหนี้คงเหลือ" value={`฿${formatCurrency(totalOutstanding)}`} danger /></div>
      <div style={INSTALLMENT}><span>เคยชำระมาแล้วจำนวน <b>{installmentCount} งวด</b></span><span>รายการนี้จะบันทึกเป็น <b>งวดที่ {nextInstallment}</b></span></div>
    </div>
    <div className="payment-main-fields" style={TWO_COLUMNS}>
      <div><label style={LABEL}>ยอดเงินที่ได้รับ (บาท) *</label><input className="input-field" type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></div>
      <div><label style={LABEL}>วันที่และเวลาที่ชำระ *</label><BuddhistDateInput value={dateTime} onChange={setDateTime} includeTime required /></div>
    </div>
    <div style={{ marginBottom: 14 }}>
      <label style={LABEL}>ประเภทภาษีที่ต้องการตัดยอด *</label>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
        {([['land', '🏠 ภาษีที่ดินและสิ่งปลูกสร้าง', hasLand], ['sign', '🪧 ภาษีป้าย', hasSign], ['both', '🏠 + 🪧 ทั้งสองประเภท', hasLand && hasSign]] as const).map(([value, label, enabled]) => <button key={value} type="button" disabled={!enabled} onClick={() => enabled && setScope(value)} style={taxChoiceStyle(scope === value, enabled)}>{label}</button>)}
      </div>
      <label style={LABEL}>จัดสรรยอดชำระตามปีและประเภทภาษี *</label>
      <div style={{ fontSize: 12, color: '#8873b5', marginBottom: 8 }}>ระบบจัดสรรให้อัตโนมัติจากหนี้ปีเก่าสุดก่อน โดยตัดภาษีที่ดินและสิ่งปลูกสร้างก่อนภาษีป้าย และสามารถปรับแก้ได้ก่อนบันทึก</div>
      <div style={ALLOCATION_BOX}>
        {outstandingYears.map(({ assessment }) => {
          const yearRows = rows.filter(row => row.year === assessment.year)
          return <div key={assessment.year} style={YEAR_CARD}>
            <div style={YEAR_HEADER}><span>ปีภาษี {assessment.year}</span><span>คงเหลือ ฿{formatCurrency(yearRows.reduce((sum, row) => sum + row.remaining, 0))}</span></div>
            {yearRows.filter(row => scope === 'both' || row.taxType === scope).map(row => <div className="payment-allocation-row" key={row.assessmentId} style={ALLOCATION_ROW}>
              <span style={{ fontSize: 12, color: '#6b5b95' }}>{row.label}</span>
              <input className="input-field" type="number" min="0" max={Math.min(row.remaining, paymentAmount)} step="0.01" placeholder="0.00" value={allocations[row.assessmentId] ?? ''} onChange={event => setAllocation(row, event.target.value)} style={{ textAlign: 'right', fontSize: 13 }} />
              <span style={{ fontSize: 11, color: '#a89cc8', textAlign: 'right' }}>คงเหลือ ฿{formatCurrency(row.remaining)}</span>
            </div>)}
          </div>
        })}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: Math.abs(allocatedTotal + overpayment - paymentAmount) < .009 && unallocatedAmount < .009 ? '#1a8f5a' : '#c0392b', marginTop: 10 }}><span>รวมยอดที่จัดสรร</span><b>฿{formatCurrency(allocatedTotal)} / ฿{formatCurrency(paymentAmount)}</b></div>
        {overpayment > 0 && <div style={{ marginTop: 9, padding: '9px 11px', borderRadius: 9, background: '#fff8e6', color: '#8a5a00', fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>หมายเหตุ: ชำระเกิน</span><b>ส่วนต่าง ฿{formatCurrency(overpayment)}</b></div>}
        {unallocatedAmount > 0 && <div style={{ marginTop: 8, color: '#b42318', fontSize: 12 }}>ยังไม่ได้จัดสรร ฿{formatCurrency(unallocatedAmount)} กรุณาเลือก “ทั้งสองประเภท” เพื่อตัดยอดตามลำดับอัตโนมัติ</div>}
      </div>
    </div>
    <div style={{ marginBottom: 14 }}><label style={LABEL}>วิธีชำระ *</label><div style={{ display: 'flex', gap: 8 }}>{([['transfer', '💳 โอนเงิน'], ['cash', '💵 เงินสด']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setMethod(value)} style={{ ...choiceStyle(method === value), flex: 1 }}>{label}</button>)}</div></div>
    <div style={{ marginBottom: 18 }}><label style={LABEL}>{method === 'transfer' ? 'เลขอ้างอิงการโอน' : 'เลขที่ใบเสร็จ'}</label><input className="input-field" value={method === 'transfer' ? reference : receipt} onChange={event => method === 'transfer' ? setReference(event.target.value) : setReceipt(event.target.value)} placeholder={method === 'transfer' ? 'TRF...' : 'RC2569-...'} /></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn-secondary" onClick={onCancel}>ยกเลิก</button><button type="button" className="btn-primary" disabled={saving || !dateTime || paymentAmount <= 0 || unallocatedAmount > .009 || Math.abs(allocatedTotal + overpayment - paymentAmount) > .009} onClick={() => void save()}>{saving ? 'กำลังบันทึก...' : `💾 บันทึกการชำระงวดที่ ${nextInstallment}`}</button></div>
    <style>{`@media(max-width:640px){.payment-main-fields{grid-template-columns:1fr!important}.payment-allocation-row{grid-template-columns:1fr 120px!important}.payment-allocation-row>span:last-child{display:none}}`}</style>
  </>
}

function Summary({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div style={{ padding: '9px 11px', borderRadius: 10, background: '#fff', border: '1px solid rgba(180,165,230,.24)' }}><div style={{ fontSize: 11, color: '#a89cc8' }}>{label}</div><div style={{ fontSize: 15, fontWeight: 700, color: danger ? '#c0392b' : '#2d2545', marginTop: 3 }}>{value}</div></div>
}

const PROFILE = { padding: 14, borderRadius: 12, background: 'rgba(240,236,251,.55)', marginBottom: 16 }
const SUMMARY_GRID = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }
const INSTALLMENT = { display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(124,92,191,.09)', color: '#5f4596', fontSize: 12 }
const TWO_COLUMNS = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }
const LABEL = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
const ALLOCATION_BOX = { padding: 13, borderRadius: 12, background: 'rgba(240,236,251,.45)' }
const YEAR_CARD = { padding: 11, borderRadius: 10, background: '#fff', border: '1px solid rgba(180,165,230,.28)', marginBottom: 8 }
const YEAR_HEADER = { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, fontWeight: 700, color: '#45385e' }
const ALLOCATION_ROW = { display: 'grid', gridTemplateColumns: '1fr 150px 115px', gap: 10, alignItems: 'center', marginTop: 10 }
const choiceStyle = (active: boolean) => ({ padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13, border: active ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,.35)', background: active ? 'rgba(124,92,191,.1)' : '#fff', color: active ? '#6745ae' : '#6b5b95', fontWeight: active ? 700 : 500 })
const taxChoiceStyle = (active: boolean, enabled: boolean) => ({ padding: '8px 12px', borderRadius: 10, cursor: enabled ? 'pointer' : 'not-allowed', fontFamily: "'Sarabun',sans-serif", fontSize: 12, border: active && enabled ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,.35)', background: !enabled ? '#eeeeF2' : active ? 'rgba(124,92,191,.1)' : '#fff', color: !enabled ? '#aaa8b0' : active ? '#6745ae' : '#6b5b95', fontWeight: active && enabled ? 700 : 500, opacity: enabled ? 1 : .72 })
