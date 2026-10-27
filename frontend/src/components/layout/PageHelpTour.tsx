// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useState } from 'react'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Button, Tour } from 'antd'
import type { TourProps } from 'antd'
import { ROUTE_PATHS } from '../../routes/menuConfig'

type GuideStep = NonNullable<TourProps['steps']>[number]

function guideStep(targetId: string, title: string, description: string): GuideStep {
  return {
    title,
    description,
    target: () =>
      document.getElementById(targetId) ??
      document.getElementById('app-page-tour')!,
  }
}

const pageGuides: Record<string, GuideStep[]> = {
  [ROUTE_PATHS.home]: [
    guideStep('home-carousel', 'Ảnh giới thiệu', 'Carousel tự chuyển ảnh để giới thiệu khuôn viên và hệ thống. Có thể dùng các chấm phía dưới để chuyển đến ảnh khác.'),
    guideStep('home-actions', 'Mở chức năng', 'Các thẻ bên dưới được lọc theo quyền tài khoản. Nhấn “Mở chức năng” để chuyển đến trang làm việc tương ứng.'),
  ],
  [ROUTE_PATHS.dashboard]: [
    guideStep('dashboard-filters', 'Lọc theo học kỳ', 'Chọn một học kỳ duy nhất để cập nhật phạm vi báo cáo. Xóa lựa chọn để xem dữ liệu của tất cả học kỳ.'),
    guideStep('dashboard-statistics', 'Đọc các chỉ số chính', 'Bốn thẻ tóm tắt tổng số phòng, tỷ lệ sử dụng trung bình, lượt sử dụng và số phòng dưới ngưỡng.'),
    guideStep('dashboard-utilization', 'Tỷ lệ sử dụng theo phòng', 'So sánh mức độ khai thác từng phòng trong phạm vi bộ lọc. Di chuột lên biểu đồ để xem giá trị.'),
    guideStep('dashboard-demand', 'Nhu cầu theo ngày và ca', 'Bản đồ nhiệt cho biết số buổi theo từng ngày trong tuần và ca học; màu đậm thể hiện nhu cầu cao hơn.'),
    guideStep('dashboard-underused', 'Phòng sử dụng thấp', 'Bảng cuối trang liệt kê các phòng dưới ngưỡng. Có thể tìm tên phòng và chuyển trang để tra cứu.'),
  ],
  [ROUTE_PATHS.map]: [
    guideStep('map-date-filters', 'Chọn thời điểm xem', 'Chọn học kỳ và ngày để hiển thị lịch lớp trong ngày đó. Nút “Hôm nay” chuyển nhanh về ngày hiện tại.'),
    guideStep('map-navigation', 'Chọn khu vực', 'Dùng danh sách cơ sở, tòa nhà và tầng để định vị; chọn “Toàn khuôn viên” để trở về toàn cảnh.'),
    guideStep('map-building-selector', 'Điều hướng bản đồ', 'Chọn tòa nhà để phóng đến khu vực. Có thể chọn phòng trực tiếp trên sơ đồ để xem chi tiết.'),
  ],
  [ROUTE_PATHS.cardReader]: [
    guideStep('reader-campus-select', 'Chọn cơ sở điểm danh', 'Chọn đúng cơ sở để xem phiên và lịch sử điểm danh. Bộ đọc chỉ phục vụ một phiên tại một thời điểm.'),
    guideStep('reader-session-duration', 'Cấu hình thời lượng', 'Bật tự kết thúc và nhập số phút từ 1 đến 1440; tắt chế độ này nếu phiên sẽ được kết thúc thủ công.'),
    guideStep('reader-session-actions', 'Bắt đầu hoặc kết thúc phiên', 'Xác nhận thao tác trong hộp thoại. Chỉ MSSV được quét lần đầu trong phiên được ghi nhận; đây không phải xác minh danh tính.'),
    guideStep('reader-session-history', 'Xem lịch sử điểm danh', 'Chọn một phiên để xem tối đa 50 lượt mỗi trang; bảng thể hiện MSSV, giờ nhận tại server và trạm đọc.'),
    guideStep('reader-latest-scan', 'Kết quả đầu đọc', 'Khu vực này tự cập nhật lần quét gần nhất. Kiểm tra trạng thái đọc, UID, loại thẻ và dữ liệu; MSSV trên thẻ chưa được đối chiếu với danh sách sinh viên.'),
  ],
  [ROUTE_PATHS.cardWriter]: [
    guideStep('writer-card-status', 'Nhận diện thẻ', 'Chạm thẻ trắng hoặc thẻ mẫu lên trạm. Xác nhận writer đang liên lạc và kiểm tra UID, loại thẻ trước khi tiếp tục.'),
    guideStep('writer-mssv-input', 'Nhập MSSV', 'Nhập đủ 10 chữ số, bắt đầu bằng 245101. Nút xác nhận chỉ được mở khi định dạng hợp lệ, writer trực tuyến và thẻ còn mới.'),
    guideStep('writer-card-confirmation', 'Xác nhận quyền sử dụng thẻ', 'Kiểm tra UID đang hiển thị và xác nhận đây là thẻ trắng/thẻ mẫu thuộc quyền sử dụng của bạn. Không dùng thẻ trường có dữ liệu sẵn.'),
    guideStep('writer-authorize', 'Ủy quyền ghi một lần', 'Sau khi xác nhận, nhấc thẻ rồi chạm lại đúng thẻ trong thời hạn ủy quyền. Đọc kết quả lệnh ghi bên dưới để xác nhận thao tác hoàn tất.'),
  ],
  [ROUTE_PATHS.timetable]: [
    guideStep('timetable-filters', 'Lọc thời khóa biểu', 'Chọn học kỳ, cơ sở, khoa, ngành và phòng. Kết hợp bộ lọc để thu hẹp lịch cần tra cứu.'),
    guideStep('timetable-week-view', 'Xem và chuyển tuần', 'Lịch được hiển thị theo tuần; dùng hai nút mũi tên trên tiêu đề lịch để chuyển tuần. Chọn một lịch để xem hoặc chỉnh sửa theo quyền.'),
    guideStep('timetable-auto-schedule', 'Xếp lịch tự động', 'Mở quy trình xếp lịch, chọn phạm vi và xác nhận sau khi kiểm tra dữ liệu đăng ký, phòng và thời khóa biểu hiện có.'),
  ],
  [ROUTE_PATHS.dataManagement]: [
    guideStep('data-entity-selector', 'Chọn loại danh mục', 'Chọn cơ sở, khoa, ngành, lớp, phòng, môn học, học kỳ hoặc ca học. Danh sách và biểu mẫu thay đổi theo loại đang chọn.'),
    guideStep('data-actions', 'Tạo mới hoặc nhập CSV', 'Với danh mục cho phép ghi, dùng biểu mẫu để tạo một mục hoặc tải file mẫu CSV, điền đúng tên cột rồi nhập hàng loạt.'),
    guideStep('data-record-list', 'Tra cứu và cập nhật', 'Tìm kiếm trong danh sách, chọn sửa để cập nhật thông tin. Quyền xóa phụ thuộc vai trò; Admin không có quyền xóa.'),
  ],
  [ROUTE_PATHS.courseRegistrations]: [
    guideStep('registration-csv-import', 'Nhập đăng ký bằng CSV', 'Tải file mẫu, giữ nguyên tên cột lop_name, mon_name, hoc_ky_name, so_luong rồi tải file lên. Kiểm tra các dòng lỗi trước khi tạo.'),
    guideStep('registration-semester-filter', 'Lọc theo học kỳ', 'Chọn một học kỳ hoặc nhóm chưa gán học kỳ để thu hẹp danh sách đăng ký.'),
    guideStep('registration-list', 'Tra cứu và quản lý đăng ký', 'Tìm theo lớp hoặc môn học, dùng phân trang để duyệt danh sách và chọn thao tác trên dòng để cập nhật. Số lượng không được vượt sĩ số lớp; quyền xóa phụ thuộc vai trò.'),
  ],
  [ROUTE_PATHS.userManagement]: [
    guideStep('users-create-button', 'Tạo tài khoản', 'Nhấn “Tạo tài khoản”, nhập họ tên, email đăng nhập, mật khẩu SmartOU và vai trò. Không nhập mật khẩu hộp thư email.'),
    guideStep('users-list', 'Tìm tài khoản', 'Tìm theo tên, email, vai trò hoặc trạng thái; bảng hiển thị thông tin và phân trang.'),
    guideStep('users-list', 'Cập nhật và phân quyền', 'Dùng “Sửa” để cập nhật thông tin hoặc vai trò; chuyển trạng thái để vô hiệu hóa/kích hoạt. Không thể tự vô hiệu hóa tài khoản đang đăng nhập.'),
  ],
  [ROUTE_PATHS.auditLogs]: [
    guideStep('audit-log-table', 'Đọc nhật ký hoạt động', 'Mỗi dòng gồm thời gian, phương thức, đường dẫn API, mã trạng thái và thông tin chi tiết nếu có.'),
    guideStep('audit-log-table', 'Tìm các bản ghi tiếp theo', 'Dùng điều khiển phân trang phía cuối bảng để chuyển trang hoặc đổi số bản ghi hiển thị. Trang tải tối đa 500 hoạt động gần nhất.'),
  ],
  [ROUTE_PATHS.profile]: [
    guideStep('profile-summary', 'Thông tin hồ sơ', 'Thẻ đầu trang hiển thị tên, email và vai trò của tài khoản đang đăng nhập.'),
    guideStep('profile-details', 'Chi tiết tài khoản', 'Đối chiếu họ tên, email và vai trò đang được cấp trong hệ thống.'),
    guideStep('profile-status', 'Trạng thái tài khoản', 'Kiểm tra vai trò, trường và trạng thái hoạt động hiện tại.'),
  ],
  [ROUTE_PATHS.documentation]: [
    guideStep('guide-intro', 'Trang tài liệu', 'Nút “Tour toàn hệ thống” giới thiệu các phần của tài liệu; nút “Bắt đầu hướng dẫn” trên thẻ mở tour cho chức năng tương ứng.'),
    guideStep('guide-roles', 'Quyền theo vai trò', 'Các chức năng được lọc theo vai trò hiện tại. Nếu thiếu một mục, tài khoản có thể chưa được cấp quyền truy cập.'),
    guideStep('guide-features', 'Chọn hướng dẫn chi tiết', 'Mỗi thẻ có quy trình, lưu ý và quyền truy cập. Dùng “Mở chức năng” để đến trang làm việc.'),
  ],
}

const defaultGuide = [
  guideStep('app-page-tour', 'Hướng dẫn trang hiện tại', 'Mở Tài liệu để xem hướng dẫn chi tiết theo chức năng và quyền truy cập.'),
]

type PageHelpTourProps = {
  pathname: string
}

export default function PageHelpTour({ pathname }: PageHelpTourProps) {
  const [open, setOpen] = useState(false)
  const steps = pageGuides[pathname] ?? defaultGuide

  return (
    <>
      <Button
        type="text"
        shape="circle"
        icon={<QuestionCircleOutlined />}
        aria-label="Hướng dẫn trang hiện tại"
        title="Hướng dẫn trang hiện tại"
        onClick={() => setOpen(true)}
      />
      <Tour open={open} onClose={() => setOpen(false)} steps={steps} />
    </>
  )
}
