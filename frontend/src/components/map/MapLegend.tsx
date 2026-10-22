import { Badge, Card, Flex } from 'antd'
import { ROOM_STATE_META } from '../../data/campusData'

export default function MapLegend() {
  return (
    <Card className="glass" size="small" styles={{ body: { padding: '8px 12px' } }}>
      <Flex gap={14} wrap>
        {Object.values(ROOM_STATE_META).map((m) => (
          <Badge key={m.label} color={m.color} text={m.label} />
        ))}
      </Flex>
    </Card>
  )
}
