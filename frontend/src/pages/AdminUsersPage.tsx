import { useState } from 'react'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import type { User } from '../types'
import { createUser, setUserActive, updateUserRecord } from '../api/users'

const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท']
const ROLE_MAP: Record<string, string> = { officer: 'พนักงาน', director: 'ผู้บริหาร', admin: 'แอดมิน' }

export default function AdminUsersPage() {
  const { users, addUser, updateUser } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState({ code: '', name: '', username: '', password: '', role: 'officer', group: 'ก-น', active: true })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const openAdd = () => {
    setEditUser(null)
    setForm({ code: '', name: '', username: '', password: '', role: 'officer', group: 'ก-น', active: true })
    setShowModal(true)
  }
  const openEdit = (u: User) => {
    setEditUser(u)
    setForm({ code: u.code, name: u.name, username: u.username ?? '', password: '', role: u.role, group: u.group ?? 'ก-น', active: u.active })
    setShowModal(true)
  }

  const handleSave = async () => {
    const parts = form.name.trim().split(/\s+/)
    const firstName = parts.shift() ?? ''
    const lastName = parts.join(' ')
    if (!firstName || !lastName) return alert('กรุณากรอกชื่อและนามสกุล')
    if (!editUser && form.password.length < 6) return alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
    const payload = {
      employee_code: form.code.trim(), first_name: firstName, last_name: lastName,
      username: form.username.trim(), password: form.password || undefined,
      role: form.role.toUpperCase(), group_code: form.role === 'officer' ? form.group : null,
      is_active: form.active,
    }
    try {
      setSaving(true)
      if (editUser) {
        await updateUserRecord(Number(editUser.id), payload)
        updateUser({ ...editUser, code: form.code, name: form.name, username: form.username,
          role: form.role as User['role'], active: form.active,
          group: form.role === 'officer' ? form.group : undefined })
      } else {
        const id = await createUser({ ...payload, password: form.password })
        addUser({ id, code: form.code, name: form.name, username: form.username,
          role: form.role as User['role'], active: form.active,
          group: form.role === 'officer' ? form.group : undefined })
      }
      setSaved(true)
      setTimeout(() => { setSaved(false); setShowModal(false) }, 1200)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'บันทึกผู้ใช้งานไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  const handleToggleActive = async (u: User) => {
    try {
      await setUserActive(Number(u.id), !u.active)
      updateUser({ ...u, active: !u.active })
    } catch (error) {
      alert(error instanceof Error ? error.message : 'เปลี่ยนสถานะผู้ใช้งานไม่สำเร็จ')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: '#2d2545' }}>จัดการผู้ใช้งาน</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#a89cc8' }}>กำหนดสิทธิ์และกลุ่มรับผิดชอบของพนักงาน</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>➕ เพิ่มผู้ใช้งาน</button>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {users.length === 0 ? (
          <EmptyState icon="👥" title="ยังไม่มีผู้ใช้งาน" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(240,236,251,0.5)' }}>
                {['รหัสพนักงาน', 'ชื่อ', 'สิทธิ์', 'กลุ่มที่รับผิดชอบ', 'สถานะ', ''].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(200,190,240,0.15)', opacity: u.active ? 1 : 0.55 }}>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, color: '#7c5cbf' }}>{u.code}</td>
                  <td style={{ ...TD, fontWeight: 500, color: '#2d2545' }}>{u.name}</td>
                  <td style={TD}><StatusBadge status={u.role} size="sm" /></td>
                  <td style={{ ...TD, color: '#6b5b95' }}>{u.role === 'officer' ? `กลุ่ม ${u.group ?? '-'}` : '—'}</td>
                  <td style={TD}><StatusBadge status={u.active ? 'active' : 'inactive'} size="sm" /></td>
                  <td style={{ ...TD, display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => openEdit(u)}>แก้ไข</button>
                    <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px', color: u.active ? '#c0392b' : '#1a8f5a' }} onClick={() => handleToggleActive(u)}>
                      {u.active ? 'ปิดการใช้งาน' : 'เปิดใช้งาน'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title={editUser ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'} onClose={() => setShowModal(false)}>
          {saved ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 600, color: '#1a8f5a' }}>บันทึกเรียบร้อย</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={LBL}>รหัสพนักงาน *</label>
                    <input className="input-field" placeholder="EMP001" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} disabled={!!editUser} />
                  </div>
                  <div>
                    <label style={LBL}>ชื่อ-นามสกุล *</label>
                    <input className="input-field" placeholder="ชื่อเต็ม" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={LBL}>Username *</label>
                    <input className="input-field" placeholder="username" value={form.username}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                  </div>
                  <div>
                    <label style={LBL}>{editUser ? 'รหัสผ่านใหม่ (ไม่เปลี่ยนให้เว้นว่าง)' : 'รหัสผ่าน *'}</label>
                    <input className="input-field" type="password" placeholder="อย่างน้อย 6 ตัวอักษร" value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={LBL}>สิทธิ์ (Role)</label>
                    <select className="input-field" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                      <option value="officer">พนักงาน</option>
                      <option value="director">ผู้บริหาร</option>
                      <option value="admin">แอดมิน</option>
                    </select>
                  </div>
                  {form.role === 'officer' && (
                    <div>
                      <label style={LBL}>กลุ่มที่รับผิดชอบ</label>
                      <select className="input-field" value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))}>
                        {GROUPS.map(g => <option key={g} value={g}>กลุ่ม {g}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>ยกเลิก</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving || !form.code || !form.name || !form.username || (!editUser && form.password.length < 6)}>
                  {saving ? '⏳...' : '💾 บันทึก'}
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
