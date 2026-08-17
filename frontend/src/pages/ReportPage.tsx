import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import {
  getTaxpayerName, formatCurrency, formatDate, getTotalAssessed,
  getTotalRemaining, getPaymentStatus, getFollowStatus, getUserById,
  getLandRemaining, getSignRemaining, getLastFollowUp
} from '../data/mockData'

const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท'] as const

export default function ReportPage() {
  const { taxpayers, currentUser, selectedYear } = useApp()
  const isDirector = currentUser?.role === 'director' || currentUser?.role === 'admin'
  const today = new Date().toISOString().slice(0, 10)

  const [groupFilter, setGroupFilter] = useState(isDirector ? 'all' : (currentUser?.group ?? 'all'))
  const [statusFilter, setStatusFilter] = useState('all')
  const [taxTypeFilter, setTaxTypeFilter] = useState('all')
  const [personTypeFilter, setPersonTypeFilter] = useState('all')

  const filtered = useMemo(() => {
    return taxpayers.filter(tp => {
      if (!isDirector && tp.group !== currentUser?.group) return false
      if (groupFilter !== 'all' && tp.group !== groupFilter) return false
      if (statusFilter !== 'all' && getPaymentStatus(tp, selectedYear) !== statusFilter) return false
      if (personTypeFilter === 'individual' && tp.type !== 'individual') return false
      if (personTypeFilter === 'company' && tp.type !== 'company') return false
      if (taxTypeFilter === 'land') {
        const a = tp.assessments.find(x => x.year === selectedYear)
        return (a?.landAmount ?? 0) > 0
      }
      if (taxTypeFilter === 'sign') {
        const a = tp.assessments.find(x => x.year === selectedYear)
        return (a?.signAmount ?? 0) > 0
      }
      return true
    })
  }, [taxpayers, groupFilter, statusFilter, taxTypeFilter, personTypeFilter, selectedYear, currentUser, isDirector])

  // Totals for Section A
  const totalAssessed = filtered.reduce((s, tp) => s + getTotalAssessed(tp, selectedYear), 0)
  const totalRemaining = filtered.reduce((s, tp) => s + getTotalRemaining(tp, selectedYear), 0)
  const totalPaid = totalAssessed - totalRemaining
  const paidCount = filtered.filter(tp => getPaymentStatus(tp, selectedYear) === 'paid').length
  const unpaidCount = filtered.filter(tp => getPaymentStatus(tp, selectedYear) !== 'paid').length
  const paidPct = totalAssessed > 0 ? Math.round(totalPaid / totalAssessed * 100) : 0

  const landTotal = filtered.reduce((s, tp) => { const a = tp.assessments.find(x => x.year === selectedYear); return s + (a?.landAmount ?? 0) }, 0)
  const signTotal = filtered.reduce((s, tp) => { const a = tp.assessments.find(x => x.year === selectedYear); return s + (a?.signAmount ?? 0) }, 0)
  const landRemaining = filtered.reduce((s, tp) => s + getLandRemaining(tp, selectedYear), 0)
  const signRemaining = filtered.reduce((s, tp) => s + getSignRemaining(tp, selectedYear), 0)
  const landPaid = landTotal - landRemaining
  const signPaid = signTotal - signRemaining
  const landPct = landTotal > 0 ? Math.round(landPaid / landTotal * 100) : 0
  const signPct = signTotal > 0 ? Math.round(signPaid / signTotal * 100) : 0

  // Section B — group stats
  const groupStats = GROUPS.map(g => {
    const tps = taxpayers.filter(tp => tp.group === g && !!tp.assessments.find(a => a.year === selectedYear))
    const officer = tps[0] ? getUserById(tps[0].responsibleOfficer) : undefined
    const totalRem = tps.reduce((s, tp) => s + getTotalRemaining(tp, selectedYear), 0)
    const totalAss = tps.reduce((s, tp) => s + getTotalAssessed(tp, selectedYear), 0)
    const paidG = tps.filter(tp => getPaymentStatus(tp, selectedYear) === 'paid').length
    const unpaidG = tps.filter(tp => getPaymentStatus(tp, selectedYear) !== 'paid').length
    const noFollow = tps.filter(tp => getFollowStatus(tp) === 'none' && getPaymentStatus(tp, selectedYear) !== 'paid').length
    const contacted = unpaidG - noFollow
    const thisMonth = new Date().toISOString().slice(0, 7)
    const paidThisMonth = tps.filter(tp => tp.payments.some(p => p.date.startsWith(thisMonth))).length
    return { group: g, tps, officer, totalRem, totalAss, paidG, unpaidG, noFollow, contacted, paidThisMonth, total: tps.length }
  }).filter(g => isDirector || g.group === currentUser?.group)

  const reportTitle = (() => {
    if (statusFilter === 'unpaid') return `รายงานผู้ยังไม่ชำระภาษี ประจำปี ${selectedYear}`
    if (statusFilter === 'paid') return `รายงานผู้ชำระภาษีครบแล้ว ประจำปี ${selectedYear}`
    return `รายงานสรุปผลการติดตามและจัดเก็บภาษี ประจำปี ${selectedYear}`
  })()

  const handlePrint = () => window.print()

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>

      {/* ── Filter bar (no-print) ── */}
      <div className="glass-card no-print" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {isDirector && (
          <div>
            <label style={LBL}>กลุ่ม</label>
            <select className="input-field" style={{ width: 130 }} value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
              <option value="all">ทุกกลุ่ม</option>
              {GROUPS.map(g => <option key={g} value={g}>กลุ่ม {g}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={LBL}>สถานะ</label>
          <select className="input-field" style={{ width: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">ทุกสถานะ</option>
            <option value="unpaid">ยังไม่ชำระ</option>
            <option value="partial">ชำระบางส่วน</option>
            <option value="paid">ชำระครบ</option>
          </select>
        </div>
        <div>
          <label style={LBL}>ประเภทภาษี</label>
          <select className="input-field" style={{ width: 150 }} value={taxTypeFilter} onChange={e => setTaxTypeFilter(e.target.value)}>
            <option value="all">ทุกประเภท</option>
            <option value="land">ที่ดินและสิ่งปลูกสร้าง</option>
            <option value="sign">ภาษีป้าย</option>
          </select>
        </div>
        <div>
          <label style={LBL}>ประเภทบุคคล</label>
          <select className="input-field" style={{ width: 150 }} value={personTypeFilter} onChange={e => setPersonTypeFilter(e.target.value)}>
            <option value="all">ทุกประเภท</option>
            <option value="individual">บุคคลธรรมดา</option>
            <option value="company">นิติบุคคล / บริษัท</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn-primary" onClick={handlePrint} style={{ fontSize: 13 }}>🖨 พิมพ์รายงาน / Export PDF</button>
        </div>
      </div>

      {/* ── Print-only document header ── */}
      <div className="print-only" style={{ marginBottom: 20, borderBottom: '2px solid #111', paddingBottom: 14 }}>
        <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#000' }}>เทศบาล / องค์การบริหารส่วนตำบล</div>
        <div style={{ textAlign: 'center', fontSize: 17, fontWeight: 800, color: '#000', margin: '6px 0' }}>{reportTitle}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#333', marginTop: 8 }}>
          <span>ปีภาษี: <strong>{selectedYear}</strong> &nbsp; กลุ่ม: <strong>{groupFilter === 'all' ? 'ทุกกลุ่ม' : `กลุ่ม ${groupFilter}`}</strong></span>
          <span>วันที่ออกรายงาน: <strong>{formatDate(today)}</strong> &nbsp; ผู้จัดทำ: <strong>{currentUser?.name}</strong></span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* SECTION A — ภาพรวมการจัดเก็บภาษี             */}
      {/* ══════════════════════════════════════════════ */}
      <div className="glass-card" style={{ padding: '22px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2545', marginBottom: 16 }}>ภาพรวมการจัดเก็บภาษี</div>

        {/* Big number row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 16, marginBottom: 16, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, color: '#a89cc8' }}>ยอดภาษีที่ต้องจัดเก็บทั้งหมด</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#2d2545' }}>฿{formatCurrency(totalAssessed)} บาท</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a89cc8' }}>ผู้เสียภาษีทั้งหมด</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2d2545' }}>{filtered.length} ราย</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a89cc8' }}>ชำระครบแล้ว</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a8f5a' }}>{paidCount} ราย</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a89cc8' }}>ยังไม่ชำระ</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#c0392b' }}>{unpaidCount} ราย</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#a89cc8' }}>อัตราจัดเก็บ</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#7c5cbf' }}>{paidPct}%</div>
          </div>
        </div>

        {/* Overall progress */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 18, borderRadius: 99, background: '#f0ecfb', overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#7c5cbf,#9b7dd4)', width: `${paidPct}%`, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#7c5cbf', fontWeight: 600 }}>รับชำระแล้ว ฿{formatCurrency(totalPaid)} บาท ({paidPct}%)</span>
            <span style={{ color: '#c0392b', fontWeight: 600 }}>ยอดคงเหลือ ฿{formatCurrency(totalRemaining)} บาท ({100 - paidPct}%)</span>
          </div>
        </div>

        {/* Sub-bars by tax type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {[
            { label: 'ภาษีที่ดินและสิ่งปลูกสร้าง', total: landTotal, paid: landPaid, remaining: landRemaining, pct: landPct, color: '#3a5fbf' },
            { label: 'ภาษีป้าย', total: signTotal, paid: signPaid, remaining: signRemaining, pct: signPct, color: '#7c5cbf' },
          ].map(t => (
            <div key={t.label} style={{ padding: '14px 16px', background: 'rgba(240,236,251,0.35)', borderRadius: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2d2545', marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: '#a89cc8', marginBottom: 8 }}>
                ฿{formatCurrency(t.paid)} / ฿{formatCurrency(t.total)} บาท · จัดเก็บแล้ว {t.pct}%
              </div>
              <div style={{ height: 8, borderRadius: 99, background: '#e8e0f8', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', borderRadius: 99, background: t.color, width: `${t.pct}%`, transition: 'width 0.4s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#a89cc8' }}>คงเหลือ ฿{formatCurrency(t.remaining)} บาท</div>
            </div>
          ))}
        </div>

        {/* Print-only B&W progress */}
        <div className="print-only" style={{ marginTop: 16, padding: '10px 12px', border: '1px solid #ccc' }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>อัตราการจัดเก็บรวม: {paidPct}%</div>
          <div style={{ height: 14, background: '#eee', border: '1px solid #999', position: 'relative' }}>
            <div style={{ width: `${paidPct}%`, height: '100%', background: '#555' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 3, color: '#333' }}>
            <span>รับชำระแล้ว ฿{formatCurrency(totalPaid)} บาท</span>
            <span>คงเหลือ ฿{formatCurrency(totalRemaining)} บาท</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* SECTION B — ภาพรวมแต่ละกลุ่ม                 */}
      {/* ══════════════════════════════════════════════ */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2545', marginBottom: 14 }}>ภาพรวมแต่ละกลุ่ม</div>
        <div style={{ display: 'grid', gridTemplateColumns: isDirector ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr', gap: 16 }}>
          {groupStats.map(g => {
            const collPct = g.totalAss > 0 ? Math.round((g.totalAss - g.totalRem) / g.totalAss * 100) : 0
            return (
            <div key={g.group} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Card header strip */}
              <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg, rgba(124,92,191,0.10) 0%, rgba(58,95,191,0.06) 100%)', borderBottom: '1px solid rgba(200,190,240,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#2d2545', letterSpacing: 0.2 }}>กลุ่ม {g.group}</div>
                  <div style={{ fontSize: 11, color: '#8873b5', marginTop: 2 }}>{g.officer?.name ?? '-'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#7c5cbf', lineHeight: 1 }}>{g.total}</div>
                  <div style={{ fontSize: 10, color: '#a89cc8' }}>ราย</div>
                </div>
              </div>

              <div style={{ padding: '14px 18px' }}>
                {/* Payment row */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {[
                    { label: 'ชำระครบ', val: g.paidG, color: '#1a8f5a', bg: 'rgba(26,143,90,0.08)', border: 'rgba(26,143,90,0.2)' },
                    { label: 'ยังไม่ชำระ', val: g.unpaidG, color: '#c0392b', bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.2)' },
                    { label: 'เดือนนี้', val: g.paidThisMonth, color: '#7c5cbf', bg: 'rgba(124,92,191,0.07)', border: 'rgba(124,92,191,0.2)' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, padding: '8px 6px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: s.color, opacity: 0.75, marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Contact row */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {[
                    { label: 'ติดต่อแล้ว', val: g.contacted, color: '#3a5fbf', bg: 'rgba(58,95,191,0.07)', border: 'rgba(58,95,191,0.18)' },
                    { label: 'ยังไม่ได้ติดต่อ', val: g.noFollow, color: g.noFollow > 0 ? '#8a5a00' : '#6b5b95', bg: g.noFollow > 0 ? 'rgba(230,160,0,0.08)' : 'rgba(240,236,251,0.5)', border: g.noFollow > 0 ? 'rgba(230,160,0,0.25)' : 'rgba(200,190,240,0.2)' },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, padding: '8px 6px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: s.color, opacity: 0.75, marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Collection rate mini-bar */}
                <div style={{ padding: '10px 12px', background: 'rgba(240,236,251,0.4)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                    <span style={{ color: '#6b5b95', fontWeight: 600 }}>อัตราจัดเก็บ {collPct}%</span>
                    <span style={{ color: '#a89cc8' }}>฿{formatCurrency(g.totalAss)} บาท</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: '#e8e0f8', overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#7c5cbf,#9b7dd4)', width: `${collPct}%`, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#1a8f5a', fontWeight: 600 }}>รับแล้ว ฿{formatCurrency(g.totalAss - g.totalRem)}</span>
                    <span style={{ color: '#c0392b', fontWeight: 600 }}>เหลือ ฿{formatCurrency(g.totalRem)}</span>
                  </div>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* Detail Table (web only, hidden in print)       */}
      {/* ══════════════════════════════════════════════ */}
      <div className="glass-card no-print" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(200,190,240,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#2d2545' }}>รายละเอียดผู้เสียภาษี</span>
          <span style={{ fontSize: 12, color: '#a89cc8' }}>{filtered.length} รายการ · ตารางนี้ไม่พิมพ์ใน Report</span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="📊" title="ไม่มีข้อมูลในช่วงนี้" />
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 420 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(240,236,251,0.5)', position: 'sticky', top: 0 }}>
                  {['#','รหัส','ชื่อ','ประเภทภาษี','ยอดประเมิน','ยอดชำระ','ยอดคงเหลือ','ผู้รับผิดชอบ','สถานะ'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tp, i) => {
                  const a = tp.assessments.find(x => x.year === selectedYear)
                  const assessed = getTotalAssessed(tp, selectedYear)
                  const remaining = getTotalRemaining(tp, selectedYear)
                  const paid = assessed - remaining
                  const officer = getUserById(tp.responsibleOfficer)
                  const taxTypes = [a?.landAmount ? 'ที่ดินฯ' : null, a?.signAmount ? 'ป้าย' : null].filter(Boolean).join('+')
                  return (
                    <tr key={tp.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(200,190,240,0.15)' }}>
                      <td style={TD}>{i + 1}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#7c5cbf' }}>{tp.ownerCode}</td>
                      <td style={{ ...TD, fontWeight: 500, color: '#2d2545' }}>{getTaxpayerName(tp)}</td>
                      <td style={{ ...TD, fontSize: 12, color: '#6b5b95' }}>{taxTypes || '-'}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>฿{formatCurrency(assessed)}</td>
                      <td style={{ ...TD, textAlign: 'right', color: '#1a8f5a' }}>฿{formatCurrency(paid)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: remaining > 0 ? '#c0392b' : '#1a8f5a' }}>฿{formatCurrency(remaining)}</td>
                      <td style={{ ...TD, fontSize: 12, color: '#6b5b95' }}>{officer?.name ?? '-'}</td>
                      <td style={TD}><StatusBadge status={getPaymentStatus(tp, selectedYear)} size="sm" /></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(240,236,251,0.5)', fontWeight: 700 }}>
                  <td colSpan={4} style={{ ...TD, color: '#7c5cbf' }}>รวม {filtered.length} ราย</td>
                  <td style={{ ...TD, textAlign: 'right' }}>฿{formatCurrency(totalAssessed)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#1a8f5a' }}>฿{formatCurrency(totalPaid)}</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#c0392b' }}>฿{formatCurrency(totalRemaining)}</td>
                  <td colSpan={2} style={TD}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const LBL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b5b95', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,190,240,0.25)', fontSize: 12 }
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
