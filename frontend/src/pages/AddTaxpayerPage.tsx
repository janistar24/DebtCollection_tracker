import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { CURRENT_YEAR } from '../data/mockData'
import { generateOwnerCode, isDuplicateCode } from '../utils/ownerCode'
import type { Taxpayer } from '../types'
import { createTaxpayer } from '../api/taxpayers'
import {
  createTaxpayerYearRecord
} from '../api/taxpayer_year_records'

import {
  createTaxAssessment
} from '../api/tax_assessments'

export default function AddTaxpayerPage() {
  const { currentUser, taxpayers, refreshData } = useApp()
  const navigate = useNavigate()

  const [tpType, setTpType] = useState<'individual' | 'company'>('individual')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [landAmount, setLandAmount] = useState('')
  const [signAmount, setSignAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Auto-generated owner code
  const [generatedCode, setGeneratedCode] = useState('')
  const [isDuplicate, setIsDuplicate] = useState(false)

  const existingCodes = taxpayers.map(tp => tp.ownerCode)

  useEffect(() => {
    if (tpType === 'individual' && firstName && lastName) {
      const code = generateOwnerCode(firstName, lastName)
      setGeneratedCode(code)
      setIsDuplicate(isDuplicateCode(code, existingCodes))
    } else {
      setGeneratedCode('')
      setIsDuplicate(false)
    }
  }, [firstName, lastName, tpType])

  // Determine group from first consonant prefix
  const getGroupFromCode = (code: string): Taxpayer['group'] => {
    const ch = code.charAt(0)
    const groups: Record<string, Taxpayer['group']> = {
      'ก': 'ก-น', 'ข': 'ก-น', 'ค': 'ก-น', 'ง': 'ก-น', 'จ': 'ก-น', 'ฉ': 'ก-น',
      'ช': 'ก-น', 'ซ': 'ก-น', 'ญ': 'ก-น', 'ด': 'ก-น', 'ต': 'ก-น', 'ถ': 'ก-น',
      'ท': 'ก-น', 'ธ': 'ก-น', 'น': 'ก-น',
      'บ': 'บ-ล', 'ป': 'บ-ล', 'ผ': 'บ-ล', 'ฝ': 'บ-ล', 'พ': 'บ-ล', 'ฟ': 'บ-ล',
      'ภ': 'บ-ล', 'ม': 'บ-ล', 'ย': 'บ-ล', 'ร': 'บ-ล', 'ล': 'บ-ล',
      'ว': 'ว-ฮ และบริษัท', 'ศ': 'ส-ศ', 'ษ': 'ส-ศ', 'ส': 'ส-ศ', 'ห': 'ว-ฮ และบริษัท',
      'อ': 'ว-ฮ และบริษัท', 'ฮ': 'ว-ฮ และบริษัท', 'ฬ': 'ว-ฮ และบริษัท', 'ฤ': 'ว-ฮ และบริษัท',
    }
    return groups[ch] ?? (currentUser?.group ?? 'ก-น')
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (tpType === 'individual' && !firstName) errs.firstName = 'กรุณากรอกชื่อ'
    if (tpType === 'individual' && !lastName) errs.lastName = 'กรุณากรอกนามสกุล'
    if (tpType === 'individual' && !generatedCode) errs.code = 'ไม่สามารถสร้างรหัสได้ กรุณาตรวจสอบชื่อ-นามสกุล'
    if (tpType === 'company' && !companyName) errs.companyName = 'กรุณากรอกชื่อบริษัท'
    if (!phone) errs.phone = 'กรุณากรอกเบอร์โทร'
    if (!address) errs.address = 'กรุณากรอกที่อยู่'
    if (!landAmount && !signAmount) errs.tax = 'กรุณากรอกยอดภาษีอย่างน้อยหนึ่งประเภท'
    if (isDuplicate) errs.code = `รหัส ${generatedCode} ซ้ำกับผู้เสียภาษีที่มีอยู่แล้ว กรุณาตรวจสอบ`
    return errs
  }

const handleSubmit = async (
  e: React.FormEvent
) => {
  e.preventDefault()

  const errs = validate()

  if (Object.keys(errs).length > 0) {
    setErrors(errs)
    return
  }

  try {
    setSaving(true)

    const ownerCode =
      tpType === 'individual'
        ? generatedCode
        : null

    const group: Taxpayer['group'] =
      tpType === 'company'
        ? 'ว-ฮ และบริษัท'
        : getGroupFromCode(generatedCode)


    // ============================
    // 1. CREATE MASTER TAXPAYER
    // ============================

    const taxpayerResult =
      await createTaxpayer({
        taxpayer_type:
          tpType === 'company'
            ? 'COMPANY'
            : 'INDIVIDUAL',

        owner_code:
          ownerCode,

        first_name:
          tpType === 'individual'
            ? firstName
            : null,

        last_name:
          tpType === 'individual'
            ? lastName
            : null,

        company_name:
          tpType === 'company'
            ? companyName
            : null,

        phone:
          phone || null,

        address:
          address || null,

        group_code:
          group,

        is_active:
          true
      })


    // ต้องได้ taxpayer_id กลับมาจาก API
    const taxpayerId =
      Number(
        taxpayerResult.data.taxpayer_id
      )


    // ============================
    // 2. CREATE YEAR RECORD
    // ============================

    const yearResult =
      await createTaxpayerYearRecord({
        taxpayer_id:
          taxpayerId,

        tax_year:
          CURRENT_YEAR,

        note:
          null,

        added_by:
          currentUser?.id
            ? Number(currentUser.id)
            : null
      })


    const yearRecordId =
      Number(
        yearResult.data.year_record_id
      )


    const land =
      parseFloat(landAmount) || 0

    const sign =
      parseFloat(signAmount) || 0


    // ============================
    // CREATE LAND ASSESSMENT
    // ============================

    if (land > 0) {
      await createTaxAssessment({
        year_record_id:
          yearRecordId,

        tax_type:
          'LAND_BUILDING',

        assessed_amount:
          land,

        previous_amount:
          0,

        change_reason:
          null,

        assessment_date:
          null,

        annual_due_date:
          null,

        created_by:
          currentUser?.id
            ? Number(currentUser.id)
            : null
      })
    }


    // ============================
    // CREATE SIGN ASSESSMENT
    // ============================

    if (sign > 0) {
      await createTaxAssessment({
        year_record_id:
          yearRecordId,

        tax_type:
          'SIGN',

        assessed_amount:
          sign,

        previous_amount:
          0,

        change_reason:
          null,

        assessment_date:
          null,

        annual_due_date:
          null,

        created_by:
          currentUser?.id
            ? Number(currentUser.id)
            : null
      })
    }


    // โหลดข้อมูลล่าสุดจากฐานข้อมูล
    await refreshData()

    setSaved(true)

    // เปลี่ยนหน้าด้วย React โดยไม่ reload
    navigate('/taxpayers')

  } catch (error) {

    console.error(
      'Create taxpayer error:',
      error
    )

    alert(
      error instanceof Error
        ? error.message
        : 'เพิ่มผู้เสียภาษีไม่สำเร็จ'
    )

  } finally {
    setSaving(false)
  }
}

  if (saved) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a8f5a', marginBottom: 8 }}>บันทึกผู้เสียภาษีเรียบร้อย</div>
        <div style={{ fontSize: 14, color: '#a89cc8' }}>กำลังนำกลับไปหน้ารายการ...</div>
      </div>
    </div>
  )

  const err = (key: string) => errors[key] ? (
    <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>⚠ {errors[key]}</div>
  ) : null

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ marginBottom: 16 }}>
        <button className="btn-ghost" onClick={() => navigate('/taxpayers')} style={{ fontSize: 13, padding: '6px 10px' }}>
          ← กลับไปรายการ
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#2d2545', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>📋</span> ข้อมูลหลัก
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Person type */}
            <div>
              <label style={LBL}>ประเภทผู้เสียภาษี *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['individual', '👤 บุคคลธรรมดา'], ['company', '🏢 นิติบุคคล / บริษัท']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => { setTpType(v as 'individual' | 'company'); setFirstName(''); setLastName(''); setCompanyName('') }} style={{
                    padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Sarabun',sans-serif", fontSize: 13,
                    border: tpType === v ? '1.5px solid #7c5cbf' : '1px solid rgba(180,165,230,0.3)',
                    background: tpType === v ? 'rgba(124,92,191,0.1)' : 'transparent',
                    color: tpType === v ? '#7c5cbf' : '#6b5b95', fontWeight: tpType === v ? 600 : 400
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Name fields */}
            {tpType === 'individual' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={LBL}>ชื่อ (ไม่ต้องมีคำนำหน้า) *</label>
                  <input className="input-field" placeholder="เช่น กรกน" value={firstName}
                    onChange={e => { setFirstName(e.target.value); setErrors(prev => ({ ...prev, firstName: '', code: '' })) }} />
                  {err('firstName')}
                </div>
                <div>
                  <label style={LBL}>นามสกุล *</label>
                  <input className="input-field" placeholder="เช่น สำลีสัน" value={lastName}
                    onChange={e => { setLastName(e.target.value); setErrors(prev => ({ ...prev, lastName: '', code: '' })) }} />
                  {err('lastName')}
                </div>
              </div>
            ) : (
              <div>
                <label style={LBL}>ชื่อบริษัท / นิติบุคคล *</label>
                <input className="input-field" placeholder="ชื่อบริษัท จำกัด / ห้างหุ้นส่วน" value={companyName}
                  onChange={e => { setCompanyName(e.target.value); setErrors(prev => ({ ...prev, companyName: '' })) }} />
                {err('companyName')}
              </div>
            )}

            {/* Auto-generated Owner Code — บุคคลธรรมดาเท่านั้น */}
            {tpType === 'individual' && (
              <div>
                <label style={LBL}>รหัสเจ้าของทรัพย์สิน (สร้างอัตโนมัติ)</label>
                <div style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: generatedCode ? (isDuplicate ? 'rgba(192,57,43,0.06)' : 'rgba(26,143,90,0.06)') : 'rgba(240,236,251,0.4)',
                  border: `1px solid ${generatedCode ? (isDuplicate ? 'rgba(192,57,43,0.3)' : 'rgba(26,143,90,0.25)') : 'rgba(180,165,230,0.25)'}`,
                  display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <div style={{ flex: 1 }}>
                    {generatedCode ? (
                      <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: isDuplicate ? '#c0392b' : '#2d2545', letterSpacing: '0.05em' }}>
                        {generatedCode}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: '#a89cc8' }}>กรอกชื่อและนามสกุลเพื่อสร้างรหัสอัตโนมัติ</div>
                    )}
                    <div style={{ fontSize: 11, color: '#a89cc8', marginTop: 3 }}>
                      ระบบสร้างรหัสจากชื่อและนามสกุลโดยอัตโนมัติ ไม่ต้องกรอก
                    </div>
                  </div>
                  {generatedCode && !isDuplicate && <span style={{ fontSize: 18 }}>✅</span>}
                  {isDuplicate && <span style={{ fontSize: 18 }}>⚠️</span>}
                </div>
                {isDuplicate && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: '#fff1f0', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 8, fontSize: 12, color: '#c0392b' }}>
                    ⚠ รหัส <strong>{generatedCode}</strong> ซ้ำกับผู้เสียภาษีที่มีอยู่แล้ว — กรุณาตรวจสอบก่อนบันทึก
                  </div>
                )}
                {err('code')}
              </div>
            )}

            {/* Contact info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
              <div>
                <label style={LBL}>เบอร์โทรศัพท์ *</label>
                <input className="input-field" placeholder="08x-xxx-xxxx" value={phone}
                  onChange={e => { setPhone(e.target.value); setErrors(prev => ({ ...prev, phone: '' })) }} />
                {err('phone')}
              </div>
              <div>
                <label style={LBL}>ที่อยู่ *</label>
                <input className="input-field" placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" value={address}
                  onChange={e => { setAddress(e.target.value); setErrors(prev => ({ ...prev, address: '' })) }} />
                {err('address')}
              </div>
            </div>
          </div>
        </div>

        {/* Tax amounts */}
        <div className="glass-card" style={{ padding: '24px 28px', marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#2d2545', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>💰</span> ข้อมูลภาษีประจำปี {CURRENT_YEAR}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="glass-card" style={{ padding: '16px 18px', background: 'rgba(218,237,248,0.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🏠</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#2d2545' }}>ภาษีที่ดินและสิ่งปลูกสร้าง</span>
              </div>
              <label style={LBL}>ยอดภาษี (บาท)</label>
              <input className="input-field" type="number" min="0" step="0.01" placeholder="0.00"
                value={landAmount} onChange={e => { setLandAmount(e.target.value); setErrors(prev => ({ ...prev, tax: '' })) }} />
              <div style={{ fontSize: 11, color: '#a89cc8', marginTop: 4 }}>เว้นว่างหากไม่มีภาษีประเภทนี้</div>
            </div>
            <div className="glass-card" style={{ padding: '16px 18px', background: 'rgba(240,236,251,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🪧</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: '#2d2545' }}>ภาษีป้าย</span>
              </div>
              <label style={LBL}>ยอดภาษี (บาท)</label>
              <input className="input-field" type="number" min="0" step="0.01" placeholder="0.00"
                value={signAmount} onChange={e => { setSignAmount(e.target.value); setErrors(prev => ({ ...prev, tax: '' })) }} />
              <div style={{ fontSize: 11, color: '#a89cc8', marginTop: 4 }}>เว้นว่างหากไม่มีภาษีประเภทนี้</div>
            </div>
          </div>
          {err('tax')}
          {(landAmount || signAmount) && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(124,92,191,0.06)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: '#a89cc8' }}>ยอดรวมทั้งหมด</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#7c5cbf' }}>
                ฿{((parseFloat(landAmount) || 0) + (parseFloat(signAmount) || 0)).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={() => navigate('/taxpayers')}>ยกเลิก</button>
          <button type="submit" className="btn-primary" disabled={saving || (tpType === 'individual' && isDuplicate)} style={{ minWidth: 160 }}>
            {saving ? '⏳ กำลังบันทึก...' : '💾 บันทึกผู้เสียภาษี'}
          </button>
        </div>
      </form>
    </div>
  )
}

const LBL: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }
