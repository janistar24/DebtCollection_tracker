interface Props {
  status: string
  size?: 'sm' | 'md'
}

const STATUS_MAP: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  paid:       { label: 'ชำระครบ',      bg: '#e8fdf4', color: '#1a8f5a', dot: '#1a8f5a' },
  partial:    { label: 'ชำระบางส่วน', bg: '#fff8e6', color: '#b07800', dot: '#e6a800' },
  unpaid:     { label: 'ยังไม่ชำระ',   bg: '#fff1f0', color: '#c0392b', dot: '#e74c3c' },
  overdue:    { label: 'ค้างชำระ',     bg: '#fde8f0', color: '#8e1d4d', dot: '#c0395a' },
  none:       { label: 'ยังไม่ติดต่อ', bg: '#f4f4f8', color: '#6b5b95', dot: '#a89cc8' },
  followed:   { label: 'ติดตามแล้ว',  bg: '#e8eef8', color: '#3a5fbf', dot: '#3a5fbf' },
  promised:   { label: 'นัดชำระ',      bg: '#f0ecfb', color: '#7c5cbf', dot: '#9b7dd4' },
  dispute:    { label: 'มีข้อโต้แย้ง', bg: '#fff8e6', color: '#8a5a00', dot: '#e6a800' },
  closed:     { label: 'ปิดแล้ว',      bg: '#e8fdf4', color: '#1a8f5a', dot: '#1a8f5a' },
  active:     { label: 'ใช้งาน',       bg: '#e8fdf4', color: '#1a8f5a', dot: '#1a8f5a' },
  inactive:   { label: 'ปิดการใช้งาน',bg: '#f4f4f8', color: '#888', dot: '#aaa' },
  officer:    { label: 'พนักงาน',      bg: '#e8eef8', color: '#3a5fbf', dot: '#3a5fbf' },
  director:   { label: 'ผู้บริหาร',    bg: '#f0ecfb', color: '#7c5cbf', dot: '#9b7dd4' },
  admin:      { label: 'แอดมิน',       bg: '#fff1f0', color: '#c0392b', dot: '#e74c3c' },
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  const cfg = STATUS_MAP[status] ?? { label: status, bg: '#f4f4f8', color: '#555', dot: '#999' }
  const px = size === 'sm' ? '6px 10px' : '4px 12px'
  const fs = size === 'sm' ? '11px' : '12px'
  return (
    <span className="status-badge" style={{ background: cfg.bg, color: cfg.color, padding: px, fontSize: fs }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}
