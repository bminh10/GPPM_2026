import { Avatar, Descriptions, Flex, Popover, Tag, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { useAuth } from '../../store/authStore'

export default function UserMenu() {
  const { user } = useAuth()
  if (!user) return null

  const content = (
    <Flex vertical gap={12} style={{ width: 260 }}>
      <Flex align="center" gap={12}>
        <Avatar size={48} icon={<UserOutlined />} style={{ background: 'var(--color-primary)' }} />
        <Flex vertical>
          <Typography.Text strong>{user.user_name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ID #{user.id}
          </Typography.Text>
        </Flex>
      </Flex>
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'user_name', label: 'Tên', children: user.user_name },
          { key: 'email', label: 'Email', children: user.email },
          { key: 'role', label: 'Vai trò', children: <Tag color="blue">{user.role ?? 'Chưa có'}</Tag> },
        ]}
      />
    </Flex>
  )

  return (
    <Popover content={content} trigger="click" placement="bottomRight" arrow={false}>
      <Flex align="center" gap={8} style={{ cursor: 'pointer' }}>
        <Typography.Text strong>{user.user_name}</Typography.Text>
        <Avatar icon={<UserOutlined />} style={{ background: 'var(--color-primary)' }} />
      </Flex>
    </Popover>
  )
}
