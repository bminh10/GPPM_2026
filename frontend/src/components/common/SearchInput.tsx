// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { InputProps } from 'antd'

type SearchInputProps = Omit<InputProps, 'prefix' | 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}

export default function SearchInput({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  ...props
}: SearchInputProps) {
  return (
    <Input
      {...props}
      allowClear
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
