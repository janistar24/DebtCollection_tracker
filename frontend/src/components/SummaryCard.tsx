interface Props {
  icon: string
  label: string
  value: string | number
  sub?: string
  accent?: string
  onClick?: () => void
}

export default function SummaryCard({ icon, label, value, sub, accent = '#7c5cbf', onClick }: Props) {
  return (
    <div className="glass-card" onClick={onClick} style={{
      padding: '20px 22px',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.18s, box-shadow 0.18s',
    }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(124,92,191,0.13)' } }}
      onMouseLeave={e => { if (onClick) { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 20, background: `${accent}18`, flexShrink: 0
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#a89cc8', fontWeight: 500, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2d2545', lineHeight: 1.2 }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: '#a89cc8', marginTop: 3 }}>{sub}</div>}
        </div>
      </div>
    </div>
  )
}
