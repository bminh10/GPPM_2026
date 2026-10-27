// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Avatar, Card, Col, Descriptions, Flex, Row, Tag, Typography } from 'antd'
import { CheckCircleOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '../../store/authStore'
// import { url } from 'inspector'
import background from '../../assets/ĐẠI HỌC MỞ.png'

export default function ProfilePage() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <Flex vertical gap={24} style={{ maxWidth: 960, margin: '0 auto' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>Hồ sơ cá nhân</Typography.Title>
        <Typography.Text type="secondary">
          Thông tin tài khoản đang đăng nhập.
        </Typography.Text>
      </div>

      <Card
        id="profile-summary"
        styles={{ body: { padding: 0 } }}
        style={{ overflow: 'hidden', borderRadius: 16, border: "3px solid blue" }}
      >
        <div
          style={{
            height: 200,
            backgroundImage: `url(${background})`,
            backgroundSize: 'cover',               // Bao phủ vừa vặn khung div
            // backgroundPosition: 'center',
          }}
        />
        <Flex
          align="end"
          justify="space-between"
          wrap="wrap"
          gap={16}
          style={{ padding: '0 28px 24px', marginTop: -44 }}
        >
          <Flex align="end" gap={18} wrap="wrap">
            <Avatar
              size={104}
              icon={<UserOutlined />}
              style={{
                color: '#0a5ca8',
                background: '#fff',
                border: '4px solid #fff',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.18)',
              }}
            />
            <div style={{ paddingBottom: 5 }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {user.user_name}
              </Typography.Title>
              <Typography.Text type="secondary">{user.email}</Typography.Text>
            </div>
          </Flex>
          <Tag color="blue" style={{ marginBottom: 8, padding: '4px 10px', borderRadius: 12 }}>
            {user.role ?? 'Chưa có vai trò'}
          </Tag>
        </Flex>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={16}>
          <Card id="profile-details" title="Thông tin tài khoản">
            <Descriptions
              bordered
              column={1}
              items={[
                {
                  key: 'name',
                  label: 'Họ và tên',
                  children: (
                    <Flex align="center" gap={8}>
                      <UserOutlined />
                      {user.user_name}
                    </Flex>
                  ),
                },
                {
                  key: 'email',
                  label: 'Email',
                  children: (
                    <Flex align="center" gap={8}>
                      <MailOutlined />
                      {user.email}
                    </Flex>
                  ),
                },
                {
                  key: 'role',
                  label: 'Vai trò',
                  children: <Tag color="blue">{user.role ?? 'Chưa có vai trò'}</Tag>,
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card id="profile-status" title="Tài khoản">
            <Flex vertical gap={18}>
              <div>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                  Chức vụ
                </Typography.Text>
                <Tag color="blue">{user.role ?? 'Chưa có chức vụ'}</Tag>
              </div>
              <div>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                  Tên trường
                </Typography.Text>
                <Typography.Text strong>Đại học Mở TP.HCM</Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                  Trạng thái hoạt động
                </Typography.Text>
                <Tag
                  color={user.is_active ? 'success' : 'default'}
                  icon={user.is_active ? <CheckCircleOutlined /> : undefined}
                >
                  {user.is_active ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
                </Tag>
              </div>
            </Flex>
          </Card>
        </Col>
      </Row>
    </Flex>
  )
}
