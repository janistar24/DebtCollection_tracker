import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import type { Taxpayer } from '../types'
import { getMonthlyPaymentReport } from '../api/reports'

const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท'] as const
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export default function ReportPage() {
  const { taxpayers, users, currentUser, selectedYear } = useApp()
  const isDirector = currentUser?.role === 'director' || currentUser?.role === 'admin'
  const today = new Date().toISOString().slice(0, 10)
  const [groupFilter, setGroupFilter] = useState(isDirector ? 'all' : (currentUser?.group ?? 'all'))
  const [statusFilter, setStatusFilter] = useState('all')
  const [taxTypeFilter, setTaxTypeFilter] = useState('all')
  const [personTypeFilter, setPersonTypeFilter] = useState('all')
  const [monthlyPayments, setMonthlyPayments] = useState(
    MONTHS.map(month => ({ month, land: 0, sign: 0 }))
  )

  const filtered = useMemo(() => taxpayers.filter(tp => {
    if (!tp.assessments.some(a => a.year === selectedYear)) return false
    if (!isDirector && tp.group !== currentUser?.group) return false
    if (groupFilter !== 'all' && tp.group !== groupFilter) return false
    if (statusFilter !== 'all' && getPaymentStatus(tp, selectedYear) !== statusFilter) return false
    if (personTypeFilter !== 'all' && tp.type !== personTypeFilter) return false
    const assessment = tp.assessments.find(a => a.year === selectedYear)
    if (taxTypeFilter === 'land' && (assessment?.landAmount ?? 0) <= 0) return false
    if (taxTypeFilter === 'sign' && (assessment?.signAmount ?? 0) <= 0) return false
    return true
  }), [taxpayers, selectedYear, isDirector, currentUser, groupFilter, statusFilter, taxTypeFilter, personTypeFilter])

  const totalAssessed = filtered.reduce((sum, tp) => sum + getTotalAssessed(tp, selectedYear), 0)
  const totalRemaining = filtered.reduce((sum, tp) => sum + getTotalRemaining(tp, selectedYear), 0)
  const totalPaid = totalAssessed - totalRemaining
  const paidCount = filtered.filter(tp => getPaymentStatus(tp, selectedYear) === 'paid').length
  const partialCount = filtered.filter(tp => getPaymentStatus(tp, selectedYear) === 'partial').length
  const unpaidCount = filtered.filter(tp => getPaymentStatus(tp, selectedYear) === 'unpaid').length
  useEffect(() => {
    let cancelled = false
    void getMonthlyPaymentReport(selectedYear, groupFilter).then(rows => {
      if (!cancelled) {
        setMonthlyPayments(rows.map(row => ({
          month: MONTHS[row.month - 1],
          land: row.landAmount,
          sign: row.signAmount,
        })))
      }
    }).catch(error => console.error('โหลดกราฟยอดชำระรายเดือนไม่สำเร็จ:', error))
    return () => { cancelled = true }
  }, [selectedYear, groupFilter])

  const currentMonth = new Date().toISOString().slice(0, 7)
  const paidThisMonth = filtered.filter(tp => tp.payments.some(payment => payment.date.startsWith(currentMonth))).length
  const statusData = [
    { name: 'ชำระครบ', value: paidCount, color: '#6f4db5' },
    { name: 'ชำระบางส่วน', value: partialCount, color: '#c3b2ef' },
    { name: 'ยังไม่ชำระ', value: unpaidCount, color: '#ef999b' },
  ]
  const groupLabel = groupFilter === 'all' ? 'ทุกกลุ่ม' : `กลุ่ม ${groupFilter}`
  const officer = groupFilter === 'all' ? 'ผู้รับผิดชอบทุกคน' : users.find(user => user.id === filtered[0]?.responsibleOfficer)?.name ?? currentUser?.name ?? '-'

  return <div style={{ padding: 24, maxWidth: 1200 }}>
    <div className="glass-card no-print" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {isDirector && <Filter label="กลุ่มผู้รับผิดชอบ" value={groupFilter} setValue={setGroupFilter} options={[['all','ทุกกลุ่ม'],...GROUPS.map(g => [g,`กลุ่ม ${g}`])]} />}
      <Filter label="สถานะ" value={statusFilter} setValue={setStatusFilter} options={[['all','ทุกสถานะ'],['unpaid','ยังไม่ชำระ'],['partial','ชำระบางส่วน'],['paid','ชำระครบ']]} />
      <Filter label="ประเภทภาษี" value={taxTypeFilter} setValue={setTaxTypeFilter} options={[['all','ทุกประเภท'],['land','ที่ดินและสิ่งปลูกสร้าง'],['sign','ภาษีป้าย']]} />
      <Filter label="ประเภทบุคคล" value={personTypeFilter} setValue={setPersonTypeFilter} options={[['all','ทุกประเภท'],['individual','บุคคลธรรมดา'],['company','นิติบุคคล / บริษัท']]} />
      <button className="btn-primary" onClick={() => window.print()} style={{ marginLeft: 'auto', fontSize: 13 }}>🖨 พิมพ์รายงาน / Export PDF</button>
    </div>

    <div className="print-only" style={{ marginBottom: 20, borderBottom: '2px solid #111', paddingBottom: 14 }}>
      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#000' }}>เทศบาล / องค์การบริหารส่วนตำบล</div>
      <div style={{ textAlign: 'center', fontSize: 17, fontWeight: 800, color: '#000', margin: 6 }}>รายงานสรุปผลการติดตามและจัดเก็บภาษี ประจำปี {selectedYear}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#333' }}><span>ปีภาษี: <b>{selectedYear}</b> · {groupLabel}</span><span>วันที่ออกรายงาน: <b>{formatDate(today)}</b> · ผู้จัดทำ: <b>{currentUser?.name}</b></span></div>
    </div>

    <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '18px 20px', marginBottom: 14, borderRadius: 16, color: '#fff', background: 'linear-gradient(135deg,#7048b3,#9a7ad1)' }}>
      <div><div style={{ fontSize: 11, opacity: .82 }}>ภาพรวมกลุ่มที่เลือก · ปีภาษี {selectedYear}</div><div style={{ fontSize: 25, fontWeight: 800, marginTop: 4 }}>{groupLabel}</div></div>
      <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}><Meta label="ผู้รับผิดชอบ" value={officer} /><Meta label="ผู้เสียภาษีในกลุ่ม" value={`${filtered.length} ราย`} /><Meta label="อัปเดตล่าสุด" value={formatDate(today)} /></div>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 14 }}>
      <Kpi label="ยอดภาษีทั้งหมด" value={`฿${formatCurrency(totalAssessed)}`} color="#2d2545" /><Kpi label="รับชำระแล้ว" value={`฿${formatCurrency(totalPaid)}`} color="#1a8f5a" /><Kpi label="ยอดคงเหลือ" value={`฿${formatCurrency(totalRemaining)}`} color="#c0392b" /><Kpi label="ผู้ที่ยังมียอดค้าง" value={`${partialCount + unpaidCount} ราย`} color="#7c5cbf" />
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(300px,.65fr)', gap: 14, marginBottom: 18 }}>
      <div className="glass-card" style={{ padding: '18px 20px', minWidth: 0 }}>
        <div style={TITLE}>ยอดรับชำระรายเดือน แยกตามประเภทภาษี</div><div style={SUB}>เปรียบเทียบยอดของภาษีแต่ละประเภทในเดือนเดียวกัน (บาท)</div>
        <div style={{ width: '100%', height: 280 }}><ResponsiveContainer><BarChart data={monthlyPayments} margin={{ top: 8, right: 8, left: 6 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(180,165,210,.25)" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8873b5' }} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: '#8873b5' }} axisLine={false} tickLine={false} width={62} tickFormatter={value => Number(value).toLocaleString('th-TH')} label={{ value: 'บาท', angle: -90, position: 'insideLeft', fill: '#8873b5', fontSize: 11 }} /><Tooltip formatter={(value, name) => [`฿${formatCurrency(Number(value))}`, name]} contentStyle={{ fontFamily: "'Sarabun',sans-serif", fontSize: 12, borderRadius: 10 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="land" name="ภาษีที่ดินฯ" fill="#7c5cbf" radius={[5,5,0,0]} maxBarSize={26} /><Bar dataKey="sign" name="ภาษีป้าย" fill="#b9a6eb" radius={[5,5,0,0]} maxBarSize={26} /></BarChart></ResponsiveContainer></div>
      </div>
      <div className="glass-card" style={{ padding: '18px 20px', minWidth: 0 }}>
        <div style={TITLE}>สถานะการชำระของผู้เสียภาษี</div><div style={SUB}>จำนวนคน แยกตามสถานะปัจจุบัน</div>
        <div style={{ width: '100%', height: 205, position: 'relative' }}><ResponsiveContainer><PieChart><Pie data={statusData} dataKey="value" innerRadius="52%" outerRadius="82%" paddingAngle={2}>{statusData.map(item => <Cell key={item.name} fill={item.color} stroke="none" />)}</Pie><Tooltip formatter={(value, name) => [`${value} ราย`, name]} /></PieChart></ResponsiveContainer><div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', fontSize: 15, fontWeight: 700 }}>{filtered.length} ราย</div></div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#6b5b95' }}>{statusData.map(item => <span key={item.name}><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: item.color, marginRight: 5 }} />{item.name} <b>{item.value}</b></span>)}</div>
        <div style={{ borderTop: '1px solid rgba(200,190,240,.25)', marginTop: 16, paddingTop: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}><span>มีผู้ชำระเข้ามาเดือนนี้</span><b style={{ color: '#7c5cbf', fontSize: 19 }}>{paidThisMonth} ราย</b></div><div style={{ height: 8, background: '#eee9f8', borderRadius: 99, overflow: 'hidden', marginTop: 7 }}><div style={{ width: `${filtered.length ? paidThisMonth / filtered.length * 100 : 0}%`, height: '100%', background: '#7c5cbf' }} /></div></div>
      </div>
    </section>

    <div className="glass-card no-print" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(200,190,240,.25)', display: 'flex', justifyContent: 'space-between' }}><b>รายละเอียดผู้เสียภาษี</b><span style={{ fontSize: 12, color: '#a89cc8' }}>{filtered.length} รายการ · ตารางนี้ไม่พิมพ์ใน Report</span></div>{filtered.length === 0 ? <EmptyState icon="📊" title="ไม่มีข้อมูลในช่วงนี้" /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr style={{ background: 'rgba(240,236,251,.5)' }}>{['#','รหัส','ชื่อ','ประเภทภาษี','ยอดประเมิน','ยอดชำระ','ยอดคงเหลือ','ผู้รับผิดชอบ','สถานะ'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{filtered.map((tp, i) => { const a=tp.assessments.find(x=>x.year===selectedYear); const assessed=getTotalAssessed(tp,selectedYear); const remaining=getTotalRemaining(tp,selectedYear); const taxTypes=[a?.landAmount?'ที่ดินฯ':null,a?.signAmount?'ป้าย':null].filter(Boolean).join('+'); return <tr key={tp.id} style={{ borderBottom:'1px solid rgba(200,190,240,.15)' }}><td style={TD}>{i+1}</td><td style={{...TD,fontFamily:'monospace',fontSize:11,color:'#7c5cbf'}}>{tp.ownerCode}</td><td style={TD}>{getTaxpayerName(tp)}</td><td style={TD}>{taxTypes||'-'}</td><td style={{...TD,textAlign:'right'}}>฿{formatCurrency(assessed)}</td><td style={{...TD,textAlign:'right',color:'#1a8f5a'}}>฿{formatCurrency(assessed-remaining)}</td><td style={{...TD,textAlign:'right',color:remaining?'#c0392b':'#1a8f5a'}}>฿{formatCurrency(remaining)}</td><td style={TD}>{users.find(user => user.id === tp.responsibleOfficer)?.name??'-'}</td><td style={TD}><StatusBadge status={getPaymentStatus(tp,selectedYear)} size="sm" /></td></tr> })}</tbody><tfoot><tr style={{background:'rgba(240,236,251,.5)',fontWeight:700}}><td colSpan={4} style={TD}>รวม {filtered.length} ราย</td><td style={{...TD,textAlign:'right'}}>฿{formatCurrency(totalAssessed)}</td><td style={{...TD,textAlign:'right',color:'#1a8f5a'}}>฿{formatCurrency(totalPaid)}</td><td style={{...TD,textAlign:'right',color:'#c0392b'}}>฿{formatCurrency(totalRemaining)}</td><td colSpan={2} /></tr></tfoot></table></div>}</div>
  </div>
}

