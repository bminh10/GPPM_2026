// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Select } from 'antd'
import type { SelectProps } from 'antd'

type SearchFilterSelectProps = SelectProps

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase()

const defaultFilterOption: NonNullable<SelectProps['filterOption']> = (input, option) => {
  const label = option?.label
  const searchableLabel = typeof label === 'string' || typeof label === 'number' ? String(label) : ''
  return normalize(searchableLabel).includes(normalize(input))
}

export default function SearchFilterSelect({
  showSearch,
  optionFilterProp,
  filterOption,
  ...props
}: SearchFilterSelectProps) {
  return (
    <Select
      {...props}
      showSearch={showSearch ?? true}
      optionFilterProp={optionFilterProp ?? 'label'}
      filterOption={filterOption ?? defaultFilterOption}
    />
  )
}
