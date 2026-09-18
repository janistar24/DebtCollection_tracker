import { useState, type CSSProperties, type ReactNode } from 'react'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import type { User } from '../types'
import { createUser, createUserInvitation, deleteUser, resetUserPassword, setUserActive, updateUserRecord } from '../api/users'

const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท']
const ROLES = { officer: 'เจ้าหน้าที่ผู้รับผิดชอบ', director: 'ผู้บริหาร', admin: 'ผู้ดูแลระบบ' }
const EMPTY = { name: '', username: '', email: '', password: '', role: 'officer', group: 'ก-น', active: true }

export default function AdminUsersPage() {
  const { currentUser, users, addUser, updateUser, removeUser } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [createMode, setCreateMode] = useState<'password' | 'email'>('password')
  const [invitationLink, setInvitationLink] = useState('')
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [activeTarget, setActiveTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const notify = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text })
    window.setTimeout(() => setNotice(null), 4200)
  }
  const openAdd = () => { setEditUser(null); setForm(EMPTY); setCreateMode('password'); setShowForm(true) }
  const openEdit = (u: User) => {
    setEditUser(u)
    setForm({ name: u.name, username: u.username ?? '', email: u.email ?? '', password: '', role: u.role, group: u.group ?? 'ก-น', active: u.active })
    setShowForm(true)
  }

  const save = async () => {
    const parts = form.name.trim().split(/\s+/), firstName = parts.shift() ?? '', lastName = parts.join(' ')
    if (!firstName || !lastName) return notify('error', 'กรุณาระบุชื่อและนามสกุลให้ครบถ้วน')
    if (createMode === 'email' && !editUser && !form.email.trim()) return notify('error', 'กรุณาระบุอีเมลผู้รับคำเชิญ')
    if ((editUser || createMode === 'password') && !form.username.trim()) return notify('error', 'กรุณาระบุชื่อผู้ใช้งาน')
    if (!editUser && createMode === 'password' && form.password.length < 12) return notify('error', 'รหัสผ่านชั่วคราวต้องมีอย่างน้อย 12 ตัวอักษร')
    const payload = { first_name: firstName, last_name: lastName, username: form.username.trim(), email: form.email.trim() || null, password: form.password || undefined, role: form.role.toUpperCase(), group_code: form.role === 'officer' ? form.group : null, is_active: form.active }
    try {
      setBusy(true)
      if (editUser) {
        await updateUserRecord(Number(editUser.id), payload)
        updateUser({ ...editUser, name: `${firstName} ${lastName}`, username: payload.username, email: form.email.trim() || undefined, role: form.role as User['role'], group: form.role === 'officer' ? form.group : undefined, active: form.active })
        notify('success', 'ปรับปรุงข้อมูลบัญชีผู้ใช้งานเรียบร้อยแล้ว')
      } else if (createMode === 'email') {
        const link = await createUserInvitation({ first_name: firstName, last_name: lastName, email: form.email.trim(), role: payload.role, group_code: payload.group_code })
        setInvitationLink(link)
        notify('success', 'สร้างลิงก์คำเชิญเรียบร้อยแล้ว')
      } else {
        const created = await createUser({ ...payload, password: form.password })
        addUser({ id: created.id, code: created.code, name: `${firstName} ${lastName}`, username: payload.username, email: form.email.trim() || undefined, role: form.role as User['role'], group: form.role === 'officer' ? form.group : undefined, active: form.active })
        notify('success', 'สร้างบัญชีผู้ใช้งานเรียบร้อยแล้ว')
      }
      setShowForm(false)
    } catch (e) { notify('error', e instanceof Error ? e.message : 'ไม่สามารถบันทึกบัญชีผู้ใช้งานได้') }
    finally { setBusy(false) }
  }

  const resetPassword = async () => {
    if (!resetTarget || newPassword.length < 12) return
    try { setBusy(true); await resetUserPassword(Number(resetTarget.id), newPassword); setResetTarget(null); setNewPassword(''); notify('success', `รีเซ็ตรหัสผ่านของ ${resetTarget.username} เรียบร้อยแล้ว`) }
    catch (e) { notify('error', e instanceof Error ? e.message : 'ไม่สามารถรีเซ็ตรหัสผ่านได้') }
    finally { setBusy(false) }
  }
  const changeActive = async () => {
    if (!activeTarget) return
    const active = !activeTarget.active
    try { setBusy(true); await setUserActive(Number(activeTarget.id), active); updateUser({ ...activeTarget, active }); setActiveTarget(null); notify('success', `${active ? 'เปิด' : 'ปิด'}การใช้งานบัญชีเรียบร้อยแล้ว`) }
    catch (e) { notify('error', e instanceof Error ? e.message : 'ไม่สามารถเปลี่ยนสถานะบัญชีได้') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!deleteTarget) return
    try { setBusy(true); await deleteUser(Number(deleteTarget.id)); removeUser(deleteTarget.id); setDeleteTarget(null); notify('success', 'ลบบัญชีผู้ใช้งานเรียบร้อยแล้ว') }
    catch (e) { notify('error', e instanceof Error ? e.message : 'ไม่สามารถลบบัญชีผู้ใช้งานได้') }
    finally { setBusy(false) }
  }

  return <div style={{ padding: '24px 28px 36px', width: '100%', maxWidth: 1180 }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, marginBottom: 20, flexWrap: 'wrap' }}>
      <div><h2 style={{ margin: '0 0 4px', fontSize: 21 }}>จัดการผู้ใช้งาน</h2><p style={SUB}>สร้างบัญชี กำหนดสิทธิ์ และควบคุมกลุ่มข้อมูลที่ผู้ใช้งานรับผิดชอบ</p></div>
      <button className="btn-primary" onClick={openAdd}>＋ เพิ่มผู้ใช้งาน</button>
    </div>
    {notice && <div role="alert" style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 11, fontSize: 13.5, background: notice.type === 'success' ? '#ecf9f2' : '#fff1f0', border: `1px solid ${notice.type === 'success' ? '#b9e7ce' : '#f2c1bd'}`, color: notice.type === 'success' ? '#18794e' : '#b42318' }}>{notice.type === 'success' ? '✓' : '⚠'} {notice.text}</div>}

    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      {!users.length ? <EmptyState icon="👥" title="ยังไม่มีบัญชีผู้ใช้งาน" /> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 930 }}>
        <thead><tr style={{ background: 'rgba(240,236,251,.62)' }}>{['ชื่อผู้ใช้งาน', 'ชื่อ-นามสกุล', 'อีเมล', 'รหัสผ่าน', 'สิทธิ์การใช้งาน', 'กลุ่มที่รับผิดชอบ', 'สถานะ', 'ดำเนินการ'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{users.map(u => {
          const self = u.id === currentUser?.id
          return <tr key={u.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(200,190,240,.2)' }}>
            <td style={{ ...TD, fontFamily: 'monospace', color: '#6d4fbb', fontWeight: 600 }}>{u.username || '—'}</td>
            <td style={{ ...TD, fontWeight: 600 }}>{u.name}</td>
            <td style={{ ...TD, color: '#6b5b95' }}>{u.email || '—'}</td>
            <td style={TD}><span style={{ fontFamily: 'monospace', letterSpacing: 2, color: '#7b728e' }}>••••••••</span></td>
            <td style={TD}><StatusBadge status={u.role} size="sm" /></td>
            <td style={{ ...TD, color: '#6b5b95' }}>{u.role === 'officer' ? `กลุ่ม ${u.group ?? 'ยังไม่กำหนด'}` : 'ทุกกลุ่ม'}</td>
            <td style={TD}><StatusBadge status={u.active ? 'active' : 'inactive'} size="sm" /></td>
            <td style={TD}><div style={{ display: 'flex', gap: 3, whiteSpace: 'nowrap' }}>
              <button style={ACTION} onClick={() => openEdit(u)}>แก้ไข</button>
              <button style={ACTION} onClick={() => { setResetTarget(u); setNewPassword('') }}>รีเซ็ตรหัสผ่าน</button>
              <button style={{ ...ACTION, color: u.active ? '#a55b16' : '#168653' }} disabled={self} title={self ? 'ไม่สามารถปิดบัญชีที่กำลังใช้งานอยู่' : ''} onClick={() => setActiveTarget(u)}>{u.active ? 'ปิดการใช้งาน' : 'เปิดใช้งาน'}</button>
              <button style={{ ...ACTION, color: '#c0392b' }} disabled={self} title={self ? 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่' : ''} onClick={() => setDeleteTarget(u)}>ลบบัญชี</button>
            </div></td>
          </tr>
        })}</tbody>
      </table></div>}
    </div>

    {showForm && <Modal title={editUser ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'} onClose={() => !busy && setShowForm(false)} maxWidth="650px">
      <p style={SUB}>กำหนดข้อมูลบัญชีและขอบเขตสิทธิ์ให้สอดคล้องกับหน้าที่รับผิดชอบ</p>
      {!editUser && <div style={{ display: 'flex', gap: 8, marginTop: 15 }}><button className={createMode === 'password' ? 'btn-primary' : 'btn-secondary'} onClick={() => setCreateMode('password')}>กำหนดรหัสผ่านให้</button><button className={createMode === 'email' ? 'btn-primary' : 'btn-secondary'} onClick={() => setCreateMode('email')}>สร้างลิงก์คำเชิญ</button></div>}
      <div style={{ display: 'grid', gap: 15, marginTop: 16 }}>
        <Field label="ชื่อ-นามสกุล *"><input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <div style={GRID}>{(editUser || createMode === 'password') && <Field label="ชื่อผู้ใช้งาน *"><input className="input-field" autoComplete="off" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></Field>}<Field label={`อีเมล ${!editUser && createMode === 'email' ? '*' : '(ไม่บังคับ)'}`}><input className="input-field" type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field></div>
        {!editUser && createMode === 'password' && <Field label="รหัสผ่านชั่วคราว *"><input className="input-field" type="password" autoComplete="new-password" placeholder="อย่างน้อย 12 ตัวอักษร" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>}
        <div style={GRID}><Field label="สิทธิ์การใช้งาน *"><select className="input-field" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="officer">เจ้าหน้าที่ผู้รับผิดชอบ</option><option value="director">ผู้บริหาร</option><option value="admin">ผู้ดูแลระบบ</option></select></Field>{form.role === 'officer' && <Field label="กลุ่มที่รับผิดชอบ *"><select className="input-field" value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>{GROUPS.map(g => <option key={g} value={g}>กลุ่ม {g}</option>)}</select></Field>}</div>
        <div style={INFO}>{form.role === 'officer' ? 'เจ้าหน้าที่จะเข้าถึงข้อมูลเฉพาะกลุ่มที่ได้รับมอบหมาย' : `${ROLES[form.role as keyof typeof ROLES]}สามารถเข้าถึงข้อมูลภาพรวมของทุกกลุ่ม`}</div>
      </div>
      <Actions busy={busy} disabled={!form.name.trim() || ((editUser || createMode === 'password') && !form.username.trim()) || (!editUser && createMode === 'password' && form.password.length < 12) || (!editUser && createMode === 'email' && !form.email.trim())} confirm={editUser ? 'บันทึกการแก้ไข' : createMode === 'email' ? 'สร้างลิงก์คำเชิญ' : 'บันทึกบัญชี'} cancel={() => setShowForm(false)} run={save} />
    </Modal>}

    {invitationLink && <Modal title="สร้างลิงก์คำเชิญเรียบร้อยแล้ว" onClose={() => setInvitationLink('')} maxWidth="620px">
      <p style={SUB}>คัดลอกลิงก์ด้านล่างแล้วส่งให้ผู้ใช้งานโดยตรง ลิงก์ใช้ได้ครั้งเดียวและหมดอายุภายใน 48 ชั่วโมง</p>
      <div style={{ display: 'flex', gap: 9, marginTop: 16, alignItems: 'stretch' }}>
        <input className="input-field" readOnly value={invitationLink} onFocus={e => e.currentTarget.select()} />
        <button className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={async () => { await navigator.clipboard.writeText(invitationLink); notify('success', 'คัดลอกลิงก์คำเชิญแล้ว') }}>คัดลอกลิงก์</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}><button className="btn-primary" onClick={() => setInvitationLink('')}>เสร็จสิ้น</button></div>
    </Modal>}

    {resetTarget && <Modal title="รีเซ็ตรหัสผ่าน" onClose={() => !busy && setResetTarget(null)}><p style={SUB}>กำหนดรหัสผ่านชั่วคราวใหม่สำหรับ <strong>{resetTarget.username}</strong></p><div style={{ marginTop: 16 }}><Field label="รหัสผ่านชั่วคราวใหม่ *"><input className="input-field" autoFocus type="password" autoComplete="new-password" placeholder="อย่างน้อย 12 ตัวอักษร" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></Field></div><Actions busy={busy} disabled={newPassword.length < 12} confirm="ยืนยันการรีเซ็ต" cancel={() => setResetTarget(null)} run={resetPassword} /></Modal>}

    {activeTarget && <Modal title={`${activeTarget.active ? 'ปิด' : 'เปิด'}การใช้งานบัญชี`} onClose={() => !busy && setActiveTarget(null)}><p style={SUB}>ต้องการ{activeTarget.active ? 'ระงับ' : 'อนุญาต'}การเข้าใช้งานของ <strong>{activeTarget.name}</strong> ({activeTarget.username}) ใช่หรือไม่</p>{activeTarget.active && <div style={{ ...INFO, marginTop: 16, background: '#fff8e9', color: '#875d13' }}>ผู้ใช้งานจะไม่สามารถเข้าสู่ระบบได้ แต่ข้อมูลและประวัติการดำเนินงานจะยังคงอยู่</div>}<Actions busy={busy} danger={activeTarget.active} confirm={`ยืนยัน${activeTarget.active ? 'ปิด' : 'เปิด'}การใช้งาน`} cancel={() => setActiveTarget(null)} run={changeActive} /></Modal>}

    {deleteTarget && <Modal title="ยืนยันการลบบัญชีผู้ใช้งาน" onClose={() => !busy && setDeleteTarget(null)}><div style={DANGER}><strong>คำเตือน: การดำเนินการนี้ไม่สามารถย้อนกลับได้</strong><br />ระบบจะลบบัญชี <strong>{deleteTarget.username}</strong> ของ {deleteTarget.name} ออกจากฐานข้อมูลอย่างถาวร</div><p style={{ ...SUB, marginTop: 13 }}>ประวัติการติดต่อ การรับชำระ และการประเมินภาษีจะยังคงอยู่ เพื่อรองรับการตรวจสอบย้อนหลัง</p><Actions busy={busy} danger confirm="ยืนยันลบบัญชีถาวร" cancel={() => setDeleteTarget(null)} run={remove} /></Modal>}
  </div>
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label><span style={LABEL}>{label}</span>{children}</label> }
function Actions({ busy, disabled, danger, confirm, cancel, run }: { busy: boolean; disabled?: boolean; danger?: boolean; confirm: string; cancel: () => void; run: () => void }) { return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}><button className="btn-secondary" disabled={busy} onClick={cancel}>ยกเลิก</button><button className={danger ? 'btn-secondary' : 'btn-primary'} style={danger ? { color: '#fff', background: '#c0392b', borderColor: '#c0392b' } : undefined} disabled={busy || disabled} onClick={run}>{busy ? 'กำลังดำเนินการ...' : confirm}</button></div> }

const SUB: CSSProperties = { margin: 0, fontSize: 13.5, color: '#8f82b1', lineHeight: 1.65 }
const LABEL: CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
const TH: CSSProperties = { padding: '11px 13px', textAlign: 'left', fontWeight: 600, color: '#6b5b95', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,190,240,.3)', fontSize: 12 }
const TD: CSSProperties = { padding: '11px 13px', verticalAlign: 'middle' }
const ACTION: CSSProperties = { border: 0, background: 'transparent', color: '#6d4fbb', padding: '6px 7px', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 12 }
const GRID: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }
const INFO: CSSProperties = { padding: '11px 13px', borderRadius: 11, background: '#f7f4ff', color: '#6b5b95', fontSize: 12.5 }
const DANGER: CSSProperties = { padding: '14px 16px', borderRadius: 11, background: '#fff1f0', border: '1px solid #efbbb7', color: '#9f1d17', fontSize: 13.5, lineHeight: 1.7 }
