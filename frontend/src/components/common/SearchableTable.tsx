// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useMemo, useState } from 'react'
import { Button, Popconfirm, Space, Table, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import type { Key, ReactNode } from 'react'
import type { TableProps } from 'antd'
import SearchInput from './SearchInput'

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase()

type SearchableTableProps<T extends object> = {
  rowKey: (record: T) => Key
  dataSource: T[]
  columns: NonNullable<TableProps<T>['columns']>
  getSearchText: (record: T) => string
  searchPlaceholder?: string
  bulkDeleteLabel?: string
  onBulkDelete?: (records: T[]) => Promise<Key[]>
  emptyText?: ReactNode
  size?: TableProps<T>['size']
  pagination?: TableProps<T>['pagination']
  scroll?: TableProps<T>['scroll']
}

export default function SearchableTable<T extends object>({
  rowKey,
  dataSource,
  columns,
  getSearchText,
  searchPlaceholder = 'Tìm trong danh sách...',
  bulkDeleteLabel = 'Xóa mục đã chọn',
  onBulkDelete,
  emptyText,
  size = 'small',
  pagination = { pageSize: 8, showSizeChanger: false },
  scroll = { x: true },
}: SearchableTableProps<T>) {
  const [query, setQuery] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [deleting, setDeleting] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const filteredData = useMemo(() => {
    const normalizedQuery = normalize(query.trim())
    if (!normalizedQuery) return dataSource
    return dataSource.filter((record) =>
      normalize(getSearchText(record)).includes(normalizedQuery),
    )
  }, [dataSource, getSearchText, query])

  const handleBulkDelete = async () => {
    if (!onBulkDelete) return
    const selectedRecords = dataSource.filter((record) => selectedRowKeys.includes(rowKey(record)))
    setDeleting(true)
    try {
      const deletedKeys = await onBulkDelete(selectedRecords)
      setSelectedRowKeys((current) => current.filter((key) => !deletedKeys.includes(key)))
    } catch (error: unknown) {
      messageApi.error(error instanceof Error ? error.message : 'Không thể xóa các mục đã chọn.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {contextHolder}
      <Space direction="vertical" size={12} style={{ display: 'flex' }}>
        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
          <SearchInput
            placeholder={searchPlaceholder}
            value={query}
            onChange={setQuery}
            style={{ width: '100%', maxWidth: 360 }}
          />
          {onBulkDelete && (
            <Space>
              {selectedRowKeys.length > 0 && (
                <Button onClick={() => setSelectedRowKeys([])}>
                  Bỏ chọn ({selectedRowKeys.length})
                </Button>
              )}
              <Popconfirm
                title={`Xóa ${selectedRowKeys.length} mục đã chọn?`}
                description="Một số mục có thể không xóa được nếu đang được sử dụng."
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true, disabled: selectedRowKeys.length === 0 }}
                onConfirm={() => void handleBulkDelete()}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={selectedRowKeys.length === 0}
                  loading={deleting}
                >
                  {bulkDeleteLabel}
                </Button>
              </Popconfirm>
            </Space>
          )}
        </Space>
        <Table<T>
          rowKey={rowKey}
          columns={columns}
          dataSource={filteredData}
          size={size}
          pagination={pagination}
          scroll={scroll}
          locale={{ emptyText }}
          rowSelection={
            onBulkDelete
              ? {
                  selectedRowKeys,
                  preserveSelectedRowKeys: true,
                  onChange: setSelectedRowKeys,
                }
              : undefined
          }
        />
      </Space>
    </>
  )
}
