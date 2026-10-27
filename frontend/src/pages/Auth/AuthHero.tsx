// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { EnvironmentOutlined } from '@ant-design/icons'
import { Typography } from 'antd'

export default function AuthHero() {
  return (
    <div className="relative hidden h-full w-full overflow-hidden lg:flex lg:flex-col lg:justify-between p-12 text-white">
      {/* 1. Ảnh nền cố định với hiệu ứng zoom nhẹ */}
      <img
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105"
        src="https://tuyensinh.ou.edu.vn/media/photos/Duy.nhv/2026/toa%202C%203.jpg"
        alt="Auth Hero"
      />

      {/* 2. Lớp phủ Gradient giúp nổi bật nội dung phía trên */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/60" />

      {/* 3. Phần Header trên cùng (Logo/Brand Name) */}
      <div className="relative z-10 flex items-center gap-3">
      </div>

      {/* 4. Phần Nội dung chính phía dưới (Quote / Highlight Card) */}
      <div className="relative z-10 space-y-6">
        {/* Floating Card hiệu ứng kính mờ (Glassmorphism) */}
        <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-md shadow-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
            <EnvironmentOutlined />
            <span>Trường Đại học Mở TP.HCM</span>
          </div>

          <h2 className="flex items-center text-2xl font-bold leading-tight text-white mb-2">
            SMART CAMPUS with <span className="size-2"></span> <div className="bg-blue-900 p-3 rounded-3xl">OPEN UNIVERSITY</div>
          </h2>

          <p className="text-sm leading-relaxed text-slate-200">
            Tối ưu hóa khả năng vận hành cơ sở
          </p>
          
        </div>

        {/* Indicator trang trí / Đánh giá ngắn */}
        <div className="flex items-center justify-between text-xs text-slate-300 px-2">
          <Typography.Text type="secondary">
            SmartOU © {new Date().getFullYear()} — Smart Campus, Đại học Mở TP.HCM
          </Typography.Text>
          <div className="flex gap-1.5">
            <span className="h-1.5 w-6 rounded-full bg-blue-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          </div>
        </div>
      </div>
    </div>
  )
}