import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import {
  getTaxpayerName,
  formatCurrency,
  formatDate,
  formatDateTime,
  getTotalAssessed,
  getTotalRemaining,
  getLandRemaining,
  getSignRemaining,
  getPaymentStatus,
  getLastFollowUp,
  getInstallmentCount,
  getOutstandingYears,
  CURRENT_YEAR
} from '../data/taxData'
import type { Taxpayer, Payment } from '../types'
import PaymentForm from '../components/PaymentForm'
import BuddhistDateInput from '../components/BuddhistDateInput'
import { readPaymentSlip } from '../api/slips'
import { createCompletePayment } from '../api/payments'
import { getCrossGroupPaymentMatches, type CrossGroupMatch } from '../api/debt_management'

const CALL_RESULT_LABELS: Record<string, string> = {
  no_answer: 'ไม่รับสาย', reached: 'ติดต่อได้', callback: 'จะโทรกลับ',
  promised: 'นัดชำระ', dispute: 'มีข้อโต้แย้ง', wrong_number: 'เบอร์ผิด', other: 'อื่น ๆ'
}

interface Candidate {
  tp: Taxpayer
  taxYear: number

  taxType: 'land' | 'sign' | 'both'

  assessedForType: number
  remainingForType: number

  totalRemaining: number

  diff: number
  exact: boolean
  matchScope?: 'year' | 'cumulative'
  matchDetails?: CandidateMatch[]
}

interface CandidateMatch {
  taxYear: number
  taxType: 'land' | 'sign' | 'both'
  remaining: number
  diff: number
  exact: boolean
  scope: 'year' | 'cumulative'
}

type TaskSearchScope = 'all' | 'today' | 'previous'

const TASK_SEARCH_OPTIONS: { value: TaskSearchScope; label: string }[] = [
  { value: 'all', label: 'รายการติดตามทั้งหมด' },
  { value: 'today', label: 'รายการที่ติดต่อวันนี้' },
  { value: 'previous', label: 'รายการค้างจากวันก่อน' },
]

const getLocalDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const isInTaskScope = (tp: Taxpayer, year: number, scope: TaskSearchScope) => {
  const yearFollowUps = tp.followUps.filter(followUp => followUp.taxYear === year)
  const hasOutstandingDebt = getOutstandingYears(tp, year)
    .some(item => item.landRemaining + item.signRemaining > 0)
  const isTask = hasOutstandingDebt && yearFollowUps.length > 0
  if (!isTask) return false

  const contactedToday = yearFollowUps.some(fu => getLocalDateKey(fu.date) === getLocalDateKey(new Date()))
  return scope === 'all' || (scope === 'today' && contactedToday) || (scope === 'previous' && !contactedToday)
}

const getAccumulatedOutstanding = (tp: Taxpayer, year: number) =>
  getOutstandingYears(tp, year).reduce(
    (sum, item) => sum + item.landRemaining + item.signRemaining, 0
  )

const getPriorYearOutstanding = (tp: Taxpayer, year: number) =>
  getOutstandingYears(tp, year).reduce(
    (sum, item) => sum + (item.assessment.year < year ? item.landRemaining + item.signRemaining : 0), 0
  )

