import { useState } from 'react'
import { Button, Checkbox, Divider, Form, Input, Segmented, Select, Typography, message } from 'antd'
import {
  GoogleOutlined,
  LockOutlined,
  MailOutlined,
  UserOutlined,
  WindowsOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { colors } from '../../theme/colors'
import { markAuthenticated } from '../../utils/auth'
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
  role: string
  password: string
  confirm: string
  agree: boolean
}

const ROLE_OPTIONS = [
  { value: 'student', label: 'Sinh viên' },
  { value: 'lecturer', label: 'Giảng viên' },
  { value: 'admin', label: 'Quản trị cơ sở vật chất' },
]

export default function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const isSignIn = mode === 'sign-in'

  // Demo không có backend: giả lập đăng nhập/đăng ký rồi vào dashboard.
  const handleSubmit = async (value: any) => {
    // setLoading(true);
    window.setTimeout(() => {
      setLoading(false)
      markAuthenticated()
      messageApi.success(isSignIn ? 'Đăng nhập thành công' : 'Tạo tài khoản thành công')
      navigate(ROUTE_PATHS.dashboard)
    }, 700)
    // try {
    //   const res = await axios.post('http://127.0.0.1:8000/user/login', { 'email': value.email, 'pass_word': value.password });
    //   if(res.status == 200){
    //     message.success("Dang nhap thanh cong");
    //   }
    //   navigate(ROUTE_PATHS.dashboard)
    // } catch (e) {
    //   message.error("Dang nhap khong thanh cong");
    // }
    // setLoading(false);
  }

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
              onFinish={handleSubmit}
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
              <div className="mb-4 flex items-center justify-between">
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>Ghi nhớ tôi</Checkbox>
                </Form.Item>
                <Typography.Link>Quên mật khẩu?</Typography.Link>
              </div>
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
              onFinish={handleSubmit}
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
              <Form.Item name="role" label="Vai trò" rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}>
                <Select placeholder="Chọn vai trò" options={ROLE_OPTIONS} />
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

          {/* <Divider plain>
            <Typography.Text type="secondary">hoặc tiếp tục với</Typography.Text>
          </Divider>

          <div className="grid grid-cols-2 gap-3">
            <Button size="large" icon={<GoogleOutlined />}>
              Google
            </Button>
            <Button size="large" icon={<WindowsOutlined />}>
              Microsoft
            </Button>
          </div> */}

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
