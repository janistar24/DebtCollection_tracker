import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import {
  getTaxpayerName, formatCurrency, getAssessment, getPaymentStatus,
  CURRENT_YEAR, getGroupForCode
} from '../data/taxData'
import {
  createTaxAssessment,
  updateTaxAssessment
} from '../api/tax_assessments'
import {
  createTaxpayerYearRecord,
  getTaxpayerYearRecord,
  removeTaxpayerFromYear,
  updateTaxpayerYearRecord
} from '../api/taxpayer_year_records'
import { bulkSaveTaxpayerYearRecords } from '../api/taxpayer_year_records'
import type { Taxpayer } from '../types'

const GROUPS = ['ก-น', 'บ-ล', 'ส-ศ', 'ว-ฮ และบริษัท']
const PRINT_ROWS_PER_PAGE = 28

function exportExcel(rows: import('../types').Taxpayer[], year: number, group: string) {
  // Build CSV content (Excel-compatible UTF-8 BOM)
  const header = ['ที่', 'ชื่อ - ชื่อสกุล', 'รหัสเจ้าของทรัพย์สิน', 'ภาษีที่ดินและสิ่งปลูกสร้าง (บาท)', 'เพิ่ม/ลด ภาษีที่ดินและสิ่งปลูกสร้าง', 'ภาษีป้าย (บาท)', 'เพิ่ม/ลด ป้าย', 'หมายเหตุ']
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
  const openedYears = taxpayers.flatMap(tp => tp.assessments.map(a => a.year))
  const latestOpenedYear = openedYears.length > 0 ? Math.max(CURRENT_YEAR, ...openedYears) : CURRENT_YEAR
  const isCurrentYear = selectedYear === latestOpenedYear

  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState(searchParams.get('group') ?? (isDirector ? 'all' : (currentUser?.group ?? 'all')))
  const [statusFilter, setStatusFilter] = useState('all')
  const [personTypeFilter, setPersonTypeFilter] = useState('all')

  // Edit mode
  const [editMode, setEditMode] = useState(false)
  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingEdit>>({})
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({})
  const [pendingAdds, setPendingAdds] = useState<Record<string, true>>({})
  const [pendingRemoves, setPendingRemoves] = useState<Record<string, { taxpayer: Taxpayer; yearRecordId: string }>>({})
  const [removedAssessmentCache, setRemovedAssessmentCache] = useState<Record<string, any>>({})
  const [reasonModal, setReasonModal] = useState<{ key: string; label: string; oldVal: number; newVal: number } | null>(null)
  const [reasonInput, setReasonInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveConfirm, setSaveConfirm] = useState(false)
  const [showOpenYearModal, setShowOpenYearModal] = useState(false)
  const [openingYear, setOpeningYear] = useState(false)
  const [openYearError, setOpenYearError] = useState('')

  // Remove taxpayer
  const [removeTarget, setRemoveTarget] = useState<Taxpayer | null>(null)

  // Inline add row — Searchable Dropdown
  const [inlineSearch, setInlineSearch] = useState('')
  const [inlineSelected, setInlineSelected] = useState<Taxpayer | null>(null)
  const [inlineDropOpen, setInlineDropOpen] = useState(false)
  const [inlineAdding, setInlineAdding] = useState(false)
  const inlineDropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (inlineDropRef.current && !inlineDropRef.current.contains(e.target as Node)) setInlineDropOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const filtered = useMemo(() => {
    return taxpayers.filter(tp => {
      if (!isDirector && tp.group !== currentUser?.group) return false
      if (groupFilter !== 'all' && tp.group !== groupFilter) return false
      const s = search.toLowerCase()
      if (s && !getTaxpayerName(tp).toLowerCase().includes(s) && !(tp.ownerCode ?? '').toLowerCase().includes(s) && !(tp.phone ?? '').toLowerCase().includes(s)) return false
      if (statusFilter !== 'all' && getPaymentStatus(tp, selectedYear) !== statusFilter) return false
      if (personTypeFilter === 'individual' && tp.type !== 'individual') return false
      if (personTypeFilter === 'company' && tp.type !== 'company') return false
      // hide removed (no assessment this year)
      if (!tp.assessments.find(a => a.year === selectedYear)) return false
      return true
    }).sort((a, b) =>
      getTaxpayerName(a).localeCompare(getTaxpayerName(b), 'th')
    )
  }, [taxpayers, search, groupFilter, statusFilter, personTypeFilter, selectedYear, currentUser, isDirector])

  const landTotal = filtered.reduce((s, tp) => s + (getAssessment(tp, selectedYear)?.landAmount ?? 0), 0)
  const signTotal = filtered.reduce((s, tp) => s + (getAssessment(tp, selectedYear)?.signAmount ?? 0), 0)
  const printPages = useMemo(() => {
    const pages: Taxpayer[][] = []
    for (let index = 0; index < filtered.length; index += PRINT_ROWS_PER_PAGE) {
      pages.push(filtered.slice(index, index + PRINT_ROWS_PER_PAGE))
    }
    return pages.length > 0 ? pages : [[]]
  }, [filtered])
  const tableGroupLabel = isDirector
    ? (groupFilter === 'all' ? 'ทุกกลุ่ม' : groupFilter)
    : (currentUser?.group ?? groupFilter)

  const visibleForYear = (tp: Taxpayer) => {
    if (!isDirector && tp.group !== currentUser?.group) return false
    if (isDirector && groupFilter !== 'all' && tp.group !== groupFilter) return false
    return true
  }

  // สถานะเปิดรอบเป็นสถานะระดับปี ไม่ใช่ระดับกลุ่มที่กำลังกรอง
  // หากปีเปิดแล้วแต่กลุ่มที่เลือกไม่มีข้อมูล ให้คงหน้าตารางและแสดง EmptyState
  const hasSelectedYearData = taxpayers.some(tp =>
    tp.assessments.some(a => a.year === selectedYear)
  )

  const sourceYear = selectedYear - 1
  const sourceTaxpayers = taxpayers.filter(tp =>
    visibleForYear(tp) && tp.assessments.some(a => a.year === sourceYear)
  )

  const handleOpenYear = async () => {
    if (sourceTaxpayers.length === 0) return
    try {
      setOpeningYear(true)
      setOpenYearError('')
      const results = await bulkSaveTaxpayerYearRecords({
        tax_year: selectedYear,
        user_id: currentUser?.id ? Number(currentUser.id) : null,
        items: sourceTaxpayers.map(tp => {
          const source = tp.assessments.find(a => a.year === sourceYear)!
          return {
            taxpayer_id: Number(tp.id),
            year_record_id: null,
            include: true,
            note: source.note ?? tp.notes ?? null,
            land_amount: source.landAmount,
            sign_amount: source.signAmount,
            prev_land_amount: source.landAmount,
            prev_sign_amount: source.signAmount,
            land_reason: null,
            sign_reason: null,
          }
        }),
      })
      const resultByTaxpayer = new Map(
        results.map(result => [String(result.taxpayer_id), result]),
      )
      for (const tp of sourceTaxpayers) {
        const source = tp.assessments.find(a => a.year === sourceYear)!
        const result = resultByTaxpayer.get(tp.id)
        if (!result) continue
        updateTaxpayer({
          ...tp,
          notes: result.note ?? '',
          assessments: [
            ...tp.assessments.filter(a => a.year !== selectedYear),
            {
              yearRecordId: String(result.year_record_id),
              landAssessmentId: result.assessment_ids?.LAND_BUILDING
                ? String(result.assessment_ids.LAND_BUILDING) : '',
              signAssessmentId: result.assessment_ids?.SIGN
                ? String(result.assessment_ids.SIGN) : '',
              year: selectedYear,
              landAmount: result.land_amount ?? source.landAmount,
              signAmount: result.sign_amount ?? source.signAmount,
              prevLandAmount: source.landAmount,
              prevSignAmount: source.signAmount,
              note: result.note ?? '',
            },
          ],
        })
      }
      setShowOpenYearModal(false)
    } catch (error) {
      setOpenYearError(error instanceof Error ? error.message : 'เปิดรอบปีภาษีไม่สำเร็จ')
    } finally {
      setOpeningYear(false)
    }
  }

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
      setPendingEdits(prev => { const n = { ...prev }; delete n[key]; return n })
    } else {
      setReasonModal({ key, label: `${getTaxpayerName(tp)} — ${type === 'land' ? 'ภาษีที่ดินและสิ่งปลูกสร้าง' : 'ภาษีป้าย'}`, oldVal: origVal, newVal })
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
  try {
    setSaving(true)
    const affectedIds = new Set([
      ...Object.keys(pendingAdds), ...Object.keys(pendingRemoves),
      ...Object.keys(pendingNotes), ...Object.keys(pendingEdits).map(key => key.split('-')[0]),
    ])
    const items = [...affectedIds].map(id => {
      const tp = taxpayers.find(item => item.id === id)!
      const assessment = tp.assessments.find(item => item.year === selectedYear)
        ?? removedAssessmentCache[id]
      const include = Boolean(pendingAdds[id]) || !pendingRemoves[id]
      const landEdit = pendingEdits[`${id}-land`]
      const signEdit = pendingEdits[`${id}-sign`]
      return {
        taxpayer_id: Number(id),
        year_record_id: assessment?.yearRecordId ? Number(assessment.yearRecordId) : null,
        include,
        note: pendingNotes[id] ?? tp.notes ?? null,
        land_amount: include && (pendingAdds[id] || landEdit) ? (landEdit?.newVal ?? assessment?.landAmount ?? 0) : null,
        sign_amount: include && (pendingAdds[id] || signEdit) ? (signEdit?.newVal ?? assessment?.signAmount ?? 0) : null,
        prev_land_amount: assessment?.prevLandAmount ?? 0,
        prev_sign_amount: assessment?.prevSignAmount ?? 0,
        land_reason: landEdit?.reason ?? null,
        sign_reason: signEdit?.reason ?? null,
      }
    })
    const results = await bulkSaveTaxpayerYearRecords({
      tax_year: selectedYear,
      user_id: currentUser?.id ? Number(currentUser.id) : null,
      items,
    })
    const resultMap = new Map(results.map(result => [String(result.taxpayer_id), result]))
    for (const id of affectedIds) {
      const tp = taxpayers.find(item => item.id === id)
      const result = resultMap.get(id)
      if (!tp || !result) continue
      if (!result.included) {
        updateTaxpayer({ ...tp, assessments: tp.assessments.filter(item => item.year !== selectedYear) })
        continue
      }
      const old = tp.assessments.find(item => item.year === selectedYear) ?? removedAssessmentCache[id]
      const next = {
        yearRecordId: String(result.year_record_id),
        landAssessmentId: result.assessment_ids?.LAND_BUILDING ? String(result.assessment_ids.LAND_BUILDING) : old?.landAssessmentId ?? '',
        signAssessmentId: result.assessment_ids?.SIGN ? String(result.assessment_ids.SIGN) : old?.signAssessmentId ?? '',
        year: selectedYear,
        landAmount: result.land_amount ?? old?.landAmount ?? 0,
        signAmount: result.sign_amount ?? old?.signAmount ?? 0,
        prevLandAmount: old?.prevLandAmount ?? 0,
        prevSignAmount: old?.prevSignAmount ?? 0,
        note: result.note ?? '',
      }
      updateTaxpayer({ ...tp, notes: result.note ?? '', assessments: [...tp.assessments.filter(item => item.year !== selectedYear), next] })
    }
    setPendingEdits({}); setPendingNotes({}); setPendingAdds({}); setPendingRemoves({})
    setSaveConfirm(false); setEditMode(false)
  } catch (error) {
    console.error('Save annual taxpayer error:', error)
    alert(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ')
  } finally { setSaving(false) }
}

const handleSaveAllLegacy = async () => {
  try {
    setSaving(true)

    // ==========================================
    // SAVE รายชื่อที่นำออกจากปีภาษีก่อน
    // ==========================================
    // ต้องทำก่อน pendingAdds เพราะรายการเดียวกันอาจถูกลบแล้วเพิ่มกลับ
    // ภายใน edit session เดียวกัน เมื่อ remove สำเร็จ POST ด้านล่าง
    // จะเข้าเส้นทาง REACTIVATED ได้โดยไม่ชน duplicate record
    for (const item of Object.values(pendingRemoves)) {
      await removeTaxpayerFromYear(Number(item.yearRecordId))
    }

    // ==========================================
    // SAVE รายชื่อที่เพิ่มเข้าตาราง
    // ==========================================
    for (const taxpayerId of Object.keys(pendingAdds)) {
      const tp = taxpayers.find(t => t.id === taxpayerId)
      if (!tp) continue

      const assessment = tp.assessments.find(a => a.year === selectedYear)
      if (!assessment) continue

      const yearResult = await createTaxpayerYearRecord({
        taxpayer_id: Number(tp.id),
        tax_year: selectedYear,
        note: pendingNotes[tp.id] ?? null,
        added_by: currentUser?.id ? Number(currentUser.id) : null
      })

      const yearRecordId = Number(yearResult.data.year_record_id)

      // REACTIVATED และ ALREADY_INCLUDED ใช้ year record/assessment เดิม
      // ต้องไม่สร้าง tax assessment ซ้ำ
      if (
        yearResult.action === 'REACTIVATED' ||
        yearResult.action === 'ALREADY_INCLUDED'
      ) {
  const currentAssessment = tp.assessments.find(a => a.year === selectedYear)
  const cachedAssessment = removedAssessmentCache[tp.id]

  updateTaxpayer({
    ...tp,
    assessments: [
      ...tp.assessments.filter(a => a.year !== selectedYear),
      {
        ...currentAssessment,
        yearRecordId: String(yearRecordId),
        landAssessmentId: cachedAssessment?.landAssessmentId ?? currentAssessment?.landAssessmentId ?? '',
        signAssessmentId: cachedAssessment?.signAssessmentId ?? currentAssessment?.signAssessmentId ?? '',
        year: selectedYear,
        landAmount: pendingEdits[`${tp.id}-land`]?.newVal ?? currentAssessment?.landAmount ?? cachedAssessment?.landAmount ?? 0,
        signAmount: pendingEdits[`${tp.id}-sign`]?.newVal ?? currentAssessment?.signAmount ?? cachedAssessment?.signAmount ?? 0,
        prevLandAmount: cachedAssessment?.prevLandAmount ?? currentAssessment?.prevLandAmount ?? 0,
        prevSignAmount: cachedAssessment?.prevSignAmount ?? currentAssessment?.prevSignAmount ?? 0
      }
    ]
  })

  continue
}

      const landAmount = pendingEdits[`${tp.id}-land`]?.newVal ?? assessment.landAmount
      const signAmount = pendingEdits[`${tp.id}-sign`]?.newVal ?? assessment.signAmount

      await createTaxAssessment({
        year_record_id: yearRecordId,
        tax_type: 'LAND_BUILDING',
        assessed_amount: landAmount,
        previous_amount: assessment.prevLandAmount ?? 0,
        change_reason: pendingEdits[`${tp.id}-land`]?.reason ?? null,
        assessment_date: null,
        annual_due_date: null,
        created_by: currentUser?.id ? Number(currentUser.id) : null
      })

      await createTaxAssessment({
        year_record_id: yearRecordId,
        tax_type: 'SIGN',
        assessed_amount: signAmount,
        previous_amount: assessment.prevSignAmount ?? 0,
        change_reason: pendingEdits[`${tp.id}-sign`]?.reason ?? null,
        assessment_date: null,
        annual_due_date: null,
        created_by: currentUser?.id ? Number(currentUser.id) : null
      })
    }

    // รวม pending edits ของ LAND / SIGN ตาม taxpayer
    const grouped: Record<string, { land?: number; sign?: number }> = {}

    Object.entries(pendingEdits).forEach(([key, edit]) => {
      const [id, type] = key.split('-') as [string, 'land' | 'sign']
      if (!grouped[id]) grouped[id] = {}
      grouped[id][type] = edit.newVal
    })

    // ==========================================
    // SAVE TAX ASSESSMENTS ลง PostgreSQL
    // ==========================================
    for (const tp of taxpayers) {
      if (!grouped[tp.id]) continue

      // รายที่เพิ่งเพิ่ม ถูกจัดการด้านบนแล้ว
      if (pendingAdds[tp.id]) continue

      const assessment = tp.assessments.find(a => a.year === selectedYear)
      if (!assessment) continue

      if (!assessment.yearRecordId) {
        throw new Error(`ไม่พบ yearRecordId ของ ${getTaxpayerName(tp)}`)
      }

      const landAmount = grouped[tp.id].land !== undefined
        ? grouped[tp.id].land!
        : assessment.landAmount

      const signAmount = grouped[tp.id].sign !== undefined
        ? grouped[tp.id].sign!
        : assessment.signAmount

      // =========================
      // LAND_BUILDING
      // =========================
      if (grouped[tp.id].land !== undefined) {
        if (assessment.landAssessmentId) {
          await updateTaxAssessment(Number(assessment.landAssessmentId), {
            assessed_amount: landAmount,
            previous_amount: assessment.prevLandAmount ?? 0,
            change_reason: pendingEdits[`${tp.id}-land`]?.reason ?? null,
            assessment_date: null,
            annual_due_date: null,
            updated_by: currentUser?.id ? Number(currentUser.id) : null
          })
        } else {
          await createTaxAssessment({
            year_record_id: Number(assessment.yearRecordId),
            tax_type: 'LAND_BUILDING',
            assessed_amount: landAmount,
            previous_amount: assessment.prevLandAmount ?? 0,
            change_reason: pendingEdits[`${tp.id}-land`]?.reason ?? null,
            assessment_date: null,
            annual_due_date: null,
            created_by: currentUser?.id ? Number(currentUser.id) : null
          })
        }
      }

      // =========================
      // SIGN
      // =========================
      if (grouped[tp.id].sign !== undefined) {
        if (assessment.signAssessmentId) {
          await updateTaxAssessment(Number(assessment.signAssessmentId), {
            assessed_amount: signAmount,
            previous_amount: assessment.prevSignAmount ?? 0,
            change_reason: pendingEdits[`${tp.id}-sign`]?.reason ?? null,
            assessment_date: null,
            annual_due_date: null,
            updated_by: currentUser?.id ? Number(currentUser.id) : null
          })
        } else {
          await createTaxAssessment({
            year_record_id: Number(assessment.yearRecordId),
            tax_type: 'SIGN',
            assessed_amount: signAmount,
            previous_amount: assessment.prevSignAmount ?? 0,
            change_reason: pendingEdits[`${tp.id}-sign`]?.reason ?? null,
            assessment_date: null,
            annual_due_date: null,
            created_by: currentUser?.id ? Number(currentUser.id) : null
          })
        }
      }

      // ==========================================
      // UPDATE REACT STATE เดิมของ FIGMA
      // ==========================================
      const updated: Taxpayer = {
        ...tp,
        assessments: tp.assessments.map(a => {
          if (a.year !== selectedYear) return a

          return {
            ...a,
            ...(grouped[tp.id].land !== undefined ? { landAmount: grouped[tp.id].land! } : {}),
            ...(grouped[tp.id].sign !== undefined ? { signAmount: grouped[tp.id].sign! } : {})
          }
        })
      }

      updateTaxpayer(updated)
    }

    // ==========================================
    // SAVE NOTE
    // ==========================================
    for (const tp of taxpayers) {
      if (pendingNotes[tp.id] === undefined) continue

      // รายที่เพิ่งเพิ่ม note ถูกส่งตอน createTaxpayerYearRecord แล้ว
      if (pendingAdds[tp.id]) continue

      const assessment = tp.assessments.find(a => a.year === selectedYear)
      if (!assessment?.yearRecordId) continue

      await updateTaxpayerYearRecord(Number(assessment.yearRecordId), {
        note: pendingNotes[tp.id],
        is_included: true
      })

      updateTaxpayer({
        ...tp,
        notes: pendingNotes[tp.id]
      })
    }

    setPendingEdits({})
    setPendingNotes({})
    setPendingAdds({})
    setPendingRemoves({})
    setSaveConfirm(false)
    setEditMode(false)

  } catch (error) {
    console.error('Save annual taxpayer error:', error)

    alert(
      error instanceof Error
        ? error.message
        : 'บันทึกข้อมูลไม่สำเร็จ'
    )

  } finally {
    setSaving(false)
  }
}

const handleRemove = (tp: Taxpayer) => {
  if (pendingAdds[tp.id]) {
    updateTaxpayer({
      ...tp,
      assessments: tp.assessments.filter(a => a.year !== selectedYear)
    })

    setPendingAdds(prev => {
      const next = { ...prev }
      delete next[tp.id]
      return next
    })

    setPendingEdits(prev => {
      const next = { ...prev }
      delete next[`${tp.id}-land`]
      delete next[`${tp.id}-sign`]
      return next
    })

    setPendingNotes(prev => {
      const next = { ...prev }
      delete next[tp.id]
      return next
    })

    setRemoveTarget(null)
    return
  }

  const assessment = tp.assessments.find(a => a.year === selectedYear)

  if (!assessment?.yearRecordId) {
    alert(`ไม่พบข้อมูลปีภาษีของ ${getTaxpayerName(tp)}`)
    return
  }

  // จำข้อมูล assessment เดิมทั้งหมดไว้
  setRemovedAssessmentCache(prev => ({
    ...prev,
    [tp.id]: assessment
  }))

  setPendingRemoves(prev => ({
    ...prev,
    [tp.id]: {
      taxpayer: tp,
      yearRecordId: assessment.yearRecordId
    }
  }))

  setPendingEdits(prev => {
    const next = { ...prev }
    delete next[`${tp.id}-land`]
    delete next[`${tp.id}-sign`]
    return next
  })

  setPendingNotes(prev => {
    const next = { ...prev }
    delete next[tp.id]
    return next
  })

  updateTaxpayer({
    ...tp,
    assessments: tp.assessments.filter(a => a.year !== selectedYear)
  })

  setRemoveTarget(null)
}

  // 1) รายชื่อที่อยู่ในปีที่เลือกอยู่แล้ว
  const existingThisYear = useMemo(() => {
    return new Set(
      taxpayers
        .filter(tp => tp.assessments.some(a => a.year === selectedYear))
        .map(tp => tp.id)
    )
  }, [taxpayers, selectedYear])

  // 2) รายชื่อที่ค้นหาได้
  const inlineCandidates = useMemo(() => {
    const searchText = inlineSearch.trim().toLowerCase()
    if (!searchText) return []

    return taxpayers
      .filter(tp => {
        if (!isDirector && tp.group !== currentUser?.group) return false
        if (existingThisYear.has(tp.id)) return false

        const name = getTaxpayerName(tp).toLowerCase()
        const ownerCode = (tp.ownerCode ?? '').toLowerCase()
        const phone = (tp.phone ?? '').toLowerCase()

        return name.includes(searchText) || ownerCode.includes(searchText) || phone.includes(searchText)
      })
      .sort((a, b) => {
        const nameA = getTaxpayerName(a).toLowerCase()
        const nameB = getTaxpayerName(b).toLowerCase()

        const aStarts = nameA.startsWith(searchText)
        const bStarts = nameB.startsWith(searchText)

        if (aStarts && !bStarts) return -1
        if (!aStarts && bStarts) return 1
        return nameA.localeCompare(nameB, 'th')
      })
      .slice(0, 8)

  }, [inlineSearch, taxpayers, isDirector, currentUser, existingThisYear])

  const handleInlineSelect = (tp: Taxpayer) => {
    setInlineSelected(tp)
    setInlineSearch(getTaxpayerName(tp))
    setInlineDropOpen(false)
  }

const handleInlineAdd = async () => {
  if (!inlineSelected) return

  const taxpayerId = inlineSelected.id

  setInlineAdding(true)

  try {
  // ใช้ cache ก่อน หากเปลี่ยนหน้าไปแล้วให้โหลดข้อมูลเดิมจากฐานข้อมูล
  const removedAssessment =
    removedAssessmentCache[taxpayerId] ??
    await getTaxpayerYearRecord(Number(taxpayerId), selectedYear)

  // ถ้าไม่เคยมีปีนี้ ค่อยใช้ข้อมูลปีก่อน/ปีล่าสุด
  const previousAssessment = [...inlineSelected.assessments]
    .filter(a => a.year < selectedYear)
    .sort((a, b) => b.year - a.year)[0]

  const sourceAssessment = removedAssessment ?? previousAssessment

  const landAmount = sourceAssessment?.landAmount ?? 0
  const signAmount = sourceAssessment?.signAmount ?? 0

  const updated: Taxpayer = {
    ...inlineSelected,
    assessments: [
      ...inlineSelected.assessments.filter(a => a.year !== selectedYear),
      {
        yearRecordId: removedAssessment?.yearRecordId ?? '',
        landAssessmentId: removedAssessment?.landAssessmentId ?? '',
        signAssessmentId: removedAssessment?.signAssessmentId ?? '',
        year: selectedYear,
        landAmount,
        signAmount,
        prevLandAmount: removedAssessment
          ? removedAssessment.prevLandAmount ?? 0
          : previousAssessment?.landAmount ?? 0,
        prevSignAmount: removedAssessment
          ? removedAssessment.prevSignAmount ?? 0
          : previousAssessment?.signAmount ?? 0
      }
    ]
  }

  updateTaxpayer(updated)

  // เก็บ pendingAdds แม้เป็นคนเดียวกับ pendingRemoves เพื่อให้กรณี
  // ลบ -> เพิ่ม -> บันทึก ถูกนับเป็น 2 การเปลี่ยนแปลง
  setPendingAdds(prev => ({ ...prev, [taxpayerId]: true }))

  setInlineSearch('')
  setInlineSelected(null)
  setInlineDropOpen(false)
  } catch (error) {
    alert(error instanceof Error ? error.message : 'เพิ่มผู้เสียภาษีเข้าตารางไม่สำเร็จ')
  } finally {
    setInlineAdding(false)
  }
}

  const diff = (curr: number, prev: number) => {
    const d = curr - prev
    if (d === 0) return <span className="status-badge tag-same" style={{ fontSize: 11, padding: '2px 8px' }}>เท่าเดิม</span>
    return <span className="status-badge" style={{ fontSize: 11, padding: '2px 8px', ...(d > 0 ? { background: '#e8fdf4', color: '#1a8f5a' } : { background: '#fff1f0', color: '#c0392b' }) }}>{d > 0 ? '+' : ''}{formatCurrency(d)}</span>
  }

  const changedNoteCount = Object.entries(pendingNotes).filter(([id, value]) => {
    const tp = taxpayers.find(t => t.id === id)
    return value !== (tp?.notes ?? '')
  }).length

  const pendingCount =
    Object.keys(pendingEdits).length +
    Object.keys(pendingAdds).length +
    Object.keys(pendingRemoves).length +
    changedNoteCount

  const hasPending = pendingCount > 0

  if (!hasSelectedYearData) {
    return (
      <div className="annual-taxpayer-page" style={{ padding: 24, maxWidth: 1400 }}>
        <div className="glass-card" style={{
          minHeight: 360,
          padding: '54px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}>
          <div style={{
            width: 58, height: 58, borderRadius: 16,
            display: 'grid', placeItems: 'center', marginBottom: 16,
            background: 'rgba(124,92,191,0.1)', fontSize: 26,
          }}>📅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2d2545', marginBottom: 6 }}>
            ยังไม่มีข้อมูลปีภาษี {selectedYear}
          </div>
          <div style={{ fontSize: 13, color: '#a89cc8', marginBottom: 20 }}>
            {sourceTaxpayers.length > 0
              ? `สร้างข้อมูลตั้งต้นจากปี ${sourceYear} จำนวน ${sourceTaxpayers.length} ราย โดยไม่กระทบข้อมูลปีเดิม`
              : `ไม่พบข้อมูลปี ${sourceYear} สำหรับใช้เป็นข้อมูลตั้งต้น`}
          </div>
          <button
            className="btn-primary"
            disabled={sourceTaxpayers.length === 0}
            onClick={() => { setOpenYearError(''); setShowOpenYearModal(true) }}
          >
            เปิดรอบปี {selectedYear}
          </button>
        </div>

        {showOpenYearModal && (
          <Modal title={`เปิดรอบปีภาษี ${selectedYear}`} onClose={() => !openingYear && setShowOpenYearModal(false)} maxWidth="560px">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end', marginBottom: 16 }}>
              <div>
                <label style={LBL}>นำข้อมูลจากปี</label>
                <div className="input-field" style={{ background: 'rgba(240,236,251,.35)' }}>{sourceYear}</div>
              </div>
              <div style={{ paddingBottom: 10, color: '#7c5cbf' }}>→</div>
              <div>
                <label style={LBL}>สร้างเป็นปีภาษี</label>
                <div className="input-field" style={{ background: 'rgba(240,236,251,.35)' }}>{selectedYear}</div>
              </div>
            </div>

            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(240,236,251,.42)', fontSize: 13, color: '#5f5178' }}>
              <div style={{ fontWeight: 700, color: '#2d2545', marginBottom: 9 }}>ระบบจะดำเนินการดังนี้</div>
              <div style={{ marginBottom: 6 }}>✓ คัดลอกรายชื่อ ข้อมูลติดต่อ กลุ่ม และยอดภาษีเดิม {sourceTaxpayers.length} ราย</div>
              <div style={{ marginBottom: 6 }}>✓ หลังสร้างยังเพิ่ม ลด และแก้ไขข้อมูลในตารางได้ตามปกติ</div>
              <div style={{ color: '#c0392b' }}>× ไม่คัดลอกประวัติการชำระและประวัติการติดต่อ</div>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: '#8a5a00' }}>
              หลังยืนยัน ระบบจะเปิดตารางปี {selectedYear} รูปแบบเดียวกับปีปัจจุบันทันที
            </div>

            {openYearError && (
              <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 9, background: '#fff1f0', color: '#c0392b', fontSize: 12 }}>
                {openYearError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn-secondary" disabled={openingYear} onClick={() => setShowOpenYearModal(false)}>ยกเลิก</button>
              <button className="btn-primary" disabled={openingYear} onClick={handleOpenYear}>
                {openingYear ? '⏳ กำลังเปิดรอบ...' : `ยืนยันเปิดรอบปี ${selectedYear}`}
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  return (
    <div className="annual-taxpayer-page" style={{ padding: 24, maxWidth: 1400 }}>
      {/* toolbar */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input-field" style={{ width: 240 }} placeholder="🔍 ค้นหาชื่อ, รหัส, หมายเลขโทรศัพท์"
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
          <option value="company">นิติบุคคลหรือบริษัท</option>
        </select>

        <span style={{ fontSize: 13, color: '#a89cc8' }}>{filtered.length} รายการ</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {!editMode && <>
            <button className="btn-secondary no-print" onClick={() => window.print()} style={{ fontSize: 12 }}>🖨 พิมพ์</button>
            <button className="btn-secondary no-print" onClick={() => exportExcel(filtered, selectedYear, groupFilter)} style={{ fontSize: 12 }}>📥 ส่งออกข้อมูล Excel</button>
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
                {hasPending && <span style={{ marginLeft: 8, color: '#7c5cbf' }}>· {pendingCount} รายการรอบันทึก</span>}
              </div>

              <button className="btn-secondary" onClick={() => { setEditMode(false); setPendingEdits({}); setPendingNotes({}) }} style={{ fontSize: 13 }}>
                ยกเลิก
              </button>

              <button className="btn-primary" onClick={() => setSaveConfirm(true)} disabled={!hasPending} style={{ fontSize: 13 }}>
                💾 บันทึกการแก้ไข
              </button>
            </>
          )}

        </div>
      </div>

      {selectedYear < CURRENT_YEAR && (
        <div className="no-print" style={{ marginBottom: 16, padding: '10px 16px', background: '#fff8e6', border: '1px solid rgba(230,160,0,0.25)', borderRadius: 12, fontSize: 13, color: '#8a5a00' }}>
          📁 ปี {selectedYear} เป็นข้อมูลในอดีต — <strong>สำหรับตรวจสอบเท่านั้น</strong>
        </div>
      )}

      <div className="annual-print-document print-only">
        {printPages.map((pageRows, pageIndex) => (
          <section className="annual-print-page" key={`print-page-${pageIndex}`}>
            <header className="annual-print-header">
              <div className="annual-print-agency">เทศบาลเมืองตาคลี</div>
              <div className="annual-print-heading">รายละเอียดผู้ชำระภาษี (กค.)</div>
              <div className="annual-print-subheading">ประจำปี {selectedYear} {tableGroupLabel !== 'ทุกกลุ่ม' ? `อักษร ${tableGroupLabel}` : '(ทุกกลุ่ม)'}</div>
              <div className="annual-print-meta"><span>พิมพ์วันที่ {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span><span>จำนวนทั้งสิ้น {filtered.length} ราย</span></div>
            </header>
            <div className="annual-print-table-title">รายละเอียดผู้ชำระภาษีที่ดินและสิ่งปลูกสร้าง-ภาษีป้าย_{selectedYear}_{tableGroupLabel}</div>
            <table className="annual-print-table">
              <colgroup><col className="print-col-number" /><col className="print-col-code" /><col className="print-col-name" /><col span={6} className="print-col-tax" /><col className="print-col-note" /><col className="print-col-status" /></colgroup>
              <thead><tr><th rowSpan={2}>#</th><th rowSpan={2}>รหัส</th><th rowSpan={2}>ชื่อ-นามสกุล / บริษัท</th><th colSpan={3}>ภาษีที่ดินและสิ่งปลูกสร้าง</th><th colSpan={3}>ภาษีป้าย</th><th rowSpan={2}>หมายเหตุ</th><th rowSpan={2}>สถานะ</th></tr><tr><th>ปีนี้</th><th>ปีก่อน</th><th>เพิ่ม/ลด</th><th>ปีนี้</th><th>ปีก่อน</th><th>เพิ่ม/ลด</th></tr></thead>
              <tbody>{pageRows.map((tp, rowIndex) => {
                const assessment = getAssessment(tp, selectedYear)
                const currentLand = assessment?.landAmount ?? 0
                const currentSign = assessment?.signAmount ?? 0
                const previousLand = assessment?.prevLandAmount ?? 0
                const previousSign = assessment?.prevSignAmount ?? 0
                const status = getPaymentStatus(tp, selectedYear)
                const statusLabel = status === 'paid' ? 'ชำระครบ' : status === 'partial' ? 'ชำระบางส่วน' : 'ยังไม่ชำระ'
                const formatDifference = (value: number) => value === 0 ? 'เท่าเดิม' : `${value > 0 ? '+' : ''}${formatCurrency(value)}`
                return <tr key={`print-${tp.id}`}><td>{pageIndex * PRINT_ROWS_PER_PAGE + rowIndex + 1}</td><td>{tp.ownerCode || '-'}</td><td>{getTaxpayerName(tp)}</td><td className="number-cell">฿{formatCurrency(currentLand)}</td><td className="number-cell">฿{formatCurrency(previousLand)}</td><td className="number-cell">{formatDifference(currentLand - previousLand)}</td><td className="number-cell">฿{formatCurrency(currentSign)}</td><td className="number-cell">฿{formatCurrency(previousSign)}</td><td className="number-cell">{formatDifference(currentSign - previousSign)}</td><td>{tp.notes || '-'}</td><td>{statusLabel}</td></tr>
              })}</tbody>
              {pageIndex === printPages.length - 1 && <tfoot><tr><td colSpan={3}>รวม {filtered.length} ราย</td><td className="number-cell">฿{formatCurrency(landTotal)}</td><td colSpan={2}></td><td className="number-cell">฿{formatCurrency(signTotal)}</td><td colSpan={2}></td><td className="number-cell">฿{formatCurrency(landTotal + signTotal)}</td><td></td></tr></tfoot>}
            </table>
            <footer className="annual-print-page-number">หน้า {pageIndex + 1} จาก {printPages.length}</footer>
          </section>
        ))}
      </div>

      {/* Legacy screen table header is hidden in print because paginated pages above include their own header. */}
      <div className="print-only legacy-print-header" style={{ marginBottom: 16, borderBottom: '2px solid #222', paddingBottom: 12 }}>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
          รายละเอียดผู้ชำระภาษี (กค.)
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, marginTop: 4 }}>
          ประจำปี {selectedYear} {tableGroupLabel !== 'ทุกกลุ่ม' ? `อักษร ${tableGroupLabel}` : '(ทุกกลุ่ม)'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 8, color: '#555' }}>
          <span>พิมพ์วันที่: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span>จำนวน {filtered.length} ราย</span>
        </div>
      </div>

      <div className="glass-card annual-print-card annual-screen-table" style={{ padding: 0, overflow: 'visible' }}>
        <div className="annual-table-title" style={{ padding: '16px 18px', fontSize: 18, fontWeight: 700, color: '#5f4796', background: 'linear-gradient(90deg,rgba(240,236,251,.85),rgba(255,255,255,.7))', borderBottom: '1px solid rgba(200,190,240,.25)' }}>
          รายละเอียดผู้ชำระภาษีที่ดินและสิ่งปลูกสร้าง-ภาษีป้าย_{selectedYear}_{tableGroupLabel}
        </div>
        {filtered.length === 0 && !editMode ? (
          <EmptyState
            icon="🔍"
            title="ไม่พบข้อมูลผู้เสียภาษี"
            sub={groupFilter !== 'all'
              ? `ไม่พบข้อมูลในกลุ่ม ${groupFilter} สำหรับปีภาษี ${selectedYear} กรุณาเลือกกลุ่มอื่น`
              : 'ไม่พบข้อมูลตามเงื่อนไขที่ระบุ กรุณาปรับตัวกรองแล้วลองอีกครั้ง'}
          />
        ) : (
          <div className="annual-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="annual-taxpayer-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <colgroup>
                <col className="col-number" />
                <col className="col-code" />
                <col className="col-name" />
                <col span={6} className="col-tax" />
                <col className="col-note" />
                <col className="col-status" />
                {editMode && <col className="col-action" />}
              </colgroup>
              <thead>
                <tr style={{ background: 'rgba(240,236,251,0.6)' }}>
                  <th style={TH}>#</th>
                  <th style={TH}>รหัส</th>
                  <th style={TH}>ชื่อ-นามสกุล / บริษัท</th>
                  <th style={{ ...TH, textAlign: 'center' }} colSpan={3}>ภาษีที่ดินและสิ่งปลูกสร้าง</th>
                  <th style={{ ...TH, textAlign: 'center' }} colSpan={3}>ภาษีป้าย</th>
                  <th style={TH}>หมายเหตุ</th>
                  <th style={TH}>สถานะ</th>
                  {editMode && <th style={{ ...TH, width: 40 }}></th>}
                </tr>

                <tr style={{ background: 'rgba(240,236,251,0.35)' }}>
                  <th style={TH} colSpan={3}></th>
                  {['ปีนี้', 'ปีก่อน', 'เพิ่ม/ลด'].map(h => <th key={`l${h}`} style={{ ...TH, fontWeight: 500, color: '#8873b5', fontSize: 11 }}>{h}</th>)}
                  {['ปีนี้', 'ปีก่อน', 'เพิ่ม/ลด'].map(h => <th key={`s${h}`} style={{ ...TH, fontWeight: 500, color: '#8873b5', fontSize: 11 }}>{h}</th>)}
                  <th style={TH} colSpan={editMode ? 3 : 2}></th>
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
                    <td style={TD} colSpan={editMode ? 12 : 11}>
                      <div style={{ fontSize: 11, color: '#7c5cbf', marginBottom: 3, fontWeight: 600 }}>+ เพิ่มรายการ</div>
                      <div style={{ fontSize: 10, color: '#a89cc8', marginBottom: 7 }}>
                        เลือกผู้เสียภาษีแล้วเพิ่มเข้าตาราง ระบบจะใช้ยอดภาษีล่าสุดเป็นค่าเริ่มต้น
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div ref={inlineDropRef} style={{ width: 320, maxWidth: '100%' }}>
                          <input
                            className="input-field"
                            placeholder="ค้นหาและเลือกผู้เสียภาษี"
                            value={inlineSearch}
                            onChange={e => { setInlineSearch(e.target.value); setInlineSelected(null); setInlineDropOpen(true) }}
                            onFocus={() => { if (inlineSearch) setInlineDropOpen(true) }}
                            style={{ fontSize: 12, padding: '6px 10px', width: '100%' }}
                          />

                          {inlineDropOpen && (
                            <div style={{
                              marginTop: 4, width: '100%', maxHeight: 230, overflowY: 'auto',
                              background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
                              border: '1px solid rgba(196,181,240,0.4)', borderRadius: 12,
                              boxShadow: '0 8px 20px rgba(124,92,191,0.10)'
                            }}>
                              {inlineCandidates.length === 0 ? (
                                <div style={{ padding: '12px 14px', fontSize: 12, color: '#a89cc8', textAlign: 'center' }}>
                                  <div style={{ marginBottom: 8 }}>ไม่พบผู้เสียภาษีในระบบ</div>
                                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: '#7c5cbf' }}
                                    onMouseDown={() => navigate('/taxpayers/new')}>
                                    + เพิ่มผู้เสียภาษีรายใหม่
                                  </button>
                                </div>
                              ) : (
                                inlineCandidates.map(tp => (
                                  <div
                                    key={tp.id}
                                    onMouseDown={() => handleInlineSelect(tp)}
                                    style={{
                                      padding: '10px 14px', borderBottom: '1px solid rgba(200,190,240,0.15)',
                                      cursor: 'pointer', background: 'transparent', transition: 'background 0.1s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,236,251,0.6)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                  >
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2d2545' }}>
                                      {getTaxpayerName(tp)}
                                    </div>

                                    <div style={{ fontSize: 11, color: '#a89cc8', display: 'flex', gap: 8, marginTop: 2 }}>
                                      {tp.ownerCode && <span style={{ fontFamily: 'monospace' }}>{tp.ownerCode}</span>}
                                      <span>{tp.type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}</span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {inlineSelected && (
                            <div style={{ marginTop: 5, fontSize: 11, color: '#1a8f5a', fontWeight: 600 }}>
                              ✓ เลือก: {getTaxpayerName(inlineSelected)} · {inlineSelected.type === 'company' ? 'นิติบุคคล' : 'บุคคลธรรมดา'}
                            </div>
                          )}
                        </div>

                        <button
                          className="btn-primary"
                          onClick={handleInlineAdd}
                          disabled={!inlineSelected || inlineAdding}
                          style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
                        >
                          {inlineAdding ? '...' : '+ เพิ่มเข้าตาราง'}
                        </button>
                      </div>
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
                  <td colSpan={editMode ? 2 : 1} style={TD}></td>
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
            จะบันทึก <strong>{pendingCount} รายการ</strong> ที่แก้ไขในปีภาษี {selectedYear} ใช่ไหม?
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
            }}>
              ยืนยันนำออก
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#6b5b95', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,190,240,0.25)', fontSize: 12 }
const TD: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' }
const LBL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