function Filter({label,value,setValue,options}:{label:string,value:string,setValue:(v:string)=>void,options:string[][]}) { return <div><label style={LBL}>{label}</label><select className="input-field" style={{width:150}} value={value} onChange={e=>setValue(e.target.value)}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div> }
function Meta({label,value}:{label:string,value:string}) { return <div><div style={{fontSize:11,opacity:.8}}>{label}</div><b style={{fontSize:14}}>{value}</b></div> }
function Kpi({label,value,color}:{label:string,value:string,color:string}) { return <div className="glass-card" style={{padding:'15px 16px'}}><div style={{fontSize:11,color:'#9184ac',marginBottom:5}}>{label}</div><div style={{fontSize:20,fontWeight:800,color,whiteSpace:'nowrap'}}>{value}</div></div> }

// ฟังก์ชันด้านล่างคำนวณจาก Taxpayer ที่ AppContext โหลดจาก Backend API เท่านั้น
function getTaxpayerName(tp: Taxpayer) {
  return tp.type === 'company' ? (tp.companyName ?? '') : `${tp.firstName} ${tp.lastName}`.trim()
}

function paymentsForYear(tp: Taxpayer, taxYear: number) {
  return tp.payments.filter(payment => payment.taxYear === taxYear)
}

function getTotalAssessed(tp: Taxpayer, taxYear: number) {
  const assessment = tp.assessments.find(item => item.year === taxYear)
  return (assessment?.landAmount ?? 0) + (assessment?.signAmount ?? 0)
}

