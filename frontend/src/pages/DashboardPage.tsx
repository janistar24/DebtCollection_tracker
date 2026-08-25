import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import type { FollowUp as _FU } from '../types'
import {
  getTotalAssessed, getTotalRemaining, getPaymentStatus,
  getFollowStatus, getLastFollowUp, formatCurrency, formatDate,
  CURRENT_YEAR, getTaxpayerName, getUserById, getLandRemaining,
  getSignRemaining, getAssessment
} from '../data/mockData'
import type { FollowUp } from '../types'

const FOLLOW_FILTER_LABELS = [
  { key: 'none', label: 'ยังไม่ได้ติดต่อ' },
  { key: 'followed', label: 'ติดต่อแล้ว' },
  { key: 'nocontact', label: 'ติดต่อไม่ได้' },
] as const

const PAYMENT_FILTER_LABELS = [
  { key: 'partial', label: 'ชำระบางส่วน' },
  { key: 'unpaid', label: 'ยังไม่ชำระ' },
] as const

type FollowFilterKey = typeof FOLLOW_FILTER_LABELS[number]['key']
type PaymentFilterKey = typeof PAYMENT_FILTER_LABELS[number]['key']

const DONUT_COLORS = ['#7c5cbf', '#c4b5f0', '#f0a0a0']

