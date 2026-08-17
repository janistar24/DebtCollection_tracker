import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import {
  getTaxpayerName, formatCurrency, getAssessment, getPaymentStatus,
  CURRENT_YEAR, getGroupForCode
} from '../data/mockData'
import type { Taxpayer } from '../types'

const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท']

function exportExcel(rows: import('../types').Taxpayer[], year: number, group: string) {
  // Build CSV content (Excel-compatible UTF-8 BOM)
  const header = ['ที่', 'ชื่อ - ชื่อสกุล', 'รหัสเจ้าของทรัพย์สิน', 'ภาษีที่ดินฯ (บาท)', 'เพิ่ม/ลด ที่ดินฯ', 'ภาษีป้าย (บาท)', 'เพิ่ม/ลด ป้าย', 'หมายเหตุ']
  const body = rows.map((tp, i) => {
    const a = tp.assessments.find(x => x.year === year)
    const land = a?.landAmount ?? 0
    const sign = a?.signAmount ?? 0
    const dland = land - (a?.prevLandAmount ?? 0)
    const dsign = sign - (a?.prevSignAmount ?? 0)
    const name = tp.type === 'company' ? (tp.companyName ?? '') : `${tp.firstName} ${tp.lastName}`
    return [i + 1, name, tp.ownerCode, land.toFixed(2), dland.toFixed(2), sign.toFixed(2), dsign.toFixed(2), tp.notes ?? '']
  })
  const csvRows = [header, ...body].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const groupLabel = group === 'all' ? 'ทุกกลุ่ม' : group
  const docTitle = `รายละเอียดผู้ชำระภาษีที่ดินและสิ่งปลูกสร้าง-ภาษีป้าย_${year}_${groupLabel}`
  const bom = '﻿'
  const blob = new Blob([bom + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${docTitle}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// cells that have been edited in this edit session: key = `${id}-land` or `${id}-sign`
interface PendingEdit { newVal: number; reason: string }

export default function TaxpayerListPage() {
  const { currentUser, taxpayers, selectedYear, updateTaxpayer, addTaxpayer } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDirector = currentUser?.role === 'director' || currentUser?.role === 'admin'
  const isCurrentYear = selectedYear === CURRENT_YEAR

  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState(searchParams.get('group') ?? (isDirector ? 'all' : (currentUser?.group ?? 'all')))
  const [statusFilter, setStatusFilter] = useState('all')
  const [personTypeFilter, setPersonTypeFilter] = useState('all')

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingEdit>>({})
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({})
  const [reasonModal, setReasonModal] = useState<{ key: string; label: string; oldVal: number; newVal: number } | null>(null)
  const [reasonInput, setReasonInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveConfirm, setSaveConfirm] = useState(false)

  // Remove taxpayer
  const [removeTarget, setRemoveTarget] = useState<Taxpayer | null>(null)

  // Inline add row — Searchable Dropdown
  const [inlineSearch, setInlineSearch] = useState('')
  const [inlineSelected, setInlineSelected] = useState<Taxpayer | null>(null)
  const [inlineDropOpen, setInlineDropOpen] = useState(false)
  const [inlineLand, setInlineLand] = useState('')
  const [inlineSign, setInlineSign] = useState('')
  const [inlineNote, setInlineNote] = useState('')
  const [inlineAdding, setInlineAdding] = useState(false)
  const inlineDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (inlineDropRef.current && !inlineDropRef.current.contains(e.target as Node)) setInlineDropOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() => {
    return taxpayers.filter(tp => {
      if (!isDirector && tp.group !== currentUser?.group) return false
      if (groupFilter !== 'all' && tp.group !== groupFilter) return false
      const s = search.toLowerCase()
      if (s && !getTaxpayerName(tp).includes(s) && !tp.ownerCode.toLowerCase().includes(s) && !tp.phone.includes(s)) return false
      if (statusFilter !== 'all' && getPaymentStatus(tp, selectedYear) !== statusFilter) return false
      if (personTypeFilter === 'individual' && tp.type !== 'individual') return false
      if (personTypeFilter === 'company' && tp.type !== 'company') return false
      // hide removed (no assessment this year)
      if (!tp.assessments.find(a => a.year === selectedYear)) return false
      return true
    })
  }, [taxpayers, search, groupFilter, statusFilter, selectedYear, currentUser, isDirector])

  const landTotal = filtered.reduce((s, tp) => s + (getAssessment(tp, selectedYear)?.landAmount ?? 0), 0)
  const signTotal = filtered.reduce((s, tp) => s + (getAssessment(tp, selectedYear)?.signAmount ?? 0), 0)

  // Cell value with pending edit applied
  const cellVal = (tp: Taxpayer, type: 'land' | 'sign') => {
    const key = `${tp.id}-${type}`
    if (pendingEdits[key] !== undefined) return pendingEdits[key].newVal
    const a = getAssessment(tp, selectedYear)
    return type === 'land' ? (a?.landAmount ?? 0) : (a?.signAmount ?? 0)
  }

  const handleCellChange = (tp: Taxpayer, type: 'land' | 'sign', raw: string) => {
    const newVal = parseFloat(raw) || 0
    const key = `${tp.id}-${type}`
    const a = getAssessment(tp, selectedYear)
    const origVal = type === 'land' ? (a?.landAmount ?? 0) : (a?.signAmount ?? 0)
    if (newVal === origVal) {
      // revert
      setPendingEdits(prev => { const n = { ...prev }; delete n[key]; return n })
    } else {
      // show reason modal
      setReasonModal({ key, label: `${getTaxpayerName(tp)} — ${type === 'land' ? 'ภาษีที่ดินฯ' : 'ภาษีป้าย'}`, oldVal: origVal, newVal })
      setReasonInput(pendingEdits[key]?.reason ?? '')
    }
  }

  const confirmReason = () => {
    if (!reasonModal || !reasonInput) return
    setPendingEdits(prev => ({ ...prev, [reasonModal.key]: { newVal: reasonModal.newVal, reason: reasonInput } }))
    setReasonModal(null)
    setReasonInput('')
  }

  const handleSaveAll = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    // apply all pending edits
    const grouped: Record<string, { land?: number; sign?: number }> = {}
    Object.entries(pendingEdits).forEach(([key, edit]) => {
      const [id, type] = key.split('-') as [string, 'land' | 'sign']
      if (!grouped[id]) grouped[id] = {}
      grouped[id][type] = edit.newVal
    })
    taxpayers.forEach(tp => {
      if (!grouped[tp.id]) return
      const updated: Taxpayer = {
        ...tp,
        assessments: tp.assessments.map(a => {
          if (a.year !== selectedYear) return a
          return {
            ...a,
            ...(grouped[tp.id].land !== undefined ? { landAmount: grouped[tp.id].land! } : {}),
            ...(grouped[tp.id].sign !== undefined ? { signAmount: grouped[tp.id].sign! } : {}),
          }
        })
      }
      updateTaxpayer(updated)
    })
    setSaving(false)
    setSaveConfirm(false)
    // apply pending notes
    taxpayers.forEach(tp => {
      if (pendingNotes[tp.id] === undefined) return
      updateTaxpayer({ ...tp, notes: pendingNotes[tp.id] })
    })
    setPendingEdits({})
    setPendingNotes({})
    setEditMode(false)
  }

  const handleRemove = (tp: Taxpayer) => {
    // Remove assessment for this year (soft remove)
    const updated: Taxpayer = {
      ...tp,
      assessments: tp.assessments.filter(a => a.year !== selectedYear)
    }
    updateTaxpayer(updated)
    setRemoveTarget(null)
  }

  // ผู้เสียภาษีที่ค้นหาได้ในระบบ (ยังไม่มีในปีนี้) สำหรับ Searchable Dropdown
  const inlineCandidates = useMemo(() => {
    if (!inlineSearch.trim()) return []
    const s = inlineSearch.toLowerCase()
    return taxpayers.filter(tp => {
      if (!isDirector && tp.group !== currentUser?.group) return false
      const name = getTaxpayerName(tp).toLowerCase()
      return name.includes(s) || tp.ownerCode.toLowerCase().includes(s)
    }).slice(0, 8)
  }, [inlineSearch, taxpayers, isDirector, currentUser])

  // รายชื่อที่มีในปีนี้แล้ว (ป้องกัน duplicate)
  const existingThisYear = useMemo(
    () => new Set(taxpayers.filter(tp => tp.assessments.some(a => a.year === selectedYear)).map(tp => tp.id)),
    [taxpayers, selectedYear]
  )

  const handleInlineSelect = (tp: Taxpayer) => {
    setInlineSelected(tp)
    setInlineSearch(getTaxpayerName(tp))
    setInlineDropOpen(false)
    // auto-fill ยอดปีก่อน
    const prev = tp.assessments.find(a => a.year === selectedYear - 1)
    setInlineLand(prev?.landAmount ? String(prev.landAmount) : '')
    setInlineSign(prev?.signAmount ? String(prev.signAmount) : '')
  }

  const handleInlineAdd = async () => {
    if (!inlineSelected) return
    setInlineAdding(true)
    await new Promise(r => setTimeout(r, 400))
    const land = parseFloat(inlineLand) || 0
    const sign = parseFloat(inlineSign) || 0
    const prevAssess = inlineSelected.assessments.find(a => a.year === selectedYear - 1)
    const updated: Taxpayer = {
      ...inlineSelected,
      notes: inlineNote || inlineSelected.notes,
      assessments: [
        ...inlineSelected.assessments.filter(a => a.year !== selectedYear),
        { year: selectedYear, landAmount: land, signAmount: sign, prevLandAmount: prevAssess?.landAmount ?? 0, prevSignAmount: prevAssess?.signAmount ?? 0 }
      ]
    }
    updateTaxpayer(updated)
    setInlineSelected(null); setInlineSearch(''); setInlineLand(''); setInlineSign(''); setInlineNote('')
    setInlineAdding(false)
  }

  const diff = (curr: number, prev: number) => {
    const d = curr - prev
    if (d === 0) return <span className="status-badge tag-same" style={{ fontSize: 11, padding: '2px 8px' }}>เท่าเดิม</span>
    return <span className="status-badge" style={{ fontSize: 11, padding: '2px 8px', ...(d > 0 ? { background: '#e8fdf4', color: '#1a8f5a' } : { background: '#fff1f0', color: '#c0392b' }) }}>{d > 0 ? '+' : ''}{formatCurrency(d)}</span>
  }

  const hasPending = Object.keys(pendingEdits).length > 0 || Object.values(pendingNotes).some((v, i) => {
    const id = Object.keys(pendingNotes)[i]
    const tp = taxpayers.find(t => t.id === id)
    return v !== (tp?.notes ?? '')
  })

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input-field" style={{ width: 240 }} placeholder="🔍 ค้นหาชื่อ, รหัส, เบอร์โทร"
          value={search} onChange={e => setSearch(e.target.value)} />
        {isDirector && (
          <select className="input-field" style={{ width: 140 }} value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
            <option value="all">ทุกกลุ่ม</option>
            {GROUPS.map(g => <option key={g} value={g}>กลุ่ม {g}</option>)}
          </select>
        )}
        <select className="input-field" style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">ทุกสถานะ</option>
          <option value="unpaid">ยังไม่ชำระ</option>
          <option value="partial">ชำระบางส่วน</option>
          <option value="paid">ชำระครบ</option>
        </select>
        <select className="input-field" style={{ width: 160 }} value={personTypeFilter} onChange={e => setPersonTypeFilter(e.target.value)}>
          <option value="all">ทุกประเภทบุคคล</option>
          <option value="individual">บุคคลธรรมดา</option>
          <option value="company">นิติบุคคล / บริษัท</option>
        </select>
        <span style={{ fontSize: 13, color: '#a89cc8' }}>{filtered.length} รายการ</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {!editMode && <>
            <button className="btn-secondary no-print" onClick={() => window.print()} style={{ fontSize: 12 }}>🖨 พิมพ์</button>
            <button className="btn-secondary no-print" onClick={() => exportExcel(filtered, selectedYear, groupFilter)} style={{ fontSize: 12 }}>📥 Export Excel</button>
          </>}
          {!isDirector && isCurrentYear && !editMode && (
            <button className="btn-secondary" onClick={() => { setEditMode(true); setPendingEdits({}) }}
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              ✏️ แก้ไขข้อมูล
            </button>
          )}
          {editMode && (
            <>
              <div style={{ padding: '6px 12px', background: '#fff8e6', border: '1px solid rgba(230,160,0,0.3)', borderRadius: 10, fontSize: 12, color: '#8a5a00', fontWeight: 600 }}>
                ✏️ กำลังแก้ไขข้อมูลปีภาษี {selectedYear}
                {hasPending && <span style={{ marginLeft: 8, color: '#7c5cbf' }}>· {Object.keys(pendingEdits).length} รายการรอบันทึก</span>}
              </div>
              <button className="btn-secondary" onClick={() => { setEditMode(false); setPendingEdits({}); setPendingNotes({}) }} style={{ fontSize: 13 }}>ยกเลิก</button>
              <button className="btn-primary" onClick={() => setSaveConfirm(true)} disabled={!hasPending} style={{ fontSize: 13 }}>
                💾 บันทึกการแก้ไข
              </button>
            </>
          )}
          {!editMode && !isDirector && (
            <button className="btn-primary" onClick={() => navigate('/taxpayers/new')} style={{ fontSize: 13 }}>➕ เพิ่มผู้เสียภาษีรายใหม่</button>
          )}
        </div>
      </div>

      {selectedYear < CURRENT_YEAR && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fff8e6', border: '1px solid rgba(230,160,0,0.25)', borderRadius: 12, fontSize: 13, color: '#8a5a00' }}>
          📁 ปี {selectedYear} เป็นข้อมูลในอดีต — <strong>ดูได้อย่างเดียว</strong>
        </div>
      )}

      {/* Print-only document header */}
      <div className="print-only" style={{ marginBottom: 16, borderBottom: '2px solid #222', paddingBottom: 12 }}>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
          รายละเอียดผู้ชำระภาษีที่ดินและสิ่งปลูกสร้าง - ภาษีป้าย
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>
          ประจำปี {selectedYear} {groupFilter !== 'all' ? `อักษร ${groupFilter}` : '(ทุกกลุ่ม)'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 8, color: '#555' }}>
          <span>พิมพ์วันที่: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span>จำนวน {filtered.length} ราย</span>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 && !editMode ? (
          <EmptyState icon="🔍" title="ไม่พบข้อมูล" sub="ลองเปลี่ยนเงื่อนไขการค้นหา" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(240,236,251,0.6)' }}>
                  <th style={TH}>#</th>
                  <th style={TH}>รหัส</th>
                  <th style={TH}>ชื่อ-นามสกุล / บริษัท</th>
                  <th style={{ ...TH, textAlign: 'center' }} colSpan={3}>ภาษีที่ดินและสิ่งปลูกสร้าง</th>
                  <th style={{ ...TH, textAlign: 'center' }} colSpan={3}>ภาษีป้าย</th>
                  <th style={TH}>หมายเหตุ</th>
                  <th style={TH}>สถานะ</th>
                  <th style={TH}></th>
                  {editMode && <th style={{ ...TH, width: 40 }}></th>}
                </tr>
                <tr style={{ background: 'rgba(240,236,251,0.35)' }}>
                  <th style={TH} colSpan={3}></th>
                  {['ปีนี้', 'ปีก่อน', 'เพิ่ม/ลด'].map(h => <th key={`l${h}`} style={{ ...TH, fontWeight: 500, color: '#8873b5', fontSize: 11 }}>{h}</th>)}
                  {['ปีนี้', 'ปีก่อน', 'เพิ่ม/ลด'].map(h => <th key={`s${h}`} style={{ ...TH, fontWeight: 500, color: '#8873b5', fontSize: 11 }}>{h}</th>)}
                  <th style={TH} colSpan={editMode ? 4 : 3}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tp, i) => {
                  const a = getAssessment(tp, selectedYear)
                  const payStat = getPaymentStatus(tp, selectedYear)
                  const landKey = `${tp.id}-land`
                  const signKey = `${tp.id}-sign`
                  const curLand = cellVal(tp, 'land')
                  const curSign = cellVal(tp, 'sign')
                  const landEdited = pendingEdits[landKey] !== undefined
                  const signEdited = pendingEdits[signKey] !== undefined

                  return (
                    <tr key={tp.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(200,190,240,0.15)' }}>
                      <td style={TD}>{i + 1}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#7c5cbf' }}>{tp.ownerCode}</td>
                      <td style={{ ...TD, fontWeight: 500, color: '#2d2545', whiteSpace: 'nowrap' }}>{getTaxpayerName(tp)}</td>
                      {/* land */}
                      <td style={{ ...TD, textAlign: 'right', background: landEdited ? 'rgba(124,92,191,0.06)' : undefined }}>
                        {editMode && isCurrentYear ? (
                          <input type="number" defaultValue={curLand} key={`${tp.id}-land-${curLand}`}
                            onBlur={e => handleCellChange(tp, 'land', e.target.value)}
                            style={{ width: 90, textAlign: 'right', background: landEdited ? 'rgba(124,92,191,0.1)' : 'rgba(255,255,255,0.7)', border: `1px solid ${landEdited ? 'rgba(124,92,191,0.5)' : 'rgba(180,165,230,0.35)'}`, borderRadius: 8, padding: '4px 8px', fontFamily: "'Sarabun',sans-serif", fontSize: 13, outline: 'none' }} />
                        ) : <span>฿{formatCurrency(curLand)}</span>}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', color: '#a89cc8' }}>฿{formatCurrency(a?.prevLandAmount ?? 0)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{diff(curLand, a?.prevLandAmount ?? 0)}</td>
                      {/* sign */}
                      <td style={{ ...TD, textAlign: 'right', background: signEdited ? 'rgba(124,92,191,0.06)' : undefined }}>
                        {editMode && isCurrentYear ? (
                          <input type="number" defaultValue={curSign} key={`${tp.id}-sign-${curSign}`}
                            onBlur={e => handleCellChange(tp, 'sign', e.target.value)}
                            style={{ width: 90, textAlign: 'right', background: signEdited ? 'rgba(124,92,191,0.1)' : 'rgba(255,255,255,0.7)', border: `1px solid ${signEdited ? 'rgba(124,92,191,0.5)' : 'rgba(180,165,230,0.35)'}`, borderRadius: 8, padding: '4px 8px', fontFamily: "'Sarabun',sans-serif", fontSize: 13, outline: 'none' }} />
                        ) : <span>฿{formatCurrency(curSign)}</span>}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', color: '#a89cc8' }}>฿{formatCurrency(a?.prevSignAmount ?? 0)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{diff(curSign, a?.prevSignAmount ?? 0)}</td>
                      <td style={{ ...TD, maxWidth: 160 }}>
                        {editMode && isCurrentYear ? (
                          <input type="text" defaultValue={pendingNotes[tp.id] ?? tp.notes ?? ''}
                            onChange={e => setPendingNotes(prev => ({ ...prev, [tp.id]: e.target.value }))}
                            placeholder="หมายเหตุ..."
                            style={{ width: '100%', background: (pendingNotes[tp.id] !== undefined && pendingNotes[tp.id] !== (tp.notes ?? '')) ? 'rgba(124,92,191,0.08)' : 'rgba(255,255,255,0.7)', border: '1px solid rgba(180,165,230,0.35)', borderRadius: 8, padding: '4px 8px', fontFamily: "'Sarabun',sans-serif", fontSize: 12, outline: 'none' }} />
                        ) : (
                          <span style={{ fontSize: 11, color: '#a89cc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 140 }}>{tp.notes ?? '-'}</span>
                        )}
                      </td>
                      <td style={TD}><StatusBadge status={payStat} size="sm" /></td>
                      <td style={TD}>
                        <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => navigate(`/taxpayers/${tp.id}`)}>ดู →</button>
                      </td>
                      {editMode && (
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <button onClick={() => setRemoveTarget(tp)} title="นำออกจากปีนี้" style={{
                            width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(192,57,43,0.3)',
                            background: 'rgba(192,57,43,0.06)', color: '#c0392b', cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>−</button>
                        </td>
                      )}
                    </tr>
                  )
                })}

                {/* Inline add row — Searchable Dropdown */}
                {editMode && isCurrentYear && (
                  <tr style={{ background: 'rgba(240,236,251,0.35)', borderTop: '2px dashed rgba(124,92,191,0.25)' }}>
                    <td style={TD} colSpan={3}>
                      <div style={{ fontSize: 11, color: '#7c5cbf', marginBottom: 6, fontWeight: 600 }}>+ เพิ่มรายการ</div>
                      <div ref={inlineDropRef} style={{ position: 'relative', width: 240 }}>
                        <input
                          className="input-field"
                          placeholder="ค้นหาและเลือกผู้เสียภาษี"
                          value={inlineSearch}
                          onChange={e => { setInlineSearch(e.target.value); setInlineSelected(null); setInlineDropOpen(true) }}
                          onFocus={() => inlineSearch && setInlineDropOpen(true)}
                          style={{ fontSize: 12, padding: '6px 10px', width: '100%' }}
                        />
                        {inlineDropOpen && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, marginTop: 4,
                            background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(196,181,240,0.4)', borderRadius: 12,
                            boxShadow: '0 8px 24px rgba(124,92,191,0.12)', overflow: 'hidden'
                          }}>
                            {inlineCandidates.length === 0 ? (
                              <div style={{ padding: '12px 14px', fontSize: 12, color: '#a89cc8', textAlign: 'center' }}>
                                <div style={{ marginBottom: 8 }}>ไม่พบผู้เสียภาษีในระบบ</div>
                                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: '#7c5cbf' }}
                                  onMouseDown={() => navigate('/taxpayers/new')}>
                                  + เพิ่มผู้เสียภาษีรายใหม่
                                </button>
                              </div>
                            ) : inlineCandidates.map(tp => {
                              const alreadyIn = existingThisYear.has(tp.id)
                              return (
                                <div key={tp.id}
                                  onMouseDown={() => !alreadyIn && handleInlineSelect(tp)}
                                  style={{
                                    padding: '10px 14px', borderBottom: '1px solid rgba(200,190,240,0.15)',
                                    cursor: alreadyIn ? 'default' : 'pointer', opacity: alreadyIn ? 0.5 : 1,
                                    background: 'transparent', transition: 'background 0.1s'
                                  }}
                                  onMouseEnter={e => { if (!alreadyIn) (e.currentTarget as HTMLElement).style.background = 'rgba(240,236,251,0.6)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>{getTaxpayerName(tp)}</div>
                                  <div style={{ fontSize: 11, color: '#a89cc8', display: 'flex', gap: 8, marginTop: 2 }}>
                                    {tp.ownerCode && <span style={{ fontFamily: 'monospace' }}>{tp.ownerCode}</span>}
                                    <span>{tp.type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span>
                                    {alreadyIn && <span style={{ color: '#7c5cbf', fontWeight: 600 }}>มีอยู่ในปีภาษี {selectedYear} แล้ว</span>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {inlineSelected && (
                        <div style={{ marginTop: 4, fontSize: 11, color: '#1a8f5a', fontWeight: 600 }}>
                          ✓ เลือก: {getTaxpayerName(inlineSelected)} · {inlineSelected.type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}
                        </div>
                      )}
                    </td>
                    <td style={TD}>
                      <input className="input-field" placeholder="ยอดที่ดินฯ" type="number" value={inlineLand}
                        onChange={e => setInlineLand(e.target.value)} disabled={!inlineSelected}
                        style={{ fontSize: 12, padding: '6px 8px', width: 90, opacity: inlineSelected ? 1 : 0.4 }} />
                    </td>
                    <td style={TD} colSpan={2}></td>
                    <td style={TD}>
                      <input className="input-field" placeholder="ยอดป้าย" type="number" value={inlineSign}
                        onChange={e => setInlineSign(e.target.value)} disabled={!inlineSelected}
                        style={{ fontSize: 12, padding: '6px 8px', width: 90, opacity: inlineSelected ? 1 : 0.4 }} />
                    </td>
                    <td style={TD} colSpan={2}></td>
                    <td style={TD}>
                      <input className="input-field" placeholder="หมายเหตุ" value={inlineNote}
                        onChange={e => setInlineNote(e.target.value)} disabled={!inlineSelected}
                        style={{ fontSize: 12, padding: '6px 8px', width: 110, opacity: inlineSelected ? 1 : 0.4 }} />
                    </td>
                    <td style={TD} colSpan={editMode ? 3 : 2}>
                      {inlineSelected && (
                        <button className="btn-primary" onClick={handleInlineAdd} disabled={inlineAdding || (!inlineLand && !inlineSign)}
                          style={{ fontSize: 12, padding: '6px 14px' }}>
                          {inlineAdding ? '...' : '+ เพิ่ม'}
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(240,236,251,0.5)', fontWeight: 700 }}>
                  <td colSpan={3} style={{ ...TD, color: '#7c5cbf' }}>รวม {filtered.length} ราย</td>
                  <td style={{ ...TD, textAlign: 'right', color: '#2d2545' }}>฿{formatCurrency(landTotal)}</td>
                  <td colSpan={2} style={TD}></td>
                  <td style={{ ...TD, textAlign: 'right', color: '#2d2545' }}>฿{formatCurrency(signTotal)}</td>
                  <td colSpan={2} style={TD}></td>
                  <td style={{ ...TD, fontWeight: 700, color: '#7c5cbf' }}>฿{formatCurrency(landTotal + signTotal)}</td>
                  <td colSpan={editMode ? 3 : 2} style={TD}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Reason popover modal */}
      {reasonModal && (
        <Modal title="ระบุเหตุผลการเปลี่ยนแปลงยอด" onClose={() => setReasonModal(null)} maxWidth="440px">
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 10, fontSize: 13 }}>
            <div style={{ color: '#a89cc8' }}>{reasonModal.label}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <span>เดิม: <strong>฿{formatCurrency(reasonModal.oldVal)}</strong></span>
              <span>ใหม่: <strong style={{ color: '#7c5cbf' }}>฿{formatCurrency(reasonModal.newVal)}</strong></span>
              <span>ส่วนต่าง: <strong style={{ color: reasonModal.newVal >= reasonModal.oldVal ? '#1a8f5a' : '#c0392b' }}>{reasonModal.newVal >= reasonModal.oldVal ? '+' : ''}{formatCurrency(reasonModal.newVal - reasonModal.oldVal)}</strong></span>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={LBL}>เหตุผลที่ยอดเพิ่ม/ลด *</label>
            <select className="input-field" value={reasonInput} onChange={e => setReasonInput(e.target.value)}>
              <option value="">— เลือกเหตุผล —</option>
              <option value="เพิ่มขนาดป้าย">เพิ่มขนาดป้าย</option>
              <option value="ลดขนาดป้าย">ลดขนาดป้าย</option>
              <option value="ต่อเติมอาคาร">ต่อเติมอาคาร</option>
              <option value="เปลี่ยนแปลงพื้นที่">เปลี่ยนแปลงพื้นที่</option>
              <option value="แก้ไขข้อมูล">แก้ไขข้อมูล</option>
              <option value="อื่น ๆ">อื่น ๆ</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setReasonModal(null)}>ยกเลิก</button>
            <button className="btn-primary" onClick={confirmReason} disabled={!reasonInput}>ยืนยัน</button>
          </div>
        </Modal>
      )}

      {/* Save confirm */}
      {saveConfirm && (
        <Modal title="ยืนยันบันทึกการแก้ไข" onClose={() => setSaveConfirm(false)} maxWidth="420px">
          <div style={{ marginBottom: 20, fontSize: 14, color: '#6b5b95' }}>
            จะบันทึก <strong>{Object.keys(pendingEdits).length} รายการ</strong> ที่แก้ไขในปีภาษี {selectedYear} ใช่ไหม?
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setSaveConfirm(false)}>ยกเลิก</button>
            <button className="btn-primary" onClick={handleSaveAll} disabled={saving}>
              {saving ? '⏳ กำลังบันทึก...' : '💾 ยืนยันบันทึก'}
            </button>
          </div>
        </Modal>
      )}

      {/* Remove confirm */}
      {removeTarget && (
        <Modal title={`นำรายชื่อออกจากปีภาษี ${selectedYear}?`} onClose={() => setRemoveTarget(null)} maxWidth="420px">
          <div style={{ marginBottom: 8, padding: '12px 14px', background: 'rgba(240,236,251,0.5)', borderRadius: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2d2545' }}>{getTaxpayerName(removeTarget)}</div>
            <div style={{ fontSize: 12, color: '#a89cc8', fontFamily: 'monospace' }}>{removeTarget.ownerCode}</div>
          </div>
          <div style={{ marginBottom: 20, padding: '10px 14px', background: '#fff8e6', border: '1px solid rgba(230,160,0,0.25)', borderRadius: 10, fontSize: 13, color: '#8a5a00' }}>
            ℹ️ ข้อมูลปีภาษีที่ผ่านมาและข้อมูลประจำตัวผู้เสียภาษีจะ<strong>ไม่ถูกลบ</strong>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setRemoveTarget(null)}>ยกเลิก</button>
            <button onClick={() => handleRemove(removeTarget)} style={{
              background: 'linear-gradient(135deg,#c0392b,#e74c3c)', color: 'white', border: 'none',
              borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Sarabun',sans-serif"
            }}>ยืนยันนำออก</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b5b95', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,190,240,0.25)', fontSize: 12 }
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
const LBL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
