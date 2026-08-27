import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { createCompletePayment } from '../api/payments'
import { formatCurrency, getLandRemaining, getSignRemaining, getTaxpayerName } from '../data/taxData'
import type { Taxpayer } from '../types'

type Scope = 'land' | 'sign' | 'both'

interface Props {
  taxpayer: Taxpayer
  year: number
  initialAmount?: number
  initialMethod?: 'transfer' | 'cash'
  initialScope?: Scope
  onCancel: () => void
  onSuccess?: () => void
}

const localDateTimeNow = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function PaymentForm({ taxpayer, year, initialAmount, initialMethod = 'transfer', initialScope, onCancel, onSuccess }: Props) {
  const { currentUser, addPayment, refreshData } = useApp()
  const assessment = taxpayer.assessments.find(item => item.year === year)
  const landRemaining = getLandRemaining(taxpayer, year)
  const signRemaining = getSignRemaining(taxpayer, year)
  const totalRemaining = landRemaining + signRemaining
  const defaultScope: Scope = initialScope ?? (landRemaining > 0 && signRemaining > 0 ? 'both' : landRemaining > 0 ? 'land' : 'sign')
  const startingAmount = Math.min(initialAmount ?? totalRemaining, totalRemaining)

  const allocate = (amount: number, scope: Scope) => {
    if (scope === 'land') return { land: Math.min(amount, landRemaining), sign: 0 }
    if (scope === 'sign') return { land: 0, sign: Math.min(amount, signRemaining) }
    const land = Math.min(amount, landRemaining)
    return { land, sign: Math.min(amount - land, signRemaining) }
  }

  const initialAllocation = allocate(startingAmount, defaultScope)
  const [amount, setAmount] = useState(startingAmount > 0 ? String(startingAmount) : '')
  const [dateTime, setDateTime] = useState(localDateTimeNow())
  const [scope, setScope] = useState<Scope>(defaultScope)
  const [landAllocation, setLandAllocation] = useState(String(initialAllocation.land || ''))
  const [signAllocation, setSignAllocation] = useState(String(initialAllocation.sign || ''))
  const [method, setMethod] = useState<'transfer' | 'cash'>(initialMethod)
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const paymentAmount = Number(amount) || 0
  const allocatedLand = Number(landAllocation) || 0
  const allocatedSign = Number(signAllocation) || 0
  const allocatedTotal = allocatedLand + allocatedSign

  const changeAmount = (raw: string) => {
    setAmount(raw)
    const next = allocate(Number(raw) || 0, scope)
    setLandAllocation(String(next.land || ''))
    setSignAllocation(String(next.sign || ''))
  }

  const changeScope = (nextScope: Scope) => {
    setScope(nextScope)
    const next = allocate(paymentAmount, nextScope)
    setLandAllocation(String(next.land || ''))
    setSignAllocation(String(next.sign || ''))
  }

  const changeLandAllocation = (raw: string) => {
    const land = Math.min(Number(raw) || 0, landRemaining, paymentAmount)
    setLandAllocation(raw === '' ? '' : String(land))
    if (scope === 'both') {
      const sign = Math.min(Math.max(paymentAmount - land, 0), signRemaining)
      setSignAllocation(String(sign || ''))
    }
  }

  const changeSignAllocation = (raw: string) => {
    const sign = Math.min(Number(raw) || 0, signRemaining, paymentAmount)
    setSignAllocation(raw === '' ? '' : String(sign))
    if (scope === 'both') {
      const land = Math.min(Math.max(paymentAmount - sign, 0), landRemaining)
      setLandAllocation(String(land || ''))
    }
  }

  const save = async () => {
    if (paymentAmount <= 0) return alert('กรุณากรอกยอดเงินที่รับชำระ')
    if (paymentAmount > totalRemaining) return alert('ยอดรับชำระมากกว่ายอดภาษีคงเหลือ')
    if (Math.abs(allocatedTotal - paymentAmount) > 0.009) return alert('ผลรวมยอดตัดภาษีต้องเท่ากับยอดเงินที่ได้รับ')
    if (allocatedLand > landRemaining || allocatedSign > signRemaining) return alert('ยอดตัดภาษีมากกว่ายอดคงเหลือ')
    if (allocatedLand > 0 && !assessment?.landAssessmentId) return alert('ไม่พบรหัสการประเมินภาษีที่ดิน')
    if (allocatedSign > 0 && !assessment?.signAssessmentId) return alert('ไม่พบรหัสการประเมินภาษีป้าย')

    const allocations = [
      ...(allocatedLand > 0 ? [{ assessment_id: Number(assessment!.landAssessmentId), allocated_amount: allocatedLand }] : []),
      ...(allocatedSign > 0 ? [{ assessment_id: Number(assessment!.signAssessmentId), allocated_amount: allocatedSign }] : []),
    ]

    try {
      setSaving(true)
      const paymentId = await createCompletePayment({
        payment_amount: paymentAmount,
        payment_date: dateTime.slice(0, 10),
        payment_method: method,
        reference_no: method === 'transfer' ? reference || null : null,
        receipt_no: method === 'cash' ? receipt || null : null,
        recorded_by: currentUser?.id ? Number(currentUser.id) : null,
        allocations,
      })

      // API ตอบหลัง transaction commit แล้ว จึงอัปเดตเฉพาะผู้เสียภาษีคนนี้
      addPayment({
        id: paymentId,
        taxpayerId: taxpayer.id,
        amount: paymentAmount,
        date: dateTime.slice(0, 10),
        method,
        refNo: method === 'transfer' ? reference || undefined : undefined,
        receiptNo: method === 'cash' ? receipt || undefined : undefined,
        allocatedLand,
        allocatedSign,
        recordedBy: currentUser?.id ?? '',
        taxYear: year,
      })
      await refreshData()
      setSaved(true)
      setTimeout(() => onSuccess?.(), 900)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'บันทึกการชำระไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (saved) return <div style={{ textAlign: 'center', padding: '28px 0' }}><div style={{ fontSize: 42 }}>✅</div><div style={{ marginTop: 8, fontWeight: 700, color: '#1a8f5a' }}>บันทึกการชำระเรียบร้อยแล้ว</div></div>

  return <>
    <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(240,236,251,.55)', marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#2d2545' }}>{getTaxpayerName(taxpayer)}</div>
      <div style={{ fontSize: 11, color: '#a89cc8' }}>{taxpayer.ownerCode || 'นิติบุคคล'} · ปีภาษี {year}</div>
      <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 12 }}><span>ที่ดินฯ ค้าง <b>฿{formatCurrency(landRemaining)}</b></span><span>ป้ายค้าง <b>฿{formatCurrency(signRemaining)}</b></span></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
      <div><label style={LBL}>ยอดเงินที่ได้รับ (บาท) *</label><input className="input-field" type="number" min="0" step="0.01" value={amount} onChange={e => changeAmount(e.target.value)} /></div>
      <div><label style={LBL}>วันที่และเวลาที่ชำระ *</label><input className="input-field" type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} /></div>
    </div>
    <div style={{ marginBottom: 14 }}><label style={LBL}>ประเภทภาษีที่ต้องการตัดยอด *</label><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
      {([['land','🏠 ภาษีที่ดินฯ'],['sign','🪧 ภาษีป้าย'],['both','🏠 + 🪧 ทั้งสองประเภท']] as [Scope,string][]).map(([value,label]) => <button key={value} type="button" disabled={(value === 'land' && landRemaining <= 0) || (value === 'sign' && signRemaining <= 0) || (value === 'both' && (landRemaining <= 0 || signRemaining <= 0))} onClick={() => changeScope(value)} style={choiceStyle(scope === value)}>{label}</button>)}
    </div></div>
    <div style={{ display: 'grid', gridTemplateColumns: scope === 'both' ? '1fr 1fr' : '1fr', gap: 12, padding: 13, borderRadius: 12, background: 'rgba(240,236,251,.45)', marginBottom: 14 }}>
      {scope !== 'sign' && <div><label style={LBL}>ตัดยอดภาษีที่ดินฯ *</label><input className="input-field" type="number" min="0" max={Math.min(landRemaining, paymentAmount)} step="0.01" value={landAllocation} onChange={e => changeLandAllocation(e.target.value)} /></div>}
      {scope !== 'land' && <div><label style={LBL}>ตัดยอดภาษีป้าย *</label><input className="input-field" type="number" min="0" max={Math.min(signRemaining, paymentAmount)} step="0.01" value={signAllocation} onChange={e => changeSignAllocation(e.target.value)} /></div>}
      <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: Math.abs(allocatedTotal-paymentAmount)<.009 ? '#1a8f5a' : '#c0392b' }}><span>รวมยอดตัดภาษี</span><b>฿{formatCurrency(allocatedTotal)} / ฿{formatCurrency(paymentAmount)}</b></div>
    </div>
    <div style={{ marginBottom: 14 }}><label style={LBL}>วิธีชำระ *</label><div style={{ display: 'flex', gap: 8 }}>{([['transfer','💳 โอนเงิน'],['cash','💵 เงินสด']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setMethod(value)} style={{ ...choiceStyle(method===value), flex: 1 }}>{label}</button>)}</div></div>
    <div style={{ marginBottom: 18 }}><label style={LBL}>{method === 'transfer' ? 'เลขอ้างอิงการโอน' : 'เลขที่ใบเสร็จ'}</label><input className="input-field" value={method === 'transfer' ? reference : receipt} onChange={e => method === 'transfer' ? setReference(e.target.value) : setReceipt(e.target.value)} placeholder={method === 'transfer' ? 'TRF...' : 'RC2569-...'} /></div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn-secondary" onClick={onCancel}>ยกเลิก</button><button type="button" className="btn-primary" disabled={saving || !dateTime || paymentAmount <= 0 || Math.abs(allocatedTotal-paymentAmount)>.009} onClick={() => void save()}>{saving ? 'กำลังบันทึก...' : '💾 บันทึกการชำระ'}</button></div>
  </>
}

const LBL = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
const choiceStyle = (active: boolean) => ({ padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 12, border: active ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,.35)', background: active ? 'rgba(124,92,191,.1)' : '#fff', color: active ? '#6745ae' : '#6b5b95', fontWeight: active ? 700 : 500 })
