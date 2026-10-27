// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
/**
 * Font toàn dự án (Be Vietnam Pro: thiết kế cho tiếng Việt, license OFL, self-host nên không gọi CDN).
 * Dùng cho Ant Design và Canvas/deck.gl. Bản CSS tương ứng là `--font-sans` trong index.css.
 */
export const FONT_FAMILY =
  "'Be Vietnam Pro', 'Segoe UI', system-ui, -apple-system, Tahoma, Arial, sans-serif"

/** Tải trước font để chữ vẽ bằng canvas (deck.gl) không bị dựng bằng font dự phòng. */
export function preloadFonts() {
  const sample = 'Tòa phòng Khuôn viên ĐH'
  void Promise.all(
    [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 16px "Be Vietnam Pro"`, sample)),
  )
}
