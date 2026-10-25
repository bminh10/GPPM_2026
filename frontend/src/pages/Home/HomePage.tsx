import {
  ApartmentOutlined,
  AuditOutlined,
  CalendarOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  RightOutlined,
  TeamOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import { Button, Card, Carousel, Col, Flex, Row, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import type { AppRole } from '../../routes/roleAccess'
import { getAppRole } from '../../routes/roleAccess'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { useAuth } from '../../store/authStore'
// import campusImage from '../../assets/home-campus.svg'
// import learningImage from '../../assets/home-learning.svg'
// import infrastructureImage from '../../assets/home-infrastructure.svg'
import { HandIcon } from '../../icon/Hello'

const slides = [
  {
    image: 'https://tuyensinh.ou.edu.vn/media/photos/Duy.nhv/2026/toa%202C%203.jpg',
    eyebrow: 'SMART CAMPUS',
    title: 'Kết nối mọi hoạt động trong khuôn viên',
    description: 'Quản lý dữ liệu và hạ tầng học tập tập trung trên một nền tảng.',
  },
  {
    image: 'https://congchungnguyenhue.com/Uploaded/Images/Original/2023/11/28/xaydung09_2811155521.jpg',
    eyebrow: 'LEARNING SPACES',
    title: 'Không gian học tập luôn sẵn sàng',
    description: 'Theo dõi phòng học, lịch học và khả năng sử dụng tài nguyên.',
  },
  {
    image: 'https://media-cdn-v2.laodong.vn/storage/newsportal/2023/9/17/1242767/DJI_0659-01.jpeg',
    eyebrow: 'CONNECTED INFRASTRUCTURE',
    title: 'Vận hành thông minh, trải nghiệm liền mạch',
    description: 'Kết nối bản đồ cơ sở, thiết bị và các dịch vụ trong trường.',
  },
]

type HomeAction = {
  label: string
  description: string
  path: string
  icon: React.ReactNode
  color: string
}

function getActions(role: AppRole): HomeAction[] {
  const dashboardAction: HomeAction = {
    label: 'Tổng quan',
    description: 'Xem mức sử dụng phòng và tình hình hoạt động.',
    path: ROUTE_PATHS.dashboard,
    icon: <DashboardOutlined />,
    color: '#0a5ca8',
  }
  const mapAction: HomeAction = {
    label: 'Bản đồ',
    description: 'Tra cứu sơ đồ cơ sở và trạng thái phòng học.',
    path: ROUTE_PATHS.map,
    icon: <EnvironmentOutlined />,
    color: '#0f766e',
  }
  const dataActions: HomeAction[] = [
    {
      label: 'Danh mục hệ thống',
      description: 'Tra cứu và quản lý danh mục dữ liệu.',
      path: ROUTE_PATHS.dataManagement,
      icon: <AppstoreOutlined />,
      color: '#2563eb',
    },
    {
      label: 'Đăng ký môn học',
      description: 'Xem các lớp và môn học đã đăng ký.',
      path: ROUTE_PATHS.courseRegistrations,
      icon: <ApartmentOutlined />,
      color: '#7c3aed',
    },
    {
      label: 'Thời khóa biểu',
      description: 'Theo dõi và quản lý lịch học.',
      path: ROUTE_PATHS.timetable,
      icon: <CalendarOutlined />,
      color: '#d97706',
    },
  ]
  const infrastructureActions: HomeAction[] = [
    {
      label: 'Đọc thẻ',
      description: 'Theo dõi đầu đọc và phiên điểm danh.',
      path: ROUTE_PATHS.cardReader,
      icon: <IdcardOutlined />,
      color: '#0891b2',
    },
    {
      label: 'Ghi thẻ',
      description: 'Thực hiện tác vụ ghi thẻ được phân quyền.',
      path: ROUTE_PATHS.cardWriter,
      icon: <IdcardOutlined />,
      color: '#be123c',
    },
  ]

  if (role === 'staff') return dataActions
  if (role === 'technician') return [dashboardAction, mapAction, ...infrastructureActions]
  if (role === 'admin' || role === 'super_admin') {
    return [
      dashboardAction,
      ...dataActions,
      { label: 'Tài khoản', description: 'Quản lý tài khoản và vai trò.', path: ROUTE_PATHS.userManagement, icon: <TeamOutlined />, color: '#4f46e5' },
      mapAction,
      ...infrastructureActions,
      { label: 'Xem log', description: 'Theo dõi nhật ký hoạt động hệ thống.', path: ROUTE_PATHS.auditLogs, icon: <AuditOutlined />, color: '#475569' },
    ]
  }
  return []
}

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = getAppRole(user?.role)
  const actions = getActions(role)

  return (
    <Flex vertical gap={28} style={{ maxWidth: 1320, margin: '0 auto', paddingBottom: 24 }}>
      <Typography.Text style={{ fontSize: 30}}>
        <HandIcon /> Xin chào{user?.user_name ? `, ${user.user_name}` : ''}. Chọn chức năng để bắt đầu.
      </Typography.Text>
      <div id="home-carousel">
      <Carousel autoplay autoplaySpeed={3000} dots effect="fade">
        {slides.map((slide) => (
          <div key={slide.title}>
            <div
              style={{
                position: 'relative',
                height: 'clamp(280px, 36vw, 440px)',
                overflow: 'hidden',
                borderRadius: 20,
                background: '#0b2545',
              }}
            >
              <img
                src={slide.image}
                alt=""
                aria-hidden="true"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  padding: 'clamp(24px, 6vw, 72px)',
                  background: 'linear-gradient(90deg, rgba(5, 20, 42, 0.82) 0%, rgba(5, 20, 42, 0.45) 52%, rgba(5, 20, 42, 0.05) 100%)',
                }}
              >
                <Flex vertical gap={12} style={{ maxWidth: 610 }}>
                  <Typography.Text style={{ color: '#bfdbfe', letterSpacing: 2, fontWeight: 700 }}>
                    {slide.eyebrow}
                  </Typography.Text>
                  <Typography.Title level={1} style={{ color: '#fff', margin: 0, fontSize: 'clamp(30px, 4vw, 48px)' }}>
                    {slide.title}
                  </Typography.Title>
                  <Typography.Paragraph style={{ color: 'rgba(255,255,255,0.84)', fontSize: 16, margin: 0 }}>
                    {slide.description}
                  </Typography.Paragraph>
                </Flex>
              </div>
            </div>
          </div>
        ))}
      </Carousel>
      </div>

      <section id="home-actions">
        <Flex justify="space-between" align="end" wrap="wrap" gap={8} style={{ marginBottom: 16 }}>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>Chức năng</Typography.Title>
          </div>
        </Flex>
        <Row gutter={[16, 16]}>
          {actions.map((action) => (
            <Col key={action.path} xs={24} sm={12} xl={8}>
              <Card
                hoverable
                style={{ height: '100%', borderRadius: 14 }}
                styles={{ body: { height: '100%' } }}
              >
                <Flex vertical gap={16} style={{ height: '100%' }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 14,
                      background: `${action.color}14`,
                      color: action.color,
                      fontSize: 22,
                    }}
                  >
                    {action.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Typography.Title level={5} style={{ margin: '0 0 6px' }}>
                      {action.label}
                    </Typography.Title>
                    <Typography.Text type="secondary">{action.description}</Typography.Text>
                  </div>
                  <Button
                    type="link"
                    icon={<RightOutlined />}
                    iconPlacement="end"
                    onClick={() => navigate(action.path)}
                    style={{ alignSelf: 'flex-start', paddingInline: 0 }}
                  >
                    Mở chức năng
                  </Button>
                </Flex>
              </Card>
            </Col>
          ))}
        </Row>
      </section>
    </Flex>
  )
}
