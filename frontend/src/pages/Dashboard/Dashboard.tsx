import { Card, Col, Row, Statistic, Typography } from 'antd'
import { ApartmentOutlined, ThunderboltOutlined, TeamOutlined } from '@ant-design/icons'

export default function Dashboard() {
  return (
    <>
      <Typography.Title level={3}>Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Tổng số phòng" value={5} prefix={<ApartmentOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Tỷ lệ sử dụng" value={62} suffix="%" prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Điện năng tiết kiệm" value={128} suffix="kWh" prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
      </Row>
    </>
  )
}
