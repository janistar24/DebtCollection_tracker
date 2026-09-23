import { useCallback, useEffect, useState } from 'react'
import { closeAnnouncement, getAnnouncements, type SystemAnnouncement } from '../api/announcements'
import { useApp } from '../context/AppContext'

const formatDateTime = (value: string) => new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
}).format(new Date(value))

export default function AnnouncementPanel() {
  const { currentUser } = useApp()
  const [items, setItems] = useState<SystemAnnouncement[]>([])
  const load = useCallback(async () => {
    try { setItems((await getAnnouncements()).announcements) }
    catch (error) { console.error('Announcement loading failed:', error) }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener('debt-collection:announcements-changed', load)
    return () => { window.clearInterval(timer); window.removeEventListener('debt-collection:announcements-changed', load) }
  }, [load])

  if (items.length === 0) return null
  return <section style={{ display: 'grid', gap: 10, marginBottom: 20 }} aria-label="ประกาศระบบ">
    {items.map(item => <article key={item.announcement_id} style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid #dccff5', background: 'linear-gradient(135deg,#fbf9ff,#f3effd)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ fontSize: 22 }}>📣</div>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, color: '#3a2e55' }}>{item.title}</div><div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.55, color: '#655879', whiteSpace: 'pre-wrap' }}>{item.content}</div><div style={{ marginTop: 7, fontSize: 11, color: '#9b8bb7' }}>กำหนดเวลา {formatDateTime(item.starts_at)} น.</div></div>
      {currentUser?.role === 'admin' && <button type="button" className="btn-ghost" onClick={async () => { if (!confirm('ยืนยันการปิดประกาศนี้หรือไม่')) return; await closeAnnouncement(item.announcement_id); await load() }} style={{ fontSize: 11 }}>ปิดประกาศ</button>}
    </article>)}
  </section>
}
