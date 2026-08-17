import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import {
  getTaxpayerName, formatCurrency, formatDate, formatDateTime,
  getPaymentStatus, getLandRemaining, getSignRemaining, CURRENT_YEAR,
  getUserById, getLandPaid, getSignPaid
} from '../data/mockData'
import type { FollowUp, Payment, Taxpayer } from '../types'

// Extract short keyword tags from a freeform note string
function extractTags(tp: Taxpayer): { label: string; year: number; note: string }[] {
  const TAG_PATTERNS: { re: RegExp; label: string }[] = [
    { re: /เพิ่มป้าย/i, label: 'เพิ่มป้าย' },
    { re: /ลดป้าย|ลดพื้นที่ป้าย/i, label: 'ลดพื้นที่ป้าย' },
    { re: /ปิดกิจการ/i, label: 'ปิดกิจการบางช่วง' },
    { re: /เปลี่ยนเจ้าของ/i, label: 'เปลี่ยนเจ้าของกิจการ' },
    { re: /ต่อเติม|ต่อเติมอาคาร/i, label: 'ต่อเติมอาคาร' },
    { re: /ช่วงบ่าย|บ่าย/i, label: 'ติดต่อช่วงบ่าย' },
    { re: /ช่วงเช้า|เช้า/i, label: 'ติดต่อช่วงเช้า' },
    { re: /ลดพื้นที่/i, label: 'ลดพื้นที่' },
    { re: /ไม่รับสาย/i, label: 'ไม่รับสายบ่อย' },
    { re: /ย้าย/i, label: 'ย้ายที่อยู่' },
  ]

  const seen = new Set<string>()
  const results: { label: string; year: number; note: string }[] = []

  const yearsDesc = [...tp.assessments].sort((a, b) => b.year - a.year)
  // current tp.notes as latest year
  if (tp.notes) {
    const year = yearsDesc[0]?.year ?? CURRENT_YEAR
    TAG_PATTERNS.forEach(({ re, label }) => {
      if (re.test(tp.notes!) && !seen.has(label)) {
        seen.add(label)
        results.push({ label, year, note: tp.notes! })
      }
    })
    // also split by comma
    tp.notes.split(/[,，、\n]/).map(s => s.trim()).filter(s => s.length >= 3 && s.length <= 20).forEach(phrase => {
      if (!seen.has(phrase)) {
        seen.add(phrase)
        results.push({ label: phrase, year, note: tp.notes! })
      }
    })
  }

  return results.slice(0, 9)
}

function TaxpayerTags({ tp }: { tp: Taxpayer }) {
  const tags = extractTags(tp)
  const [expanded, setExpanded] = useState(false)
  const [tooltip, setTooltip] = useState<{ label: string; year: number; note: string } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const MAX_VISIBLE = 5

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setTooltip(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (tags.length === 0) return null

  const visible = expanded ? tags : tags.slice(0, MAX_VISIBLE)
  const overflow = tags.length - MAX_VISIBLE

  const TAG_COLORS = [
    { bg: 'rgba(196,181,240,0.28)', color: '#5c3d9e', border: 'rgba(124,92,191,0.25)' },
    { bg: 'rgba(218,237,248,0.5)', color: '#2a6080', border: 'rgba(100,160,210,0.3)' },
    { bg: 'rgba(240,240,200,0.45)', color: '#6b5500', border: 'rgba(180,160,0,0.25)' },
    { bg: 'rgba(200,240,220,0.45)', color: '#1a6b45', border: 'rgba(50,160,100,0.25)' },
    { bg: 'rgba(250,220,210,0.45)', color: '#8a3020', border: 'rgba(200,100,80,0.3)' },
  ]

  return (
    <div style={{ marginBottom: 20, position: 'relative' }}>
      <div className="glass-card" style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#a89cc8', letterSpacing: '0.06em', marginBottom: 10 }}>🏷 ข้อมูลสำคัญ</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {visible.map((tag, i) => {
            const c = TAG_COLORS[i % TAG_COLORS.length]
            const isActive = tooltip?.label === tag.label
            return (
              <button key={tag.label} onClick={() => setTooltip(isActive ? null : tag)}
                style={{
                  background: isActive ? 'rgba(124,92,191,0.18)' : c.bg,
                  color: c.color, border: `1px solid ${c.border}`,
                  borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Sarabun',sans-serif",
                  transition: 'all 0.15s', outline: 'none',
                  boxShadow: isActive ? '0 0 0 2px rgba(124,92,191,0.3)' : 'none'
                }}>
                {tag.label}
              </button>
            )
          })}
          {!expanded && overflow > 0 && (
            <button onClick={() => setExpanded(true)} style={{
              background: 'rgba(124,92,191,0.08)', color: '#7c5cbf',
              border: '1px dashed rgba(124,92,191,0.3)', borderRadius: 20,
              padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif"
            }}>+{overflow} เพิ่มเติม</button>
          )}
        </div>
        {/* Tooltip */}
        {tooltip && (
          <div ref={tooltipRef} style={{
            marginTop: 12, padding: '12px 14px',
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(196,181,240,0.4)', borderRadius: 12,
            boxShadow: '0 4px 20px rgba(124,92,191,0.12)'
          }}>
            <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 4 }}>
              ปีภาษี {tooltip.year}
            </div>
            <div style={{ fontSize: 13, color: '#2d2545', lineHeight: 1.6 }}>
              "{tooltip.note}"
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const CALL_RESULT_LABELS: Record<string, string> = {
  no_answer: 'ไม่รับสาย', reached: 'ติดต่อได้', callback: 'จะโทรกลับ',
  promised: 'นัดชำระ', dispute: 'มีข้อโต้แย้ง', wrong_number: 'เบอร์ผิด', other: 'อื่น ๆ'
}
const CONTACT_ICONS: Record<string, string> = {
  phone: '📞', line: '💬', in_person: '🤝', letter: '📮', other: '📝',
  assessment: '📋', notice: '📨', payment: '💰', promise: '📅'
}