// ─── Call Log Modal ────────────────────────────────────────────────────────────
function CallLogModal({ onClose, onSave }: { onClose: () => void; onSave: (fu: Omit<FollowUp, 'id'>) => void }) {
  const { taxpayers, currentUser, selectedYear } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selected, setSelected] = useState<typeof taxpayers[0] | null>(null)
  const [taxScope, setTaxScope] = useState<'both' | 'land' | 'sign'>('both')

  // Step 2 fields
  const [fuType, setFuType] = useState<'phone' | 'line' | 'other'>('phone')
  const [fuDateOnly, setFuDateOnly] = useState(new Date().toISOString().slice(0, 10))
  const [fuTimeOnly, setFuTimeOnly] = useState(new Date().toTimeString().slice(0, 5))
  const fuDate = `${fuDateOnly}T${fuTimeOnly}`
  const [fuResult, setFuResult] = useState('')
  const [fuDetail, setFuDetail] = useState('')
  const [fuPromiseDate, setFuPromiseDate] = useState('')
  const [fuPromiseAmt, setFuPromiseAmt] = useState('')
  const [fuNextDate, setFuNextDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const suggestions = query.length >= 1
    ? taxpayers.filter(tp => {
        const s = query.toLowerCase()
        return getTaxpayerName(tp).includes(s) || tp.ownerCode.toLowerCase().includes(s) || tp.phone.includes(s)
      }).filter(tp => getPaymentStatus(tp, selectedYear) !== 'paid').slice(0, 6)
    : []

  const pickTaxpayer = (tp: typeof taxpayers[0]) => {
    setSelected(tp)
    setQuery(getTaxpayerName(tp))
    setShowSuggestions(false)
    const a = getAssessment(tp, selectedYear)
    const hasLand = (a?.landAmount ?? 0) > 0
    const hasSign = (a?.signAmount ?? 0) > 0
    setTaxScope(hasLand && hasSign ? 'both' : hasLand ? 'land' : 'sign')
    setStep(2)
  }

  const handleSave = async () => {
    if (!selected || !fuResult) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 500))
    onSave({
      taxpayerId: selected.id, type: fuType, date: fuDate,
      result: fuResult as FollowUp['result'], detail: fuDetail,
      promiseDate: fuPromiseDate || undefined,
      promiseAmount: fuPromiseAmt ? parseFloat(fuPromiseAmt) : undefined,
      nextFollowDate: fuNextDate || undefined,
      recordedBy: currentUser?.id ?? 'u1'
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 1200)
  }

  const a = selected ? getAssessment(selected, selectedYear) : null
  const landRem = selected ? getLandRemaining(selected, selectedYear) : 0
  const signRem = selected ? getSignRemaining(selected, selectedYear) : 0

  return (
    <Modal title="บันทึกการติดตาม" onClose={onClose} maxWidth="520px">
      {saved ? (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a8f5a' }}>บันทึกการติดตามเรียบร้อยแล้ว</div>
        </div>
      ) : (
        <>
          {/* Steps indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            {[1, 2].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: step >= s ? 'linear-gradient(135deg,#7c5cbf,#9b7dd4)' : 'rgba(196,181,240,0.2)',
                  color: step >= s ? '#fff' : '#a89cc8'
                }}>{s}</div>
                <span style={{ fontSize: 12, color: step >= s ? '#2d2545' : '#a89cc8', fontWeight: step === s ? 600 : 400 }}>
                  {s === 1 ? 'เลือกผู้เสียภาษี' : 'กรอกรายละเอียด'}
                </span>
                {s < 2 && <span style={{ color: '#c4b5f0', margin: '0 2px' }}>›</span>}
              </div>
            ))}
          </div>

          {/* Step 1 */}
          {step === 1 && (
            <div>
              <div ref={searchRef} style={{ position: 'relative', marginBottom: 16 }}>
                <input className="input-field" placeholder="🔍 ค้นหาชื่อ / รหัสเจ้าของทรัพย์สิน / เบอร์โทร"
                  value={query} autoFocus
                  onChange={e => { setQuery(e.target.value); setShowSuggestions(true); setSelected(null) }}
                  onFocus={() => query && setShowSuggestions(true)} />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(196,181,240,0.4)', borderRadius: 12,
                    boxShadow: '0 8px 32px rgba(124,92,191,0.12)', marginTop: 4, overflow: 'hidden'
                  }}>
                    {suggestions.map(tp => {
                      const assess = getAssessment(tp, selectedYear)
                      return (
                        <div key={tp.id} onMouseDown={() => pickTaxpayer(tp)} style={{
                          padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(200,190,240,0.15)'
                        }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(240,236,251,0.5)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#2d2545' }}>{getTaxpayerName(tp)}</div>
                          <div style={{ fontSize: 11, color: '#a89cc8', display: 'flex', gap: 10, marginTop: 2 }}>
                            <span style={{ fontFamily: 'monospace' }}>{tp.ownerCode}</span>
                            <span>{tp.phone}</span>
                            {(assess?.landAmount ?? 0) > 0 && <span>ที่ดินฯ {formatCurrency(getLandRemaining(tp, selectedYear))} บาท</span>}
                            {(assess?.signAmount ?? 0) > 0 && <span>ป้าย {formatCurrency(getSignRemaining(tp, selectedYear))} บาท</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {query && suggestions.length === 0 && <div style={{ fontSize: 13, color: '#a89cc8', textAlign: 'center', padding: '12px 0' }}>ไม่พบข้อมูล</div>}
              <div style={{ fontSize: 12, color: '#c4b5f0', textAlign: 'center', marginTop: 8 }}>พิมพ์ชื่อ รหัสทรัพย์สิน หรือเบอร์โทรเพื่อค้นหา</div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && selected && (
            <div>
              {/* Compact profile card */}
              <div style={{ padding: '12px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 12, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#2d2545' }}>{getTaxpayerName(selected)}</div>
                  <div style={{ fontSize: 11, color: '#a89cc8', fontFamily: 'monospace' }}>{selected.ownerCode} · {selected.phone}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                    {(a?.landAmount ?? 0) > 0 && <span style={{ fontSize: 12, color: '#3a5fbf', fontWeight: 600 }}>ที่ดินฯ คงเหลือ {formatCurrency(landRem)} บาท</span>}
                    {(a?.signAmount ?? 0) > 0 && <span style={{ fontSize: 12, color: '#7c5cbf', fontWeight: 600 }}>ป้าย คงเหลือ {formatCurrency(signRem)} บาท</span>}
                  </div>
                </div>
                <button onClick={() => setStep(1)} style={{ fontSize: 11, color: '#7c5cbf', background: 'none', border: '1px solid rgba(124,92,191,0.3)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif" }}>เปลี่ยน</button>
              </div>

              {/* Tax scope */}
              {(a?.landAmount ?? 0) > 0 && (a?.signAmount ?? 0) > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>การติดตามครั้งนี้เกี่ยวกับ</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['both', 'ทั้งสองประเภท'], ['land', 'ภาษีที่ดินฯ'], ['sign', 'ภาษีป้าย']].map(([k, l]) => (
                      <button key={k} onClick={() => setTaxScope(k as typeof taxScope)} style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                        border: taxScope === k ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                        background: taxScope === k ? 'rgba(124,92,191,0.1)' : 'transparent',
                        color: taxScope === k ? '#7c5cbf' : '#8873b5', fontFamily: "'Sarabun',sans-serif", fontWeight: taxScope === k ? 600 : 400
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>ช่องทางการติดต่อ</div>
                  <select className="input-field" value={fuType} onChange={e => setFuType(e.target.value as typeof fuType)}>
                    <option value="phone">โทรศัพท์</option>
                    <option value="line">LINE</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>วันที่และเวลา</div>
                  <input className="input-field" type="time" value={fuTimeOnly} onChange={e => setFuTimeOnly(e.target.value)}/>
                  </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>ผลการติดต่อ *</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[['no_answer', 'ไม่รับสาย'], ['reached', 'ติดต่อได้'], ['promised', 'นัดชำระ'], ['callback', 'ให้ติดต่อกลับ'], ['dispute', 'มีข้อโต้แย้ง'], ['wrong_number', 'เบอร์ไม่ถูกต้อง'], ['other', 'อื่น ๆ']].map(([k, l]) => (
                    <button key={k} onClick={() => setFuResult(k)} style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      border: fuResult === k ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                      background: fuResult === k ? 'rgba(124,92,191,0.12)' : 'transparent',
                      color: fuResult === k ? '#7c5cbf' : '#8873b5', fontFamily: "'Sarabun',sans-serif", fontWeight: fuResult === k ? 600 : 400
                    }}>{l}</button>
                  ))}
                </div>
              </div>

              {fuResult === 'promised' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12, padding: '10px 12px', background: 'rgba(240,236,251,0.4)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>วันที่นัดชำระ</div>
                    <input className="input-field" type="date" value={fuPromiseDate} onChange={e => setFuPromiseDate(e.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>ยอดที่แจ้งว่าจะชำระ (บาท)</div>
                    <input className="input-field" type="number" placeholder="0" value={fuPromiseAmt} onChange={e => setFuPromiseAmt(e.target.value)} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>หมายเหตุ / รายละเอียดการสนทนา</div>
                <textarea className="input-field" placeholder="บันทึกสิ่งที่คุยกัน..." rows={2}
                  value={fuDetail} onChange={e => setFuDetail(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 60 }} />
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>วันที่ติดตามครั้งถัดไป</div>
                <input className="input-field" type="date" value={fuNextDate} onChange={e => setFuNextDate(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving || !fuResult}>
                  {saving ? '⏳ กำลังบันทึก...' : '✅ บันทึกการติดตาม'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { currentUser, taxpayers, selectedYear, addFollowUp } = useApp()
  const navigate = useNavigate()
  const [followFilters, setFollowFilters] = useState<FollowFilterKey[]>([])
  const [paymentFilters, setPaymentFilters] = useState<PaymentFilterKey[]>([])
  const [showTaskFilters, setShowTaskFilters] = useState(false)
  const [showCallLog, setShowCallLog] = useState(false)
  const [callLogToast, setCallLogToast] = useState(false)

  const isDirector = currentUser?.role === 'director' || currentUser?.role === 'admin'
  const isAdmin = currentUser?.role === 'admin'
  const myTaxpayers = isDirector ? taxpayers : taxpayers.filter(tp => tp.group === currentUser?.group)

  const totalCount = myTaxpayers.filter(tp => !!tp.assessments.find(a => a.year === selectedYear)).length
  const paidCount = myTaxpayers.filter(tp => getPaymentStatus(tp, selectedYear) === 'paid').length
  const partialCount = myTaxpayers.filter(tp => getPaymentStatus(tp, selectedYear) === 'partial').length
  const unpaidCount = myTaxpayers.filter(tp => getPaymentStatus(tp, selectedYear) === 'unpaid').length

  const landTotal = myTaxpayers.reduce((s, tp) => s + (tp.assessments.find(a => a.year === selectedYear)?.landAmount ?? 0), 0)
  const landRemaining = myTaxpayers.reduce((s, tp) => s + getLandRemaining(tp, selectedYear), 0)
  const signTotal = myTaxpayers.reduce((s, tp) => s + (tp.assessments.find(a => a.year === selectedYear)?.signAmount ?? 0), 0)
  const signRemaining = myTaxpayers.reduce((s, tp) => s + getSignRemaining(tp, selectedYear), 0)
  const totalAssessed = landTotal + signTotal
  const totalRemaining = landRemaining + signRemaining
  const totalPaid = totalAssessed - totalRemaining

  const paidPct = totalAssessed > 0 ? Math.round((totalPaid / totalAssessed) * 100) : 0
  const landPaid = landTotal - landRemaining
  const signPaid = signTotal - signRemaining
  const landPct = landTotal > 0 ? Math.round((landPaid / landTotal) * 100) : 0
  const signPct = signTotal > 0 ? Math.round((signPaid / signTotal) * 100) : 0

  const donutData = [
    { name: 'ชำระครบ', value: paidCount, pct: totalCount > 0 ? Math.round(paidCount / totalCount * 100) : 0 },
    { name: 'ชำระบางส่วน', value: partialCount, pct: totalCount > 0 ? Math.round(partialCount / totalCount * 100) : 0 },
    { name: 'ยังไม่ชำระ', value: unpaidCount, pct: totalCount > 0 ? Math.round(unpaidCount / totalCount * 100) : 0 },
  ]

  const noneCount = myTaxpayers.filter(tp => getFollowStatus(tp) === 'none' && getPaymentStatus(tp, selectedYear) !== 'paid').length
  const promisedCount = myTaxpayers.filter(tp => getFollowStatus(tp) === 'promised').length

  // Director group stats
  const groups = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท'] as const
  const groupStats = groups.map(g => {
    const tps = taxpayers.filter(tp => tp.group === g && !!tp.assessments.find(a => a.year === selectedYear))
    const officer = tps[0] ? getUserById(tps[0].responsibleOfficer) : undefined
    const totalRem = tps.reduce((s, tp) => s + getTotalRemaining(tp, selectedYear), 0)
    const totalAss = tps.reduce((s, tp) => s + getTotalAssessed(tp, selectedYear), 0)
    const totalPaidG = totalAss - totalRem
    const paidG = tps.filter(tp => getPaymentStatus(tp, selectedYear) === 'paid').length
    const unpaidG = tps.filter(tp => getPaymentStatus(tp, selectedYear) !== 'paid').length
    const noFollow = tps.filter(tp => getFollowStatus(tp) === 'none' && getPaymentStatus(tp, selectedYear) !== 'paid').length
    const contacted = unpaidG - noFollow
    const overdue = tps.filter(tp => {
      const lastFu = getLastFollowUp(tp)
      return lastFu?.promiseDate && lastFu.promiseDate < new Date().toISOString().slice(0, 10) && getPaymentStatus(tp, selectedYear) !== 'paid'
    }).length
    const pctG = totalAss > 0 ? Math.round(totalPaidG / totalAss * 100) : 0
    return { group: g, tps, officer, totalRem, totalPaidG, totalAss, pctG, paidG, unpaidG, noFollow, contacted, overdue, total: tps.length }
  })

  // Director: "รายการที่ควรตรวจสอบ"
  const recheckItems = groupStats
    .flatMap(g => {
      const items = []
      if (g.noFollow > 0) items.push({ group: g.group, msg: `ยังไม่ได้ติดต่อ ${g.noFollow} ราย`, urgency: g.noFollow, filter: 'none' })
      if (g.overdue > 0) items.push({ group: g.group, msg: `เลยวันนัดชำระ ${g.overdue} ราย`, urgency: g.overdue * 2, filter: 'promised' })
      return items
    })
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 5)

  const filteredTps = myTaxpayers.filter(tp => {
    const payStat = getPaymentStatus(tp, selectedYear)
    const followStat = getFollowStatus(tp)

    // ตารางงานวันนี้ไม่แสดงผู้ที่ชำระครบแล้ว
    if (payStat === 'paid') return false

    const matchesPayment = paymentFilters.length === 0
      || paymentFilters.includes(payStat as PaymentFilterKey)

    const matchesFollow = followFilters.length === 0
      || followFilters.some(filter => {
        if (filter === 'none') return followStat === 'none'
        if (filter === 'followed') return followStat === 'followed' || followStat === 'promised'
        if (filter === 'nocontact') return followStat === 'dispute'
        return false
      })

    return matchesPayment && matchesFollow
  }).slice(0, 50)

  const toggleFollowFilter = (key: FollowFilterKey) => {
    setFollowFilters(current => current.includes(key)
      ? current.filter(item => item !== key)
      : [...current, key])
  }

  const togglePaymentFilter = (key: PaymentFilterKey) => {
    setPaymentFilters(current => current.includes(key)
      ? current.filter(item => item !== key)
      : [...current, key])
  }

  const activeTaskFilterCount = followFilters.length + paymentFilters.length

  const handleCallLogSave = (fu: Omit<FollowUp, 'id'>) => {
    addFollowUp({ ...fu, id: `fu${Date.now()}` })
    setCallLogToast(true)
    setTimeout(() => setCallLogToast(false), 3000)
  }

  // Quick Menu — 3 items, visible to all roles
  const quickMenuItems = [
    { icon: '📞', label: 'บันทึกการติดตามการชำระภาษี', sub: 'บันทึกผลการโทรติดตาม', color: '#7c5cbf', action: () => setShowCallLog(true) },
    { icon: '💳', label: 'ตรวจสอบและบันทึกการชำระ', sub: 'ค้นหายอดหรือบันทึกชำระ', color: '#3a5fbf', action: () => navigate('/search-payment') },
    { icon: '📊', label: 'ดูรายงานวันนี้', sub: 'รายงานสรุปประจำวัน', color: '#1a8f5a', action: () => navigate('/reports') },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Toast */}
      {callLogToast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 999,
          background: 'rgba(26,143,90,0.95)', color: '#fff', borderRadius: 14,
          padding: '12px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 8
        }}>
          ✅ บันทึกการติดตามเรียบร้อยแล้ว
        </div>
      )}

      {/* 1. Greeting */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#2d2545' }}>
          สวัสดี, {currentUser?.name} 👋
        </div>
        <div style={{ fontSize: 14, color: '#6b5b95', marginTop: 4 }}>
          ปีภาษี {selectedYear}
          {!isDirector && ` · กลุ่ม ${currentUser?.group}`}
          {' · '}
          <span style={{ color: '#c0392b', fontWeight: 600 }}>ยังไม่ชำระ {unpaidCount} ราย</span>
          {' · '}
          <span style={{ color: '#7c5cbf', fontWeight: 600 }}>ยังไม่ได้ติดต่อ {noneCount} ราย</span>
        </div>
      </div>

      {/* 2. Quick Menu — 3 items */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 16,
        width: '100%',
        marginBottom: 24,
      }}>
        {quickMenuItems.map(a => (
          <button key={a.label} onClick={a.action} style={{
            background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(200,190,240,0.35)', borderRadius: 16,
            padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
            width: '100%', minHeight: 112,
            boxShadow: '0 2px 12px rgba(124,92,191,0.06)', transition: 'all 0.18s',
            fontFamily: "'Sarabun', sans-serif",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(124,92,191,0.14)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(124,92,191,0.06)' }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>{a.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2d2545', marginBottom: 2 }}>{a.label}</div>
            <div style={{ fontSize: 11, color: '#a89cc8' }}>{a.sub}</div>
          </button>
        ))}
      </div>

      {/* 3. Director: รายการที่ควรตรวจสอบ */}
      {isDirector && recheckItems.length > 0 && (
        <div className="glass-card" style={{ padding: '16px 20px', marginBottom: 20, borderLeft: '3px solid rgba(124,92,191,0.5)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2d2545', marginBottom: 12 }}>รายการที่ควรตรวจสอบ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recheckItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(240,236,251,0.4)', borderRadius: 10 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>กลุ่ม {item.group}</span>
                  <span style={{ fontSize: 13, color: '#6b5b95', marginLeft: 10 }}>{item.msg}</span>
                </div>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
                  onClick={() => navigate(`/taxpayers?group=${encodeURIComponent(item.group)}`)}>
                  ดูรายชื่อ →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin system overview */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'ผู้ใช้งานระบบ', val: 'ใช้งานอยู่ 6 บัญชี', icon: '👤', action: () => navigate('/admin/users') },
            { label: 'ข้อมูลปีภาษีปัจจุบัน', val: `${taxpayers.length} รายการ`, icon: '📋', action: () => navigate('/taxpayers') },
            { label: 'รายการที่ต้องตรวจสอบ', val: 'Payment ยังไม่ Match 12 รายการ', icon: '⚠️', action: () => navigate('/search-payment') },
            { label: 'ความสมบูรณ์ของข้อมูล', val: `ไม่มีเบอร์โทร ${taxpayers.filter(tp => !tp.phone).length} ราย`, icon: '📊', action: () => navigate('/taxpayers') },
          ].map(c => (
            <div key={c.label} className="glass-card" style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={c.action}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>{c.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Visualizations row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1.45fr', gap: 16, marginBottom: 24 }}>
        {/* Donut chart */}
        <div className="glass-card" style={{ padding: '20px 18px', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2d2545', marginBottom: 12 }}>สถานะการชำระของผู้เสียภาษี</div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(190px, 1fr) 190px',
            alignItems: 'center', gap: 10
          }}>
            <div style={{
              width: '100%', maxWidth: 250, aspectRatio: '1 / 1',
              justifySelf: 'center', minWidth: 0
            }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius="30%" outerRadius="47%"
                    dataKey="value" paddingAngle={3}
                    onClick={(_, idx) => {
                      if (idx === 2) setPaymentFilters(['unpaid'])
                      else if (idx === 1) setPaymentFilters(['partial'])
                      else setPaymentFilters([])
                    }}
                    style={{ cursor: 'pointer' }}>
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} stroke="none" />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`${v} ราย`, name]} contentStyle={{ fontFamily: "'Sarabun',sans-serif", fontSize: 12, borderRadius: 10, border: '1px solid rgba(200,190,240,0.4)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ width: 190, minWidth: 190, justifySelf: 'end' }}>
              <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ผู้เสียภาษีทั้งหมด</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#2d2545', marginBottom: 12 }}>{totalCount} ราย</div>
              {donutData.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}
                  onClick={() => setPaymentFilters(i === 2 ? ['unpaid'] : i === 1 ? ['partial'] : [])}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#6b5b95', flex: 1, whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2d2545' }}>{d.value} ราย</span>
                  <span style={{ fontSize: 11, color: '#a89cc8', minWidth: 34 }}>{d.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tax collection — compact dashboard cards (Option A) */}
        <div className="glass-card" style={{ padding: '20px 22px', minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2d2545', marginBottom: 14 }}>
            ภาพรวมยอดที่ต้องจัดเก็บ
          </div>

          {/* ตัวเลขภาพรวม: ใช้ข้อมูลจริงจาก assessments และ payments */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 12,
            paddingBottom: 16,
            marginBottom: 14,
            borderBottom: '1px solid rgba(200,190,240,0.25)',
          }}>
            {[
              { label: 'ยอดภาษีทั้งหมด', value: totalAssessed, color: '#2d2545' },
              { label: 'รับชำระแล้ว', value: totalPaid, color: '#1a8f5a' },
              { label: 'ยอดคงเหลือ', value: totalRemaining, color: '#c0392b' },
            ].map(item => (
              <div key={item.label} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 4 }}>{item.label}</div>
                <div style={{
                  fontSize: 19,
                  lineHeight: 1.25,
                  fontWeight: 800,
                  color: item.color,
                  whiteSpace: 'nowrap',
                }}>
                  ฿{formatCurrency(item.value)}
                </div>
              </div>
            ))}
          </div>

          {/* การ์ดแยกประเภทภาษี */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            {[
              {
                icon: '🏠',
                label: 'ภาษีที่ดินและสิ่งปลูกสร้าง',
                total: landTotal,
                paid: landPaid,
                remaining: landRemaining,
                pct: landPct,
                color: '#3a5fbf',
                background: 'rgba(228,237,255,0.46)',
              },
              {
                icon: '🪧',
                label: 'ภาษีป้าย',
                total: signTotal,
                paid: signPaid,
                remaining: signRemaining,
                pct: signPct,
                color: '#7c5cbf',
                background: 'rgba(240,236,251,0.62)',
              },
            ].map(tax => (
              <div key={tax.label} style={{
                padding: '14px 15px',
                borderRadius: 14,
                background: tax.background,
                border: '1px solid rgba(200,190,240,0.22)',
                minWidth: 0,
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ fontSize: 17, flexShrink: 0 }}>{tax.icon}</span>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#2d2545',
                      lineHeight: 1.35,
                    }}>
                      {tax.label}
                    </span>
                  </div>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 800,
                    color: tax.color,
                    background: 'rgba(255,255,255,0.72)',
                    padding: '3px 7px',
                    borderRadius: 99,
                  }}>
                    {tax.pct}%
                  </span>
                </div>

                <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ยอดคงเหลือ</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2d2545', lineHeight: 1.2 }}>
                  ฿{formatCurrency(tax.remaining)}
                </div>
                <div style={{ fontSize: 10, color: '#9487b4', marginTop: 4 }}>
                  รับแล้ว ฿{formatCurrency(tax.paid)} จาก ฿{formatCurrency(tax.total)}
                </div>

                <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,0.9)', overflow: 'hidden', marginTop: 11 }}>
                  <div style={{
                    height: '100%',
                    width: `${tax.pct}%`,
                    minWidth: tax.pct > 0 ? 4 : 0,
                    borderRadius: 99,
                    background: tax.color,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 10, color: '#a89cc8', textAlign: 'right' }}>
            จัดเก็บแล้วทั้งหมด {paidPct}%
          </div>
        </div>
      </div>

      {/* Director group overview — text-first design */}
      {isDirector && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#2d2545', margin: '0 0 14px' }}>ภาพรวมแต่ละกลุ่ม</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {groupStats.map(g => (
              <div key={g.group} className="glass-card" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#2d2545' }}>กลุ่ม {g.group}</div>
                  <span style={{ fontSize: 11, color: '#a89cc8' }}>ดูแล {g.total} ราย</span>
                </div>
                <div style={{ fontSize: 12, color: '#a89cc8', marginBottom: 12 }}>ผู้รับผิดชอบ: {g.officer?.name ?? '-'}</div>

                <div style={{ height: 1, background: 'rgba(200,190,240,0.2)', marginBottom: 12 }} />

                {/* Payment status row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ชำระครบแล้ว</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a8f5a' }}>{g.paidG} ราย</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ยังไม่ชำระ</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#c0392b' }}>{g.unpaidG} ราย</div>
                  </div>
                </div>

                <div style={{ height: 1, background: 'rgba(200,190,240,0.2)', marginBottom: 10 }} />

                {/* Contact status row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ติดต่อแล้ว</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#2d2545' }}>{g.contacted} ราย</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ยังไม่ได้ติดต่อ</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: g.noFollow > 0 ? '#7c5cbf' : '#2d2545' }}>{g.noFollow} ราย</div>
                  </div>
                </div>

                {g.overdue > 0 && (
                  <div style={{ marginBottom: 10, padding: '6px 10px', background: '#fff8e6', border: '1px solid rgba(230,160,0,0.25)', borderRadius: 8, fontSize: 12, color: '#8a5a00', fontWeight: 600 }}>
                    เลยวันนัดชำระ {g.overdue} ราย
                  </div>
                )}

                <div style={{ height: 1, background: 'rgba(200,190,240,0.2)', marginBottom: 12 }} />

                <div style={{ height: 1, background: 'rgba(200,190,240,0.2)', marginBottom: 10 }} />

                {/* Finance section */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ยอดทั้งหมด</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2545', marginBottom: 8 }}>฿{formatCurrency(g.totalAss)} บาท</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 1 }}>รับแล้ว</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a8f5a' }}>฿{formatCurrency(g.totalPaidG)} บาท</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 1 }}>คงเหลือ</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#c0392b' }}>฿{formatCurrency(g.totalRem)} บาท</div>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: '#f0ecfb', overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#7c5cbf,#9b7dd4)', width: `${g.pctG}%` }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#a89cc8' }}>จัดเก็บแล้ว {g.pctG}%</div>
                </div>

                <button className="btn-secondary" style={{ fontSize: 12, padding: '7px 12px', width: '100%' }}
                  onClick={() => navigate(`/taxpayers?group=${encodeURIComponent(g.group)}`)}>
                  ดูรายละเอียดกลุ่ม
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Task Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid rgba(200,190,240,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>รายการงานวันนี้</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a89cc8' }}>{filteredTps.length} รายการ</span>

            <div>
              <button
                type="button"
                onClick={() => setShowTaskFilters(current => !current)}
                aria-expanded={showTaskFilters}
                style={{
                  padding: '7px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid #7c5cbf',
                  background: activeTaskFilterCount > 0 ? '#7c5cbf' : 'rgba(124,92,191,0.08)',
                  color: activeTaskFilterCount > 0 ? '#fff' : '#6b49ac',
                  fontFamily: "'Sarabun',sans-serif"
                }}
              >
                ⚙ ตัวกรอง{activeTaskFilterCount > 0 ? ` · ${activeTaskFilterCount}` : ''}
              </button>

            </div>
          </div>

          {showTaskFilters && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 22, margin: '14px -22px 0', padding: '14px 22px',
              background: 'rgba(248,246,255,0.9)',
              borderTop: '1px solid rgba(200,190,240,0.25)',
              borderBottom: '1px solid rgba(200,190,240,0.25)'
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2d2545', marginBottom: 7 }}>สถานะการติดต่อ</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  {FOLLOW_FILTER_LABELS.map(filter => (
                    <label key={filter.key} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      fontSize: 12, color: '#5f527d', cursor: 'pointer', whiteSpace: 'nowrap'
                    }}>
                      <input
                        type="checkbox"
                        checked={followFilters.includes(filter.key)}
                        onChange={() => toggleFollowFilter(filter.key)}
                        style={{ width: 15, height: 15, accentColor: '#7c5cbf' }}
                      />
                      {filter.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2d2545', marginBottom: 7 }}>สถานะการชำระ</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  {PAYMENT_FILTER_LABELS.map(filter => (
                    <label key={filter.key} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      fontSize: 12, color: '#5f527d', cursor: 'pointer', whiteSpace: 'nowrap'
                    }}>
                      <input
                        type="checkbox"
                        checked={paymentFilters.includes(filter.key)}
                        onChange={() => togglePaymentFilter(filter.key)}
                        style={{ width: 15, height: 15, accentColor: '#7c5cbf' }}
                      />
                      {filter.label}
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setFollowFilters([]); setPaymentFilters([]) }}
                    disabled={activeTaskFilterCount === 0}
                    style={{
                      marginLeft: 'auto', border: 0, background: 'transparent',
                      color: activeTaskFilterCount > 0 ? '#c0392b' : '#b9b0ca',
                      padding: '3px 0', fontSize: 12,
                      textDecoration: 'underline', textUnderlineOffset: 3,
                      cursor: activeTaskFilterCount > 0 ? 'pointer' : 'default',
                      fontFamily: "'Sarabun',sans-serif", whiteSpace: 'nowrap'
                    }}
                  >ล้างทั้งหมด</button>
                </div>
              </div>
            </div>
          )}

          {activeTaskFilterCount > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {followFilters.map(key => {
                const label = FOLLOW_FILTER_LABELS.find(item => item.key === key)?.label
                return <button key={key} type="button" onClick={() => toggleFollowFilter(key)} style={{
                  border: '1px solid rgba(124,92,191,0.22)', borderRadius: 999, padding: '4px 9px',
                  background: 'rgba(124,92,191,0.08)', color: '#6b49ac', fontSize: 11,
                  cursor: 'pointer', fontFamily: "'Sarabun',sans-serif"
                }}>{label} ×</button>
              })}
              {paymentFilters.map(key => {
                const label = PAYMENT_FILTER_LABELS.find(item => item.key === key)?.label
                return <button key={key} type="button" onClick={() => togglePaymentFilter(key)} style={{
                  border: '1px solid rgba(124,92,191,0.22)', borderRadius: 999, padding: '4px 9px',
                  background: key === 'partial' ? 'rgba(224,160,20,0.10)' : 'rgba(220,70,60,0.08)',
                  color: key === 'partial' ? '#9a6800' : '#b63a32', fontSize: 11,
                  cursor: 'pointer', fontFamily: "'Sarabun',sans-serif"
                }}>{label} ×</button>
              })}
            </div>
          )}
        </div>

        {filteredTps.length === 0 ? (
          <EmptyState icon="🎉" title="ไม่มีรายการ" sub="ไม่พบรายการในหมวดนี้" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(240,236,251,0.5)' }}>
                  {['#', 'รหัส', 'ชื่อ-นามสกุล', 'ประเภทภาษี', 'ยอดที่ต้องชำระ', 'ยอดคงเหลือ', 'ติดต่อล่าสุด', 'ผลการติดต่อ', 'วันนัด', 'สถานะ', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b5b95', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,190,240,0.25)', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTps.map((tp, i) => {
                  const assess = tp.assessments.find(a => a.year === selectedYear)
                  const remaining = getTotalRemaining(tp, selectedYear)
                  const lastFu = getLastFollowUp(tp)
                  const payStat = getPaymentStatus(tp, selectedYear)
                  const followStat = getFollowStatus(tp)
                  const landRem2 = getLandRemaining(tp, selectedYear)
                  const signRem2 = getSignRemaining(tp, selectedYear)
                  const remainingTypes = [landRem2 > 0 ? 'ภาษีที่ดินฯ' : null, signRem2 > 0 ? 'ภาษีป้าย' : null].filter(Boolean) as string[]
                  return (
                    <tr key={tp.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(200,190,240,0.15)' }}>
                      <td style={{ padding: '10px 14px', color: '#a89cc8', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#7c5cbf' }}>{tp.ownerCode}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: '#2d2545' }}>{getTaxpayerName(tp)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {remainingTypes.length === 0
                          ? <span style={{ fontSize: 11, color: '#a89cc8' }}>ชำระครบแล้ว</span>
                          : <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {remainingTypes.map(t => (
                                <span key={t} style={{ background: 'rgba(124,92,191,0.1)', color: '#5c3d9e', border: '1px solid rgba(124,92,191,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{t}</span>
                              ))}
                            </div>
                        }
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#2d2545' }}>฿{formatCurrency(getTotalAssessed(tp, selectedYear))} บาท</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: remaining > 0 ? '#c0392b' : '#1a8f5a' }}>฿{formatCurrency(remaining)} บาท</td>
                      <td style={{ padding: '10px 14px', color: '#8873b5', fontSize: 12 }}>{lastFu ? formatDate(lastFu.date) : '-'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b5b95', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastFu?.detail ?? '-'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#7c5cbf' }}>{lastFu?.promiseDate ? formatDate(lastFu.promiseDate) : '-'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <StatusBadge status={payStat} size="sm" />
                          {payStat !== 'paid' && <StatusBadge status={followStat} size="sm" />}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => navigate(`/taxpayers/${tp.id}`)}>
                          ดูรายละเอียด →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCallLog && (
        <CallLogModal
          onClose={() => setShowCallLog(false)}
          onSave={handleCallLogSave}
        />
      )}
    </div>
  )
}