export default function SearchPaymentPage() {
  const { taxpayers, addPayment, currentUser, selectedYear, refreshData } = useApp()
  const [activeTab, setActiveTab] = useState<'search' | 'direct'>('search')
  const [amtInput, setAmtInput] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [taxTypeFilter, setTaxTypeFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState(
    currentUser?.role === 'officer' ? (currentUser.group ?? 'all') : 'all'
  )
  const [taskSearchScope, setTaskSearchScope] = useState<TaskSearchScope>('all')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [searched, setSearched] = useState(false)
  const [searchedAmt, setSearchedAmt] = useState('')
  const [crossGroupMatches, setCrossGroupMatches] = useState<CrossGroupMatch[]>([])
  const [crossGroupLoading, setCrossGroupLoading] = useState(false)
  const [crossGroupError, setCrossGroupError] = useState('')
  const [slipReading, setSlipReading] = useState(false)
  const [slipMessage, setSlipMessage] = useState('')
  const [slipDragging, setSlipDragging] = useState(false)
  const [selectedSlipName, setSelectedSlipName] = useState('')

  // Drawer state
  const [drawerTp, setDrawerTp] = useState<Taxpayer | null>(null)
  const [drawerTaxYear, setDrawerTaxYear] = useState(selectedYear)
  const [showPayModal, setShowPayModal] = useState(false)

  // Cash search
  const [showCashModal, setShowCashModal] = useState(false)
  const [cashSearch, setCashSearch] = useState('')
  const [cashTp, setCashTp] = useState<Taxpayer | null>(null)
  const [cashAmt, setCashAmt] = useState('')
  const [cashDate, setCashDate] = useState(new Date().toISOString().slice(0, 10))
  const [cashReceipt, setCashReceipt] = useState('')
  const [cashSaving, setCashSaving] = useState(false)
  const [cashSaved, setCashSaved] = useState(false)

  // Payment form
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payTime, setPayTime] =
  useState(new Date().toTimeString().slice(0, 5))
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer')
  const [payRef, setPayRef] = useState('')
  const [payReceipt, setPayReceipt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const slipInputRef = useRef<HTMLInputElement>(null)

  const isDirector = currentUser?.role !== 'officer'
  const canRecordPayment = currentUser != null
  const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท']

  const runSearch = async () => {
    const amt = parseFloat(amtInput)
    const name = nameSearch.toLowerCase().trim()
    if (!amt && !name) return
    setCrossGroupMatches([])
    setCrossGroupError('')

    const pool = taxpayers.filter(tp => {
      if (!isDirector && tp.group !== currentUser?.group) return false
      if (groupFilter !== 'all' && tp.group !== groupFilter) return false
      if (name && !getTaxpayerName(tp).toLowerCase().includes(name) && !tp.ownerCode.toLowerCase().includes(name) && !tp.phone.includes(name)) return false
      return isInTaskScope(tp, selectedYear, taskSearchScope)
    })

  const yearlyResults: Candidate[] = amt > 0 ? pool
    .flatMap(tp => getOutstandingYears(tp, selectedYear).flatMap(({ assessment: assess, landRemaining, signRemaining }) => {
      const totalRemaining = landRemaining + signRemaining
      const candidates: Candidate[] = []

      const tolerance =
        Math.max(amt * 0.1, 5)


      // ==========================================
      // MATCH ภาษีที่ดินและสิ่งปลูกสร้าง
      // ==========================================
      if (
        taxTypeFilter === 'all' ||
        taxTypeFilter === 'land'
      ) {

        if (landRemaining > 0) {

          const diff =
            landRemaining - amt

          if (
            Math.abs(diff) <= tolerance
          ) {

            candidates.push({
              tp,
              taxYear: assess.year,

              taxType: 'land',

              assessedForType:
                assess.landAmount,

              remainingForType:
                landRemaining,

              totalRemaining,

              diff,

              exact:
                Math.abs(diff) < 0.01,
              matchScope: 'year'
            })
          }
        }
      }


      // ==========================================
      // MATCH ภาษีป้าย
      // ==========================================
      if (
        taxTypeFilter === 'all' ||
        taxTypeFilter === 'sign'
      ) {

        if (signRemaining > 0) {

          const diff =
            signRemaining - amt

          if (
            Math.abs(diff) <= tolerance
          ) {

            candidates.push({
              tp,
              taxYear: assess.year,

              taxType: 'sign',

              assessedForType:
                assess.signAmount,

              remainingForType:
                signRemaining,

              totalRemaining,

              diff,

              exact:
                Math.abs(diff) < 0.01,
              matchScope: 'year'
            })
          }
        }
      }


      // ==========================================
      // MATCH ยอดรวม
      // แสดงเฉพาะเมื่อเลือก "ทุกประเภท"
      // และมีภาษีมากกว่า 1 ประเภท
      // ==========================================
      if (
        taxTypeFilter === 'all' &&
        landRemaining > 0 &&
        signRemaining > 0
      ) {

        const diff =
          totalRemaining - amt

        if (
          Math.abs(diff) <= tolerance
        ) {

          candidates.push({
            tp,
            taxYear: assess.year,

            taxType: 'both',

            assessedForType:
              assess.landAmount +
              assess.signAmount,

            remainingForType:
              totalRemaining,

            totalRemaining,

            diff,

              exact:
                Math.abs(diff) < 0.01,
              matchScope: 'year'
          })
        }
      }


      return candidates
    })) : []

    const cumulativeResults: Candidate[] = (amt > 0 || !!name) ? pool.flatMap(tp => {
      const accumulated = getAccumulatedOutstanding(tp, selectedYear)
      const tolerance = amt > 0 ? Math.max(amt * 0.1, 5) : Number.POSITIVE_INFINITY
      const diff = amt > 0 ? accumulated - amt : 0
      if (accumulated <= 0 || Math.abs(diff) > tolerance) return []
      const currentAssessment = tp.assessments.find(item => item.year === selectedYear)
      return [{
        tp,
        taxYear: selectedYear,
        taxType: 'both' as const,
        assessedForType: (currentAssessment?.landAmount ?? 0) + (currentAssessment?.signAmount ?? 0),
        remainingForType: accumulated,
        totalRemaining: accumulated,
        diff,
        exact: amt > 0 && Math.abs(diff) < 0.01,
        matchScope: 'cumulative' as const,
      }]
    }) : []

    const uniqueResults = [...yearlyResults, ...cumulativeResults]
    .filter((candidate, index, all) => all.findIndex(other =>
      other.tp.id === candidate.tp.id
      && other.taxYear === candidate.taxYear
      && other.taxType === candidate.taxType
      && other.matchScope === candidate.matchScope
      && Math.abs(other.remainingForType - candidate.remainingForType) < 0.01
    ) === index)

    // หนึ่งคนอาจมียอดที่ค้นหาตรงได้หลายมุมมอง (เช่น ยอดรวมและภาษีป้าย)
    // จัดกลุ่มเป็นหนึ่งแถวต่อผู้เสียภาษี แล้วเก็บเหตุผลที่ตรงทั้งหมดไว้ในรายละเอียด
    const groupedResults = new Map<string, Candidate[]>()
    uniqueResults.forEach(candidate => {
      const current = groupedResults.get(candidate.tp.id) ?? []
      current.push(candidate)
      groupedResults.set(candidate.tp.id, current)
    })

    const results = Array.from(groupedResults.values())
    .map(matches => {
      const ranked = [...matches].sort((a, b) =>
        Number(b.exact) - Number(a.exact)
        || Math.abs(a.diff) - Math.abs(b.diff)
        || Number(b.matchScope === 'cumulative') - Number(a.matchScope === 'cumulative')
      )
      return {
        ...ranked[0],
        matchDetails: ranked.map(match => ({
          taxYear: match.taxYear,
          taxType: match.taxType,
          remaining: match.remainingForType,
          diff: match.diff,
          exact: match.exact,
          scope: match.matchScope ?? 'year',
        })),
      }
    })
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Math.abs(a.diff) - Math.abs(b.diff))

    .slice(0, 20)

    setCandidates(results)
    setSearched(true)
    setSearchedAmt(amtInput)
    if (amt > 0 && results.length === 0) {
      try {
        setCrossGroupLoading(true)
        setCrossGroupMatches(await getCrossGroupPaymentMatches(amt, selectedYear))
      } catch (error) {
        setCrossGroupError(error instanceof Error ? error.message : 'ค้นหายอดจากกลุ่มอื่นไม่สำเร็จ')
      } finally {
        setCrossGroupLoading(false)
      }
    }
  }

  const handleSlipFile = async (file?: File) => {
    if (!file) return
    setSelectedSlipName(file.name)
    setSlipMessage('')
    try {
      setSlipReading(true)
      const result = await readPaymentSlip(file)
      if (result.amount === null) {
        setSlipMessage('อ่านรูปได้ แต่ไม่พบยอดเงินรูปแบบ 0.00 กรุณากรอกยอดเอง')
        return
      }
      setAmtInput(result.amount.toFixed(2))
    } catch (error) {
      setSlipMessage(error instanceof Error ? error.message : 'อ่านสลิปไม่สำเร็จ')
    } finally {
      setSlipReading(false)
    }
  }

  const removeSlipFile = () => {
    setSelectedSlipName('')
    setSlipMessage('')
    setAmtInput('')
    if (slipInputRef.current) slipInputRef.current.value = ''
  }

  const exactCandidates = candidates.filter(c => c.exact)
  const nearCandidates = candidates.filter(c => !c.exact)

  // Confirm payment
  const drawerRemaining = drawerTp ? getTotalRemaining(drawerTp, drawerTaxYear) : 0
  const drawerOutstandingYears = drawerTp ? getOutstandingYears(drawerTp, selectedYear) : []
  const drawerTotalOutstanding = drawerOutstandingYears.reduce(
    (sum, item) => sum + item.landRemaining + item.signRemaining, 0
  )
  const drawerInstallmentCount = drawerTp ? getInstallmentCount(drawerTp) : 0
  const payAmt = parseFloat(searchedAmt) || drawerRemaining
  const toAllocate = Math.min(payAmt, drawerRemaining)
  const change = payAmt - toAllocate

  const handleConfirm = async () => {
    if (!drawerTp) return
    const assess = drawerTp.assessments.find(a => a.year === drawerTaxYear)
    const allocLand = Math.min(toAllocate, getLandRemaining(drawerTp, drawerTaxYear))
    const allocSign = Math.min(toAllocate - allocLand, getSignRemaining(drawerTp, drawerTaxYear))
    const allocations = [
      ...(allocLand > 0 && assess?.landAssessmentId ? [{ assessment_id: Number(assess.landAssessmentId), allocated_amount: allocLand }] : []),
      ...(allocSign > 0 && assess?.signAssessmentId ? [{ assessment_id: Number(assess.signAssessmentId), allocated_amount: allocSign }] : []),
    ]
    if (toAllocate <= 0 || allocations.length === 0) return alert('ไม่พบรายการภาษีที่สามารถตัดยอดได้')
    try {
      setSaving(true)
      const paymentId = await createCompletePayment({
        payment_amount: toAllocate,
        payment_date: payDate.slice(0, 10),
        payment_datetime: new Date(`${payDate.slice(0, 10)}T${payTime || '00:00'}`).toISOString(),
        payment_method: payMethod,
        reference_no: payMethod === 'transfer' ? payRef || null : null,
        receipt_no: payMethod === 'cash' ? payReceipt || null : null,
        recorded_by: currentUser?.id ? Number(currentUser.id) : null,
        allocations,
      })
      const pay: Payment = {
        id: paymentId, taxpayerId: drawerTp.id, amount: toAllocate,
        date: payDate, method: payMethod,
        refNo: payMethod === 'transfer' ? payRef : undefined,
        receiptNo: payMethod === 'cash' ? payReceipt : undefined,
        allocatedLand: allocLand, allocatedSign: allocSign,
        recordedBy: currentUser?.id ?? '', taxYear: drawerTaxYear
      }
      addPayment(pay)
      void refreshData().catch(error => console.error('รีเฟรชข้อมูลหลังบันทึกการชำระไม่สำเร็จ:', error))
      setSaved(true); showSuccessToast()
      setTimeout(() => {
        setSaved(false); setShowPayModal(false); setDrawerTp(null)
        setCandidates(prev => prev.filter(c => !(c.tp.id === drawerTp.id && c.taxYear === drawerTaxYear)))
      }, 1400)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'บันทึกการชำระไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  const showSuccessToast = () => {
    setToast(true)
    setTimeout(() => setToast(false), 3500)
  }

  const cashPool = taxpayers.filter(tp => {
    if (!isDirector && tp.group !== currentUser?.group) return false
    return isInTaskScope(tp, selectedYear, taskSearchScope)
  }).filter(tp => {
    if (!cashSearch) return false
    const s = cashSearch.toLowerCase()
    return getTaxpayerName(tp).toLowerCase().includes(s) || tp.ownerCode.toLowerCase().includes(s)
  }).slice(0, 8)

  const handleCashSave = async () => {
    if (!cashTp || !cashAmt) return
    const amt = parseFloat(cashAmt)
    const assess = cashTp.assessments.find(a => a.year === selectedYear)
    const remaining = getTotalRemaining(cashTp, selectedYear)
    if (amt <= 0 || amt > remaining) return alert('ยอดชำระต้องมากกว่า 0 และไม่เกินยอดคงเหลือ')
    const allocLand = Math.min(amt, getLandRemaining(cashTp, selectedYear))
    const allocSign = Math.min(amt - allocLand, getSignRemaining(cashTp, selectedYear))
    const allocations = [
      ...(allocLand > 0 && assess?.landAssessmentId ? [{ assessment_id: Number(assess.landAssessmentId), allocated_amount: allocLand }] : []),
      ...(allocSign > 0 && assess?.signAssessmentId ? [{ assessment_id: Number(assess.signAssessmentId), allocated_amount: allocSign }] : []),
    ]
    try {
      setCashSaving(true)
      const paymentId = await createCompletePayment({
        payment_amount: amt, payment_date: cashDate.slice(0, 10),
        payment_datetime: new Date(`${cashDate.slice(0, 10)}T${new Date().toTimeString().slice(0, 5)}`).toISOString(), payment_method: 'cash',
        reference_no: null, receipt_no: cashReceipt || null,
        recorded_by: currentUser?.id ? Number(currentUser.id) : null, allocations,
      })
      addPayment({
        id: paymentId, taxpayerId: cashTp.id, amount: amt,
        date: cashDate, method: 'cash', receiptNo: cashReceipt || undefined,
        allocatedLand: allocLand, allocatedSign: allocSign,
        recordedBy: currentUser?.id ?? '', taxYear: selectedYear
      })
      void refreshData().catch(error => console.error('รีเฟรชข้อมูลหลังบันทึกการชำระไม่สำเร็จ:', error))
      setCashSaved(true); showSuccessToast()
      setTimeout(() => { setCashSaved(false); setShowCashModal(false); setCashTp(null); setCashSearch(''); setCashAmt('') }, 1400)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'บันทึกการชำระไม่สำเร็จ')
    } finally { setCashSaving(false) }
  }

  return (
    <div className="app-fluid-page" style={{ position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'linear-gradient(135deg,#1a8f5a,#2db875)',
          color: 'white', padding: '14px 22px', borderRadius: 14,
          fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(26,143,90,0.35)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideUp 0.2s ease'
        }}>
          ✅ บันทึกการชำระเรียบร้อยแล้ว
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#2d2545' }}>ตรวจสอบยอดรับและบันทึกการชำระภาษี</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#a89cc8' }}>ตรวจสอบยอดเงินที่ได้รับ หรือบันทึกการชำระเมื่อทราบผู้ชำระเงิน</p>
      </div>

      {!canRecordPayment && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#fff8e6', color: '#8a5a00', fontSize: 12 }}>
        บัญชีผู้บริหารสามารถตรวจสอบและค้นหาข้อมูลได้ แต่ไม่สามารถบันทึกรายการชำระเงิน
      </div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(240,236,251,0.4)', borderRadius: 14, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'search', label: 'ตรวจสอบจากยอดรับ', icon: '🔍', sub: 'ไม่ทราบผู้ชำระเงิน' },
          ...(canRecordPayment ? [{ key: 'direct', label: 'บันทึกการชำระ', icon: '✅', sub: 'ทราบผู้ชำระเงิน' }] : []),
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as typeof activeTab)} style={{
            padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
            border: 'none', fontFamily: "'Sarabun',sans-serif",
            background: activeTab === t.key ? 'white' : 'transparent',
            boxShadow: activeTab === t.key ? '0 2px 8px rgba(124,92,191,0.12)' : 'none',
            color: activeTab === t.key ? '#7c5cbf' : '#a89cc8',
            textAlign: 'left', transition: 'all 0.15s'
          }}>
            <div style={{ fontSize: 13, fontWeight: activeTab === t.key ? 700 : 500 }}>{t.icon} {t.label}</div>
            <div style={{ fontSize: 11, color: activeTab === t.key ? '#a89cc8' : '#c4b5f0', marginTop: 2 }}>{t.sub}</div>
          </button>
        ))}
      </div>

      {activeTab === 'direct' && <DirectPaymentTab />}

      {activeTab === 'search' && <>

      {/* Search card */}
      <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={LBL}>ยอดเงินที่ได้รับ (บาท)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input ref={inputRef} className="input-field" type="number" step="0.01"
                placeholder="เช่น 101.00" value={amtInput}
                onChange={e => setAmtInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void runSearch()}
                style={{ width: 200, fontSize: 18, fontWeight: 600, padding: '11px 16px' }} />
              <span style={{ fontSize: 14, color: '#a89cc8', whiteSpace: 'nowrap' }}>บาท</span>
            </div>
          </div>
          <button className="btn-primary" onClick={() => void runSearch()}
            style={{ alignSelf: 'flex-end', padding: '11px 28px', fontSize: 15 }}>
            🔍 ตรวจสอบยอดรับชำระ
          </button>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="แนบหลักฐานการโอนเงินเพื่อตรวจสอบยอด"
          onClick={() => !slipReading && slipInputRef.current?.click()}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ' ') && !slipReading) {
              e.preventDefault()
              slipInputRef.current?.click()
            }
          }}
          onDragEnter={e => { e.preventDefault(); if (!slipReading) setSlipDragging(true) }}
          onDragOver={e => { e.preventDefault(); if (!slipReading) setSlipDragging(true) }}
          onDragLeave={e => { e.preventDefault(); setSlipDragging(false) }}
          onDrop={e => {
            e.preventDefault()
            setSlipDragging(false)
            if (!slipReading) void handleSlipFile(e.dataTransfer.files?.[0])
          }}
          style={{
            marginTop: 14,
            maxWidth: 510,
            minHeight: 76,
            padding: '14px 16px',
            borderRadius: 12,
            border: slipDragging ? '2px dashed #7c5cbf' : '1.5px dashed rgba(124,92,191,.42)',
            background: slipDragging ? 'rgba(124,92,191,.1)' : 'rgba(248,246,255,.72)',
            cursor: slipReading ? 'wait' : 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 14,
            transition: 'all .15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(124,92,191,.12)', display: 'grid', placeItems: 'center', fontSize: 19 }}>📎</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#5f4794' }}>
                {slipReading ? 'กำลังตรวจสอบข้อมูลจากหลักฐานการโอนเงิน...' : slipDragging ? 'วางไฟล์ตรงนี้' : 'วางหลักฐานการโอนเงินหรือเลือกไฟล์ภาพ'}
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: '#a89cc8' }}>PNG, JPG, JPEG, WEBP · ไม่เกิน 10 MB · ไม่เก็บไฟล์ในระบบ</div>
            </div>
          </div>
          <button type="button" className="btn-secondary" disabled={slipReading} onClick={e => { e.stopPropagation(); slipInputRef.current?.click() }}>
            {slipReading ? 'กรุณารอสักครู่' : 'เลือกไฟล์'}
          </button>
          <input ref={slipInputRef} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden disabled={slipReading} onChange={e => { void handleSlipFile(e.target.files?.[0]); e.currentTarget.value = '' }} />
        </div>

        {selectedSlipName && <div style={{ marginTop: 10, maxWidth: 510, padding: '9px 12px', borderRadius: 9, background: 'rgba(240,236,251,.55)', color: '#6b5b95', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedSlipName}</span>
          <button type="button" aria-label={`ลบไฟล์ ${selectedSlipName}`} onClick={removeSlipFile} style={{ border: 0, background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>×</button>
        </div>}
        {slipMessage && <div style={{ marginTop: 8, maxWidth: 510, color: '#c0392b', fontSize: 11 }}>{slipMessage}</div>}

        {/* Advanced filter toggle */}
        <button onClick={() => setShowAdvanced(v => !v)} style={{
          marginTop: 14, background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: '#7c5cbf', fontFamily: "'Sarabun',sans-serif", display: 'flex', alignItems: 'center', gap: 4
        }}>
          {showAdvanced ? '▲' : '▼'} ตัวกรองเพิ่มเติม
        </button>

        {showAdvanced && (
          <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            <div>
              <label style={LBL}>ประเภทภาษี</label>
              <select className="input-field" style={{ width: 190 }} value={taxTypeFilter} onChange={e => setTaxTypeFilter(e.target.value)}>
                <option value="all">ทุกประเภท</option>
                <option value="land">ภาษีที่ดินและสิ่งปลูกสร้าง</option>
                <option value="sign">ภาษีป้าย</option>
              </select>
            </div>
            {isDirector && (
              <div>
                <label style={LBL}>กลุ่มผู้รับผิดชอบ</label>
                <select className="input-field" style={{ width: 150 }} value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
                  <option value="all">ทุกกลุ่ม</option>
                  {GROUPS.map(g => <option key={g} value={g}>กลุ่ม {g}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={LBL}>ค้นหาจากกลุ่มรายชื่อ</label>
              <select className="input-field" style={{ width: 190 }} value={taskSearchScope} onChange={e => {
                setTaskSearchScope(e.target.value as TaskSearchScope)
                setCandidates([])
                setSearched(false)
                setDrawerTp(null)
              }}>
                {TASK_SEARCH_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!isDirector && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#a89cc8' }}>
            🔒 ค้นหาภายในกลุ่ม <strong style={{ color: '#7c5cbf' }}>{currentUser?.group}</strong> ของคุณ
            · ผู้บริหารสามารถค้นหาได้ทุกกลุ่มรับผิดชอบ
          </div>
        )}
      </div>

      {/* Results */}
      {searched && (
        <div>
          {candidates.length === 0 ? (
            <div className="glass-card" style={{ padding: '32px 24px' }}>
              {crossGroupLoading ? <div style={{ textAlign: 'center', color: '#7c5cbf', padding: 16 }}>กำลังตรวจสอบยอดจากกลุ่มรับผิดชอบอื่น...</div> : crossGroupMatches.length > 0 ? <>
                <div style={{ padding: '12px 14px', borderRadius: 11, background: '#fff8e6', border: '1px solid rgba(215,156,35,.28)', color: '#73500d', fontSize: 13, marginBottom: 14 }}>
                  ไม่พบยอดที่ตรงในกลุ่มที่กำลังค้นหา แต่พบรายการจากกลุ่มรับผิดชอบอื่น กรุณาประสานเจ้าหน้าที่ของกลุ่มนั้นก่อนบันทึกการชำระ
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2545', marginBottom: 9 }}>พบยอดตรงหรือใกล้เคียงจากกลุ่มอื่น {crossGroupMatches.length} รายการ</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {crossGroupMatches.map((match, index) => {
                    const name = match.taxpayer_type === 'COMPANY' ? match.company_name : `${match.title ?? ''}${match.first_name ?? ''} ${match.last_name ?? ''}`.trim()
                    const exact = Math.abs(match.difference) < .01
                    const typeLabel = match.match_type === 'LAND_BUILDING' ? 'ภาษีที่ดินและสิ่งปลูกสร้าง' : match.match_type === 'SIGN' ? 'ภาษีป้าย' : 'ยอดรวมทั้งสองประเภท'
                    return <div key={`${match.taxpayer_id}-${match.tax_year}-${match.match_type}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) auto auto', gap: 12, alignItems: 'center', padding: '11px 13px', borderRadius: 11, background: 'rgba(240,236,251,.5)', border: '1px solid rgba(180,165,230,.22)' }}>
                      <div><div style={{ fontSize: 13.5, fontWeight: 700, color: '#302747' }}>{name || 'ไม่ระบุชื่อ'}</div><div style={{ fontSize: 11.5, color: '#8879aa', marginTop: 2 }}>{match.owner_code || 'ไม่มีรหัส'} · ปีภาษี {match.tax_year} · {typeLabel}</div></div>
                      <span style={{ padding: '4px 9px', borderRadius: 999, background: '#ece5fb', color: '#6548a1', fontSize: 12, fontWeight: 700 }}>กลุ่ม {match.group_code}</span>
                      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 700, color: '#c0392b' }}>฿{formatCurrency(match.match_amount)}</div><div style={{ fontSize: 10.5, color: exact ? '#168653' : '#8a6c2b' }}>{exact ? 'ยอดตรง' : `ต่าง ฿${formatCurrency(Math.abs(match.difference))}`}</div></div>
                    </div>
                  })}
                </div>
              </> : <>
                <EmptyState icon="🔍" title={`ไม่พบยอดภาษีที่ตรงหรือใกล้เคียงกับ ฿${searchedAmt}`}
                  sub="ไม่พบทั้งในกลุ่มที่รับผิดชอบและกลุ่มอื่น ลองค้นหาจากชื่อหรือรหัสเจ้าของทรัพย์สิน" />
                {crossGroupError && <div style={{ textAlign: 'center', color: '#b42318', fontSize: 12, marginTop: 8 }}>{crossGroupError}</div>}
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button className="btn-secondary" onClick={() => { setAmtInput(''); setNameSearch(''); inputRef.current?.focus() }} style={{ fontSize: 13 }}>
                    ค้นหาจากชื่อหรือรหัส
                  </button>
                </div>
              </>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, alignItems: 'start', grid: drawerTp ? 'unset' : 'none' }}>
              {/* Table */}
              <div>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>
                    พบ {candidates.length} ราย{searchedAmt && ` ที่อาจตรงกับยอด ฿${searchedAmt} บาท`}
                  </span>
                  {exactCandidates.length > 0 && (
                    <span className="status-badge" style={{ background: '#e8fdf4', color: '#1a8f5a', fontSize: 12 }}>
                      ยอดตรง {exactCandidates.length} ราย
                    </span>
                  )}
                  {nearCandidates.length > 0 && (
                    <span className="status-badge" style={{ background: '#fff8e6', color: '#8a5a00', fontSize: 12 }}>
                      ยอดใกล้เคียง {nearCandidates.length} ราย
                    </span>
                  )}
                </div>

                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'rgba(240,236,251,0.5)' }}>
                          {['#', 'รหัส', 'ชื่อ', 'ประเภทภาษี', 'ปีภาษี', 'ยอดประเมิน', 'ประเภทภาษีที่ตรง', 'ชำระแล้ว', 'ยอดค้างรายการนี้', 'ยอดค้างชำระสะสม', 'ส่วนต่าง', 'สถานะ', ''].map(h => (
                            <th key={h} style={TH}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map((c, i) => {
                          const { tp } = c
                          const assess = tp.assessments.find(a => a.year === c.taxYear)
                          const assessed = getTotalAssessed(tp, c.taxYear)
                          const remaining = getTotalRemaining(tp, c.taxYear)
                          const accumulatedOutstanding = getAccumulatedOutstanding(tp, selectedYear)
                          const accumulatedAssessed = tp.assessments.filter(item => item.year <= selectedYear).reduce((sum, item) => sum + item.landAmount + item.signAmount, 0)
                          const paid = c.matchScope === 'cumulative' ? Math.max(0, accumulatedAssessed - accumulatedOutstanding) : assessed - remaining
                          const taxTypes = [
                            assess?.landAmount ? 'ภาษีที่ดินและสิ่งปลูกสร้าง' : null,
                            assess?.signAmount ? 'ภาษีป้าย' : null,
                          ].filter((item): item is string => Boolean(item))
                          const isSelected = drawerTp?.id === tp.id && drawerTaxYear === c.taxYear
                          const diffSign = c.diff >= 0 ? '+' : ''

                          return (
                            <tr 
                              key={`${tp.id}-${c.taxYear}-${c.taxType}-${c.matchScope ?? 'year'}`}
                              style={{
                                borderBottom: '1px solid rgba(200,190,240,0.15)',
                                background: isSelected ? 'rgba(124,92,191,0.06)' : undefined,
                                transition: 'background 0.15s'
                              }}>
                              <td style={TD}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {i + 1}
                                  {c.exact && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1a8f5a', display: 'inline-block' }} title="ยอดตรง" />}
                                </div>
                              </td>
                              <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#7c5cbf' }}>{tp.ownerCode}</td>
                              <td style={{ ...TD, fontWeight: 500, color: '#2d2545', whiteSpace: 'nowrap' }}>{getTaxpayerName(tp)}</td>
                              <td style={TD}>{taxTypes.length ? <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 150 }}>{taxTypes.map(type => <span key={type} style={TAX_TYPE_BADGE}>{type}</span>)}</div> : <span style={{ color: '#a89cc8' }}>—</span>}</td>
                              <td style={{ ...TD, fontSize: 12, color: '#a89cc8' }}>{c.matchScope === 'cumulative' ? `ถึง ${selectedYear}` : c.taxYear}</td>
                              <td style={{ ...TD, textAlign: 'right' }}>฿{formatCurrency(c.assessedForType)}</td>
                              <td style={{ ...TD, fontSize: 12, color: '#7c5cbf', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {(() => {
                                  const taxMatches = (c.matchDetails ?? [])
                                    .filter(match => match.scope === 'year' && match.taxType !== 'both')
                                    .filter((match, index, all) => all.findIndex(other => other.taxYear === match.taxYear && other.taxType === match.taxType) === index)
                                  if (!taxMatches.length) return '—'
                                  return taxMatches.map(match => `${match.taxType === 'land' ? 'ภาษีที่ดินและสิ่งปลูกสร้าง' : 'ภาษีป้าย'} ปี ${match.taxYear}`).join(' · ')
                                })()}
                              </td>
                              <td style={{ ...TD, textAlign: 'right', color: '#1a8f5a' }}>฿{formatCurrency(paid)}</td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#c0392b' }}>฿{formatCurrency(c.remainingForType)}</td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#8a5a00' }}>฿{formatCurrency(accumulatedOutstanding)}{getPriorYearOutstanding(tp, selectedYear) > 0 && <div style={{ fontSize: 10, fontWeight: 500, color: '#a89cc8', marginTop: 2 }}>รวมหนี้ปีก่อน ฿{formatCurrency(getPriorYearOutstanding(tp, selectedYear))}</div>}</td>
                              <td style={{ ...TD, textAlign: 'right' }}>
                                {c.exact ? (
                                  <span className="status-badge" style={{ background: '#e8fdf4', color: '#1a8f5a', fontSize: 11 }}>ยอดตรง</span>
                                ) : (
                                  <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: Math.abs(c.diff) <= 1 ? '#8a5a00' : '#888'
                                  }}>{diffSign}{formatCurrency(c.diff)}</span>
                                )}
                              </td>
                              <td style={TD}><StatusBadge status={accumulatedOutstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'} size="sm" /></td>
                              <td style={TD}>
                                <button className="btn-primary"
                                  onClick={() => { setDrawerTp(tp); setDrawerTaxYear(c.taxYear); setPayDate(new Date().toISOString().slice(0, 10)); setPayTime(new Date().toTimeString().slice(0, 5)); setPayRef(''); setPayReceipt(''); setPayMethod('transfer') }}
                                  style={{ fontSize: 12, padding: '6px 14px', background: isSelected ? 'linear-gradient(135deg,#5a3a9f,#7c5cbf)' : undefined }}>
                                  ตรวจสอบ
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Drawer */}
              {drawerTp && (
                <div className="glass-card" style={{ padding: '22px 22px', position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', border: '1px solid rgba(124,92,191,0.12)', boxShadow: '0 20px 40px rgba(30, 19, 53, 0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>ตรวจสอบผู้เสียภาษี</span>
                    <button onClick={() => setDrawerTp(null)} style={{
                      background: 'rgba(8, 6, 12, 0.08)', border: 'none', borderRadius: 8,
                      width: 28, height: 28, cursor: 'pointer', color: '#7c5cbf', fontSize: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>×</button>
                  </div>

                  {/* Taxpayer info */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, padding: '12px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#c4b5f0,#9b7dd4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'white', flexShrink: 0 }}>
                      {drawerTp.type === 'company' ? '🏢' : '👤'}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#2d2545' }}>{getTaxpayerName(drawerTp)}</div>
                      <div style={{ fontSize: 11, color: '#a89cc8', fontFamily: 'monospace' }}>{drawerTp.ownerCode}</div>
                      <div style={{ fontSize: 12, color: '#6b5b95', marginTop: 2 }}>📞 {drawerTp.phone}</div>
                      <div style={{ fontSize: 12, color: '#6b5b95' }}>กลุ่ม {drawerTp.group}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {[
                      [`ยอดประเมินภาษี ปี ${drawerTaxYear}`, getTotalAssessed(drawerTp, drawerTaxYear), '#2d2545'],
                      ['ยอดหนี้คงเหลือ', drawerTotalOutstanding, '#c0392b'],
                    ].map(([label, value, color]) => <div key={String(label)} style={{ padding: '10px 11px', borderRadius: 10, border: '1px solid rgba(180,165,230,.25)', background: '#fff' }}>
                      <div style={{ fontSize: 11, color: '#a89cc8' }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: String(color), marginTop: 3 }}>฿{formatCurrency(Number(value))}</div>
                    </div>)}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: '#6b5b95', fontWeight: 700, marginBottom: 8 }}>ยอดค้างแยกตามปีภาษี</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 11px', borderRadius: 10, background: 'rgba(124,92,191,.09)', color: '#5f4596', fontSize: 12, marginBottom: 8 }}><span>เคยชำระมาแล้วจำนวน <b>{drawerInstallmentCount} งวด</b></span><span>รายการนี้จะเป็น <b>งวดที่ {drawerInstallmentCount + 1}</b></span></div>
                    {drawerOutstandingYears.map(({ assessment, landRemaining, signRemaining }) => <div key={assessment.year} style={{ display: 'grid', gridTemplateColumns: '65px 1fr auto', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(240,236,251,.45)', marginBottom: 5, alignItems: 'center' }}><b style={{ fontSize: 12, color: '#45385e' }}>ปี {assessment.year}</b><span style={{ fontSize: 11, color: '#8873b5' }}>{[landRemaining > 0 ? `ภาษีที่ดินฯ ฿${formatCurrency(landRemaining)}` : '', signRemaining > 0 ? `ภาษีป้าย ฿${formatCurrency(signRemaining)}` : ''].filter(Boolean).join(' · ')}</span><b style={{ fontSize: 12, color: '#c0392b' }}>฿{formatCurrency(landRemaining + signRemaining)}</b></div>)}
                  </div>

                  {/* Last follow-up */}
                  {(() => {
                    const lastFu = getLastFollowUp(drawerTp)
                    return lastFu ? (
                      <div style={{ marginBottom: 14, padding: '12px 14px', background: 'linear-gradient(135deg,rgba(240,236,251,.7),rgba(218,237,248,.5))', border: '1px solid rgba(180,165,230,.25)', borderRadius: 11, fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#5f4596', marginBottom: 8, fontSize: 12 }}>☎ การติดตามล่าสุด</div>
                        <div style={{ color: '#45385e', fontSize: 12, fontWeight: 700 }}>{formatDateTime(lastFu.date)}</div>
                        <div style={{ color: '#7c5cbf', fontSize: 12, fontWeight: 700, marginTop: 3 }}>{CALL_RESULT_LABELS[lastFu.result ?? ''] ?? '-'}</div>
                        {lastFu.detail && <div style={{ color: '#6b5b95', marginTop: 3, fontStyle: 'italic' }}>"{lastFu.detail}"</div>}
                        {lastFu.promiseDate && (
                          <div style={{ marginTop: 4, color: '#7c5cbf', fontWeight: 600 }}>
                            📅 นัดชำระ: {formatDate(lastFu.promiseDate)}
                            {lastFu.promiseAmount && ` · ฿${formatCurrency(lastFu.promiseAmount)}`}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(240,236,251,0.4)', borderRadius: 10, fontSize: 12, color: '#a89cc8' }}>
                        ยังไม่มีบันทึกการติดตาม
                      </div>
                    )
                  })()}

                  {/* Reminder */}
                  <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fff8e6', border: '1px solid rgba(230,160,0,0.25)', borderRadius: 10, fontSize: 12, color: '#8a5a00' }}>
                    ⚠️ กรุณาตรวจสอบข้อมูลจากระบบรับชำระ/ระบบต้นทางก่อนยืนยัน
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {canRecordPayment && <button className="btn-primary" onClick={() => setShowPayModal(true)} style={{ width: '100%' }}>
                      ✅ ยืนยันว่าเป็นรายนี้
                    </button>}
                    <button className="btn-secondary" onClick={() => setDrawerTp(null)} style={{ width: '100%' }}>
                      ❌ ไม่ใช่รายนี้
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirm Payment Modal */}
      {canRecordPayment && showPayModal && drawerTp && (
        <Modal title="ยืนยันการชำระ" onClose={() => setShowPayModal(false)} maxWidth="500px">
          <PaymentForm key={`${drawerTp.id}-${drawerTaxYear}-${payAmt}`} taxpayer={drawerTp} year={drawerTaxYear} initialAmount={payAmt} initialMethod={payMethod} onCancel={() => setShowPayModal(false)} onSuccess={() => { showSuccessToast(); setShowPayModal(false); setDrawerTp(null); setCandidates(prev => prev.filter(c => !(c.tp.id === drawerTp.id && c.taxYear === drawerTaxYear))) }} />
          {false && (saved ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a8f5a' }}>บันทึกการชำระเรียบร้อยแล้ว</div>
              <div style={{ fontSize: 13, color: '#a89cc8', marginTop: 6 }}>อัปเดตยอดคงเหลือและสถานะแล้ว</div>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div style={{ padding: '14px 16px', background: 'rgba(240,236,251,0.5)', borderRadius: 12, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, fontSize: 13 }}>
                <div><div style={SLIM}>ผู้เสียภาษี</div><div style={{ fontWeight: 700, color: '#2d2545' }}>{getTaxpayerName(drawerTp!)}</div></div>
                <div><div style={SLIM}>ปีภาษี</div><div style={{ fontWeight: 700, color: '#2d2545' }}>{drawerTaxYear}</div></div>
                <div style={{ gridColumn: '1/-1' }}><div style={SLIM}>ยอดที่ต้องชำระ</div><div style={{ fontSize: 18, fontWeight: 700, color: '#c0392b' }}>฿{formatCurrency(drawerRemaining)}</div></div>
              </div>

              {/* Payment calc */}
              <div style={{ padding: '12px 14px', background: 'rgba(124,92,191,0.06)', borderRadius: 12, marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#7c5cbf', marginBottom: 10 }}>การคำนวณ</div>
                {[
                  ['ยอดเงินที่ได้รับ', `฿${formatCurrency(payAmt)}`],
                  ['ยอดภาษีคงเหลือ', `฿${formatCurrency(drawerRemaining)}`],
                  ['นำไปตัดยอด', `฿${formatCurrency(toAllocate)}`],
                  ['ส่วนต่าง', `฿${formatCurrency(change)}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(200,190,240,0.2)', fontSize: 13 }}>
                    <span style={{ color: '#a89cc8' }}>{l}</span>
                    <span style={{ fontWeight: 700, color: '#2d2545' }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={LBL}>วันที่ชำระ</label>
                  <BuddhistDateInput value={payDate} onChange={setPayDate} required />
                </div>
                <div>
                  <label style={LBL}>เวลาชำระ</label>
                  <input
                    className="input-field"
                    type="time"
                    value={payTime}
                    onChange={e => setPayTime(e.target.value)}
                  />
                </div>
                <div>
                  <label style={LBL}>ช่องทางการชำระ</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['transfer', 'โอนเงิน'], ['cash', 'เงินสด']].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setPayMethod(v as 'transfer' | 'cash')} style={{
                        flex: 1, padding: '9px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13,
                        border: payMethod === v ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                        background: payMethod === v ? 'rgba(124,92,191,0.1)' : 'transparent',
                        color: payMethod === v ? '#7c5cbf' : '#6b5b95', fontWeight: 500
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              {payMethod === 'transfer' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>เลขอ้างอิงการชำระ (ถ้ามี)</label>
                  <input className="input-field" placeholder="TRF..." value={payRef} onChange={e => setPayRef(e.target.value)} />
                </div>
              )}
              {payMethod === 'cash' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>เลขที่ใบเสร็จ (Receipt No.)</label>
                  <input className="input-field" placeholder="RC2569-..." value={payReceipt} onChange={e => setPayReceipt(e.target.value)} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => setShowPayModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleConfirm} disabled={saving}>
                  {saving ? '⏳ กำลังบันทึก...' : '✅ ยืนยันการชำระ'}
                </button>
              </div>
            </>
          ))}
        </Modal>
      )}

      {/* Cash payment modal */}
      {canRecordPayment && showCashModal && (
        <Modal title="บันทึกชำระเงินสด" onClose={() => setShowCashModal(false)} maxWidth="480px">
          {cashSaved ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a8f5a' }}>บันทึกเรียบร้อยแล้ว</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={LBL}>ค้นหาผู้เสียภาษี (ชื่อหรือรหัสเจ้าของทรัพย์สิน)</label>
                <input className="input-field" placeholder="พิมพ์ชื่อหรือรหัส..." value={cashSearch}
                  onChange={e => { setCashSearch(e.target.value); setCashTp(null) }} autoFocus />
                {cashPool.length > 0 && !cashTp && (
                  <div style={{ marginTop: 4, background: 'white', border: '1px solid rgba(180,165,230,0.35)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(124,92,191,0.1)' }}>
                    {cashPool.map(tp => (
                      <button key={tp.id} onClick={() => { setCashTp(tp); setCashSearch(getTaxpayerName(tp)); setCashAmt(String(getAccumulatedOutstanding(tp, selectedYear))) }}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13, borderBottom: '1px solid rgba(200,190,240,0.2)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,92,191,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ fontWeight: 500, color: '#2d2545' }}>{getTaxpayerName(tp)}</span>
                        <span style={{ color: '#a89cc8', fontSize: 11, marginLeft: 8, fontFamily: 'monospace' }}>{tp.ownerCode}</span>
                        <span style={{ float: 'right', color: '#c0392b', fontWeight: 600 }}>สะสม ฿{formatCurrency(getAccumulatedOutstanding(tp, selectedYear))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {cashTp && (
                <PaymentForm key={`${cashTp.id}-${selectedYear}`} taxpayer={cashTp} year={selectedYear} initialMethod="cash" initialAmount={Number(cashAmt) || undefined} onCancel={() => { setCashTp(null); setCashSearch(''); setShowCashModal(false) }} onSuccess={() => { showSuccessToast(); setShowCashModal(false); setCashTp(null); setCashSearch('') }} />
              )}
              {false && cashTp && (
                <>
                  <div style={{ padding: '10px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>{getTaxpayerName(cashTp!)}</div>
                    <div style={{ fontSize: 12, color: '#a89cc8' }}>ยอดคงเหลือ: <strong style={{ color: '#c0392b' }}>฿{formatCurrency(getTotalRemaining(cashTp!, selectedYear))}</strong></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={LBL}>ยอดเงินที่รับ (บาท)</label>
                      <input className="input-field" type="number" step="0.01" value={cashAmt} onChange={e => setCashAmt(e.target.value)} />
                    </div>
                    <div>
                      <label style={LBL}>วันที่ชำระ</label>
                      <BuddhistDateInput value={cashDate} onChange={setCashDate} required />
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={LBL}>เลขที่ใบเสร็จ</label>
                    <input className="input-field" placeholder="RC2569-..." value={cashReceipt} onChange={e => setCashReceipt(e.target.value)} />
                  </div>
                </>
              )}

              {!cashTp && <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowCashModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleCashSave} disabled={cashSaving || !cashTp || !cashAmt}>
                  {cashSaving ? '⏳...' : '💾 บันทึกการชำระ'}
                </button>
              </div>}
            </>
          )}
        </Modal>
      )}

      </>}
    </div>
  )
}

// ─── Tab 2: Direct Record Payment ─────────────────────────────────────────────
function DirectPaymentTab() {
  const { taxpayers, addPayment, currentUser, selectedYear, refreshData } = useApp()
  const [search, setSearch] = useState('')
  const [taskSearchScope, setTaskSearchScope] = useState<TaskSearchScope>('all')
  const [selectedTp, setSelectedTp] = useState<Taxpayer | null>(null)
  const [taxType, setTaxType] = useState<'both' | 'land' | 'sign'>('both')
  const [amt, setAmt] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'transfer' | 'cash'>('cash')
  const [payTaxType, setPayTaxType] = useState<'land' | 'sign' | 'both'>('both')
  const [refNo, setRefNo] = useState('')
  const [receiptNo, setReceiptNo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowSuggestions(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const isDirector = currentUser?.role !== 'officer'
  const pool = taxpayers.filter(tp => {
    if (!isDirector && tp.group !== currentUser?.group) return false
    if (!isInTaskScope(tp, selectedYear, taskSearchScope)) return false
    if (!search) return false
    const s = search.toLowerCase()
    return getTaxpayerName(tp).toLowerCase().includes(s) || tp.ownerCode.toLowerCase().includes(s) || tp.phone.includes(s)
  }).slice(0, 8)

  const pick = (tp: Taxpayer) => {
    setSelectedTp(tp)
    setSearch(getTaxpayerName(tp))
    setShowSuggestions(false)
    setAmt(String(getAccumulatedOutstanding(tp, selectedYear)))
    // auto-detect tax type
    const a = tp.assessments.find(x => x.year === selectedYear)
    setTaxType((a?.landAmount ?? 0) > 0 && (a?.signAmount ?? 0) > 0 ? 'both' : (a?.landAmount ?? 0) > 0 ? 'land' : 'sign')
  }

  const remaining = selectedTp ? getAccumulatedOutstanding(selectedTp, selectedYear) : 0
  const payAmt = parseFloat(amt) || 0

  const handleSave = async () => {
    if (!selectedTp || !payAmt) return
    const a = selectedTp.assessments.find(x => x.year === selectedYear)
    if (payAmt > remaining) return alert('ยอดชำระเกินยอดคงเหลือ')
    const landRemaining = getLandRemaining(selectedTp, selectedYear)
    const signRemaining = getSignRemaining(selectedTp, selectedYear)
    const allocLand = payTaxType === 'sign' ? 0 : Math.min(payAmt, landRemaining)
    const allocSign = payTaxType === 'land' ? 0 : Math.min(payAmt - allocLand, signRemaining)
    if (Math.abs(allocLand + allocSign - payAmt) > 0.009) return alert('ยอดที่กรอกไม่สอดคล้องกับประเภทภาษีและยอดคงเหลือ')
    const allocations = [
      ...(allocLand > 0 && a?.landAssessmentId ? [{ assessment_id: Number(a.landAssessmentId), allocated_amount: allocLand }] : []),
      ...(allocSign > 0 && a?.signAssessmentId ? [{ assessment_id: Number(a.signAssessmentId), allocated_amount: allocSign }] : []),
    ]
    try {
      setSaving(true)
      const paymentId = await createCompletePayment({
        payment_amount: payAmt, payment_date: payDate.slice(0, 10),
        payment_datetime: new Date(`${payDate.slice(0, 10)}T${new Date().toTimeString().slice(0, 5)}`).toISOString(), payment_method: method,
        reference_no: method === 'transfer' ? refNo || null : null,
        receipt_no: method !== 'transfer' ? receiptNo || null : null,
        recorded_by: currentUser?.id ? Number(currentUser.id) : null, allocations,
      })
      addPayment({
        id: paymentId, taxpayerId: selectedTp.id, amount: payAmt,
        date: payDate, method,
        refNo: method === 'transfer' ? refNo : undefined,
        receiptNo: method !== 'transfer' ? receiptNo : undefined,
        allocatedLand: allocLand, allocatedSign: allocSign,
        recordedBy: currentUser?.id ?? '', taxYear: selectedYear
      })
      void refreshData().catch(error => console.error('รีเฟรชข้อมูลหลังบันทึกการชำระไม่สำเร็จ:', error))
      setSaved(true); setToast(true)
      setTimeout(() => { setToast(false); setSaved(false); setSelectedTp(null); setSearch(''); setAmt(''); setRefNo(''); setReceiptNo('') }, 2000)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'บันทึกการชำระไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'linear-gradient(135deg,#1a8f5a,#2db875)',
          color: 'white', padding: '14px 22px', borderRadius: 14,
          fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(26,143,90,0.35)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>✅ บันทึกการชำระเรียบร้อยแล้ว</div>
      )}

      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2545', marginBottom: 18 }}>บันทึกการชำระ</div>

        {/* Task List source */}
        <div style={{ marginBottom: 16 }}>
          <label style={LBL}>ค้นหาจากกลุ่มรายชื่อ</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {TASK_SEARCH_OPTIONS.map(option => (
              <button key={option.value} onClick={() => { setTaskSearchScope(option.value); setSelectedTp(null); setSearch('') }} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                border: taskSearchScope === option.value ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                background: taskSearchScope === option.value ? 'rgba(124,92,191,0.1)' : 'transparent',
                color: taskSearchScope === option.value ? '#7c5cbf' : '#8873b5', fontFamily: "'Sarabun',sans-serif"
              }}>{option.label}</button>
            ))}
          </div>
        </div>

        {/* Step 1: Search taxpayer */}
        <div style={{ marginBottom: 20 }} ref={dropRef}>
          <label style={LBL}>ค้นหาผู้เสียภาษี (ชื่อ / รหัสทรัพย์สิน / หมายเลขโทรศัพท์) *</label>
          <input className="input-field" placeholder="พิมพ์เพื่อค้นหา..." value={search}
            onChange={e => { setSearch(e.target.value); setSelectedTp(null); setShowSuggestions(true) }}
            onFocus={() => search && setShowSuggestions(true)} autoFocus />
          {showSuggestions && pool.length > 0 && (
            <div style={{ marginTop: 4, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)', border: '1px solid rgba(196,181,240,0.4)', borderRadius: 12, boxShadow: '0 8px 24px rgba(124,92,191,0.12)', overflow: 'hidden' }}>
              {pool.map(tp => (
                <div key={tp.id} onMouseDown={() => pick(tp)} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(200,190,240,0.15)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(240,236,251,0.5)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#2d2545' }}>{getTaxpayerName(tp)}</div>
                  <div style={{ fontSize: 11, color: '#a89cc8', display: 'flex', gap: 10, marginTop: 2 }}>
                    <span style={{ fontFamily: 'monospace' }}>{tp.ownerCode}</span>
                    <span>{tp.phone}</span>
                    <span style={{ color: '#c0392b', fontWeight: 600 }}>ค้างชำระสะสม ฿{formatCurrency(getAccumulatedOutstanding(tp, selectedYear))} บาท</span>
                    {getPriorYearOutstanding(tp, selectedYear) > 0 && <span style={{ color: '#9a6800' }}>หนี้ปีก่อน ฿{formatCurrency(getPriorYearOutstanding(tp, selectedYear))}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedTp && <PaymentForm key={`${selectedTp.id}-${selectedYear}`} taxpayer={selectedTp} year={selectedYear} initialMethod="cash" onCancel={() => { setSelectedTp(null); setSearch('') }} onSuccess={() => { setToast(true); setTimeout(() => setToast(false), 3500); setSelectedTp(null); setSearch('') }} />}

        {false && selectedTp && (
          <>
            {/* Compact profile */}
            <div style={{ padding: '12px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 12, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#2d2545' }}>{getTaxpayerName(selectedTp!)}</div>
                <div style={{ fontSize: 11, color: '#a89cc8', fontFamily: 'monospace' }}>{selectedTp!.ownerCode} · {selectedTp!.phone}</div>
                <div style={{ fontSize: 12, color: '#c0392b', fontWeight: 600, marginTop: 4 }}>ยอดคงเหลือ ฿{formatCurrency(remaining)} บาท</div>
              </div>
              <button onClick={() => { setSelectedTp(null); setSearch('') }} style={{ fontSize: 11, color: '#7c5cbf', background: 'none', border: '1px solid rgba(124,92,191,0.3)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif" }}>เปลี่ยน</button>
            </div>

            {/* Tax type */}
            {(() => {
              const a = selectedTp!.assessments.find(x => x.year === selectedYear)
              const hasLand = (a?.landAmount ?? 0) > 0
              const hasSign = (a?.signAmount ?? 0) > 0
              return hasLand && hasSign ? (
                <div style={{ marginBottom: 16 }}>
                  <label style={LBL}>ประเภทภาษีที่ชำระ</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['both', 'ทั้งสองประเภท'], ['land', 'ภาษีที่ดินและสิ่งปลูกสร้าง'], ['sign', 'ภาษีป้าย']].map(([k, l]) => (
                      <button key={k} onClick={() => setTaxType(k as typeof taxType)} style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                        border: taxType === k ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                        background: taxType === k ? 'rgba(124,92,191,0.1)' : 'transparent',
                        color: taxType === k ? '#7c5cbf' : '#8873b5', fontFamily: "'Sarabun',sans-serif", fontWeight: taxType === k ? 600 : 400
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
              ) : null
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={LBL}>ยอดเงินที่รับ (บาท) *</label>
                <input className="input-field" type="number" step="0.01" value={amt} onChange={e => setAmt(e.target.value)} style={{ fontSize: 16, fontWeight: 600 }} />
                {payAmt > remaining && <div style={{ fontSize: 11, color: '#8a5a00', marginTop: 4 }}>⚠️ ยอดเกินกว่าที่ค้างชำระ {formatCurrency(payAmt - remaining)} บาท</div>}
              </div>
              <div>
                <label style={LBL}>วันที่ชำระ</label>
                <BuddhistDateInput value={payDate} onChange={setPayDate} required />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LBL}>ช่องทางการชำระ</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['cash', '💵 เงินสด'], ['transfer', '💳 โอนเงิน']].map(([v, l]) => (
                  <button key={v} onClick={() => setMethod(v as typeof method)} style={{
                    padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13,
                    border: method === v ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                    background: method === v ? 'rgba(124,92,191,0.1)' : 'transparent',
                    color: method === v ? '#7c5cbf' : '#6b5b95', fontWeight: method === v ? 600 : 400
                  }}>{l}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={LBL}>{method === 'transfer' ? 'เลขที่อ้างอิงการโอน' : 'เลขที่ใบเสร็จ'}</label>
              <input className="input-field" placeholder={method === 'transfer' ? 'REF2569-...' : 'RC2569-...'}
                value={method === 'transfer' ? refNo : receiptNo}
                onChange={e => method === 'transfer' ? setRefNo(e.target.value) : setReceiptNo(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setSelectedTp(null); setSearch('') }}>ยกเลิก</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving || !amt || saved}
                style={{ minWidth: 160 }}>
                {saving ? '⏳ กำลังบันทึก...' : saved ? '✅ บันทึกแล้ว' : '💾 บันทึกการชำระ'}
              </button>
            </div>
          </>
        )}

        {!selectedTp && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#c4b5f0', fontSize: 13 }}>
            ค้นหาและเลือกผู้เสียภาษีก่อน
          </div>
        )}
      </div>
    </div>
  )
}

const LBL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
const SLIM: React.CSSProperties = { fontSize: 11, color: '#a89cc8', marginBottom: 3 }
const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b5b95', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,190,240,0.25)', fontSize: 12 }
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
const TAX_TYPE_BADGE: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(124,92,191,.22)', background: 'rgba(124,92,191,.08)', color: '#6745ae', fontSize: 11, lineHeight: 1.25, whiteSpace: 'nowrap' }
