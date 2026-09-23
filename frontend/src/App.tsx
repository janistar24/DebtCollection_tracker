import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import { getAnnouncements, getReleaseId, type SystemAnnouncement } from './api/announcements'
import { saveOpenEditorsBeforeSystemUpdate } from './systemUpdate'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const TaxpayerListPage = lazy(() => import('./pages/TaxpayerListPage'))
const AddTaxpayerPage = lazy(() => import('./pages/AddTaxpayerPage'))
const TaxpayerDetailPage = lazy(() => import('./pages/TaxpayerDetailPage'))
const ReportPage = lazy(() => import('./pages/ReportPage'))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'))
const SearchPaymentPage = lazy(() => import('./pages/SearchPaymentPage'))
const ManageTaxpayersPage = lazy(() => import('./pages/ManageTaxPayersPage'))

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Page rendering failed:', error, info) }
  render() {
    if (!this.state.error) return this.props.children
    return <div className="app-fluid-page"><div className="glass-card" style={{ padding: 24, color: '#7a2830' }}><h2 style={{ margin: '0 0 8px', fontSize: 18 }}>ไม่สามารถแสดงหน้านี้ได้</h2><p style={{ margin: '0 0 16px', color: '#806e88', fontSize: 13 }}>พบข้อมูลบางรายการที่ไม่สมบูรณ์ กรุณาโหลดหน้าใหม่ หากยังพบปัญหาให้แจ้งข้อความด้านล่างแก่ผู้ดูแลระบบ</p><code style={{ display: 'block', padding: 12, borderRadius: 9, background: '#fff1f0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{this.state.error.message}</code><button type="button" className="btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>โหลดหน้าใหม่</button></div></div>
  }
}

function ProtectedLayout() {
  const { currentUser, logout } = useApp()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [maintenance, setMaintenance] = useState<SystemAnnouncement | null>(null)
  const [updateMessage, setUpdateMessage] = useState('')
  const baselineIds = useRef<Set<number> | null>(null)
  const currentRelease = useRef('')
  const checkingUpdate = useRef(false)

  useEffect(() => {
    if (!currentUser) return
    void getReleaseId().then(id => { currentRelease.current = id }).catch(() => undefined)
    const check = async () => {
      if (checkingUpdate.current || maintenance) return
      checkingUpdate.current = true
      try {
        const snapshot = await getAnnouncements()
        const now = new Date(snapshot.serverTime).getTime()
        const due = snapshot.announcements.filter(item => new Date(item.starts_at).getTime() <= now)
        if (baselineIds.current === null) { baselineIds.current = new Set(due.map(item => item.announcement_id)); return }
        const target = due.find(item => !baselineIds.current?.has(item.announcement_id) && !sessionStorage.getItem(`debt-update-refreshed:${item.announcement_id}`))
        if (!target) return
        setUpdateMessage('ถึงกำหนดปรับปรุงระบบ กำลังบันทึกงานที่เปิดอยู่โดยอัตโนมัติ...')
        const saved = await saveOpenEditorsBeforeSystemUpdate()
        if (!saved) {
          setUpdateMessage('ยังบันทึกงานไม่สำเร็จ ระบบจะลองใหม่อีกครั้ง โดยยังไม่ปิดหน้าที่กำลังทำงาน')
          return
        }
        if (!currentRelease.current) currentRelease.current = await getReleaseId()
        setMaintenance(target)
      } catch (error) { console.error('System update check failed:', error) }
      finally { checkingUpdate.current = false }
    }
    void check()
    const timer = window.setInterval(check, 10_000)
    return () => window.clearInterval(timer)
  }, [currentUser, maintenance])

  useEffect(() => {
    if (!maintenance) return
    const checkRelease = async () => {
      try {
        const nextRelease = await getReleaseId()
        if (currentRelease.current && nextRelease && nextRelease !== currentRelease.current) {
          sessionStorage.setItem(`debt-update-refreshed:${maintenance.announcement_id}`, '1')
          logout()
          window.location.reload()
        }
      } catch { /* ระหว่าง deploy backend อาจยังไม่พร้อม ให้คงหน้ารอและตรวจซ้ำ */ }
    }
    const timer = window.setInterval(checkRelease, 5_000)
    return () => window.clearInterval(timer)
  }, [maintenance, logout])

  if (!currentUser) return <Navigate to="/login" replace />

  if (maintenance) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(circle at top,#eee8ff,#f9f8ff 55%)' }}><div style={{ maxWidth: 570, width: '100%', textAlign: 'center', background: '#fff', border: '1px solid #e2d8f5', borderRadius: 24, padding: '44px 34px', boxShadow: '0 24px 60px rgba(72,49,120,.14)' }}><div style={{ fontSize: 52, marginBottom: 14 }}>🛠️</div><h1 style={{ margin: '0 0 10px', fontSize: 24, color: '#302746' }}>กำลังปรับปรุงระบบ</h1><p style={{ margin: '0 auto 8px', color: '#685c78', lineHeight: 1.7 }}>{maintenance.content}</p><p style={{ margin: '18px 0 0', color: '#8d7ca8', fontSize: 13 }}>ระบบบันทึกงานของคุณแล้ว และกำลังตรวจสอบเวอร์ชันใหม่โดยอัตโนมัติ<br />เมื่ออัปเดตเสร็จ ระบบจะพากลับไปหน้าเข้าสู่ระบบ</p><div style={{ width: 42, height: 42, margin: '24px auto 0', border: '4px solid #eadff8', borderTopColor: '#855dca', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div></div>

  return (
    <div className="app-shell" style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden', background: 'radial-gradient(ellipse at 15% 10%, rgba(196,181,240,0.18) 0%, transparent 40%), radial-gradient(ellipse at 85% 85%, rgba(218,237,248,0.22) 0%, transparent 40%), #f8f7ff' }}>
      {updateMessage && <div style={{ position: 'fixed', top: 72, right: 20, zIndex: 1000, maxWidth: 430, padding: '12px 16px', borderRadius: 12, background: '#4d3a70', color: '#fff', fontSize: 13, boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>{updateMessage}</div>}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="app-main-column" style={{ flex: 1, height: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Header pathname={location.pathname} />
        <main className="app-main-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
          <PageErrorBoundary key={location.pathname}><Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/taxpayers/new" element={
              <AddTaxpayerPage />
            } />
            <Route path="/taxpayers/manage" element={<ManageTaxpayersPage />} />
            <Route path="/taxpayers/manage/:id" element={<TaxpayerDetailPage />} />
            <Route path="/taxpayers/:id" element={<TaxpayerDetailPage />} />
            <Route path="/taxpayers" element={<TaxpayerListPage />} />
            <Route path="/payment-matching" element={<SearchPaymentPage />} />
            <Route path="/search-payment" element={<SearchPaymentPage />} />
            <Route path="/reports" element={<ReportPage />} />
            <Route path="/admin/users" element={
              currentUser.role === 'admin' ? <AdminUsersPage /> : <Navigate to="/dashboard" replace />
            } />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes></PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { currentUser } = useApp()
  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#6b5b95' }}>กำลังโหลดข้อมูล...</div>}>
          <AppRoutes />
        </Suspense>
      </HashRouter>
    </AppProvider>
  )
}
