import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import YearSelector from './YearSelector'
import Modal from './Modal'
import { CURRENT_YEAR } from '../data/taxData'

const ROLE_LABEL: Record<string, string> = {
  officer: 'เจ้าหน้าที่ผู้รับผิดชอบ',
  director: 'ผู้บริหาร',
  admin: 'ผู้ดูแลระบบ',
}
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'หน้าหลัก',
  '/taxpayers': 'รายละเอียดผู้ชำระภาษี (กค.)',
  '/taxpayers/new': 'เพิ่มผู้เสียภาษีรายใหม่',
  '/taxpayers/manage': 'จัดการผู้เสียภาษีทั้งหมด',
  '/payment-matching': 'ตรวจสอบการชำระ',
  '/search-payment': 'ตรวจสอบยอดรับและบันทึกการชำระภาษี',
  '/reports': 'รายงาน',
  '/admin/users': 'จัดการผู้ใช้งาน',
}

interface Props { pathname: string }

export default function Header({ pathname }: Props) {
  const { currentUser, taxpayers, selectedYear, setSelectedYear } = useApp()
  const [unavailableYear, setUnavailableYear] = useState<number | null>(null)
  const title = PAGE_TITLES[pathname] ?? 'ระบบบริหารภาษี'
  const showYear = ['/dashboard', '/taxpayers', '/reports'].some(p => pathname.startsWith(p))
  const openedYears = [...new Set(taxpayers.flatMap(tp => tp.assessments.map(a => a.year)))]
    .sort((a, b) => b - a)
  const selectableYears = pathname.startsWith('/taxpayers')
    ? [...new Set([CURRENT_YEAR + 2, CURRENT_YEAR + 1, CURRENT_YEAR, ...openedYears])]
        .sort((a, b) => b - a)
    : openedYears

  // การเลือกปีอนาคตเพื่อเปิดรอบเป็นบริบทของหน้ารายปีเท่านั้น
  // เมื่อไปหน้าอื่นให้กลับมาใช้ปีจริงปัจจุบัน แต่ยังเลือกปีอื่นบนหน้านั้นเองได้
  useEffect(() => {
    if (!pathname.startsWith('/taxpayers') && selectedYear > CURRENT_YEAR) {
      setSelectedYear(CURRENT_YEAR)
    }
  }, [pathname, selectedYear, setSelectedYear])

  const handleYearChange = (year: number) => {
    // เปิดรอบล่วงหน้าได้ไม่เกิน 1 ปีจากปีปัจจุบัน
    if (pathname.startsWith('/taxpayers') && year > CURRENT_YEAR + 1) {
      setUnavailableYear(year)
      return
    }
    setSelectedYear(year)
  }

  return (
    <>
    <header className="glass-header no-print" style={{
      height: 60, padding: '0 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50,
      overflow: 'visible'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#2d2545' }}>{title}</h1>
        {showYear && (
          <YearSelector value={selectedYear} onChange={handleYearChange}
            years={selectableYears.length > 0 ? selectableYears : [CURRENT_YEAR]}
            openedYears={openedYears} />
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
    {unavailableYear !== null && (
      <Modal
        title="ยังไม่ถึงกำหนดเปิดรอบปีภาษี"
        onClose={() => setUnavailableYear(null)}
        maxWidth="440px"
      >
        <div style={{ textAlign: 'center', padding: '4px 0 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#2d2545', marginBottom: 8 }}>
            ยังไม่สามารถเปิดรอบปีภาษี {unavailableYear} ได้
          </div>
          <p style={{ margin: '0 0 22px', fontSize: 14, lineHeight: 1.7, color: '#81759f' }}>
            ขณะนี้ระบบอนุญาตให้เปิดรอบล่วงหน้าได้ถึงปีภาษี {CURRENT_YEAR + 1} เท่านั้น
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setUnavailableYear(null)}
            style={{ minWidth: 120 }}
          >
            รับทราบ
          </button>
        </div>
      </Modal>
    )}
    </>
  )
}
