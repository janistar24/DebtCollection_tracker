import { Component, lazy, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'

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
  const { currentUser } = useApp()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  if (!currentUser) return <Navigate to="/login" replace />

  return (
    <div className="app-shell" style={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden', background: 'radial-gradient(ellipse at 15% 10%, rgba(196,181,240,0.18) 0%, transparent 40%), radial-gradient(ellipse at 85% 85%, rgba(218,237,248,0.22) 0%, transparent 40%), #f8f7ff' }}>
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
