import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import {
  getTaxpayerName, formatCurrency, formatDate, formatDateTime,
  getTotalAssessed, getTotalRemaining, getPaymentStatus,
  getLastFollowUp, CURRENT_YEAR, getUserById
} from '../data/mockData'
import type { Taxpayer, Payment } from '../types'

const CALL_RESULT_LABELS: Record<string, string> = {
  no_answer: 'ไม่รับสาย', reached: 'ติดต่อได้', callback: 'จะโทรกลับ',
  promised: 'นัดชำระ', dispute: 'มีข้อโต้แย้ง', wrong_number: 'เบอร์ผิด', other: 'อื่น ๆ'
}

interface Candidate {
  tp: Taxpayer
  diff: number
  exact: boolean
}

export default function SearchPaymentPage() {
  const { taxpayers, addPayment, currentUser, selectedYear } = useApp()
  const [activeTab, setActiveTab] = useState<'search' | 'direct'>('search')
  const [amtInput, setAmtInput] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [taxTypeFilter, setTaxTypeFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState(
    currentUser?.role === 'officer' ? (currentUser.group ?? 'all') : 'all'
  )
  const [personTypeFilter, setPersonTypeFilter] = useState('all')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [searched, setSearched] = useState(false)
  const [searchedAmt, setSearchedAmt] = useState('')

  // Drawer state
  const [drawerTp, setDrawerTp] = useState<Taxpayer | null>(null)
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
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer')
  const [payRef, setPayRef] = useState('')
  const [payReceipt, setPayReceipt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const isDirector = currentUser?.role !== 'officer'
  const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท']

  const runSearch = () => {
    const amt = parseFloat(amtInput)
    const name = nameSearch.toLowerCase().trim()
    if (!amt && !name) return

    const pool = taxpayers.filter(tp => {
      if (!isDirector && tp.group !== currentUser?.group) return false
      if (groupFilter !== 'all' && tp.group !== groupFilter) return false
      if (personTypeFilter === 'individual' && tp.type !== 'individual') return false
      if (personTypeFilter === 'company' && tp.type !== 'company') return false
      return getTotalRemaining(tp, selectedYear) > 0
    })

    const results: Candidate[] = pool
      .filter(tp => {
        const remaining = getTotalRemaining(tp, selectedYear)
        const assess = tp.assessments.find(a => a.year === selectedYear)
        if (taxTypeFilter === 'land' && !(assess?.landAmount)) return false
        if (taxTypeFilter === 'sign' && !(assess?.signAmount)) return false
        if (name) {
          return getTaxpayerName(tp).toLowerCase().includes(name) ||
            tp.ownerCode.toLowerCase().includes(name)
        }
        if (amt > 0) {
          const diff = Math.abs(remaining - amt)
          return diff <= Math.max(amt * 0.1, 5)
        }
        return false
      })
      .map(tp => {
        const remaining = getTotalRemaining(tp, selectedYear)
        const diff = amt > 0 ? remaining - amt : 0
        return { tp, diff, exact: Math.abs(diff) < 0.01 }
      })
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))
      .slice(0, 20)

    setCandidates(results)
    setSearched(true)
    setSearchedAmt(amtInput)
  }

  const exactCandidates = candidates.filter(c => c.exact)
  const nearCandidates = candidates.filter(c => !c.exact)

  // Confirm payment
  const drawerRemaining = drawerTp ? getTotalRemaining(drawerTp, selectedYear) : 0
  const payAmt = parseFloat(searchedAmt) || drawerRemaining
  const toAllocate = Math.min(payAmt, drawerRemaining)
  const change = payAmt - toAllocate

  const handleConfirm = async () => {
    if (!drawerTp) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    const assess = drawerTp.assessments.find(a => a.year === selectedYear)
    const alloc = toAllocate
    const allocLand = Math.min(alloc, assess?.landAmount ?? 0)
    const allocSign = Math.min(alloc - allocLand, assess?.signAmount ?? 0)
    const pay: Payment = {
      id: `pay${Date.now()}`, taxpayerId: drawerTp.id, amount: payAmt,
      date: payDate, method: payMethod,
      refNo: payMethod === 'transfer' ? payRef : undefined,
      receiptNo: payMethod === 'cash' ? payReceipt : undefined,
      allocatedLand: allocLand, allocatedSign: allocSign,
      recordedBy: currentUser?.id ?? 'u1'
    }
    addPayment(pay)
    setSaving(false); setSaved(true)
    showSuccessToast()
    setTimeout(() => {
      setSaved(false); setShowPayModal(false); setDrawerTp(null)
      setCandidates(prev => prev.filter(c => c.tp.id !== drawerTp.id))
    }, 1400)
  }

  const showSuccessToast = () => {
    setToast(true)
    setTimeout(() => setToast(false), 3500)
  }

  const cashPool = taxpayers.filter(tp => {
    if (!isDirector && tp.group !== currentUser?.group) return false
    return getTotalRemaining(tp, selectedYear) > 0
  }).filter(tp => {
    if (!cashSearch) return false
    const s = cashSearch.toLowerCase()
    return getTaxpayerName(tp).toLowerCase().includes(s) || tp.ownerCode.toLowerCase().includes(s)
  }).slice(0, 8)

  const handleCashSave = async () => {
    if (!cashTp || !cashAmt) return
    setCashSaving(true)
    await new Promise(r => setTimeout(r, 500))
    const amt = parseFloat(cashAmt)
    const assess = cashTp.assessments.find(a => a.year === selectedYear)
    const allocLand = Math.min(amt, assess?.landAmount ?? 0)
    const allocSign = Math.min(amt - allocLand, assess?.signAmount ?? 0)
    addPayment({
      id: `pay${Date.now()}`, taxpayerId: cashTp.id, amount: amt,
      date: cashDate, method: 'cash', receiptNo: cashReceipt || undefined,
      allocatedLand: allocLand, allocatedSign: allocSign,
      recordedBy: currentUser?.id ?? 'u1'
    })
    setCashSaving(false); setCashSaved(true)
    showSuccessToast()
    setTimeout(() => { setCashSaved(false); setShowCashModal(false); setCashTp(null); setCashSearch(''); setCashAmt('') }, 1400)
  }

  return (
    <div style={{ padding: 24, maxWidth: 1300, position: 'relative' }}>

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
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#2d2545' }}>ตรวจสอบและบันทึกการชำระ</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#a89cc8' }}>ค้นหาจากยอดเงินที่รับมา หรือบันทึกการชำระเมื่อรู้จากชื่อผู้เสียภาษีแล้ว</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(240,236,251,0.4)', borderRadius: 14, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'search', label: 'ค้นหาจากยอดเงิน', icon: '🔍', sub: 'ไม่รู้ว่าใครโอนมา' },
          { key: 'direct', label: 'บันทึกการชำระ', icon: '✅', sub: 'รู้แล้วว่าใครชำระ' },
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
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                style={{ width: 200, fontSize: 18, fontWeight: 600, padding: '11px 16px' }} />
              <span style={{ fontSize: 14, color: '#a89cc8', whiteSpace: 'nowrap' }}>บาท</span>
            </div>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={LBL}>หรือค้นหาจากชื่อ / รหัส</label>
            <input className="input-field" placeholder="ชื่อ-นามสกุล หรือ Owner Code"
              value={nameSearch} onChange={e => setNameSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              style={{ width: 220 }} />
          </div>
          <button className="btn-primary" onClick={runSearch}
            style={{ alignSelf: 'flex-end', padding: '11px 28px', fontSize: 15 }}>
            🔍 ค้นหายอด
          </button>
        </div>

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
              <label style={LBL}>ประเภทบุคคล</label>
              <select className="input-field" style={{ width: 160 }} value={personTypeFilter} onChange={e => setPersonTypeFilter(e.target.value)}>
                <option value="all">ทุกประเภท</option>
                <option value="individual">บุคคลธรรมดา</option>
                <option value="company">นิติบุคคล / บริษัท</option>
              </select>
            </div>
          </div>
        )}

        {!isDirector && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#a89cc8' }}>
            🔒 ค้นหาภายในกลุ่ม <strong style={{ color: '#7c5cbf' }}>{currentUser?.group}</strong> ของคุณ
            · Director สามารถค้นหาทุกกลุ่มได้
          </div>
        )}
      </div>

      {/* Results */}
      {searched && (
        <div>
          {candidates.length === 0 ? (
            <div className="glass-card" style={{ padding: '32px 24px' }}>
              <EmptyState icon="🔍" title={`ไม่พบยอดภาษีที่ตรงหรือใกล้เคียงกับ ฿${searchedAmt}`}
                sub="ลองค้นหาจากชื่อหรือรหัสเจ้าของทรัพย์สิน" />
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button className="btn-secondary" onClick={() => { setAmtInput(''); setNameSearch(''); inputRef.current?.focus() }} style={{ fontSize: 13 }}>
                  ค้นหาจากชื่อหรือรหัส
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: drawerTp ? '1fr 380px' : '1fr', gap: 20, alignItems: 'start' }}>
              {/* Table */}
              <div>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>
                    พบ {candidates.length} รายการ{searchedAmt && ` ที่อาจตรงกับยอด ฿${searchedAmt} บาท`}
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
                          {['#', 'รหัส', 'ชื่อ', 'ประเภทภาษี', 'ปีภาษี', 'ยอดภาษี', 'ชำระแล้ว', 'ยอดคงเหลือ', 'ส่วนต่าง', 'สถานะ', ''].map(h => (
                            <th key={h} style={TH}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {candidates.map((c, i) => {
                          const { tp } = c
                          const assess = tp.assessments.find(a => a.year === selectedYear)
                          const assessed = getTotalAssessed(tp, selectedYear)
                          const remaining = getTotalRemaining(tp, selectedYear)
                          const paid = assessed - remaining
                          const taxType = [assess?.landAmount ? 'ที่ดินฯ' : null, assess?.signAmount ? 'ป้าย' : null].filter(Boolean).join('+')
                          const isSelected = drawerTp?.id === tp.id
                          const diffSign = c.diff >= 0 ? '+' : ''

                          return (
                            <tr key={tp.id}
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
                              <td style={{ ...TD, fontSize: 12, color: '#6b5b95' }}>{taxType || '-'}</td>
                              <td style={{ ...TD, fontSize: 12, color: '#a89cc8' }}>{selectedYear}</td>
                              <td style={{ ...TD, textAlign: 'right' }}>฿{formatCurrency(assessed)}</td>
                              <td style={{ ...TD, textAlign: 'right', color: '#1a8f5a' }}>฿{formatCurrency(paid)}</td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#c0392b' }}>฿{formatCurrency(remaining)}</td>
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
                              <td style={TD}><StatusBadge status={getPaymentStatus(tp, selectedYear)} size="sm" /></td>
                              <td style={TD}>
                                <button className="btn-primary"
                                  onClick={() => { setDrawerTp(tp); setPayDate(new Date().toISOString().slice(0, 10)); setPayRef(''); setPayReceipt(''); setPayMethod('transfer') }}
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
                <div className="glass-card" style={{ padding: '22px 22px', position: 'sticky', top: 76 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>ตรวจสอบผู้เสียภาษี</span>
                    <button onClick={() => setDrawerTp(null)} style={{
                      background: 'rgba(124,92,191,0.08)', border: 'none', borderRadius: 8,
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

                  {/* Tax summary */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#a89cc8', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>ข้อมูลภาษี ปี {selectedYear}</div>
                    {[
                      ['ยอดประเมิน', `฿${formatCurrency(getTotalAssessed(drawerTp, selectedYear))}`, '#2d2545'],
                      ['ชำระแล้ว', `฿${formatCurrency(getTotalAssessed(drawerTp, selectedYear) - drawerRemaining)}`, '#1a8f5a'],
                      ['ยอดคงเหลือ', `฿${formatCurrency(drawerRemaining)}`, '#c0392b'],
                    ].map(([l, v, c]) => (
                      <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(200,190,240,0.2)' }}>
                        <span style={{ fontSize: 12, color: '#a89cc8' }}>{l}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: String(c) }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Last follow-up */}
                  {(() => {
                    const lastFu = getLastFollowUp(drawerTp)
                    return lastFu ? (
                      <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(218,237,248,0.4)', borderRadius: 10, fontSize: 12 }}>
                        <div style={{ fontWeight: 600, color: '#3a5fbf', marginBottom: 6 }}>📞 การติดตามล่าสุด</div>
                        <div style={{ color: '#6b5b95' }}>{formatDateTime(lastFu.date)}</div>
                        <div style={{ color: '#6b5b95' }}>ผล: {CALL_RESULT_LABELS[lastFu.result ?? ''] ?? '-'}</div>
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
                    <button className="btn-primary" onClick={() => setShowPayModal(true)} style={{ width: '100%' }}>
                      ✅ ยืนยันว่าเป็นรายนี้
                    </button>
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
      {showPayModal && drawerTp && (
        <Modal title="ยืนยันการชำระ" onClose={() => setShowPayModal(false)} maxWidth="500px">
          {saved ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a8f5a' }}>บันทึกการชำระเรียบร้อยแล้ว</div>
              <div style={{ fontSize: 13, color: '#a89cc8', marginTop: 6 }}>อัปเดตยอดคงเหลือและสถานะแล้ว</div>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div style={{ padding: '14px 16px', background: 'rgba(240,236,251,0.5)', borderRadius: 12, marginBottom: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                <div><div style={SLIM}>ผู้เสียภาษี</div><div style={{ fontWeight: 700, color: '#2d2545' }}>{getTaxpayerName(drawerTp)}</div></div>
                <div><div style={SLIM}>ปีภาษี</div><div style={{ fontWeight: 700, color: '#2d2545' }}>{selectedYear}</div></div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={LBL}>วันที่ชำระ</label>
                  <input className="input-field" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div>
                  <label style={LBL}>ช่องทางการชำระ</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['transfer', '💳 โอน'], ['cash', '💵 สด']].map(([v, l]) => (
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
          )}
        </Modal>
      )}

      {/* Cash payment modal */}
      {showCashModal && (
        <Modal title="บันทึกชำระเงินสด" onClose={() => setShowCashModal(false)} maxWidth="480px">
          {cashSaved ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a8f5a' }}>บันทึกเรียบร้อยแล้ว</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={LBL}>ค้นหาผู้เสียภาษี (ชื่อ หรือ Owner Code)</label>
                <input className="input-field" placeholder="พิมพ์ชื่อหรือรหัส..." value={cashSearch}
                  onChange={e => { setCashSearch(e.target.value); setCashTp(null) }} autoFocus />
                {cashPool.length > 0 && !cashTp && (
                  <div style={{ marginTop: 4, background: 'white', border: '1px solid rgba(180,165,230,0.35)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(124,92,191,0.1)' }}>
                    {cashPool.map(tp => (
                      <button key={tp.id} onClick={() => { setCashTp(tp); setCashSearch(getTaxpayerName(tp)); setCashAmt(String(getTotalRemaining(tp, selectedYear))) }}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13, borderBottom: '1px solid rgba(200,190,240,0.2)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,92,191,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ fontWeight: 500, color: '#2d2545' }}>{getTaxpayerName(tp)}</span>
                        <span style={{ color: '#a89cc8', fontSize: 11, marginLeft: 8, fontFamily: 'monospace' }}>{tp.ownerCode}</span>
                        <span style={{ float: 'right', color: '#c0392b', fontWeight: 600 }}>฿{formatCurrency(getTotalRemaining(tp, selectedYear))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {cashTp && (
                <>
                  <div style={{ padding: '10px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>{getTaxpayerName(cashTp)}</div>
                    <div style={{ fontSize: 12, color: '#a89cc8' }}>ยอดคงเหลือ: <strong style={{ color: '#c0392b' }}>฿{formatCurrency(getTotalRemaining(cashTp, selectedYear))}</strong></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={LBL}>ยอดเงินที่รับ (บาท)</label>
                      <input className="input-field" type="number" step="0.01" value={cashAmt} onChange={e => setCashAmt(e.target.value)} />
                    </div>
                    <div>
                      <label style={LBL}>วันที่ชำระ</label>
                      <input className="input-field" type="date" value={cashDate} onChange={e => setCashDate(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={LBL}>เลขที่ใบเสร็จ</label>
                    <input className="input-field" placeholder="RC2569-..." value={cashReceipt} onChange={e => setCashReceipt(e.target.value)} />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowCashModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleCashSave} disabled={cashSaving || !cashTp || !cashAmt}>
                  {cashSaving ? '⏳...' : '💾 บันทึกการชำระ'}
                </button>
              </div>
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
  const { taxpayers, addPayment, currentUser, selectedYear } = useApp()
  const [search, setSearch] = useState('')
  const [personTypeFilter, setPersonTypeFilter] = useState('all')
  const [selectedTp, setSelectedTp] = useState<Taxpayer | null>(null)
  const [taxType, setTaxType] = useState<'both' | 'land' | 'sign'>('both')
  const [amt, setAmt] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState<'transfer' | 'cash'>('cash')
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
    if (personTypeFilter === 'individual' && tp.type !== 'individual') return false
    if (personTypeFilter === 'company' && tp.type !== 'company') return false
    if (!search) return false
    const s = search.toLowerCase()
    return getTaxpayerName(tp).toLowerCase().includes(s) || tp.ownerCode.toLowerCase().includes(s) || tp.phone.includes(s)
  }).filter(tp => getTotalRemaining(tp, selectedYear) > 0).slice(0, 8)

  const pick = (tp: Taxpayer) => {
    setSelectedTp(tp)
    setSearch(getTaxpayerName(tp))
    setShowSuggestions(false)
    setAmt(String(getTotalRemaining(tp, selectedYear)))
    // auto-detect tax type
    const a = tp.assessments.find(x => x.year === selectedYear)
    setTaxType((a?.landAmount ?? 0) > 0 && (a?.signAmount ?? 0) > 0 ? 'both' : (a?.landAmount ?? 0) > 0 ? 'land' : 'sign')
  }

  const remaining = selectedTp ? getTotalRemaining(selectedTp, selectedYear) : 0
  const payAmt = parseFloat(amt) || 0

  const handleSave = async () => {
    if (!selectedTp || !payAmt) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 500))
    const a = selectedTp.assessments.find(x => x.year === selectedYear)
    const allocLand = Math.min(payAmt, a?.landAmount ?? 0)
    const allocSign = Math.min(payAmt - allocLand, a?.signAmount ?? 0)
    addPayment({
      id: `pay${Date.now()}`, taxpayerId: selectedTp.id, amount: payAmt,
      date: payDate, method,
      refNo: method === 'transfer' ? refNo : undefined,
      receiptNo: method !== 'transfer' ? receiptNo : undefined,
      allocatedLand: allocLand, allocatedSign: allocSign,
      recordedBy: currentUser?.id ?? 'u1'
    })
    setSaving(false); setSaved(true)
    setToast(true)
    setTimeout(() => { setToast(false); setSaved(false); setSelectedTp(null); setSearch(''); setAmt(''); setRefNo(''); setReceiptNo('') }, 2000)
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

        {/* Person type filter */}
        <div style={{ marginBottom: 16 }}>
          <label style={LBL}>ประเภทบุคคล</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['all', 'ทุกประเภท'], ['individual', 'บุคคลธรรมดา'], ['company', 'นิติบุคคล']].map(([v, l]) => (
              <button key={v} onClick={() => setPersonTypeFilter(v)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                border: personTypeFilter === v ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                background: personTypeFilter === v ? 'rgba(124,92,191,0.1)' : 'transparent',
                color: personTypeFilter === v ? '#7c5cbf' : '#8873b5', fontFamily: "'Sarabun',sans-serif"
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Step 1: Search taxpayer */}
        <div style={{ marginBottom: 20 }} ref={dropRef}>
          <label style={LBL}>ค้นหาผู้เสียภาษี (ชื่อ / รหัสทรัพย์สิน / เบอร์โทร) *</label>
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
                    <span style={{ color: '#c0392b', fontWeight: 600 }}>คงเหลือ ฿{formatCurrency(getTotalRemaining(tp, selectedYear))} บาท</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedTp && (
          <>
            {/* Compact profile */}
            <div style={{ padding: '12px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 12, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#2d2545' }}>{getTaxpayerName(selectedTp)}</div>
                <div style={{ fontSize: 11, color: '#a89cc8', fontFamily: 'monospace' }}>{selectedTp.ownerCode} · {selectedTp.phone}</div>
                <div style={{ fontSize: 12, color: '#c0392b', fontWeight: 600, marginTop: 4 }}>ยอดคงเหลือ ฿{formatCurrency(remaining)} บาท</div>
              </div>
              <button onClick={() => { setSelectedTp(null); setSearch('') }} style={{ fontSize: 11, color: '#7c5cbf', background: 'none', border: '1px solid rgba(124,92,191,0.3)', borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontFamily: "'Sarabun',sans-serif" }}>เปลี่ยน</button>
            </div>

            {/* Tax type */}
            {(() => {
              const a = selectedTp.assessments.find(x => x.year === selectedYear)
              const hasLand = (a?.landAmount ?? 0) > 0
              const hasSign = (a?.signAmount ?? 0) > 0
              return hasLand && hasSign ? (
                <div style={{ marginBottom: 16 }}>
                  <label style={LBL}>ประเภทภาษีที่ชำระ</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['both', 'ทั้งสองประเภท'], ['land', 'ภาษีที่ดินฯ'], ['sign', 'ภาษีป้าย']].map(([k, l]) => (
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
                <input className="input-field" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
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
