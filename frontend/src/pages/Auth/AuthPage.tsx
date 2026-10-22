import { useState } from 'react'
import { Button, Checkbox, Form, Input, Segmented, Typography, message } from 'antd'
import {
  LockOutlined,
  MailOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { colors } from '../../theme/colors'
import { getErrorMessage } from '../../services/apiClient'
import { signIn, signUp } from '../../services/AuthService'
import AuthHero from './AuthHero'
import axios from "axios";

export type AuthMode = 'sign-in' | 'sign-up'

type AuthPageProps = {
  mode: AuthMode
}

type SignInValues = { email: string; password: string; remember?: boolean }
type SignUpValues = {
  fullName: string
  email: string
  password: string
  confirm: string
  agree: boolean
}

export default function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const isSignIn = mode === 'sign-in'

  const submit = async (action: () => Promise<unknown>, successMessage: string) => {
    setLoading(true)
    try {
      await action()
      messageApi.success(successMessage)
      navigate(ROUTE_PATHS.dashboard, { replace: true })
    } catch (error) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const handleSignIn = (values: SignInValues) => submit(() => signIn(values), 'Đăng nhập thành công')
  const handleSignUp = (values: SignUpValues) => submit(() => signUp(values), 'Tạo tài khoản thành công')

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]" style={{ background: colors.bg.main }}>
      {contextHolder}
      <AuthHero />

      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Typography.Title level={2} style={{ marginBottom: 4 }}>
              {isSignIn ? 'Chào mừng trở lại 👋' : 'Tạo tài khoản mới'}
            </Typography.Title>
            <Typography.Text type="secondary">
              {isSignIn
                ? 'Đăng nhập để theo dõi và tối ưu tài nguyên phòng học.'
                : 'Chỉ mất 1 phút để bắt đầu với CampusOpt.'}
            </Typography.Text>
          </div>

          <Segmented
            block
            size="large"
            value={mode}
            onChange={(value) => navigate(value === 'sign-in' ? ROUTE_PATHS.signIn : ROUTE_PATHS.signUp)}
            options={[
              { label: 'Đăng nhập', value: 'sign-in' },
              // { label: 'Đăng ký', value: 'sign-up' },
            ]}
            style={{ marginBottom: 24 }}
          />

          {isSignIn ? (
            <Form<SignInValues>
              key="sign-in"
              layout="vertical"
              size="large"
              requiredMark={false}
              initialValues={{ remember: true }}
              onFinish={handleSignIn}
            >
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email' },
                  { type: 'email', message: 'Email không hợp lệ' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="ten@truong.edu.vn" autoComplete="email" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Mật khẩu"
                rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="••••••••" autoComplete="current-password" />
              </Form.Item>
              <Form.Item name="remember" valuePropName="checked">
                <Checkbox>Ghi nhớ tôi</Checkbox>
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                Đăng nhập
              </Button>
            </Form>
          ) : (
            <Form<SignUpValues>
              key="sign-up"
              layout="vertical"
              size="large"
              requiredMark={false}
              onFinish={handleSignUp}
            >
              <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}>
                <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn A" autoComplete="name" />
              </Form.Item>
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email' },
                  { type: 'email', message: 'Email không hợp lệ' },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="ten@truong.edu.vn" autoComplete="email" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Mật khẩu"
                rules={[
                  { required: true, message: 'Vui lòng nhập mật khẩu' },
                  { min: 8, message: 'Mật khẩu tối thiểu 8 ký tự' },
                ]}
                hasFeedback
              >
                <Input.Password prefix={<LockOutlined />} placeholder="Tối thiểu 8 ký tự" autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirm"
                label="Xác nhận mật khẩu"
                dependencies={['password']}
                hasFeedback
                rules={[
                  { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve()
                      }
                      return Promise.reject(new Error('Mật khẩu xác nhận không khớp'))
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="agree"
                valuePropName="checked"
                rules={[
                  {
                    validator: (_, value) =>
                      value ? Promise.resolve() : Promise.reject(new Error('Bạn cần đồng ý với điều khoản')),
                  },
                ]}
              >
                <Checkbox>Tôi đồng ý với điều khoản sử dụng</Checkbox>
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                Tạo tài khoản
              </Button>
            </Form>
          )}

          {/* <Typography.Paragraph type="secondary" style={{ textAlign: 'center', marginTop: 24, marginBottom: 0 }}>
            {isSignIn ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}
            <Typography.Link onClick={() => navigate(isSignIn ? ROUTE_PATHS.signUp : ROUTE_PATHS.signIn)}>
              {isSignIn ? 'Đăng ký ngay' : 'Đăng nhập'}
            </Typography.Link>
          </Typography.Paragraph> */}
        </div>
      </div>
    </div>
  )
}
