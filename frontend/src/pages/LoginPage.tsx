import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import takhliLogo from '../takhli_logo.jpeg'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login } = useApp()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (loading) return

    setLoading(true)
    setError('')

    try {
      const ok = await login(username.trim(), password)

      if (ok) {
        navigate('/dashboard')
        return
      }

      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'ไม่สามารถเข้าสู่ระบบได้'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at 30% 20%, rgba(196,181,240,0.35) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(218,237,248,0.4) 0%, transparent 55%), #f8f7ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative backgrounds */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: '10%',
          left: '8%',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(196,181,240,0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          right: '10%',
          bottom: '12%',
          width: 360,
          height: 360,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(218,237,248,0.3) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <main
        style={{
          width: '100%',
          maxWidth: 420,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src={takhliLogo}
            alt="โลโก้เทศบาลเมืองตาคลี"
            style={{
              display: 'block',
              width: 82,
              height: 82,
              margin: '0 auto 16px',
              borderRadius: 22,
              objectFit: 'cover',
              objectPosition: 'center',
              boxShadow: '0 8px 22px rgba(75, 58, 120, 0.16)',
            }}
          />

          <h1
            style={{
              margin: '0 0 6px',
              fontSize: 22,
              fontWeight: 700,
              color: '#2d2545',
            }}
          >
            ระบบบริหารการชำระภาษีท้องถิ่น
          </h1>

          <p style={{ margin: 0, fontSize: 14, color: '#a89cc8' }}>
            กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ
          </p>
        </div>

        {/* Login card */}
        <div className="glass-card" style={{ padding: '36px 40px' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="login-username"
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#6b5b95',
                }}
              >
                Username
              </label>

              <input
                id="login-username"
                className="input-field"
                type="text"
                placeholder="ชื่อผู้ใช้"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (error) setError('')
                }}
                autoComplete="username"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#6b5b95',
                }}
              >
                Password
              </label>

              <input
                id="login-password"
                className="input-field"
                type="password"
                placeholder="รหัสผ่าน"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  background: '#fff1f0',
                  border: '1px solid rgba(192,57,43,0.2)',
                  borderRadius: 10,
                  fontSize: 13,
                  color: '#c0392b',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <button
              className="btn-primary"
              type="submit"
              disabled={loading || !username.trim() || !password}
              style={{
                width: '100%',
                padding: 13,
                fontSize: 15,
                cursor: loading ? 'wait' : 'pointer',
                opacity:
                  loading || !username.trim() || !password
                    ? 0.65
                    : 1,
              }}
            >
              {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}