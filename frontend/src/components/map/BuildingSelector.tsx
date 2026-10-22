import { Button, Card, Flex, Segmented } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'
import type { Building } from '../../data/campusData'

type Props = {
  buildings: Building[]
  value: string | null
  onChange: (buildingId: string) => void
  onReset: () => void
}

export default function BuildingSelector({ buildings, value, onChange, onReset }: Props) {
  return (
    <Card className="glass" size="small" styles={{ body: { padding: 8 } }}>
      <Flex vertical gap={8}>
        <Segmented
          block
          value={value ?? undefined}
          onChange={(v) => onChange(String(v))}
          options={buildings.map((b) => ({ label: b.name, value: b.id }))}
        />
        <Button
          size="small"
          type={value ? 'default' : 'primary'}
          icon={<GlobalOutlined />}
          onClick={onReset}
        >
          Toàn khuôn viên
        </Button>
      </Flex>
    </Card>
  )
}