export default function TaxpayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { taxpayers, addFollowUp, addPayment, currentUser } = useApp()
  const navigate = useNavigate()
  const tp = taxpayers.find(t => t.id === id)
  const [showFollowModal, setShowFollowModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)

  // Follow-up form
  const [fuType, setFuType] = useState<FollowUp['type']>('phone')
  const [fuResult, setFuResult] = useState('')
  const [fuDetail, setFuDetail] = useState('')
  const [fuPromiseDate, setFuPromiseDate] = useState('')
  const [fuPromiseAmt, setFuPromiseAmt] = useState('')
  const [fuNextDate, setFuNextDate] = useState('')
  const [fuDate, setFuDate] = useState(new Date().toISOString().slice(0,16))
  const [fuSaving, setFuSaving] = useState(false)

  // Payment form
  const [payAmt, setPayAmt] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0,10))
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer')
  const [payRef, setPayRef] = useState('')
  const [payReceipt, setPayReceipt] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [paySaved, setPaySaved] = useState(false)
  const [fuSaved, setFuSaved] = useState(false)

  if (!tp) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>🔍</div>
      <div style={{ fontSize: 16, color: '#6b5b95', marginTop: 12 }}>ไม่พบข้อมูลผู้เสียภาษี</div>
      <button className="btn-secondary" onClick={() => navigate('/taxpayers')} style={{ marginTop: 16 }}>กลับไปรายการ</button>
    </div>
  )

  const officer = getUserById(tp.responsibleOfficer)
  const payStat = getPaymentStatus(tp, CURRENT_YEAR)
  const assess = tp.assessments.find(a => a.year === CURRENT_YEAR)
  const landPaid = getLandPaid(tp)
  const signPaid = getSignPaid(tp)
  const landRem = getLandRemaining(tp, CURRENT_YEAR)
  const signRem = getSignRemaining(tp, CURRENT_YEAR)

  // Build timeline
  const timeline: { date: string; icon: string; title: string; detail?: string; amount?: number }[] = [
    ...(assess ? [{ date: `2569-01-15`, icon: '📋', title: `ประเมินภาษีปี ${CURRENT_YEAR}`, detail: `ที่ดินฯ ฿${formatCurrency(assess.landAmount)} · ป้าย ฿${formatCurrency(assess.signAmount)}` }] : []),
    ...tp.followUps.map(fu => ({
      date: fu.date, icon: CONTACT_ICONS[fu.type] ?? '📝',
      title: fu.type === 'phone' ? `โทรศัพท์ — ${CALL_RESULT_LABELS[fu.result ?? ''] ?? ''}` : fu.type === 'line' ? 'แจ้งผ่าน LINE' : 'ติดต่อ',
      detail: fu.detail + (fu.promiseDate ? ` · นัด ${formatDate(fu.promiseDate)}` : '') + (fu.nextFollowDate ? ` · ติดตามครั้งถัดไป ${formatDate(fu.nextFollowDate)}` : ''),
    })),
    ...tp.payments.map(p => ({
      date: p.date, icon: '💰',
      title: `รับชำระ ฿${formatCurrency(p.amount)}`,
      detail: `${p.method === 'transfer' ? 'โอนเงิน' : 'เงินสด'} · ${p.refNo ?? p.receiptNo ?? '-'}`,
      amount: p.amount
    }))
  ].sort((a, b) => b.date.localeCompare(a.date))

  const handleSaveFu = async () => {
    setFuSaving(true)
    await new Promise(r => setTimeout(r, 500))
    const fu: FollowUp = {
      id: `fu${Date.now()}`, taxpayerId: tp.id, type: fuType, date: fuDate,
      result: fuResult as FollowUp['result'], detail: fuDetail,
      promiseDate: fuPromiseDate || undefined, promiseAmount: parseFloat(fuPromiseAmt) || undefined,
      nextFollowDate: fuNextDate || undefined, recordedBy: currentUser?.id ?? 'u1'
    }
    addFollowUp(fu)
    setFuSaving(false); setFuSaved(true)
    setTimeout(() => { setFuSaved(false); setShowFollowModal(false) }, 1200)
  }

  const handleSavePay = async () => {
    setPaySaving(true)
    await new Promise(r => setTimeout(r, 500))
    const amt = parseFloat(payAmt) || 0
    const allocLand = Math.min(amt, assess?.landAmount ?? 0)
    const allocSign = Math.min(amt - allocLand, assess?.signAmount ?? 0)
    const pay: Payment = {
      id: `pay${Date.now()}`, taxpayerId: tp.id, amount: amt,
      date: payDate, method: payMethod, refNo: payMethod === 'transfer' ? payRef : undefined,
      receiptNo: payMethod === 'cash' ? payReceipt : undefined,
      allocatedLand: allocLand, allocatedSign: allocSign, recordedBy: currentUser?.id ?? 'u1'
    }
    addPayment(pay)
    setPaySaving(false); setPaySaved(true)
    setTimeout(() => { setPaySaved(false); setShowPayModal(false) }, 1200)
  }

  const totalRemaining = landRem + signRem
  const payAmt_num = parseFloat(payAmt) || 0
  const toAllocate = Math.min(payAmt_num, totalRemaining)
  const change = payAmt_num - toAllocate

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: '#a89cc8' }}>
        <button className="btn-ghost" onClick={() => navigate('/dashboard')} style={{ fontSize: 13, padding: '4px 8px' }}>หน้าหลัก</button>
        <span>›</span>
        <button className="btn-ghost" onClick={() => navigate('/taxpayers')} style={{ fontSize: 13, padding: '4px 8px' }}>ผู้เสียภาษี</button>
        <span>›</span>
        <span style={{ color: '#2d2545', fontWeight: 600 }}>{getTaxpayerName(tp)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        {/* LEFT */}
        <div>
          {/* Profile card */}
          <div className="glass-card" style={{ padding: '22px 26px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg,#c4b5f0,#9b7dd4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'white', flexShrink: 0
                }}>{tp.type === 'company' ? '🏢' : '👤'}</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#2d2545', marginBottom: 4 }}>{getTaxpayerName(tp)}</div>
                  <div style={{ fontSize: 12, color: '#a89cc8', fontFamily: 'monospace' }}>{tp.ownerCode}</div>
                </div>
              </div>
              <StatusBadge status={payStat} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, fontSize: 13 }}>
              <div><div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>เบอร์โทร</div><div style={{ fontWeight: 500 }}>{tp.phone}</div></div>
              <div><div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>กลุ่มผู้รับผิดชอบ</div><div style={{ fontWeight: 500 }}>กลุ่ม {tp.group}</div></div>
              <div><div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>พนักงานผู้รับผิดชอบ</div><div style={{ fontWeight: 500 }}>{officer?.name ?? '-'}</div></div>
              <div style={{ gridColumn: '1/-1' }}><div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 2 }}>ที่อยู่</div><div>{tp.address}</div></div>
            </div>
          </div>

          {/* Tags */}
          <TaxpayerTags tp={tp} />

          {/* Tax cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'ภาษีที่ดินและสิ่งปลูกสร้าง', icon: '🏠', assessed: assess?.landAmount ?? 0, paid: landPaid, remaining: landRem, color: '#3a5fbf', bg: 'rgba(218,237,248,0.4)' },
              { label: 'ภาษีป้าย', icon: '🪧', assessed: assess?.signAmount ?? 0, paid: signPaid, remaining: signRem, color: '#7c5cbf', bg: 'rgba(240,236,251,0.4)' },
            ].map(t => (
              <div key={t.label} className="glass-card" style={{ padding: '18px 20px', background: t.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>{t.label}</span>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {[['ยอดประเมิน', `฿${formatCurrency(t.assessed)}`, '#2d2545'], ['ชำระแล้ว', `฿${formatCurrency(t.paid)}`, '#1a8f5a'], ['ยอดคงเหลือ', `฿${formatCurrency(t.remaining)}`, t.remaining > 0 ? '#c0392b' : '#1a8f5a']].map(([lbl, val, col]) => (
                    <div key={String(lbl)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(200,190,240,0.2)' }}>
                      <span style={{ fontSize: 12, color: '#a89cc8' }}>{lbl}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: String(col) }}>{String(val)}</span>
                    </div>
                  ))}
                </div>
                {t.assessed === 0 && <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12, color: '#c4b5f0' }}>ไม่มีภาษีประเภทนี้</div>}
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="glass-card" style={{ padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#2d2545' }}>📜 ประวัติการดำเนินการ</h3>
            {timeline.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#c4b5f0', fontSize: 13 }}>ยังไม่มีบันทึก</div>
            ) : (
              <div style={{ position: 'relative' }}>
                {timeline.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 20, position: 'relative' }}>
                    {i < timeline.length - 1 && <div style={{ position: 'absolute', left: 17, top: 36, bottom: -6, width: 1, background: 'linear-gradient(180deg, rgba(124,92,191,0.3), transparent)' }} />}
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, background: 'rgba(124,92,191,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0
                    }}>{ev.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>{ev.title}</div>
                        <div style={{ fontSize: 11, color: '#a89cc8', whiteSpace: 'nowrap', marginLeft: 12 }}>{formatDateTime(ev.date)}</div>
                      </div>
                      {ev.detail && <div style={{ fontSize: 12, color: '#6b5b95' }}>{ev.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div style={{ position: 'sticky', top: 76 }}>
          <div className="glass-card" style={{ padding: '20px', marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#2d2545' }}>การดำเนินการ</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => setShowFollowModal(true)}>
                📞 บันทึกการติดตาม
              </button>
              <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setShowPayModal(true)}>
                💰 บันทึกการชำระ
              </button>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '16px 18px' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#2d2545' }}>สรุปยอดภาษี</h4>
            {[['ยอดประเมินรวม', `฿${formatCurrency((assess?.landAmount ?? 0) + (assess?.signAmount ?? 0))}`, '#2d2545'],
              ['รับชำระแล้ว', `฿${formatCurrency(landPaid + signPaid)}`, '#1a8f5a'],
              ['คงเหลือ', `฿${formatCurrency(landRem + signRem)}`, landRem + signRem > 0 ? '#c0392b' : '#1a8f5a']
            ].map(([l, v, c]) => (
              <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(200,190,240,0.2)', fontSize: 13 }}>
                <span style={{ color: '#a89cc8' }}>{l}</span>
                <span style={{ fontWeight: 700, color: String(c) }}>{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Follow-up Modal */}
      {showFollowModal && (
        <Modal title="บันทึกการติดตาม" onClose={() => setShowFollowModal(false)}>
          {fuSaved ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 600, color: '#1a8f5a' }}>บันทึกเรียบร้อย</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={LBL}>ประเภทการติดตาม</label>
                  <select className="input-field" value={fuType} onChange={e => setFuType(e.target.value as FollowUp['type'])}>
                    <option value="phone">📞 โทรศัพท์</option>
                    <option value="line">💬 LINE</option>
                    <option value="in_person">🤝 พบตัว</option>
                    <option value="letter">📮 หนังสือ</option>
                    <option value="other">📝 อื่น ๆ</option>
                  </select>
                </div>
                <div>
                  <label style={LBL}>วันที่และเวลา</label>
                  <input className="input-field" type="datetime-local" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                </div>
              </div>
              {fuType === 'phone' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>ผลการโทร</label>
                  <select className="input-field" value={fuResult} onChange={e => setFuResult(e.target.value)}>
                    <option value="">— เลือกผล —</option>
                    {Object.entries(CALL_RESULT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={LBL}>รายละเอียดการสนทนา</label>
                <textarea className="input-field" rows={3} placeholder="บันทึกรายละเอียด..." value={fuDetail} onChange={e => setFuDetail(e.target.value)} style={{ resize: 'vertical' }} />
              </div>
              {fuResult === 'promised' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14, padding: '14px', background: 'rgba(240,236,251,0.5)', borderRadius: 12 }}>
                  <div>
                    <label style={LBL}>📅 วันที่แจ้งว่าจะชำระ</label>
                    <input className="input-field" type="date" value={fuPromiseDate} onChange={e => setFuPromiseDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={LBL}>💰 ยอดที่แจ้งว่าจะชำระ</label>
                    <input className="input-field" type="number" placeholder="0.00" value={fuPromiseAmt} onChange={e => setFuPromiseAmt(e.target.value)} />
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <label style={LBL}>วันที่ควรติดตามครั้งถัดไป</label>
                <input className="input-field" type="date" value={fuNextDate} onChange={e => setFuNextDate(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowFollowModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleSaveFu} disabled={fuSaving}>
                  {fuSaving ? '⏳ กำลังบันทึก...' : '💾 บันทึก'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Payment Modal */}
      {showPayModal && (
        <Modal title="บันทึกการชำระ" onClose={() => setShowPayModal(false)}>
          {paySaved ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 600, color: '#1a8f5a' }}>บันทึกการชำระเรียบร้อย</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 10, fontSize: 13 }}>
                <span style={{ color: '#a89cc8' }}>ยอดคงเหลือ: </span>
                <strong style={{ color: '#c0392b' }}>฿{formatCurrency(totalRemaining)}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={LBL}>ยอดเงินที่ได้รับ (บาท) *</label>
                  <input className="input-field" type="number" step="0.01" placeholder="0.00" value={payAmt} onChange={e => setPayAmt(e.target.value)} autoFocus />
                </div>
                <div>
                  <label style={LBL}>วันที่ชำระ</label>
                  <input className="input-field" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LBL}>วิธีชำระ</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['transfer','💳 โอนเงิน'],['cash','💵 เงินสด']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setPayMethod(v as 'transfer' | 'cash')} style={{
                      flex: 1, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13,
                      border: payMethod === v ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                      background: payMethod === v ? 'rgba(124,92,191,0.1)' : 'transparent', color: payMethod === v ? '#7c5cbf' : '#6b5b95', fontWeight: 500
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              {payMethod === 'transfer' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>เลขที่อ้างอิง (Reference No.)</label>
                  <input className="input-field" placeholder="TRF..." value={payRef} onChange={e => setPayRef(e.target.value)} />
                </div>
              )}
              {payMethod === 'cash' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>เลขที่ใบเสร็จ (Receipt No.)</label>
                  <input className="input-field" placeholder="RC2569-..." value={payReceipt} onChange={e => setPayReceipt(e.target.value)} />
                </div>
              )}
              {payAmt_num > 0 && (
                <div style={{ marginBottom: 20, padding: '14px', background: 'rgba(124,92,191,0.06)', borderRadius: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {[
                    ['ยอดคงเหลือ', `฿${formatCurrency(totalRemaining)}`, '#2d2545'],
                    ['รับเงินจริง', `฿${formatCurrency(payAmt_num)}`, '#7c5cbf'],
                    ['นำไปตัดภาษี', `฿${formatCurrency(toAllocate)}`, '#1a8f5a'],
                    ['ส่วนต่าง', `฿${formatCurrency(change)}`, change > 0 ? '#8a5a00' : '#1a8f5a'],
                  ].map(([l, v, c]) => (
                    <div key={String(l)}>
                      <div style={{ fontSize: 11, color: '#a89cc8' }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: String(c) }}>{String(v)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowPayModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleSavePay} disabled={paySaving || !payAmt}>
                  {paySaving ? '⏳...' : '✅ ยืนยันการชำระ'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

const LBL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
