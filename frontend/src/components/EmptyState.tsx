interface Props { icon?: string; title: string; sub?: string }

export default function EmptyState({ icon = '📭', title, sub }: Props) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#a89cc8' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#6b5b95', marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: 13 }}>{sub}</div>}
    </div>
  )
}
