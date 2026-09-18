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
  const [submitted, setSubmitted] = useState(false)

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
    const cleanUsername = username.trim()
    if (!cleanUsername) return setError('กรุณากรอกชื่อผู้ใช้งาน')
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(cleanUsername)) return setError('ชื่อผู้ใช้งานต้องเป็นอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง จำนวน 3–64 ตัวอักษร')
    if (password.length < 12) return setError(`รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร (ขาดอีก ${12 - password.length} ตัว)`)
    if (!confirmPassword) return setError('กรุณากรอกยืนยันรหัสผ่าน')
    if (password !== confirmPassword) return setError('รหัสผ่านที่ยืนยันไม่ตรงกัน')
    setBusy(true)
    setError('')
    try {
      await acceptInvitation(token, cleanUsername, password)
      setSubmitted(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'ไม่สามารถตั้งค่าบัญชีได้') }
    finally { setBusy(false) }
  }

  return <div style={{ minHeight: '100vh', background: '#f8f7ff', display: 'grid', placeItems: 'center', padding: 24 }}>
    <div className="glass-card" style={{ width: '100%', maxWidth: 460, padding: '32px 36px' }}>
      <h1 style={{ margin: '0 0 5px', fontSize: 23, color: '#302747' }}>ตั้งค่าบัญชีผู้ใช้งาน</h1>
      <p style={{ color: '#8f82b1', margin: '0 0 22px', fontSize: 13 }}>ระบบบริหารภาษี เทศบาลเมืองตาคลี</p>
      {submitted ? <div style={{ textAlign: 'center', padding: '12px 0' }}><div style={{ fontSize: 38 }}>✅</div><h2 style={{ fontSize: 18, margin: '10px 0 6px' }}>ส่งคำขอใช้งานเรียบร้อยแล้ว</h2><p style={{ color: '#7e719c', fontSize: 13, lineHeight: 1.7 }}>กรุณารอผู้ดูแลระบบอนุมัติบัญชี แล้วจึงเข้าสู่ระบบด้วยชื่อผู้ใช้งานและรหัสผ่านที่กำหนดไว้</p><button type="button" className="btn-primary" onClick={() => navigate('/login', { replace: true })}>กลับหน้าเข้าสู่ระบบ</button></div> : loading ? <p>กำลังตรวจสอบคำเชิญ...</p> : details ? <>
        <div style={{ background: '#f5f1ff', padding: 13, borderRadius: 11, marginBottom: 20, color: '#594484' }}>
          <strong>{details.name}</strong><br />{details.email}
        </div>
        <form noValidate onSubmit={submit} style={{ display: 'grid', gap: 15 }}>
          <label>ชื่อผู้ใช้งาน<input className="input-field" autoComplete="username" maxLength={64} value={username} onChange={e => { setUsername(e.target.value); setError('') }} placeholder="อักษรอังกฤษหรือตัวเลข 3–64 ตัว" /><span style={{ display: 'block', color: '#9b8daf', fontSize: 11, marginTop: 4 }}>ใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง</span></label>
          <label>รหัสผ่าน<input className="input-field" type="password" autoComplete="new-password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} placeholder="อย่างน้อย 12 ตัวอักษร" /><span style={{ display: 'block', color: password.length > 0 && password.length < 12 ? '#9b6b00' : '#9b8daf', fontSize: 11, marginTop: 4 }}>{password.length < 12 ? `กรอกแล้ว ${password.length}/12 ตัวอักษร` : 'รหัสผ่านมีความยาวครบตามกำหนด'}</span></label>
          <label>ยืนยันรหัสผ่าน<input className="input-field" type="password" autoComplete="new-password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError('') }} />{confirmPassword && <span style={{ display: 'block', color: password === confirmPassword ? '#168653' : '#b42318', fontSize: 11, marginTop: 4 }}>{password === confirmPassword ? 'รหัสผ่านตรงกัน' : 'รหัสผ่านยังไม่ตรงกัน'}</span>}</label>
          {error && <div role="alert" style={{ color: '#b42318', fontSize: 13 }}>{error}</div>}
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'ตั้งค่าบัญชี'}</button>
        </form>
      </> : <><div role="alert" style={{ color: '#b42318', marginBottom: 18 }}>{error}</div><Link to="/login">กลับหน้าเข้าสู่ระบบ</Link></>}
    </div>
  </div>
}
