import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import takhliLogo from '../takhli_logo.jpeg'

const ROLE_MENUS: Record<string, { path: string; icon: string; label: string }[]> = {
  officer: [
    { path: '/dashboard', icon: '🏠', label: 'หน้าหลักและงานติดตามประจำวัน' },
    { path: '/taxpayers', icon: '📋', label: 'รายละเอียดผู้ชำระภาษี (กค.)' },
    { path: '/taxpayers/manage', icon: '👥', label: 'ทะเบียนผู้เสียภาษี' },
    { path: '/taxpayers/new', icon: '➕', label: 'ลงทะเบียนผู้เสียภาษีรายใหม่' },
    { path: '/search-payment', icon: '💳', label: 'ตรวจสอบยอดรับและบันทึกการชำระ' },
    { path: '/reports', icon: '📊', label: 'รายงานผลการจัดเก็บภาษี' },
  ],
  director: [
    { path: '/dashboard', icon: '🏠', label: 'หน้าหลักและภาพรวมการดำเนินงาน' },
    { path: '/taxpayers', icon: '📋', label: 'รายละเอียดผู้ชำระภาษี (กค.)' },
    { path: '/taxpayers/manage', icon: '👥', label: 'ทะเบียนผู้เสียภาษี' },
    { path: '/search-payment', icon: '💳', label: 'ตรวจสอบยอดรับและบันทึกการชำระ' },
    { path: '/reports', icon: '📊', label: 'รายงานผลการจัดเก็บภาษี' },
  ],
  admin: [
    { path: '/dashboard', icon: '🏠', label: 'หน้าหลักและภาพรวมการดำเนินงาน' },
    { path: '/taxpayers', icon: '📋', label: 'รายละเอียดผู้ชำระภาษี (กค.)' },
    { path: '/taxpayers/manage', icon: '👥', label: 'ทะเบียนผู้เสียภาษี' },
    { path: '/search-payment', icon: '💳', label: 'ตรวจสอบยอดรับและบันทึกการชำระ' },
    { path: '/reports', icon: '📊', label: 'รายงานผลการจัดเก็บภาษี' },
    { path: '/admin/users', icon: '👥', label: 'บริหารบัญชีผู้ใช้งาน' },
  ],
}

const ROLE_LABEL: Record<string, string> = {
  officer: 'เจ้าหน้าที่ผู้รับผิดชอบ', director: 'ผู้บริหาร', admin: 'ผู้ดูแลระบบ'
}

interface Props { collapsed: boolean; onToggle: () => void }

export default function Sidebar({ collapsed, onToggle }: Props) {
  const { currentUser, logout } = useApp()
  const location = useLocation()
  const menus = currentUser ? (ROLE_MENUS[currentUser.role] ?? []) : []

  return (
    <aside className="glass-sidebar no-print" style={{
      width: collapsed ? 64 : 240, height: '100vh', minHeight: '100vh', maxHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s ease', overflow: 'hidden', flexShrink: 0,
      position: 'sticky', top: 0, alignSelf: 'flex-start', zIndex: 10
    }}>
    {/* Logo */}
    <div
      style={{
        padding: collapsed ? '18px 0' : '18px 20px',
        borderBottom: '1px solid rgba(200,190,240,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 10,
        minHeight: 64,
      }}
    >
      <img
        src={takhliLogo}
        alt="โลโก้หน่วยงาน"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />

      {!collapsed && (
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#2d2545',
              lineHeight: 1.2,
            }}
          >
            ระบบบริหารภาษี
          </div>

          <div style={{ fontSize: 10, color: '#a89cc8' }}>
            ท้องถิ่น
          </div>
        </div>
      )}
    </div>

      {/* Toggle */}
      <button onClick={onToggle} style={{
        position: 'absolute', top: 20, right: collapsed ? 8 : 12,
        width: 24, height: 24, borderRadius: 6, background: 'rgba(124,92,191,0.1)',
        border: '1px solid rgba(180,165,230,0.3)', cursor: 'pointer',
        color: '#7c5cbf', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>{collapsed ? '›' : '‹'}</button>

      {/* Menu */}
      <nav style={{ flex: 1, minHeight: 0, padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
        {menus.map(m => {
          const active = location.pathname === m.path ||
            (m.path !== '/dashboard' && m.path !== '/taxpayers' && m.path !== '/taxpayers/new' && location.pathname.startsWith(`${m.path}/`))
          return (
            <Link key={m.path} to={m.path} className={`sidebar-item ${active ? 'active' : ''}`}
              style={{ justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '10px 0' : '10px 14px', marginBottom: 2 }}
              title={collapsed ? m.label : undefined}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{m.icon}</span>
              {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      {currentUser && (
        <div style={{ flexShrink: 0, padding: collapsed ? '12px 8px' : '12px 16px', borderTop: '1px solid rgba(200,190,240,0.2)', background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
          {!collapsed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
              <div style={{ fontSize: 11, color: '#a89cc8' }}>{ROLE_LABEL[currentUser.role]}{currentUser.group ? ` · กลุ่ม ${currentUser.group}` : ''}</div>
            </div>
          )}
          <button onClick={logout} className="btn-ghost" style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '8px 0' : '8px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {!collapsed && <span>ออกจากระบบ</span>}<span>➜]</span>
          </button>
        </div>
      )}
    </aside>
  )
}
