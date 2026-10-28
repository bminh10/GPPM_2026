# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [1.0.0] - 2026-10-27

### Thêm mới
- Xếp lịch phòng học tự động bằng OR-Tools CP-SAT.
- Bản đồ cơ sở và phòng học trực quan (MapLibre GL, deck.gl).
- Điều khiển đèn phòng học qua ESP32.
- Thống kê điện năng theo phòng và theo cơ sở.
- Đọc thẻ RFID (RC522) và ghi thẻ sinh viên, điểm danh theo phiên.
- Đăng nhập bằng JWT, phân quyền theo vai trò.
- Hướng dẫn cài đặt đầy đủ, hỗ trợ chạy bằng Docker và mô phỏng Wokwi.

### Thay đổi
- Triển khai frontend lên Cloudflare Workers, backend lên Render.
- Loại bỏ cấu hình và thư mục các phòng không còn sử dụng.

### Sửa lỗi
- Sửa lỗi mất đăng nhập sau khi triển khai (cookie cross-site).
- Sửa lỗi build `npm run build` và cấu hình deploy Wrangler.
- Giảm độ trễ khi quét thẻ RFID.
- Sửa vị trí nút báo lỗi và nội dung cảnh báo trên giao diện.
- Bỏ ràng buộc unique cho username.
