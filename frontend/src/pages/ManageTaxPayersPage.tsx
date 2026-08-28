import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import type { Taxpayer } from '../types'

const nameOf = (tp: Taxpayer) => tp.type === 'company' ? tp.companyName ?? '' : `${tp.firstName} ${tp.lastName}`

export default function ManageTaxpayersPage() {
  const { taxpayers, currentUser, dataLoading, dataError, refreshData } = useApp()
  const navigate = useNavigate()
  const canWrite = currentUser != null
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 60
  const rows = useMemo(() => taxpayers.filter(tp => {
    if (currentUser?.role === 'officer' && tp.group !== currentUser.group) return false
    if (type !== 'all' && tp.type !== type) return false
    const q = search.trim().toLowerCase()
    return !q || nameOf(tp).toLowerCase().includes(q) || tp.ownerCode.toLowerCase().includes(q) || tp.phone.includes(q)
  }).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'th')), [taxpayers, currentUser, search, type])
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => setPage(1), [search, type, currentUser?.role, currentUser?.group])
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  return <div style={{ padding: 24, maxWidth: 1300 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
      <div><h2 style={{ margin: 0, fontSize: 20 }}>ทะเบียนผู้เสียภาษี</h2><div style={{ color: '#a89cc8', fontSize: 12, marginTop: 4 }}>{currentUser?.role === 'officer' ? `รายชื่อผู้เสียภาษีกลุ่ม ${currentUser.group}` : 'รายชื่อผู้เสียภาษีทุกกลุ่มรับผิดชอบ'}</div></div>
      {canWrite && <button className="btn-primary" onClick={() => navigate('/taxpayers/new')}>＋ ลงทะเบียนผู้เสียภาษีรายใหม่</button>}
    </div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <input className="input-field" placeholder="ค้นหาจากชื่อ รหัสเจ้าของทรัพย์สิน หรือหมายเลขโทรศัพท์" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 380 }} />
      <select className="input-field" value={type} onChange={e => setType(e.target.value)} style={{ width: 170 }}><option value="all">ทุกประเภทบุคคล</option><option value="individual">บุคคลธรรมดา</option><option value="company">นิติบุคคล</option></select>
      <span style={{ alignSelf: 'center', color: '#8873b5', fontSize: 12 }}>{rows.length} ราย</span>
    </div>
    {dataLoading && taxpayers.length === 0 ? (
      <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: '#6b5b95' }}>กำลังโหลดทะเบียนผู้เสียภาษี...</div>
    ) : dataError && taxpayers.length === 0 ? (
      <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: '#c0392b', marginBottom: 12 }}>{dataError}</div>
        <button className="btn-primary" onClick={() => void refreshData()}>โหลดข้อมูลอีกครั้ง</button>
      </div>
    ) : <>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(285px,1fr))', gap: 14 }}>
      {visibleRows.map(tp => <div key={tp.id} className="glass-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ width: 42, height: 42, borderRadius: 13, background: '#eee8fb', display: 'grid', placeItems: 'center', fontSize: 19 }}>{tp.type === 'company' ? '🏢' : '👤'}</div><div><div style={{ fontWeight: 700 }}>{nameOf(tp)}</div><div style={{ fontSize: 11, color: '#a89cc8' }}>{tp.ownerCode || 'นิติบุคคล'} · กลุ่ม {tp.group}</div></div></div>
        <div style={{ marginTop: 13, color: '#6b5b95', fontSize: 12, lineHeight: 1.8 }}>☎ {tp.phone || '-'}<br/>⌂ {tp.address || '-'}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(200,190,240,.25)' }}>
          <button className="btn-secondary" style={{ flex: 1, fontSize: 11 }} onClick={() => navigate(`/taxpayers/manage/${tp.id}`)}>ตรวจสอบรายละเอียด</button>
          {canWrite && <><button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => navigate(`/taxpayers/manage/${tp.id}?edit=1`)}>แก้ไข</button>
          <button className="btn-ghost" style={{ fontSize: 11, color: '#c0392b' }} onClick={() => navigate(`/taxpayers/manage/${tp.id}?delete=1`)}>ลบ</button></>}
        </div>
      </div>)}
    </div>
    {pageCount > 1 && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20 }}>
      <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>ก่อนหน้า</button>
      <span style={{ fontSize: 12, color: '#6b5b95' }}>หน้า {page} จาก {pageCount}</span>
      <button className="btn-secondary" disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>ถัดไป</button>
    </div>}
    </>}
  </div>
}
