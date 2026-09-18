export const TAXPAYER_TITLES = [
  'นาย', 'นาง', 'นางสาว',
  'พล.อ.', 'พล.ท.', 'พล.ต.', 'พ.อ.', 'พ.ท.', 'พ.ต.', 'ร.อ.', 'ร.ท.', 'ร.ต.',
  'จ.ส.อ.', 'จ.ส.ท.', 'จ.ส.ต.', 'ส.อ.', 'ส.ท.', 'ส.ต.',
  'พล.ต.อ.', 'พล.ต.ท.', 'พล.ต.ต.', 'พ.ต.อ.', 'พ.ต.ท.', 'พ.ต.ต.',
  'ร.ต.อ.', 'ร.ต.ท.', 'ร.ต.ต.', 'ด.ต.', 'หมู่ใหญ่', 'ส.ต.อ.', 'ส.ต.ท.', 'ส.ต.ต.',
  'ผศ.', 'รศ.', 'ศ.', 'ดร.',
] as const

export const OTHER_TITLE = '__OTHER__'

export function isStandardTaxpayerTitle(value?: string): boolean {
  return TAXPAYER_TITLES.includes(value as (typeof TAXPAYER_TITLES)[number])
}

export function splitTaxpayerTitle(value: string | null | undefined): { title?: string; firstName: string } {
  const name = (value ?? '').trim()
  const title = [...TAXPAYER_TITLES]
    .sort((a, b) => b.length - a.length)
    .find(item => name.startsWith(item))
  return title ? { title, firstName: name.slice(title.length).trim() } : { firstName: name }
}

export function joinTaxpayerTitle(title: string | undefined, firstName: string): string {
  return `${title ?? ''}${firstName.trim()}`
}
