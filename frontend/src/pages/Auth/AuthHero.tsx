import { Typography } from 'antd'
import { EnvironmentOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { colors } from '../../theme/colors'

type DemoRoom = {
  id: string
  x: number
  y: number
  w: number
  h: number
  fill: string
}

const ROOMS: DemoRoom[] = [
  { id: 'A101', x: 20, y: 20, w: 120, h: 90, fill: colors.campus.busy },
  { id: 'A102', x: 150, y: 20, w: 130, h: 90, fill: colors.campus.available },
  { id: 'B201', x: 20, y: 125, w: 120, h: 95, fill: colors.campus.moderate },
  { id: 'LIB', x: 150, y: 125, w: 130, h: 95, fill: colors.campus.available },
  { id: 'C301', x: 295, y: 20, w: 85, h: 200, fill: colors.campus.maintenance },
]

const HOTSPOTS = [
  { x: 80, y: 62, color: colors.hotspot.critical },
  { x: 215, y: 172, color: colors.hotspot.warning },
  { x: 337, y: 120, color: colors.hotspot.info },
]

const glassCard = {
  background: colors.glass.bg,
  border: `1px solid ${colors.glass.border}`,
  backdropFilter: 'blur(14px)',
} as const

export default function AuthHero() {
  return (
    <div
      className="relative hidden h-full overflow-hidden lg:flex lg:flex-col lg:justify-between"
      style={{
        background: `linear-gradient(145deg, ${colors.layout.siderBg} 0%, ${colors.primary.DEFAULT} 55%, ${colors.info.DEFAULT} 100%)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full blur-3xl"
        style={{ background: colors.primary.hover, opacity: 0.45 }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full blur-3xl"
        style={{ background: colors.info.DEFAULT, opacity: 0.5 }}
      />

      <div className="relative z-10 flex items-center gap-3 p-10">
        <div
          className="grid h-11 w-11 place-items-center rounded-xl text-xl text-white"
          style={{ background: 'rgba(255,255,255,0.18)', border: `1px solid ${colors.glass.border}` }}
        >
          <EnvironmentOutlined />
        </div>
        <span className="text-xl font-bold tracking-wide text-white">CampusOpt</span>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-10">
        <div className="relative" style={{ perspective: 1100 }}>
          <div
            className="rounded-3xl p-5"
            style={{
              width: 420,
              background: 'rgba(255,255,255,0.14)',
              border: `1px solid ${colors.glass.border}`,
              backdropFilter: 'blur(10px)',
              transform: 'rotateX(48deg) rotateZ(-28deg)',
              transformStyle: 'preserve-3d',
              boxShadow: `0 40px 60px -20px ${colors.glass.shadow}`,
            }}
          >
            <svg viewBox="0 0 400 240" width="100%" role="img" aria-label="Sơ đồ phòng học mẫu">
              {ROOMS.map((room) => (
                <g key={room.id}>
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.w}
                    height={room.h}
                    rx={10}
                    fill={room.fill}
                    fillOpacity={0.82}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  <text
                    x={room.x + room.w / 2}
                    y={room.y + room.h / 2 + 4}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    {room.id}
                  </text>
                </g>
              ))}
              {HOTSPOTS.map((spot) => (
                <g key={`${spot.x}-${spot.y}`}>
                  <circle cx={spot.x} cy={spot.y} r={8} fill={spot.color} opacity={0.5}>
                    <animate attributeName="r" values="8;22;8" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={spot.x} cy={spot.y} r={7} fill={spot.color} stroke="#ffffff" strokeWidth={2.5} />
                </g>
              ))}
            </svg>
          </div>

          <div className="absolute -left-6 -top-8 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl" style={glassCard}>
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-white"
              style={{ background: colors.campus.available }}
            >
              <ThunderboltOutlined />
            </span>
            <div>
              <div className="text-xs" style={{ color: colors.text.secondary }}>
                Điện năng tiết kiệm
              </div>
              <div className="text-base font-bold" style={{ color: colors.text.primary }}>
                128 kWh
              </div>
            </div>
          </div>

          <div className="absolute -bottom-6 -right-4 rounded-2xl px-4 py-3 shadow-xl" style={glassCard}>
            <div className="text-xs" style={{ color: colors.text.secondary }}>
              Tỷ lệ sử dụng phòng
            </div>
            <div className="text-base font-bold" style={{ color: colors.primary.DEFAULT }}>
              62% · Tối ưu
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 p-10">
        <Typography.Title level={2} style={{ color: '#ffffff', marginBottom: 8 }}>
          Tối ưu từng phòng học, từng kWh.
        </Typography.Title>
        <Typography.Paragraph
          style={{ color: colors.layout.siderText, fontSize: 15, marginBottom: 0, maxWidth: 480 }}
        >
          Hệ thống phân tích và tối ưu sử dụng tài nguyên phòng học trong khuôn viên đại học — trực quan trên bản đồ, theo
          thời gian thực.
        </Typography.Paragraph>
      </div>
    </div>
  )
}
