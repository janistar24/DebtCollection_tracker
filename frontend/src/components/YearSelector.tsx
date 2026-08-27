import { useEffect, useMemo, useRef, useState } from 'react'
import { CURRENT_YEAR } from '../data/taxData'

interface Props {
  value: number
  onChange: (year: number) => void
  years?: number[]
  openedYears?: number[]
}

export default function YearSelector({
  value,
  onChange,
  years,
  openedYears,
}: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const options = useMemo(() => {
    const defaultYears = Array.from(
      { length: 10 },
      (_, index) => CURRENT_YEAR - index,
    )

    return [...new Set(years ?? defaultYears)].sort(
      (first, second) => second - first,
    )
  }, [years])

  const opened = useMemo(
    () => new Set(openedYears ?? options),
    [openedYears, options],
  )

  const getYearLabel = (year: number) => {
    if (year === CURRENT_YEAR) {
      return `${year} — ปีปัจจุบัน`
    }

    if (!opened.has(year)) {
      return `${year} — ยังไม่เปิดรอบ`
    }

    return String(year)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const selectYear = (year: number) => {
    onChange(year)
    setOpen(false)
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: '#a89cc8',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        ปีภาษี
      </span>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          minWidth: 190,
          height: 38,
          padding: '7px 12px',
          borderRadius: 9,
          border: '1.5px solid #cfc2ef',
          background: '#ffffff',
          color: '#6f50b3',
          fontWeight: 600,
          fontSize: 14,
          fontFamily: "'Sarabun', sans-serif",
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          whiteSpace: 'nowrap',
        }}
      >
        <span>{getYearLabel(value)}</span>

        <span
          aria-hidden="true"
          style={{
            fontSize: 10,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          ▼
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="เลือกปีภาษี"
          style={{
            position: 'absolute',

            // บังคับให้ dropdown เปิดลงด้านล่าง
            top: 'calc(100% + 8px)',
            right: 0,

            zIndex: 1000,
            width: 230,
            maxHeight: 280,
            overflowY: 'auto',
            padding: 6,
            background: '#ffffff',
            border: '1px solid #ddd5f2',
            borderRadius: 12,
            boxShadow: '0 12px 30px rgba(45, 37, 69, 0.18)',
          }}
        >
          {options.map((year) => {
            const selected = year === value

            return (
              <button
                key={year}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => selectYear(year)}
                style={{
                  width: '100%',
                  minHeight: 40,
                  padding: '9px 10px',
                  border: 0,
                  borderRadius: 8,
                  background: selected ? '#7c5cc4' : 'transparent',
                  color: selected ? '#ffffff' : '#3a3154',
                  cursor: 'pointer',
                  fontFamily: "'Sarabun', sans-serif",
                  fontSize: 14,
                  fontWeight: selected ? 700 : 500,
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(event) => {
                  if (!selected) {
                    event.currentTarget.style.background = '#f4f0fc'
                  }
                }}
                onMouseLeave={(event) => {
                  if (!selected) {
                    event.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                {selected ? '✓ ' : ''}
                {getYearLabel(year)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
