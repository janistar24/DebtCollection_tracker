import { useMemo } from 'react'
import { CURRENT_YEAR } from '../data/taxData'

interface Props {
  value: number
  onChange: (year: number) => void
  years?: number[]
}

export default function YearSelector({ value, onChange, years }: Props) {
  const options = useMemo(() => {
    const defaultYears = Array.from(
      { length: 15 },
      (_, index) => CURRENT_YEAR + 2 - index,
    )
    return [...new Set(years ?? defaultYears)].sort((a, b) => b - a)
  }, [years])

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, color: '#a89cc8', fontWeight: 500, whiteSpace: 'nowrap' }}>
        ปีภาษี
      </span>
      <select
        aria-label="เลือกปีภาษี"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          minWidth: 116,
          height: 38,
          padding: '7px 34px 7px 12px',
          borderRadius: 9,
          border: '1.5px solid #cfc2ef',
          background: '#ffffff',
          color: '#6f50b3',
          fontWeight: 600,
          fontSize: 14,
          fontFamily: "'Sarabun', sans-serif",
          cursor: 'pointer',
        }}
      >
        {options.map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
    </label>
  )
}
