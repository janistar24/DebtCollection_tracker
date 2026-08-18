import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useApp()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)
  setError('')

  try {
    const ok = await login(username, password)

    if (ok) {
      navigate('/dashboard')
    } else {
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    }
    } catch (error) {
      setError('ไม่สามารถเข้าสู่ระบบได้')
    } finally {
      setLoading(false)
    }
  }
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 30% 20%, rgba(196,181,240,0.35) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(218,237,248,0.4) 0%, transparent 55%), #f8f7ff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      {/* decorative blobs */}
      <div style={{ position: 'fixed', top: '10%', left: '8%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(196,181,240,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '12%', right: '10%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(218,237,248,0.3) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative' }}>
        {/* header card */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg,#7c5cbf,#9b7dd4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(124,92,191,0.3)'
          }}>🏛</div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#2d2545' }}>ระบบบริหารการชำระภาษีท้องถิ่น</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#a89cc8' }}>กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ</p>
        </div>

        <div className="glass-card" style={{ padding: '36px 40px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6b5b95', marginBottom: 8 }}>Username</label>
              <input className="input-field" type="text" placeholder="ชื่อผู้ใช้"
                value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6b5b95', marginBottom: 8 }}>Password</label>
              <input className="input-field" type="password" placeholder="รหัสผ่าน"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff1f0', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 10, fontSize: 13, color: '#c0392b' }}>
                ⚠️ {error}
              </div>
            )}
            <button className="btn-primary" type="submit" style={{ width: '100%', padding: '13px', fontSize: 15 }} disabled={loading}>
              {loading ? '⏳ กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
