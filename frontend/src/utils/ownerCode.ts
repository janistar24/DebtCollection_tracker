/**
 * Owner Code Generator — บุคคลธรรมดาเท่านั้น
 * รูปแบบ: {พยัญชนะแรกของชื่อ}-{3หลักจากชื่อ}/{4หลักจากนามสกุล}
 * ตัวอย่าง: นายกรกน สำลีสัน → ก-611/7671
 *
 * Mapping Table (Source of Truth จากระบบ — ห้ามแก้ไขโดยไม่ได้รับอนุมัติ):
 * 1: ก ข ค ฆ ง
 * 2: จ ฉ ช ซ ฌ
 * 3: ญ ฎ ฏ ฐ ฑ
 * 4: ฒ ณ ด ต ถ
 * 5: ท ธ น บ ป
 * 6: ผ ฝ พ ฟ ภ
 * 7: ม ย ร ล ว
 * 8: ศ ษ ส ห
 * 9: ฬ อ ฮ ฤ
 */

export const CONSONANT_MAP: Record<string, number> = {
  // เลข 1
  'ก': 1, 'ข': 1, 'ค': 1, 'ฆ': 1, 'ง': 1,
  // เลข 2
  'จ': 2, 'ฉ': 2, 'ช': 2, 'ซ': 2, 'ฌ': 2,
  // เลข 3
  'ญ': 3, 'ฎ': 3, 'ฏ': 3, 'ฐ': 3, 'ฑ': 3,
  // เลข 4
  'ฒ': 4, 'ณ': 4, 'ด': 4, 'ต': 4, 'ถ': 4,
  // เลข 5
  'ท': 5, 'ธ': 5, 'น': 5, 'บ': 5, 'ป': 5,
  // เลข 6
  'ผ': 6, 'ฝ': 6, 'พ': 6, 'ฟ': 6, 'ภ': 6,
  // เลข 7
  'ม': 7, 'ย': 7, 'ร': 7, 'ล': 7, 'ว': 7,
  // เลข 8
  'ศ': 8, 'ษ': 8, 'ส': 8, 'ห': 8,
  // เลข 9
  'ฬ': 9, 'อ': 9, 'ฮ': 9, 'ฤ': 9,
}

const THAI_CONSONANTS = new Set(Object.keys(CONSONANT_MAP))

/** ตัดคำนำหน้าออก (นาย, นาง, นางสาว, ด.ช., ด.ญ.) */
export function stripTitle(name: string): string {
  return name
    .replace(/^นางสาว\s*/, '')
    .replace(/^นาง\s*/, '')
    .replace(/^นาย\s*/, '')
    .replace(/^ด\.ช\.\s*/, '')
    .replace(/^ด\.ญ\.\s*/, '')
    .trim()
}

/** ดึงเฉพาะพยัญชนะไทยจาก string */
function extractConsonants(text: string): string[] {
  return text.split('').filter(ch => THAI_CONSONANTS.has(ch))
}

/**
 * สร้าง Owner Code สำหรับบุคคลธรรมดาเท่านั้น
 * ห้ามเรียกด้วยชื่อบริษัท/นิติบุคคล
 */
export function generateOwnerCode(firstName: string, lastName: string): string {
  const fn = stripTitle(firstName)
  const fnConsonants = extractConsonants(fn)
  if (fnConsonants.length === 0) return ''

  // prefix = พยัญชนะแรกของชื่อ
  const prefix = fnConsonants[0]

  // 3 หลักจากพยัญชนะตัวที่ 2-4 ของชื่อ (ขาดเติม 0)
  const fnRest = fnConsonants.slice(1)
  const fnCode = [0, 1, 2].map(i => fnRest[i] !== undefined ? (CONSONANT_MAP[fnRest[i]] ?? 0) : 0).join('')

  // 4 หลักจากพยัญชนะ 4 ตัวแรกของนามสกุล (ขาดเติม 0)
  const lnConsonants = extractConsonants(lastName)
  const lnCode = [0, 1, 2, 3].map(i => lnConsonants[i] !== undefined ? (CONSONANT_MAP[lnConsonants[i]] ?? 0) : 0).join('')

  return `${prefix}-${fnCode}/${lnCode}`
}

/** ตรวจสอบรหัสซ้ำในรายการที่มีอยู่ */
export function isDuplicateCode(code: string, existingCodes: string[]): boolean {
  if (!code) return false
  return existingCodes.some(c => c.toLowerCase() === code.toLowerCase())
}
