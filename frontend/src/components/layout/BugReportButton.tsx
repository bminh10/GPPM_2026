// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Button, Popover, Space, Typography } from 'antd'
import { BugOutlined, QuestionCircleOutlined } from '@ant-design/icons'

const ISSUES_URL = 'https://github.com/bminh10/GPPM_2026/issues'

const helpContent = (
  <Space direction="vertical" size={8} style={{ maxWidth: 300 }}>
    <Typography.Text strong>Hướng dẫn báo lỗi</Typography.Text>
    <Typography.Text>
      1. Mở Issues bằng nút “Báo lỗi”.
    </Typography.Text>
    <Typography.Text>
      2. Đặt tiêu đề ngắn gọn, mô tả lỗi và các bước để gặp lại lỗi.
    </Typography.Text>
    <Typography.Text>
      3. Ghi rõ kết quả mong đợi, kết quả thực tế và đính kèm ảnh nếu có.
    </Typography.Text>
    <Typography.Text type="secondary">
      Không đăng mật khẩu, token hoặc thông tin cá nhân.
    </Typography.Text>
    {/* <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
      Mở trang Issues
    </a> */}
  </Space>
)

const content = (
  <Space direction="vertical" size={8}>
    <Space size={4}>
      <Typography.Text strong>Hỗ trợ & Kênh giao tiếp</Typography.Text>
      <Popover content={helpContent} title={null} trigger="click" placement="right">
        <Button
          type="text"
          size="small"
          shape="circle"
          aria-label="Hướng dẫn báo lỗi"
          icon={<QuestionCircleOutlined />}
        />
      </Popover>
    </Space>
    <Typography.Text type="secondary">
      Nếu phát hiện lỗi phần mềm, vui lòng tạo báo cáo chi tiết tại tab Issues.
    </Typography.Text>
    <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
      Báo lỗi (Issues)
    </a>
  </Space>
)

export default function BugReportButton() {
  return (
    <Popover content={content} trigger="click" placement="bottomRight">
      <Button type="primary" style={{ backgroundColor: 'red' }} icon={<BugOutlined />}>
        Báo lỗi
      </Button>
    </Popover>
  )
}
