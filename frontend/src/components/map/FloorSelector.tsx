import { Card, Segmented, Typography } from 'antd'

type Props = {
  floors: number
  value: number
  onChange: (floor: number) => void
}

export default function FloorSelector({ floors, value, onChange }: Props) {
  const options = Array.from({ length: floors }, (_, i) => floors - i).map((f) => ({
    label: `T${f}`,
    value: f,
  }))

  return (
    <Card className="glass" size="small" styles={{ body: { padding: 6, textAlign: 'center' } }} title="Tầng">
      <Segmented vertical value={value} onChange={(v) => onChange(Number(v))} options={options} />
    </Card>
  )
}
