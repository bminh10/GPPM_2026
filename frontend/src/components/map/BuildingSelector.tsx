import { Button, Card, Flex } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'
import type { Building } from '../../data/campusData'
import SearchFilterSelect from '../common/SearchFilterSelect'

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
        <SearchFilterSelect
          aria-label="Tìm và chọn tòa nhà"
          placeholder="Tìm và chọn tòa nhà"
          value={value ?? undefined}
          options={buildings.map((b) => ({ label: b.name, value: b.id }))}
          onChange={(buildingId: string | undefined) => {
            if (buildingId !== undefined) onChange(buildingId)
          }}
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
