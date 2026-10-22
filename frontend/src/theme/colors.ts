import type { ThemeConfig } from 'antd'

/**
 * Single Source of Truth cho toàn bộ bảng màu dự án:
 * - Dùng cho Ant Design (thông qua antdTheme)
 * - Dùng cho Deck.gl / Canvas (thông qua helper hexToRgba / deckColors)
 * - Dùng cho Tailwind CSS & Pure CSS (thông qua CSS variables trong index.css)
 */
export const colors = {
  // Brand / Primary (tone xanh Đại học Mở TP.HCM)
  primary: {
    DEFAULT: '#0a5ca8',
    light: '#e6f1fb',
    dark: '#004ea2',
    hover: '#2f80d1',
    active: '#003d80',
  },

  // Layout (Sider / Header / Footer)
  layout: {
    siderBg: '#004ea2',
    siderText: '#dbeafe',
    headerBg: '#ffffff',
    footerBg: '#ffffff',
  },

  // Liquid glass
  glass: {
    bg: 'rgba(255, 255, 255, 0.72)',
    border: 'rgba(255, 255, 255, 0.65)',
    shadow: 'rgba(0, 78, 162, 0.15)',
  },

  // Semantic Status
  success: {
    DEFAULT: '#22c55e',
    light: '#dcfce7',
    dark: '#16a34a',
  },
  warning: {
    DEFAULT: '#f59e0b',
    light: '#fef3c7',
    dark: '#d97706',
  },
  danger: {
    DEFAULT: '#ef4444',
    light: '#fee2e2',
    dark: '#dc2626',
  },
  info: {
    DEFAULT: '#0e7490',
    light: '#e0f2fe',
    dark: '#155e75',
  },

  // Campus Status (Phòng học & Vận hành)
  campus: {
    available: '#16a34a',
    busy: '#ef4444',
    maintenance: '#f59e0b',
    moderate: '#3b82f6',
  },

  // Hotspots
  hotspot: {
    critical: '#dc2626',
    warning: '#f97316',
    info: '#0e7490',
  },

  // Zones (Khu vực campus)
  zone: {
    corridor: '#e0efff',
    block: '#f8fafc',
    outdoor: '#ece8da',
  },

  // Background & Surface
  bg: {
    main: '#f4f7fb',
    card: '#ffffff',
    subtle: '#f8fafc',
    border: '#dbe3ef',
  },

  // Neutral text
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#94a3b8',
  },
} as const

/**
 * Chuyển mã hex '#RRGGBB' sang tuple RGBA [r, g, b, a] dùng cho Deck.gl / Canvas
 */
export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const cleanHex = hex.replace('#', '')
  const parsed = parseInt(
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex,
    16,
  )

  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255

  return [r, g, b, alpha]
}

/**
 * Cấu hình Theme token chuẩn cho Ant Design ConfigProvider
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary.DEFAULT,
    colorSuccess: colors.success.DEFAULT,
    colorWarning: colors.warning.DEFAULT,
    colorError: colors.danger.DEFAULT,
    colorInfo: colors.primary.DEFAULT,
    colorTextBase: colors.text.primary,
    colorBgBase: colors.bg.card,
    borderRadius: 8,
    fontFamily: "Inter, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  components: {
    Layout: {
      siderBg: colors.layout.siderBg,
      headerBg: colors.layout.headerBg,
      footerBg: colors.layout.footerBg,
      bodyBg: 'transparent',
      headerPadding: '0 20px',
    },
    Menu: {
      darkItemBg: colors.layout.siderBg,
      darkSubMenuItemBg: colors.layout.siderBg,
      darkItemColor: colors.layout.siderText,
      darkItemSelectedBg: 'rgba(255, 255, 255, 0.18)',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.1)',
    },
  },
}
