import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import takhliLogo from '../takhli_logo.jpeg'

const ROLE_MENUS: Record<string, { path: string; icon: string; label: string }[]> = {
  officer: [
    { path: '/dashboard', icon: '🏠', label: 'หน้าหลัก / งานวันนี้' },
    { path: '/taxpayers', icon: '📋', label: 'ข้อมูลผู้เสียภาษีประจำปี' },
    { path: '/taxpayers/manage', icon: '👥', label: 'จัดการผู้เสียภาษีทั้งหมด' },
    { path: '/taxpayers/new', icon: '➕', label: 'เพิ่มผู้เสียภาษี' },
    { path: '/search-payment', icon: '💳', label: 'ตรวจสอบและบันทึกการชำระ' },
    { path: '/reports', icon: '📊', label: 'รายงาน' },
  ],
  director: [
    { path: '/dashboard', icon: '🏠', label: 'ภาพรวมระบบ' },
    { path: '/taxpayers', icon: '📋', label: 'ข้อมูลผู้เสียภาษี' },
    { path: '/taxpayers/manage', icon: '👥', label: 'จัดการผู้เสียภาษีทั้งหมด' },
    { path: '/search-payment', icon: '💳', label: 'ตรวจสอบและบันทึกการชำระ' },
    { path: '/reports', icon: '📊', label: 'รายงาน' },
  ],
  admin: [
    { path: '/dashboard', icon: '🏠', label: 'หน้าหลัก' },
    { path: '/taxpayers', icon: '📋', label: 'ข้อมูลผู้เสียภาษี' },
    { path: '/taxpayers/manage', icon: '👥', label: 'จัดการผู้เสียภาษีทั้งหมด' },
    { path: '/search-payment', icon: '💳', label: 'ตรวจสอบและบันทึกการชำระ' },
    { path: '/reports', icon: '📊', label: 'รายงาน' },
    { path: '/admin/users', icon: '👥', label: 'จัดการผู้ใช้งาน' },
  ],
}

const ROLE_LABEL: Record<string, string> = {
  officer: 'พนักงาน', director: 'ผู้บริหาร', admin: 'แอดมิน'
}

interface Props { collapsed: boolean; onToggle: () => void }

export default function Sidebar({ collapsed, onToggle }: Props) {
  const { currentUser, logout } = useApp()
  const location = useLocation()
  const menus = currentUser ? (ROLE_MENUS[currentUser.role] ?? []) : []

  return (
    <aside className="glass-sidebar no-print" style={{
      width: collapsed ? 64 : 240, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s ease', overflow: 'hidden', flexShrink: 0, position: 'relative', zIndex: 10
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
              กองคลัง เทศบาลเมืองตาคลี
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
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
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
        <div style={{ padding: collapsed ? '12px 8px' : '12px 16px', borderTop: '1px solid rgba(200,190,240,0.2)' }}>
          {!collapsed && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
              <div style={{ fontSize: 11, color: '#a89cc8' }}>{ROLE_LABEL[currentUser.role]}{currentUser.group ? ` · กลุ่ม ${currentUser.group}` : ''}</div>
            </div>
          )}
          <button onClick={logout} className="btn-ghost" style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '8px 0' : '8px 10px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🚪</span>{!collapsed && <span>ออกจากระบบ</span>}
          </button>
        </div>
      )}
    </aside>
  )
}
