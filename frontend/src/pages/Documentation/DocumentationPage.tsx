// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useMemo, useState } from 'react'
import {
  ApartmentOutlined,
  AuditOutlined,
  BookOutlined,
  CalendarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  RightOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Card, Col, Flex, Row, Tour, Typography } from 'antd'
import type { TourProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { getAppRole, type AppRole } from '../../routes/roleAccess'
import { useAuth } from '../../store/authStore'

type GuideFeature = {
  id: string
  title: string
  description: string
  route: string
  roles: AppRole[]
  accessLabel: string
  icon: React.ReactNode
  workflow: string[]
  tips: string
}

const adminRoles: AppRole[] = ['super_admin', 'admin']
const dataRoles: AppRole[] = ['super_admin', 'admin', 'staff']
const infrastructureRoles: AppRole[] = ['super_admin', 'admin', 'technician']
const dashboardRoles: AppRole[] = [...adminRoles, 'technician']

const features: GuideFeature[] = [
  {
    id: 'dashboard',
    title: 'Tổng quan và mức sử dụng phòng',
    description: 'Theo dõi tình hình sử dụng phòng, nhu cầu theo thời gian và các phòng ít được sử dụng.',
    route: ROUTE_PATHS.dashboard,
    roles: dashboardRoles,
    accessLabel: 'Super Admin, Admin, Kỹ thuật viên',
    icon: <DashboardOutlined />,
    workflow: [
      'Chọn một học kỳ để lọc dữ liệu; xóa lựa chọn để xem toàn bộ học kỳ.',
      'Xem biểu đồ tỷ lệ sử dụng, nhu cầu phòng theo khung giờ và danh sách phòng ít sử dụng.',
      'Dùng ô tìm kiếm hoặc bộ lọc trên bảng để tra cứu phòng cụ thể.',
    ],
    tips: 'Kỹ thuật viên có quyền xem dữ liệu tổng quan; các API ghi dữ liệu vẫn bị giới hạn theo vai trò.',
  },
  {
    id: 'system-data',
    title: 'Danh mục hệ thống',
    description: 'Quản lý cơ sở, khoa, ngành, lớp, phòng, môn học, học kỳ và ca học.',
    route: ROUTE_PATHS.dataManagement,
    roles: dataRoles,
    accessLabel: 'Super Admin, Admin, Cán bộ nhân viên',
    icon: <DatabaseOutlined />,
    workflow: [
      'Chọn loại danh mục cần thao tác ở danh sách phía trên.',
      'Nhập biểu mẫu để tạo mới; dùng tìm kiếm để tra cứu bản ghi.',
      'Chọn Sửa để cập nhật. Có thể tải mẫu CSV và nhập nhiều bản ghi cùng lúc.',
    ],
    tips: 'Cán bộ nhân viên có thể xóa dữ liệu. Admin được tạo và sửa nhưng không có quyền xóa; Super Admin có toàn quyền.',
  },
  {
    id: 'registrations',
    title: 'Đăng ký môn học',
    description: 'Tra cứu, chỉnh sửa và nhập đăng ký môn học theo lớp, môn và học kỳ.',
    route: ROUTE_PATHS.courseRegistrations,
    roles: dataRoles,
    accessLabel: 'Super Admin, Admin, Cán bộ nhân viên',
    icon: <ApartmentOutlined />,
    workflow: [
      'Chọn học kỳ để lọc đăng ký; có thể chọn nhóm chưa gán học kỳ.',
      'Tải file mẫu CSV, điền tên lớp, môn học, học kỳ và số lượng.',
      'Tải CSV lên, kiểm tra các dòng hợp lệ/lỗi rồi bắt đầu nhập.',
    ],
    tips: 'Số lượng đăng ký không được vượt sĩ số lớp. Đăng ký đã được xếp thời khóa biểu có thể không xóa được.',
  },
  {
    id: 'accounts',
    title: 'Tài khoản và phân quyền',
    description: 'Tạo tài khoản, cập nhật thông tin, gán vai trò và bật/tắt trạng thái.',
    route: ROUTE_PATHS.userManagement,
    roles: adminRoles,
    accessLabel: 'Super Admin, Admin',
    icon: <TeamOutlined />,
    workflow: [
      'Chọn Tạo tài khoản và nhập tên, email, mật khẩu cùng vai trò.',
      'Dùng nút Sửa trên một tài khoản để cập nhật thông tin hoặc vai trò.',
      'Bật/tắt trạng thái để vô hiệu hóa hoặc kích hoạt tài khoản.',
    ],
    tips: 'Admin có thể kích hoạt tài khoản nhưng chỉ Super Admin được vô hiệu hóa tài khoản. Không thể tự vô hiệu hóa tài khoản đang đăng nhập.',
  },
  {
    id: 'timetable',
    title: 'Thời khóa biểu',
    description: 'Xem lịch theo học kỳ, chuyển tuần, chỉnh sửa lịch và chạy xếp lịch tự động.',
    route: ROUTE_PATHS.timetable,
    roles: dataRoles,
    accessLabel: 'Super Admin, Admin, Cán bộ nhân viên',
    icon: <CalendarOutlined />,
    workflow: [
      'Chọn học kỳ và bộ lọc cơ sở/khoa để tải lịch phù hợp.',
      'Dùng mũi tên tuần để chuyển thời gian; chọn một lịch để mở phần chỉnh sửa.',
      'Chọn Lịch thông minh, cấu hình phạm vi và xác nhận trước khi chạy.',
    ],
    tips: 'Kiểm tra cơ sở, phòng và đăng ký môn học trước khi xếp lịch để hạn chế xung đột.',
  },
  {
    id: 'map',
    title: 'Bản đồ và trạng thái phòng',
    description: 'Tra cứu tòa, tầng, phòng, lịch lớp đang diễn ra và thiết bị chiếu sáng.',
    route: ROUTE_PATHS.map,
    roles: infrastructureRoles,
    accessLabel: 'Super Admin, Admin, Kỹ thuật viên',
    icon: <EnvironmentOutlined />,
    workflow: [
      'Chọn cơ sở, học kỳ, ngày, tòa nhà và tầng cần xem.',
      'Chọn phòng trên bản đồ hoặc danh sách để xem thông tin và lịch lớp.',
      'Nhân sự hạ tầng được phân quyền có thể bật/tắt đèn và cập nhật cấu hình thiết bị.',
    ],
    tips: 'Dữ liệu lịch và phòng được lấy từ hệ thống; kỹ thuật viên chỉ có quyền đọc các danh mục tham chiếu.',
  },
  {
    id: 'card-reader',
    title: 'Đọc thẻ',
    description: 'Theo dõi lần quét gần nhất và quản lý phiên điểm danh tại cơ sở.',
    route: ROUTE_PATHS.cardReader,
    roles: infrastructureRoles,
    accessLabel: 'Super Admin, Admin, Kỹ thuật viên',
    icon: <IdcardOutlined />,
    workflow: [
      'Chọn cơ sở và mở phiên điểm danh nếu cần ghi nhận lượt quét.',
      'Chạm thẻ vào đầu đọc; hệ thống hiển thị kết quả đọc và trạng thái phiên.',
      'Theo dõi danh sách lượt quét, sau đó đóng phiên khi hoàn tất.',
    ],
    tips: 'MSSV đọc từ thẻ chưa được xác minh danh tính. Chỉ bắt đầu phiên tại đúng cơ sở và thời gian.',
  },
  {
    id: 'card-writer',
    title: 'Ghi thẻ',
    description: 'Ủy quyền ghi một MSSV lên thẻ trắng/thẻ mẫu và kiểm tra kết quả đọc lại.',
    route: ROUTE_PATHS.cardWriter,
    roles: infrastructureRoles,
    accessLabel: 'Super Admin, Admin, Kỹ thuật viên',
    icon: <IdcardOutlined />,
    workflow: [
      'Chạm thẻ trắng/thẻ mẫu lên trạm ghi để nhận UID.',
      'Nhập MSSV hợp lệ, xác nhận đúng UID và cấp quyền ghi một lần.',
      'Chạm lại đúng thẻ, kiểm tra trạng thái và kết quả đọc lại.',
    ],
    tips: 'Không dùng thẻ trường có dữ liệu sẵn. Nếu kết quả vật lý không rõ, cần kiểm tra thẻ trước khi đóng lệnh.',
  },
  {
    id: 'audit-logs',
    title: 'Nhật ký hệ thống',
    description: 'Xem các hoạt động gần đây, phương thức, đường dẫn, trạng thái và chi tiết.',
    route: ROUTE_PATHS.auditLogs,
    roles: adminRoles,
    accessLabel: 'Super Admin, Admin',
    icon: <AuditOutlined />,
    workflow: [
      'Mở Xem log từ nhóm quản lý hoặc từ thẻ chức năng.',
      'Đọc thời gian, phương thức, đường dẫn và mã trạng thái của từng hoạt động.',
      'Dùng phân trang để xem các bản ghi tiếp theo.',
    ],
    tips: 'Trang hiển thị tối đa 500 hoạt động gần nhất. Nhật ký chỉ dành cho quản trị viên.',
  },
]

export default function DocumentationPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = getAppRole(user?.role)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [activeFeature, setActiveFeature] = useState<string | null>(null)
  const visibleFeatures = useMemo(
    () => features.filter((feature) => feature.roles.includes(role)),
    [role],
  )
  const selectedFeature = visibleFeatures.find((feature) => feature.id === activeFeature)

  const overviewSteps: TourProps['steps'] = [
    {
      title: 'Chào mừng đến với tài liệu SmartOU',
      description: 'Tại đây có hướng dẫn tổng quan và quy trình cho từng chức năng theo quyền của tài khoản.',
      target: () => document.getElementById('guide-intro')!,
    },
    // {
    //   title: 'Vai trò và quyền hạn',
    //   description: 'Các chức năng được lọc theo vai trò. Nếu không thấy một chức năng, tài khoản hiện tại có thể chưa được cấp quyền.',
    //   target: () => document.getElementById('guide-roles')!,
    // },
    {
      title: 'Hướng dẫn từng chức năng',
      description: 'Chọn Bắt đầu hướng dẫn trên từng thẻ để xem tour thao tác, hoặc chọn Mở chức năng để chuyển đến màn hình làm việc.',
      target: () => document.getElementById('guide-features')!,
    },
  ]

  const featureSteps: TourProps['steps'] = selectedFeature
    ? [
        {
          title: selectedFeature.title,
          description: selectedFeature.description,
          target: () => document.getElementById(`guide-${selectedFeature.id}-title`)!,
        },
        {
          title: 'Các bước thực hiện',
          description: selectedFeature.workflow.join(' '),
          target: () => document.getElementById(`guide-${selectedFeature.id}-workflow`)!,
        },
        {
          title: 'Lưu ý và quyền truy cập',
          description: `${selectedFeature.tips} Quyền sử dụng: ${selectedFeature.accessLabel}.`,
          target: () => document.getElementById(`guide-${selectedFeature.id}-access`)!,
        },
      ]
    : []

  return (
    <Flex vertical gap={24} style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 32 }}>
      <Tour
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        steps={overviewSteps}
      />
      <Tour
        open={activeFeature !== null}
        onClose={() => setActiveFeature(null)}
        steps={featureSteps}
      />

      <Flex justify="space-between" align="center" wrap="wrap" gap={12} id="guide-intro">
        <div>
          <Typography.Title level={2} style={{ marginBottom: 4 }}>
            <BookOutlined /> Tài liệu hướng dẫn
          </Typography.Title>
          <Typography.Text type="secondary">
            Mở hướng dẫn khi cần; nội dung chức năng được hiển thị theo vai trò của bạn.
          </Typography.Text>
        </div>
      </Flex>

      {/* <Card id="guide-roles" title="Vai trò và quyền hạn">
        <Flex wrap="wrap" gap={8}>
          <Tag color="purple">Super Admin · Toàn quyền</Tag>
          <Tag color="blue">Admin · Quản lý, không xóa</Tag>
          <Tag color="cyan">Kỹ thuật viên · Hạ tầng và xem tổng quan</Tag>
          <Tag color="green">Cán bộ nhân viên · Dữ liệu, không quản lý tài khoản/dashboard</Tag>
        </Flex>
        <Typography.Paragraph type="secondary" style={{ margin: '12px 0 0' }}>
          Tài liệu chỉ liệt kê các chức năng tài khoản của bạn được phép truy cập.
        </Typography.Paragraph>
      </Card> */}

      <section id="guide-features">
        <Typography.Title level={3}>Hướng dẫn từng chức năng</Typography.Title>
        <Row gutter={[16, 16]}>
          {visibleFeatures.map((feature) => (
            <Col key={feature.id} xs={24} md={12}>
              <Card style={{ height: '100%' }}>
                <Flex vertical gap={14} style={{ height: '100%' }}>
                  <div id={`guide-${feature.id}-title`}>
                    <Flex align="center" gap={10}>
                      <Typography.Text style={{ color: '#0a5ca8', fontSize: 20 }}>
                        {feature.icon}
                      </Typography.Text>
                      <Typography.Title level={4} style={{ margin: 0 }}>{feature.title}</Typography.Title>
                    </Flex>
                    <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                      {feature.description}
                    </Typography.Paragraph>
                  </div>

                  <div id={`guide-${feature.id}-workflow`} style={{ flex: 1 }}>
                    <Typography.Text strong>Cách thực hiện</Typography.Text>
                    <ol style={{ paddingLeft: 22, margin: '8px 0' }}>
                      {feature.workflow.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  </div>

                  {/* <Alert
                    id={`guide-${feature.id}-access`}
                    type="info"
                    showIcon
                    message={`Quyền truy cập: ${feature.accessLabel}`}
                    description={feature.tips}
                  /> */}

                  <Flex gap={8} wrap="wrap">
                    {/* <Button
                      icon={<PlayCircleOutlined />}
                      onClick={() => setActiveFeature(feature.id)}
                    >
                      Bắt đầu hướng dẫn
                    </Button> */}
                    <Button
                      type="primary"
                      icon={<RightOutlined />}
                      iconPlacement="end"
                      onClick={() => navigate(feature.route)}
                    >
                      Mở chức năng
                    </Button>
                  </Flex>
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>
      </section>
    </Flex>
  )
}
