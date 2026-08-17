import { useApp } from '../context/AppContext'
import YearSelector from './YearSelector'
import { CURRENT_YEAR } from '../data/mockData'

const ROLE_LABEL: Record<string, string> = { officer: 'พนักงาน', director: 'ผู้บริหาร', admin: 'แอดมิน' }
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'หน้าหลัก',
  '/taxpayers': 'ข้อมูลผู้เสียภาษีประจำปี',
  '/taxpayers/new': 'เพิ่มผู้เสียภาษีรายใหม่',
  '/payment-matching': 'ตรวจสอบการชำระ',
  '/search-payment': 'ตรวจสอบและบันทึกการชำระ',
  '/reports': 'รายงาน',
  '/admin/users': 'จัดการผู้ใช้งาน',
}

interface Props { pathname: string }

export default function Header({ pathname }: Props) {
  const { currentUser, selectedYear, setSelectedYear } = useApp()
  const title = PAGE_TITLES[pathname] ?? 'ระบบบริหารภาษี'
  const showYear = ['/dashboard', '/taxpayers', '/reports'].some(p => pathname.startsWith(p))

  return (
    <header className="glass-header no-print" style={{
      height: 60, padding: '0 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 9
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2d2545' }}>{title}</h1>
        {showYear && (
          <YearSelector value={selectedYear} onChange={setSelectedYear}
            years={[CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR]} />
        )}
      </div>
      {currentUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: 'rgba(124,92,191,0.1)', borderRadius: 8, padding: '4px 10px',
            fontSize: 12, color: '#7c5cbf', fontWeight: 600
          }}>{ROLE_LABEL[currentUser.role]}</div>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg,#c4b5f0,#9b7dd4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: 'white', fontWeight: 700, flexShrink: 0
          }}>{currentUser.name[0]}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545', lineHeight: 1.2 }}>{currentUser.name}</div>
            {currentUser.group && <div style={{ fontSize: 11, color: '#a89cc8' }}>กลุ่ม {currentUser.group}</div>}
          </div>
        </div>
      )}
    </header>
  )
}
