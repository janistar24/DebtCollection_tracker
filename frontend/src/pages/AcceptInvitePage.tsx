import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { acceptInvitation, validateInvitation, type InvitationDetails } from '../api/users'

export default function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [details, setDetails] = useState<InvitationDetails | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!token) { setError('ลิงก์คำเชิญไม่ถูกต้อง'); setLoading(false); return }
    validateInvitation(token).then(value => { if (!cancelled) setDetails(value) }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'ไม่สามารถตรวจสอบคำเชิญได้')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password !== confirmPassword) return setError('รหัสผ่านที่ยืนยันไม่ตรงกัน')
    setBusy(true)
    setError('')
    try {
      await acceptInvitation(token, username.trim(), password)
      navigate('/login', { replace: true })
    } catch (e) { setError(e instanceof Error ? e.message : 'ไม่สามารถตั้งค่าบัญชีได้') }
    finally { setBusy(false) }
  }

  return <div style={{ minHeight: '100vh', background: '#f8f7ff', display: 'grid', placeItems: 'center', padding: 24 }}>
    <div className="glass-card" style={{ width: '100%', maxWidth: 460, padding: '32px 36px' }}>
      <h1 style={{ margin: '0 0 5px', fontSize: 23, color: '#302747' }}>ตั้งค่าบัญชีผู้ใช้งาน</h1>
      <p style={{ color: '#8f82b1', margin: '0 0 22px', fontSize: 13 }}>ระบบบริหารภาษี เทศบาลเมืองตาคลี</p>
      {loading ? <p>กำลังตรวจสอบคำเชิญ...</p> : details ? <>
        <div style={{ background: '#f5f1ff', padding: 13, borderRadius: 11, marginBottom: 20, color: '#594484' }}>
          <strong>{details.name}</strong><br />{details.email}
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 15 }}>
          <label>ชื่อผู้ใช้งาน<input className="input-field" autoComplete="username" required minLength={3} maxLength={64} value={username} onChange={e => setUsername(e.target.value)} placeholder="อักษรอังกฤษหรือตัวเลข" /></label>
          <label>รหัสผ่าน<input className="input-field" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} placeholder="อย่างน้อย 12 ตัวอักษร" /></label>
          <label>ยืนยันรหัสผ่าน<input className="input-field" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
          {error && <div role="alert" style={{ color: '#b42318', fontSize: 13 }}>{error}</div>}
          <button className="btn-primary" disabled={busy || password.length < 12}>{busy ? 'กำลังบันทึก...' : 'ตั้งค่าบัญชี'}</button>
        </form>
      </> : <><div role="alert" style={{ color: '#b42318', marginBottom: 18 }}>{error}</div><Link to="/login">กลับหน้าเข้าสู่ระบบ</Link></>}
    </div>
  </div>
}
