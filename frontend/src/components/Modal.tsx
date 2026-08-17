import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidth?: string
}

export default function Modal({ title, onClose, children, maxWidth = '540px' }: Props) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ maxWidth }}>
        <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#2d2545' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'rgba(124,92,191,0.08)', border: 'none', borderRadius: 8,
            width: 32, height: 32, cursor: 'pointer', color: '#7c5cbf', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>×</button>
        </div>
        <div style={{ padding: '20px 28px 28px' }}>{children}</div>
      </div>
    </div>
  )
}
