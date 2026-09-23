import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import YearSelector from './YearSelector'
import Modal from './Modal'
import BuddhistDateInput from './BuddhistDateInput'
import { CURRENT_YEAR } from '../data/taxData'
import { changeOwnPassword } from '../api/users'
import { createAnnouncement } from '../api/announcements'

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
  const { currentUser, taxpayers, selectedYear, setSelectedYear, logout } = useApp()
  const [unavailableYear, setUnavailableYear] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [announcementTitle, setAnnouncementTitle] = useState('แจ้งปรับปรุงระบบ')
  const [announcementContent, setAnnouncementContent] = useState('ระบบจะปิดปรับปรุงชั่วคราว กรุณาบันทึกงานก่อนเวลาที่กำหนด')
  const [announcementTime, setAnnouncementTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const title = PAGE_TITLES[pathname] ?? 'ระบบบริหารภาษี'
  const showYear = ['/dashboard', '/taxpayers', '/reports'].some(p => pathname.startsWith(p))
  const openedYears = [...new Set(taxpayers.flatMap(tp => tp.assessments.map(a => a.year)))]
    .sort((a, b) => b - a)
  const selectableYears = pathname.startsWith('/taxpayers')
    ? [...new Set([
        ...Array.from({ length: 15 }, (_, index) => CURRENT_YEAR + 2 - index),
        ...openedYears,
      ])]
        .sort((a, b) => b - a)
    : openedYears

  // การเลือกปีอนาคตเพื่อเปิดรอบเป็นบริบทของหน้ารายปีเท่านั้น
  // เมื่อไปหน้าอื่นให้กลับมาใช้ปีจริงปัจจุบัน แต่ยังเลือกปีอื่นบนหน้านั้นเองได้
  useEffect(() => {
    if (!pathname.startsWith('/taxpayers') && selectedYear > CURRENT_YEAR) {
      setSelectedYear(CURRENT_YEAR)
    }
  }, [pathname, selectedYear, setSelectedYear])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [])

  const submitPassword = async () => {
    setFormError('')
    if (newPassword.length < 12) return setFormError('รหัสผ่านใหม่ต้องมีอย่างน้อย 12 ตัวอักษร')
    if (newPassword !== confirmPassword) return setFormError('การยืนยันรหัสผ่านใหม่ไม่ตรงกัน')
    try {
      setSubmitting(true)
      await changeOwnPassword(currentPassword, newPassword)
      setPasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      alert('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว')
    } catch (error) { setFormError(error instanceof Error ? error.message : 'ไม่สามารถเปลี่ยนรหัสผ่านได้') }
    finally { setSubmitting(false) }
  }

  const submitAnnouncement = async () => {
    setFormError('')
    if (!announcementTime) return setFormError('กรุณาระบุวันและเวลาเริ่มปรับปรุงระบบ')
    try {
      setSubmitting(true)
      await createAnnouncement({
        title: announcementTitle,
        content: announcementContent,
        starts_at: new Date(announcementTime).toISOString(),
      })
      window.dispatchEvent(new Event('debt-collection:announcements-changed'))
      setAnnouncementOpen(false); setAnnouncementTime('')
      alert('เผยแพร่ประกาศเรียบร้อยแล้ว')
    } catch (error) { setFormError(error instanceof Error ? error.message : 'ไม่สามารถสร้างประกาศได้') }
    finally { setSubmitting(false) }
  }

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
            years={selectableYears.length > 0 ? selectableYears : [CURRENT_YEAR]} />
        )}
      </div>
      {currentUser && (
        <div ref={menuRef} style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <div style={{
            background: 'rgba(124,92,191,0.1)', borderRadius: 8, padding: '4px 10px',
            fontSize: 12, color: '#7c5cbf', fontWeight: 600
          }}>{ROLE_LABEL[currentUser.role]}</div>
          <button type="button" onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} style={{
            border: 0, background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left'
          }}><div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg,#c4b5f0,#9b7dd4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: 'white', fontWeight: 700, flexShrink: 0
          }}>{currentUser.name[0]}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545', lineHeight: 1.2 }}>{currentUser.name}</div>
            {currentUser.group && <div style={{ fontSize: 11, color: '#a89cc8' }}>กลุ่ม {currentUser.group}</div>}
          </div><span style={{ color: '#8a78b4', fontSize: 11 }}>▾</span></button>
          {menuOpen && <div style={{ position: 'absolute', right: 0, top: 48, width: 235, padding: 8, borderRadius: 14, background: '#fff', border: '1px solid #e6e0f3', boxShadow: '0 14px 35px rgba(62,45,100,.18)', zIndex: 100 }}>
            <div style={{ padding: '9px 10px 11px', borderBottom: '1px solid #eee9f7' }}><div style={{ fontWeight: 700, fontSize: 13 }}>{currentUser.name}</div><div style={{ color: '#9588b4', fontSize: 11, marginTop: 3 }}>{ROLE_LABEL[currentUser.role]}{currentUser.group ? ` · กลุ่ม ${currentUser.group}` : ''}</div></div>
            {[['👤','ข้อมูลของฉัน',() => setProfileOpen(true)],['🔐','เปลี่ยนรหัสผ่าน',() => setPasswordOpen(true)]].map(([icon,label,action]) => <button key={String(label)} type="button" onClick={() => { setMenuOpen(false); (action as () => void)() }} style={{ width: '100%', border: 0, background: 'transparent', padding: '10px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: '#3b3152' }}>{String(icon)}&nbsp; {String(label)}</button>)}
            {currentUser.role === 'admin' && <button type="button" onClick={() => { setMenuOpen(false); setAnnouncementOpen(true) }} style={{ width: '100%', border: 0, background: 'transparent', padding: '10px', textAlign: 'left', cursor: 'pointer', borderRadius: 8, color: '#3b3152' }}>📣&nbsp; ประกาศปรับปรุงระบบ</button>}
            <button type="button" onClick={logout} style={{ width: '100%', border: 0, borderTop: '1px solid #eee9f7', background: 'transparent', padding: '11px 10px 8px', textAlign: 'left', cursor: 'pointer', color: '#c0392b' }}>ออกจากระบบ</button>
          </div>}
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
    {profileOpen && currentUser && <Modal title="ข้อมูลของฉัน" onClose={() => setProfileOpen(false)} maxWidth="430px"><div style={{ display: 'grid', gap: 12, fontSize: 14 }}><div><b>ชื่อผู้ใช้งาน</b><div style={{ color: '#756987', marginTop: 4 }}>{currentUser.name}</div></div><div><b>สิทธิ์การใช้งาน</b><div style={{ color: '#756987', marginTop: 4 }}>{ROLE_LABEL[currentUser.role]}</div></div>{currentUser.group && <div><b>กลุ่มที่รับผิดชอบ</b><div style={{ color: '#756987', marginTop: 4 }}>กลุ่ม {currentUser.group}</div></div>}</div></Modal>}
    {passwordOpen && <Modal title="เปลี่ยนรหัสผ่าน" onClose={() => { setPasswordOpen(false); setFormError('') }} maxWidth="460px"><div style={{ display: 'grid', gap: 13 }}><label>รหัสผ่านปัจจุบัน<input type="password" className="input-field" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={{ marginTop: 5 }} /></label><label>รหัสผ่านใหม่<input type="password" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ marginTop: 5 }} /></label><label>ยืนยันรหัสผ่านใหม่<input type="password" className="input-field" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ marginTop: 5 }} /></label>{formError && <div style={{ color: '#c0392b', fontSize: 12 }}>{formError}</div>}<button type="button" className="btn-primary" disabled={submitting} onClick={submitPassword}>{submitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}</button></div></Modal>}
    {announcementOpen && <Modal title="ประกาศปรับปรุงระบบ" onClose={() => { setAnnouncementOpen(false); setFormError('') }} maxWidth="520px"><div style={{ display: 'grid', gap: 13 }}><label>หัวข้อประกาศ<input className="input-field" value={announcementTitle} onChange={e => setAnnouncementTitle(e.target.value)} style={{ marginTop: 5 }} /></label><label>รายละเอียด<textarea className="input-field" value={announcementContent} onChange={e => setAnnouncementContent(e.target.value)} rows={4} style={{ marginTop: 5, resize: 'vertical' }} /></label><label>วันและเวลาเริ่มปรับปรุง<BuddhistDateInput value={announcementTime} onChange={setAnnouncementTime} includeTime required style={{ marginTop: 5 }} /></label><div style={{ color: '#81759f', fontSize: 12, lineHeight: 1.6 }}>เมื่อถึงเวลาระบบจะบันทึกงานที่กำลังแก้ไขให้ก่อนเข้าสู่หน้ารอ และกลับสู่หน้าเข้าสู่ระบบหลังตรวจพบว่า Railway deploy รุ่นใหม่เสร็จแล้ว</div>{formError && <div style={{ color: '#c0392b', fontSize: 12 }}>{formError}</div>}<button type="button" className="btn-primary" disabled={submitting} onClick={submitAnnouncement}>{submitting ? 'กำลังเผยแพร่...' : 'เผยแพร่ประกาศ'}</button></div></Modal>}
    </>
  )
}
