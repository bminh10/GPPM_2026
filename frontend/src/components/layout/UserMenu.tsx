// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useState } from 'react'
import { Avatar, Button, Descriptions, Flex, Popover, Tag, Typography } from 'antd'
import { UserOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/authStore'
import { ROUTE_PATHS } from '../../routes/menuConfig'

export default function UserMenu() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
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
      <Button
        type="primary"
        icon={<UserSwitchOutlined />}
        block
        onClick={() => {
          setOpen(false)
          navigate(ROUTE_PATHS.profile)
        }}
      >
        Hồ sơ cá nhân
      </Button>
    </Flex>
  )

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      open={open}
      onOpenChange={setOpen}
    >
      <Flex align="center" gap={8} style={{ cursor: 'pointer' }}>
        <Typography.Text strong>{user.user_name}</Typography.Text>
        <Avatar icon={<UserOutlined />} style={{ background: 'var(--color-primary)' }} />
      </Flex>
    </Popover>
  )
}
