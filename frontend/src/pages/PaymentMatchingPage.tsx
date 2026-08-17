import { useState } from 'react'
import { useApp } from '../context/AppContext'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import {
  getTaxpayerName, formatCurrency, formatDate, getTotalRemaining,
  getTotalAssessed, CURRENT_YEAR
} from '../data/mockData'
import type { Taxpayer, Payment } from '../types'

export default function PaymentMatchingPage() {
  const { taxpayers, addPayment, currentUser, selectedYear } = useApp()
  const [amtSearch, setAmtSearch] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [candidates, setCandidates] = useState<{ tp: Taxpayer; diff: number }[]>([])
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<Taxpayer | null>(null)
  const [payAmt, setPayAmt] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer')
  const [payRef, setPayRef] = useState('')
  const [payReceipt, setPayReceipt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSearch = () => {
    const amt = parseFloat(amtSearch)
    const name = nameSearch.toLowerCase()
    const pool = taxpayers.filter(tp => {
      if (currentUser?.role === 'officer' && tp.group !== currentUser.group) return false
      return getTotalRemaining(tp, selectedYear) > 0
    })
    const results = pool.filter(tp => {
      const remaining = getTotalRemaining(tp, selectedYear)
      if (amt > 0) {
        const diff = Math.abs(remaining - amt)
        return diff <= amt * 0.1 || remaining === amt
      }
      if (name) return getTaxpayerName(tp).toLowerCase().includes(name) || tp.ownerCode.toLowerCase().includes(name)
      return false
    }).map(tp => {
      const remaining = getTotalRemaining(tp, selectedYear)
      return { tp, diff: Math.abs(remaining - (parseFloat(amtSearch) || remaining)) }
    }).sort((a, b) => a.diff - b.diff).slice(0, 10)
    setCandidates(results)
    setSearched(true)
  }

  const handleConfirmPayment = async () => {
    if (!selected) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    const amt = parseFloat(payAmt) || 0
    const assess = selected.assessments.find(a => a.year === selectedYear)
    const allocLand = Math.min(amt, assess?.landAmount ?? 0)
    const allocSign = Math.min(amt - allocLand, assess?.signAmount ?? 0)
    const pay: Payment = {
      id: `pay${Date.now()}`, taxpayerId: selected.id, amount: amt,
      date: payDate, method: payMethod,
      refNo: payMethod === 'transfer' ? payRef : undefined,
      receiptNo: payMethod === 'cash' ? payReceipt : undefined,
      allocatedLand: allocLand, allocatedSign: allocSign,
      recordedBy: currentUser?.id ?? 'u1'
    }
    addPayment(pay)
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setSelected(null); setPayAmt(''); setPayRef(''); setPayReceipt('') }, 1500)
  }

  const selectedRemaining = selected ? getTotalRemaining(selected, selectedYear) : 0
  const payAmt_num = parseFloat(payAmt) || 0
  const toAllocate = Math.min(payAmt_num, selectedRemaining)
  const change = payAmt_num - toAllocate

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#2d2545' }}>ตรวจสอบและจับคู่การชำระ</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#a89cc8' }}>ค้นหาจากยอดเงิน หรือชื่อ/รหัสผู้เสียภาษี แล้วยืนยันการจับคู่</p>
      </div>

      {/* Search */}
      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={LBL}>ค้นหาจากยอดเงิน (บาท)</label>
            <input className="input-field" style={{ width: 180 }} type="number" step="0.01" placeholder="เช่น 101.00"
              value={amtSearch} onChange={e => setAmtSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          </div>
          <div style={{ fontSize: 13, color: '#a89cc8', paddingBottom: 10 }}>หรือ</div>
          <div style={{ flex: '0 0 auto' }}>
            <label style={LBL}>ค้นหาจากชื่อ / รหัส</label>
            <input className="input-field" style={{ width: 220 }} placeholder="ชื่อ-นามสกุล หรือ Owner Code"
              value={nameSearch} onChange={e => setNameSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          </div>
          <button className="btn-primary" onClick={handleSearch} style={{ marginBottom: 0, alignSelf: 'flex-end' }}>
            🔍 ค้นหา
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(200,190,240,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>ผลการค้นหา</span>
            <span style={{ fontSize: 12, color: '#a89cc8' }}>{candidates.length} รายการ</span>
          </div>
          {candidates.length === 0 ? (
            <EmptyState icon="🔍" title="ไม่พบรายการที่ตรงกัน" sub="ลองเปลี่ยนยอดเงินหรือชื่อที่ค้นหา" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(240,236,251,0.5)' }}>
                    {['ชื่อ','รหัส','ประเภทภาษี','ยอดที่ต้องจ่าย','ยอดคงเหลือ','ส่วนต่าง','สถานะ',''].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map(({ tp, diff }) => {
                    const assess = tp.assessments.find(a => a.year === selectedYear)
                    const remaining = getTotalRemaining(tp, selectedYear)
                    const taxTypes = [assess?.landAmount ? 'ที่ดินฯ' : null, assess?.signAmount ? 'ป้าย' : null].filter(Boolean).join(' + ')
                    return (
                      <tr key={tp.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(200,190,240,0.15)' }}>
                        <td style={TD}><span style={{ fontWeight: 500, color: '#2d2545' }}>{getTaxpayerName(tp)}</span></td>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#7c5cbf' }}>{tp.ownerCode}</td>
                        <td style={{ ...TD, fontSize: 12, color: '#6b5b95' }}>{taxTypes}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>฿{formatCurrency(getTotalAssessed(tp, selectedYear))}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#c0392b' }}>฿{formatCurrency(remaining)}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {diff < 1 ? (
                            <span className="status-badge" style={{ background: '#e8fdf4', color: '#1a8f5a', fontSize: 11 }}>ตรงพอดี</span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#8a5a00' }}>฿{formatCurrency(diff)}</span>
                          )}
                        </td>
                        <td style={TD}><StatusBadge status="unpaid" size="sm" /></td>
                        <td style={TD}>
                          <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => { setSelected(tp); setPayAmt(String(remaining)) }}>
                            เลือก
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
      )}

      {/* Confirm Payment Modal */}
      {selected && (
        <Modal title="ยืนยันการจับคู่และบันทึกชำระ" onClose={() => setSelected(null)} maxWidth="500px">
          {saved ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, color: '#1a8f5a', fontSize: 16 }}>บันทึกการชำระเรียบร้อย</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 16px', background: 'rgba(124,92,191,0.06)', borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#a89cc8' }}>ผู้เสียภาษีที่เลือก</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#2d2545' }}>{getTaxpayerName(selected)}</div>
                <div style={{ fontSize: 12, color: '#a89cc8', fontFamily: 'monospace' }}>{selected.ownerCode}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={LBL}>ยอดเงินที่ได้รับ (บาท) *</label>
                  <input className="input-field" type="number" step="0.01" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
                </div>
                <div>
                  <label style={LBL}>วันที่ชำระ</label>
                  <input className="input-field" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LBL}>วิธีชำระ</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['transfer', '💳 โอนเงิน'], ['cash', '💵 เงินสด']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setPayMethod(v as 'transfer' | 'cash')} style={{
                      flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13,
                      border: payMethod === v ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                      background: payMethod === v ? 'rgba(124,92,191,0.1)' : 'transparent', color: payMethod === v ? '#7c5cbf' : '#6b5b95', fontWeight: 500
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              {payMethod === 'transfer' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>Reference No.</label>
                  <input className="input-field" placeholder="TRF..." value={payRef} onChange={e => setPayRef(e.target.value)} />
                </div>
              )}
              {payMethod === 'cash' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={LBL}>Receipt No.</label>
                  <input className="input-field" placeholder="RC2569-..." value={payReceipt} onChange={e => setPayReceipt(e.target.value)} />
                </div>
              )}
              {payAmt_num > 0 && (
                <div style={{ marginBottom: 20, padding: '14px', background: 'rgba(240,236,251,0.5)', borderRadius: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {[
                    ['ยอดที่ต้องจ่าย', `฿${formatCurrency(selectedRemaining)}`],
                    ['รับเงินจริง', `฿${formatCurrency(payAmt_num)}`],
                    ['นำไปตัดภาษี', `฿${formatCurrency(toAllocate)}`],
                    ['ส่วนต่าง', `฿${formatCurrency(change)}`],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: 11, color: '#a89cc8' }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setSelected(null)}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleConfirmPayment} disabled={saving || !payAmt}>
                  {saving ? '⏳...' : '✅ ยืนยันการชำระ'}
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
const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b5b95', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,190,240,0.25)', fontSize: 12 }
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
