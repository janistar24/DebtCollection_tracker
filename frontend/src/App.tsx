import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TaxpayerListPage from './pages/TaxpayerListPage'
import AddTaxpayerPage from './pages/AddTaxpayerPage'
import TaxpayerDetailPage from './pages/TaxpayerDetailPage'
import ReportPage from './pages/ReportPage'
import AdminUsersPage from './pages/AdminUsersPage'
import SearchPaymentPage from './pages/SearchPaymentPage'

function ProtectedLayout() {
  const { currentUser } = useApp()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  if (!currentUser) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'radial-gradient(ellipse at 15% 10%, rgba(196,181,240,0.18) 0%, transparent 40%), radial-gradient(ellipse at 85% 85%, rgba(218,237,248,0.22) 0%, transparent 40%), #f8f7ff' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Header pathname={location.pathname} />
        <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/taxpayers/new" element={
              currentUser.role === 'director' ? <Navigate to="/taxpayers" replace /> : <AddTaxpayerPage />
            } />
            <Route path="/taxpayers/:id" element={<TaxpayerDetailPage />} />
            <Route path="/taxpayers" element={<TaxpayerListPage />} />
            <Route path="/payment-matching" element={<SearchPaymentPage />} />
            <Route path="/search-payment" element={<SearchPaymentPage />} />
            <Route path="/reports" element={<ReportPage />} />
            <Route path="/admin/users" element={
              currentUser.role === 'admin' ? <AdminUsersPage /> : <Navigate to="/dashboard" replace />
            } />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
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
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppProvider>
  )
}
