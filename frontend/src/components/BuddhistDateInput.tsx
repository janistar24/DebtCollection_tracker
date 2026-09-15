import { useEffect, useState } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  includeTime?: boolean
  className?: string
  style?: React.CSSProperties
  required?: boolean
}

const displayValue = (value: string, includeTime: boolean) => {
  if (!value) return ''
  const [datePart, timePart = ''] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  if (!year || !month || !day) return value
  const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year + 543}`
  return includeTime ? `${date}${timePart ? ` ${timePart.slice(0, 5)}` : ''}` : date
}

const isoValue = (raw: string, includeTime: boolean) => {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!match) return null
  const [, dayText, monthText, buddhistYearText, hourText = '00', minuteText = '00'] = match
  const day = Number(dayText), month = Number(monthText), year = Number(buddhistYearText) - 543
  const hour = Number(hourText), minute = Number(minuteText)
  const check = new Date(year, month - 1, day, hour, minute)
  if (year < 1900 || check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day || hour > 23 || minute > 59) return null
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return includeTime ? `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : date
}

export default function BuddhistDateInput({ value, onChange, includeTime = false, className = 'input-field', style, required }: Props) {
  const [draft, setDraft] = useState(() => displayValue(value, includeTime))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setDraft(displayValue(value, includeTime)), [value, includeTime])

  const commit = () => {
    if (!draft.trim() && !required) { setInvalid(false); onChange(''); return }
    const parsed = isoValue(draft, includeTime)
    if (!parsed) { setInvalid(true); setDraft(displayValue(value, includeTime)); return }
    setInvalid(false); onChange(parsed); setDraft(displayValue(parsed, includeTime))
  }

  return <div>
    <input className={className} value={draft} onChange={event => { setDraft(event.target.value); setInvalid(false) }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} placeholder={includeTime ? 'วว/ดด/พ.ศ. ชช:นน' : 'วว/ดด/พ.ศ.'} inputMode="numeric" style={{ ...style, borderColor: invalid ? '#c0392b' : style?.borderColor }} aria-invalid={invalid} />
    {invalid && <div style={{ color: '#c0392b', fontSize: 10, marginTop: 3 }}>กรุณาระบุวันที่เป็นรูปแบบ วว/ดด/พ.ศ.{includeTime ? ' ชช:นน' : ''}</div>}
  </div>
}
