// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Button, Popover, Space, Typography } from 'antd'
import { BugOutlined } from '@ant-design/icons'

const ISSUES_URL = 'https://github.com/bminh10/GPPM_2026/issues'

const content = (
  <Space direction="vertical" size={8}>
    <Typography.Text strong>Hỗ trợ & Kênh giao tiếp</Typography.Text>
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
      <Button type="primary" style={{backgroundColor: 'red'}} icon={<BugOutlined />}>
        Báo lỗi
      </Button>
    </Popover>
  )
}
