import { CURRENT_YEAR } from '../data/mockData'

interface Props {
  value: number
  onChange: (y: number) => void
  years?: number[]
}

export default function YearSelector({ value, onChange, years }: Props) {
  const options = [...new Set(years ?? Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i))].sort((a, b) => b - a)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label htmlFor="tax-year" style={{ fontSize: 13, color: '#a89cc8', fontWeight: 500 }}>ปีภาษี</label>
      <select id="tax-year" value={value} onChange={e => onChange(Number(e.target.value))} style={{ padding: '7px 34px 7px 12px', borderRadius: 9, border: '1.5px solid #cfc2ef', background: '#fff', color: '#6f50b3', fontWeight: 600, fontFamily: "'Sarabun',sans-serif", cursor: 'pointer' }}>
        {options.map(year => <option key={year} value={year}>{year}{year === CURRENT_YEAR ? ' — ปีปัจจุบัน' : ''}</option>)}
      </select>
    </div>
  )
}
