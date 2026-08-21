import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import type { Taxpayer } from '../types'

const nameOf = (tp: Taxpayer) => tp.type === 'company' ? tp.companyName ?? '' : `${tp.firstName} ${tp.lastName}`

export default function ManageTaxpayersPage() {
  const { taxpayers, currentUser } = useApp()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const rows = useMemo(() => taxpayers.filter(tp => {
    if (currentUser?.role === 'officer' && tp.group !== currentUser.group) return false
    if (type !== 'all' && tp.type !== type) return false
    const q = search.trim().toLowerCase()
    return !q || nameOf(tp).toLowerCase().includes(q) || tp.ownerCode.toLowerCase().includes(q) || tp.phone.includes(q)
  }).sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'th')), [taxpayers, currentUser, search, type])

  return <div style={{ padding: 24, maxWidth: 1300 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
      <div><h2 style={{ margin: 0, fontSize: 20 }}>จัดการผู้เสียภาษี</h2><div style={{ color: '#a89cc8', fontSize: 12, marginTop: 4 }}>{currentUser?.role === 'officer' ? `รายชื่อกลุ่ม ${currentUser.group}` : 'รายชื่อผู้เสียภาษีทุกกลุ่ม'}</div></div>
      <button className="btn-primary" onClick={() => navigate('/taxpayers/new')}>＋ เพิ่มผู้เสียภาษีรายใหม่</button>
    </div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <input className="input-field" placeholder="ค้นหาชื่อ รหัส หรือเบอร์โทร" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 380 }} />
      <select className="input-field" value={type} onChange={e => setType(e.target.value)} style={{ width: 170 }}><option value="all">ทุกประเภทบุคคล</option><option value="individual">บุคคลธรรมดา</option><option value="company">นิติบุคคล</option></select>
      <span style={{ alignSelf: 'center', color: '#8873b5', fontSize: 12 }}>{rows.length} ราย</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(285px,1fr))', gap: 14 }}>
      {rows.map(tp => <div key={tp.id} className="glass-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ width: 42, height: 42, borderRadius: 13, background: '#eee8fb', display: 'grid', placeItems: 'center', fontSize: 19 }}>{tp.type === 'company' ? '🏢' : '👤'}</div><div><div style={{ fontWeight: 700 }}>{nameOf(tp)}</div><div style={{ fontSize: 11, color: '#a89cc8' }}>{tp.ownerCode || 'นิติบุคคล'} · กลุ่ม {tp.group}</div></div></div>
        <div style={{ marginTop: 13, color: '#6b5b95', fontSize: 12, lineHeight: 1.8 }}>☎ {tp.phone || '-'}<br/>⌂ {tp.address || '-'}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(200,190,240,.25)' }}>
          <button className="btn-secondary" style={{ flex: 1, fontSize: 11 }} onClick={() => navigate(`/taxpayers/manage/${tp.id}`)}>ดูรายละเอียด</button>
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => navigate(`/taxpayers/manage/${tp.id}?edit=1`)}>แก้ไข</button>
          <button className="btn-ghost" style={{ fontSize: 11, color: '#c0392b' }} onClick={() => navigate(`/taxpayers/manage/${tp.id}?delete=1`)}>ลบ</button>
        </div>
      </div>)}
    </div>
  </div>
}
