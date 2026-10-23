import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd'
import { UserAddOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'
import SearchableTable from '../../components/common/SearchableTable'
import { useAuth } from '../../store/authStore'

type RoleOption = { id: number; name: string }
type ManagedUser = {
  id: number
  user_name: string
  email: string
  role: string | null
  is_active: boolean
}
type CreateUserValues = {
  user_name: string
  email: string
  pass_word: string
  confirm_password: string
  role_id: number
  is_active: boolean
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm<CreateUserValues>()

  const canAssignAdminRole = currentUser?.role?.trim().toLowerCase() === 'superadmin'

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data } = await apiClient.get<ManagedUser[]>('/user/all')
      setUsers(data)
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  const updateUserStatus = useCallback(async (record: ManagedUser, isActive: boolean) => {
    setUpdatingUserId(record.id)
    try {
      await apiClient.patch(`/user/${record.id}`, { is_active: isActive })
      messageApi.success(isActive ? 'Đã kích hoạt tài khoản' : 'Đã vô hiệu hóa tài khoản')
      await loadUsers()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setUpdatingUserId(null)
    }
  }, [loadUsers, messageApi])

  useEffect(() => {
    let active = true
    Promise.all([
      apiClient.get<RoleOption[]>('/roles'),
      apiClient.get<ManagedUser[]>('/user/all'),
    ])
      .then(([rolesResponse, usersResponse]) => {
        if (!active) return
        const availableRoles = rolesResponse.data.filter((role) => Boolean(role.name))
        setRoles(availableRoles)
        const defaultRole = availableRoles.find((role) => role.name.trim().toLowerCase() === 'user')
        if (defaultRole && form.getFieldValue('role_id') === undefined) {
          form.setFieldValue('role_id', defaultRole.id)
        }
        setUsers(usersResponse.data)
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getErrorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [form])

  const columns = useMemo<ColumnsType<ManagedUser>>(
    () => [
      { title: 'Họ và tên', dataIndex: 'user_name', key: 'user_name' },
      { title: 'Email đăng nhập', dataIndex: 'email', key: 'email' },
      {
        title: 'Chức vụ / quyền',
        dataIndex: 'role',
        key: 'role',
        render: (role: string | null) => role ?? 'Chưa phân quyền',
      },
      {
        title: 'Trạng thái',
        dataIndex: 'is_active',
        key: 'is_active',
        render: (isActive: boolean, record) => (
          <Space>
            <Tag color={isActive ? 'success' : 'default'}>
              {isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}
            </Tag>
            <Popconfirm
              title={isActive ? 'Vô hiệu hóa tài khoản?' : 'Kích hoạt tài khoản?'}
              description={
                isActive
                  ? 'Người dùng sẽ bị đăng xuất và không thể đăng nhập cho đến khi được kích hoạt lại.'
                  : 'Người dùng sẽ có thể đăng nhập lại.'
              }
              okText={isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
              cancelText="Hủy"
              okButtonProps={{ danger: isActive }}
              disabled={record.id === currentUser?.id || updatingUserId !== null}
              onConfirm={() => void updateUserStatus(record, !isActive)}
            >
              <Switch
                size="small"
                checked={isActive}
                loading={updatingUserId === record.id}
                disabled={record.id === currentUser?.id || updatingUserId !== null}
                aria-label={isActive ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'}
              />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [currentUser?.id, updatingUserId, updateUserStatus],
  )

  const handleCreate = async (values: CreateUserValues) => {
    setSubmitting(true)
    try {
      await apiClient.post('/user', {
        user_name: values.user_name,
        email: values.email,
        pass_word: values.pass_word,
        role_id: values.role_id,
        is_active: values.is_active,
      })
      messageApi.success('Đã tạo tài khoản và cấp quyền')
      form.resetFields()
      await loadUsers()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      {contextHolder}
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>Quản lý tài khoản</Typography.Title>
        <Typography.Text type="secondary">
          Tạo tài khoản, cấp email đăng nhập, mật khẩu ứng dụng và phân quyền.
        </Typography.Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Mật khẩu email"
        description="Chỉ đặt mật khẩu đăng nhập CampusOpt. Không nhập hoặc lưu mật khẩu hộp thư email của người dùng."
      />

      <Card title="Tạo tài khoản">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            is_active: true,
            role_id: roles.find((role) => role.name.trim().toLowerCase() === 'user')?.id,
          }}
        >
          <Form.Item
            name="user_name"
            label="Họ và tên"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ và tên' }]}
          >
            <Input autoComplete="name" placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email đăng nhập"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input autoComplete="email" placeholder="name@example.com" />
          </Form.Item>
          <Form.Item
            name="pass_word"
            label="Mật khẩu đăng nhập"
            rules={[
              { required: true, message: 'Vui lòng đặt mật khẩu' },
              { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
              {
                validator: (_, value: string | undefined) =>
                  value === undefined || new TextEncoder().encode(value).length <= 72
                    ? Promise.resolve()
                    : Promise.reject(new Error('Mật khẩu tối đa 72 byte')),
              },
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="Tối thiểu 8 ký tự" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="Xác nhận mật khẩu"
            dependencies={['pass_word']}
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu' },
              ({ getFieldValue }) => ({
                validator(_, value: string | undefined) {
                  return !value || getFieldValue('pass_word') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('Mật khẩu xác nhận không khớp'))
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="Nhập lại mật khẩu" />
          </Form.Item>
          <Form.Item
            name="role_id"
            label="Phân quyền"
            rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
          >
            <SearchFilterSelect
              options={roles.map((role) => ({
                value: role.id,
                label: role.name,
                disabled:
                  !canAssignAdminRole &&
                  ['admin', 'superadmin'].includes(role.name.trim().toLowerCase()),
              }))}
              placeholder="Chọn vai trò"
            />
          </Form.Item>
          {!canAssignAdminRole && (
            <Typography.Paragraph type="secondary">
              Chỉ superadmin mới được cấp vai trò admin hoặc superadmin.
            </Typography.Paragraph>
          )}
          <Form.Item name="is_active" label="Trạng thái hoạt động" valuePropName="checked">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Vô hiệu hóa" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            icon={<UserAddOutlined />}
            loading={submitting}
            block
          >
            Tạo tài khoản
          </Button>
        </Form>
      </Card>

      <Card
        title="Tài khoản hiện có"
        extra={<Button onClick={() => void loadUsers()} loading={loading}>Tải lại</Button>}
      >
        {loadError ? (
          <Alert type="error" showIcon message={loadError} />
        ) : loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
        ) : (
          <SearchableTable<ManagedUser>
            rowKey={(record) => record.id}
            columns={columns}
            dataSource={users}
            getSearchText={(record) =>
              `${record.user_name} ${record.email} ${record.role ?? ''} ${record.is_active ? 'hoạt động' : 'vô hiệu hóa'}`
            }
            searchPlaceholder="Tìm theo tên, email, quyền hoặc trạng thái..."
            emptyText="Chưa có tài khoản"
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        )}
      </Card>
    </Space>
  )
}