function getTotalRemaining(tp: Taxpayer, taxYear: number) {
  const assessment = tp.assessments.find(item => item.year === taxYear)
  if (!assessment) return 0
  const payments = paymentsForYear(tp, taxYear)
  const landPaid = payments.reduce((sum, payment) => sum + payment.allocatedLand, 0)
  const signPaid = payments.reduce((sum, payment) => sum + payment.allocatedSign, 0)
  return Math.max(0, assessment.landAmount - landPaid) + Math.max(0, assessment.signAmount - signPaid)
}

function getPaymentStatus(tp: Taxpayer, taxYear: number): 'paid' | 'partial' | 'unpaid' {
  const assessed = getTotalAssessed(tp, taxYear)
  if (assessed === 0) return 'paid'
  const remaining = getTotalRemaining(tp, taxYear)
  if (remaining === 0) return 'paid'
  return remaining < assessed ? 'partial' : 'unpaid'
}

function formatCurrency(value: number) {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(date: string) {
  if (!date) return '-'
  const [yearText, monthText, dayText] = date.split('T')[0].split('-')
  const year = Number(yearText)
  const displayYear = year < 2400 ? year + 543 : year
  const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
  return `${Number(dayText)} ${monthNames[Number(monthText) - 1]} ${displayYear}`
}

const TITLE:React.CSSProperties={fontSize:14,fontWeight:700,color:'#2d2545'}
const SUB:React.CSSProperties={fontSize:11,color:'#a89cc8',margin:'4px 0 14px'}
const LBL:React.CSSProperties={display:'block',fontSize:12,fontWeight:600,color:'#6b5b95',marginBottom:6}
const TH:React.CSSProperties={padding:'10px 14px',textAlign:'left',fontWeight:600,color:'#6b5b95',whiteSpace:'nowrap',fontSize:12}
const TD:React.CSSProperties={padding:'10px 14px',verticalAlign:'middle'}
