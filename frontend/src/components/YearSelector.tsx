import { CURRENT_YEAR } from '../data/mockData'

interface Props {
  value: number
  onChange: (y: number) => void
  years?: number[]
}

export default function YearSelector({ value, onChange, years }: Props) {
  const opts = years ?? [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, color: '#a89cc8', fontWeight: 500 }}>ปีภาษี</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {opts.map(y => (
          <button key={y} onClick={() => onChange(y)} style={{
            padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: y === value ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.35)',
            background: y === value ? 'linear-gradient(135deg,#7c5cbf,#9b7dd4)' : 'rgba(255,255,255,0.6)',
            color: y === value ? '#fff' : '#7c5cbf',
            transition: 'all 0.15s',
            fontFamily: "'Sarabun', sans-serif"
          }}>{y}</button>
        ))}
      </div>
    </div>
  )
}
