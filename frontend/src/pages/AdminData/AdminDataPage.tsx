// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Space,
  Spin,
  Switch,
  TimePicker,
  Typography,
  Upload,
  message,
  Tabs,
} from 'antd'
import { DownloadOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import { useAuth } from '../../store/authStore'
import { getAppRole } from '../../routes/roleAccess'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'
import SearchableTable from '../../components/common/SearchableTable'
import { csvTemplate, parseCsv } from './csvUtils'
import CourseRegistrationTab from './CourseRegistrationTab'

type EntityKey = 'campus' | 'faculty' | 'major' | 'class' | 'room' | 'subject' | 'semester' | 'timeSlot'
type FormValues = Record<string, unknown>
type EntityRecord = Record<string, unknown> & { id: number }
type OptionRecord = { id: number; name: string }
type CsvRow = { line: number; values: FormValues; error?: string }
type CsvImportFailure = { line: number; message: string }

function getRecordName(record: EntityRecord) {
  return String(record.name ?? record.code ?? `#${record.id}`)
}

type EntityConfig = {
  key: EntityKey
  label: string
  endpoint: string
  createEndpoint: string
  updateEndpoint: string
  deleteEndpoint: string
  csvColumns: string[]
  csvSample: string[]
  requiredCsvColumns: string[]
  readOnly?: boolean
  csvReferences?: { column: string; payloadField: string }[]
  columns: { key: string; title: string }[]
}

const entities: EntityConfig[] = [
  {
    key: 'campus',
    label: 'Cơ sở (Campus)',
    readOnly: true,
    endpoint: '/campus/all',
    createEndpoint: '/campus/create',
    updateEndpoint: '/campus',
    deleteEndpoint: '/campus',
    csvColumns: ['name', 'address'],
    csvSample: ['Cơ sở 1', '123 Đường mẫu, Thành phố Hồ Chí Minh'],
    requiredCsvColumns: ['name', 'address'],
    columns: [{ key: 'name', title: 'Tên cơ sở' }, { key: 'address', title: 'Địa chỉ' }],
  },
  {
    key: 'faculty',
    label: 'Khoa',
    readOnly: true,
    endpoint: '/faculties',
    createEndpoint: '/faculties',
    updateEndpoint: '/faculties',
    deleteEndpoint: '/faculties',
    csvColumns: ['name'],
    csvSample: ['Khoa Công nghệ thông tin'],
    requiredCsvColumns: ['name'],
    columns: [{ key: 'name', title: 'Tên khoa' }],
  },
  {
    key: 'major',
    label: 'Ngành',
    readOnly: true,
    endpoint: '/majors',
    createEndpoint: '/majors',
    updateEndpoint: '/majors',
    deleteEndpoint: '/majors',
    csvColumns: ['name', 'khoa_name'],
    csvSample: ['Công nghệ thông tin', 'Khoa Công nghệ thông tin'],
    requiredCsvColumns: ['name'],
    csvReferences: [{ column: 'khoa_name', payloadField: 'khoa_id' }],
    columns: [{ key: 'name', title: 'Tên ngành' }, { key: 'khoa_id', title: 'Khoa' }],
  },
  {
    key: 'class',
    label: 'Lớp học',
    endpoint: '/classes',
    createEndpoint: '/classes',
    updateEndpoint: '/classes',
    deleteEndpoint: '/classes',
    csvColumns: ['name', 'si_so', 'nganh_name'],
    csvSample: ['CNTT01', '45', 'Công nghệ thông tin'],
    requiredCsvColumns: ['name', 'nganh_name'],
    csvReferences: [{ column: 'nganh_name', payloadField: 'nganh_id' }],
    columns: [
      { key: 'name', title: 'Tên lớp' },
      { key: 'si_so', title: 'Sĩ số' },
      { key: 'nganh_id', title: 'Ngành' },
    ],
  },
  {
    key: 'room',
    label: 'Phòng học',
    readOnly: true,
    endpoint: '/rooms',
    createEndpoint: '/rooms',
    updateEndpoint: '/rooms',
    deleteEndpoint: '/rooms',
    csvColumns: ['name', 'building', 'capacity', 'is_thuc_hanh', 'campus_name'],
    csvSample: ['A.101', 'Tòa A', '40', 'false', 'Cơ sở 1'],
    requiredCsvColumns: ['name', 'capacity', 'campus_name'],
    csvReferences: [{ column: 'campus_name', payloadField: 'campus_id' }],
    columns: [
      { key: 'name', title: 'Tên phòng' },
      { key: 'building', title: 'Tòa nhà' },
      { key: 'capacity', title: 'Sức chứa' },
      { key: 'campus_id', title: 'Cơ sở' },
    ],
  },
  {
    key: 'subject',
    label: 'Môn học',
    endpoint: '/subjects',
    createEndpoint: '/subjects',
    updateEndpoint: '/subjects',
    deleteEndpoint: '/subjects',
    csvColumns: ['code', 'name', 'credits', 'is_thuc_hanh'],
    csvSample: ['IT001', 'Nhập môn lập trình', '3', 'false'],
    requiredCsvColumns: ['code', 'name'],
    columns: [
      { key: 'code', title: 'Mã môn' },
      { key: 'name', title: 'Tên môn học' },
      { key: 'credits', title: 'Số tín chỉ' },
      { key: 'is_thuc_hanh', title: 'Môn thực hành' },
    ],
  },
  {
    key: 'semester',
    label: 'Học kỳ',
    endpoint: '/semesters',
    createEndpoint: '/semesters',
    updateEndpoint: '/semesters',
    deleteEndpoint: '/semesters',
    csvColumns: ['name', 'start_date', 'end_date'],
    csvSample: ['Học kỳ 1 năm 2026', '2026-09-01', '2027-01-15'],
    requiredCsvColumns: ['name', 'start_date', 'end_date'],
    columns: [
      { key: 'name', title: 'Tên học kỳ' },
      { key: 'start_date', title: 'Ngày bắt đầu' },
      { key: 'end_date', title: 'Ngày kết thúc' },
    ],
  },
  {
    key: 'timeSlot',
    label: 'Ca học',
    endpoint: '/time-slots',
    createEndpoint: '/time-slots',
    updateEndpoint: '/time-slots',
    deleteEndpoint: '/time-slots',
    csvColumns: ['name', 'start_time', 'end_time'],
    csvSample: ['Ca 1', '07:00:00', '09:30:00'],
    requiredCsvColumns: ['name', 'start_time', 'end_time'],
    columns: [
      { key: 'name', title: 'Tên ca' },
      { key: 'start_time', title: 'Bắt đầu' },
      { key: 'end_time', title: 'Kết thúc' },
    ],
  },
]

const emptyOptions: OptionRecord[] = []
const MAX_CSV_SIZE = 5 * 1024 * 1024
const MAX_CSV_ROWS = 500

function parseImportRows(
  fileText: string,
  entity: EntityConfig,
  references: Record<string, OptionRecord[]>,
): CsvRow[] {
  const rows = parseCsv(fileText.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('File CSV cần có dòng tiêu đề và ít nhất một dòng dữ liệu.')

  const headers = rows[0].cells.map((header) => header.trim())
  if (new Set(headers).size !== headers.length) throw new Error('File CSV có tên cột bị trùng.')
  const unsupportedHeaders = headers.filter((header) => !entity.csvColumns.includes(header))
  if (unsupportedHeaders.length > 0) {
    throw new Error(`Cột không được hỗ trợ: ${unsupportedHeaders.join(', ')}.`)
  }
  const missingHeaders = entity.requiredCsvColumns.filter((header) => !headers.includes(header))
  if (missingHeaders.length > 0) {
    throw new Error(`Thiếu cột bắt buộc: ${missingHeaders.join(', ')}.`)
  }

  const dataRows = rows.slice(1)
  if (dataRows.length > MAX_CSV_ROWS) {
    throw new Error(`Mỗi lần chỉ nhập tối đa ${MAX_CSV_ROWS} dòng dữ liệu.`)
  }

  return dataRows.map(({ cells, line }) => {
    if (cells.length !== headers.length) {
      return {
        line,
        values: {},
        error: `Dòng ${line} có ${cells.length} giá trị, cần ${headers.length} giá trị.`,
      }
    }

    try {
      const values: FormValues = {}
      headers.forEach((header, columnIndex) => {
        const value = cells[columnIndex].trim()
        if (!value) return
        const reference = entity.csvReferences?.find((item) => item.column === header)
        if (reference) {
          const matches = (references[reference.column] ?? []).filter(
            (option) => option.name.trim().toLocaleLowerCase() === value.toLocaleLowerCase(),
          )
          if (matches.length !== 1) {
            throw new Error(
              matches.length === 0
                ? `không tìm thấy tên "${value}" ở cột ${header}.`
                : `tên "${value}" ở cột ${header} không duy nhất.`,
            )
          }
          values[reference.payloadField] = matches[0].id
          return
        }
        if (['khoa_id', 'nganh_id', 'si_so', 'capacity', 'campus_id', 'credits'].includes(header)) {
          const number = Number(value)
          if (!Number.isInteger(number)) throw new Error(`cột ${header} phải là số nguyên.`)
          values[header] = number
        } else if (header === 'is_thuc_hanh') {
          const normalized = value.toLowerCase()
          if (['true', '1', 'yes', 'co', 'có'].includes(normalized)) values[header] = true
          else if (['false', '0', 'no', 'khong', 'không'].includes(normalized)) values[header] = false
          else throw new Error('is_thuc_hanh nhận true/false, 1/0, có/không.')
        } else {
          values[header] = value
        }
      })

      const missingValues = entity.requiredCsvColumns.filter(
        (header) => {
          const reference = entity.csvReferences?.find((item) => item.column === header)
          const payloadField = reference?.payloadField ?? header
          return headers.includes(header) && !String(values[payloadField] ?? '').trim()
        },
      )
      if (missingValues.length > 0) throw new Error(`thiếu giá trị ${missingValues.join(', ')}.`)
      return { line, values }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.'
      return { line, values: {}, error: `Dòng ${line}: ${reason}` }
    }
  })
}

function isNotFound(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404
}

function toPayload(entity: EntityKey, values: FormValues): FormValues {
  const payload = { ...values }
  if (entity === 'semester') {
    for (const field of ['start_date', 'end_date']) {
      const value = payload[field] as Dayjs | undefined
      if (value) payload[field] = value.format('YYYY-MM-DD')
    }
  }
  if (entity === 'timeSlot') {
    for (const field of ['start_time', 'end_time']) {
      const value = payload[field] as Dayjs | undefined
      if (value) payload[field] = value.format('HH:mm:ss')
    }
  }
  return payload
}

function EntityFields({
  entity,
  faculties,
  majors,
  campuses,
}: {
  entity: EntityKey
  faculties: OptionRecord[]
  majors: OptionRecord[]
  campuses: OptionRecord[]
}) {
  switch (entity) {
    case 'campus':
      return (
        <>
          <Form.Item name="name" label="Tên cơ sở" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Ví dụ: Cơ sở 1" maxLength={120} />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Địa chỉ cơ sở" maxLength={255} />
          </Form.Item>
        </>
      )
    case 'faculty':
      return (
        <Form.Item name="name" label="Tên khoa" rules={[{ required: true, whitespace: true }]}>
          <Input placeholder="Nhập tên khoa" maxLength={120} />
        </Form.Item>
      )
    case 'major':
      return (
        <>
          <Form.Item name="name" label="Tên ngành" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Nhập tên ngành" maxLength={120} />
          </Form.Item>
          <Form.Item name="khoa_id" label="Khoa">
            <SearchFilterSelect
              allowClear
              placeholder="Chọn khoa (không bắt buộc)"
              options={faculties.map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
        </>
      )
    case 'class':
      return (
        <>
          <Form.Item name="name" label="Tên lớp" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Ví dụ: CNTT01" maxLength={120} />
          </Form.Item>
          <Form.Item name="si_so" label="Sĩ số" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="nganh_id" label="Ngành" rules={[{ required: true, message: 'Vui lòng chọn ngành' }]}>
            <SearchFilterSelect
              placeholder="Chọn ngành"
              options={majors.map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
        </>
      )
    case 'room':
      return (
        <>
          <Form.Item name="name" label="Tên phòng" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Ví dụ: A.101" maxLength={120} />
          </Form.Item>
          <Form.Item name="building" label="Tòa nhà">
            <Input placeholder="Tên hoặc mã tòa nhà" maxLength={120} />
          </Form.Item>
          <Form.Item name="capacity" label="Sức chứa" rules={[{ required: true }]}>
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="campus_id" label="Cơ sở" rules={[{ required: true, message: 'Vui lòng chọn cơ sở' }]}>
            <SearchFilterSelect
              disabled
              placeholder="Chọn cơ sở"
              options={campuses.map((item) => ({ value: item.id, label: item.name }))}
            />
          </Form.Item>
          <Form.Item name="is_thuc_hanh" label="Phòng thực hành" valuePropName="checked">
            <Switch disabled />
          </Form.Item>
        </>
      )
    case 'subject':
      return (
        <>
          <Form.Item name="code" label="Mã môn" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Ví dụ: IT001" maxLength={40} />
          </Form.Item>
          <Form.Item name="name" label="Tên môn học" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Nhập tên môn học" maxLength={120} />
          </Form.Item>
          <Form.Item name="credits" label="Số tín chỉ" rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="is_thuc_hanh"
            label="Có buổi thực hành"
            valuePropName="checked"
          >
            <Switch checkedChildren="Có" unCheckedChildren="Không" />
          </Form.Item>
        </>
      )
    case 'semester':
      return (
        <>
          <Form.Item name="name" label="Tên học kỳ" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Ví dụ: Học kỳ 1 năm 2026" maxLength={120} />
          </Form.Item>
          <Form.Item name="start_date" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="end_date" label="Ngày kết thúc" rules={[{ required: true }]}>
            <DatePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
          </Form.Item>
        </>
      )
    case 'timeSlot':
      return (
        <>
          <Form.Item name="name" label="Tên ca học" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Ví dụ: Ca 1" maxLength={120} />
          </Form.Item>
          <Form.Item name="start_time" label="Giờ bắt đầu" rules={[{ required: true }]}>
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="end_time" label="Giờ kết thúc" rules={[{ required: true }]}>
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
        </>
      )
  }
}

export default function AdminDataPage() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canDelete = ['super_admin', 'staff'].includes(getAppRole(user?.role))
  const [selectedKey, setSelectedKey] = useState<EntityKey>('campus')
  const [records, setRecords] = useState<EntityRecord[]>([])
  const [faculties, setFaculties] = useState<OptionRecord[]>(emptyOptions)
  const [majors, setMajors] = useState<OptionRecord[]>(emptyOptions)
  const [campuses, setCampuses] = useState<OptionRecord[]>(emptyOptions)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvFileList, setCsvFileList] = useState<UploadFile[]>([])
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvParseError, setCsvParseError] = useState<string | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress, setCsvProgress] = useState(0)
  const [csvFailures, setCsvFailures] = useState<CsvImportFailure[]>([])
  const [csvCreatedCount, setCsvCreatedCount] = useState<number | null>(null)
  const [editingRecord, setEditingRecord] = useState<EntityRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const entity = entities.find((item) => item.key === selectedKey) ?? entities[0]
  const [form] = Form.useForm<FormValues>()
  const [editForm] = Form.useForm<FormValues>()

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data } = await apiClient.get<EntityRecord[]>(entity.endpoint)
      setRecords(data)
    } catch (error: unknown) {
      if (selectedKey === 'campus' && isNotFound(error)) {
        setRecords([])
      } else {
        setLoadError(getErrorMessage(error))
      }
    } finally {
      setLoading(false)
    }
  }, [entity.endpoint, selectedKey])

  const handleDelete = useCallback(async (record: EntityRecord) => {
    if (entity.readOnly || !canDelete) return
    try {
      await apiClient.delete(`${entity.deleteEndpoint}/${record.id}`)
      messageApi.success(`Đã xóa ${entity.label.toLowerCase()}`)
      await loadRecords()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    }
  }, [canDelete, entity, loadRecords, messageApi])

  const handleBulkDelete = useCallback(async (selectedRecords: EntityRecord[]) => {
    if (entity.readOnly || !canDelete) return []
    const deletedIds: number[] = []
    const failures: string[] = []
    for (const record of selectedRecords) {
      try {
        await apiClient.delete(`${entity.deleteEndpoint}/${record.id}`)
        deletedIds.push(record.id)
      } catch (error: unknown) {
        failures.push(`${getRecordName(record)}: ${getErrorMessage(error)}`)
      }
    }
    if (deletedIds.length > 0) await loadRecords()
    if (failures.length > 0) {
      messageApi.warning(
        `Đã xóa ${deletedIds.length}/${selectedRecords.length} mục. ${failures.join(' · ')}`,
        8,
      )
    } else {
      messageApi.success(`Đã xóa ${deletedIds.length} ${entity.label.toLowerCase()}`)
    }
    return deletedIds
  }, [canDelete, entity, loadRecords, messageApi])

  useEffect(() => {
    let active = true

    const loadSelectedRecords = async () => {
      try {
        const { data } = await apiClient.get<EntityRecord[]>(entity.endpoint)
        if (active) setRecords(data)
      } catch (error: unknown) {
        if (active && selectedKey === 'campus' && isNotFound(error)) {
          setRecords([])
        } else if (active) {
          setLoadError(getErrorMessage(error))
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadSelectedRecords()
    const optionsRequest =
      selectedKey === 'major'
        ? apiClient.get<OptionRecord[]>('/faculties').then(({ data }) => {
            if (active) setFaculties(data)
          })
        : selectedKey === 'class'
          ? apiClient.get<OptionRecord[]>('/majors').then(({ data }) => {
              if (active) setMajors(data)
            })
          : selectedKey === 'room'
            ? apiClient.get<OptionRecord[]>('/campus/all').then(({ data }) => {
                if (active) setCampuses(data)
              })
            : Promise.resolve()
    void optionsRequest.catch((error: unknown) => {
      if (active) setOptionsError(getErrorMessage(error))
    })

    return () => {
      active = false
    }
  }, [entity.endpoint, selectedKey])

  const columns = useMemo<ColumnsType<EntityRecord>>(
    () => [
      ...entity.columns.map(({ key, title }) => ({
        title,
        dataIndex: key,
        key,
        render: (value: unknown) => {
          if (typeof value === 'boolean') return value ? 'Có' : 'Không'
          if (key === 'khoa_id' && typeof value === 'number') {
            return faculties.find((faculty) => faculty.id === value)?.name ?? '—'
          }
          if (key === 'nganh_id' && typeof value === 'number') {
            return majors.find((major) => major.id === value)?.name ?? '—'
          }
          if (key === 'campus_id' && typeof value === 'number') {
            return campuses.find((campus) => campus.id === value)?.name ?? '—'
          }
          return value === null || value === undefined || value === '' ? '—' : String(value)
        },
      })),
      {
        title: 'Thao tác',
        key: 'actions',
        width: 150,
        fixed: 'right',
        render: (_, record) => (
          <Space>
            <Button
              type="link"
              size="small"
              onClick={() => {
                const values = { ...record } as FormValues
                if (selectedKey === 'semester') {
                  for (const field of ['start_date', 'end_date']) {
                    const value = values[field]
                    if (typeof value === 'string') values[field] = dayjs(value)
                  }
                }
                if (selectedKey === 'timeSlot') {
                  for (const field of ['start_time', 'end_time']) {
                    const value = values[field]
                    if (typeof value === 'string') values[field] = dayjs(`2000-01-01T${value}`)
                  }
                }
                setEditingRecord(record)
                editForm.setFieldsValue(values)
              }}
            >
              Sửa
            </Button>
            {!entity.readOnly && canDelete && (
              <Popconfirm
                title={`Xóa ${entity.label.toLowerCase()}?`}
                description="Thao tác này không thể hoàn tác."
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => void handleDelete(record)}
              >
                <Button type="link" danger size="small">Xóa</Button>
              </Popconfirm>
            )}
          </Space>
        ),
      },
    ],
    [canDelete, campuses, editForm, entity, faculties, handleDelete, majors, selectedKey],
  )

  const handleCreate = async (values: FormValues) => {
    if (entity.readOnly) return
    setSubmitting(true)
    try {
      await apiClient.post(entity.createEndpoint, toPayload(selectedKey, values))
      messageApi.success(`Đã tạo ${entity.label.toLowerCase()} thành công`)
      form.resetFields()
      await loadRecords()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (values: FormValues) => {
    if (!editingRecord) return
    setSubmitting(true)
    try {
      await apiClient.patch(
        `${entity.updateEndpoint}/${editingRecord.id}`,
        toPayload(selectedKey, values),
      )
      messageApi.success(`Đã cập nhật ${entity.label.toLowerCase()}`)
      setEditingRecord(null)
      editForm.resetFields()
      await loadRecords()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const downloadCsvTemplate = () => {
    const blob = new Blob([csvTemplate(entity.csvColumns, entity.csvSample)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mau-${selectedKey}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const selectCsvFile = async (file: File) => {
    setCsvFile(file)
    setCsvRows([])
    setCsvFailures([])
    setCsvCreatedCount(null)
    setCsvParseError(null)
    if (file.size > MAX_CSV_SIZE) {
      setCsvParseError('File vượt quá giới hạn 5 MB.')
      return
    }

    try {
      const references: Record<string, OptionRecord[]> = {
        khoa_name: faculties,
        nganh_name: majors,
        campus_name: campuses,
      }
      const rows = parseImportRows(await file.text(), entity, references)
      setCsvRows(rows)
    } catch (error: unknown) {
      setCsvParseError(error instanceof Error ? error.message : 'Không thể đọc file CSV.')
    }
  }

  const importCsv = async () => {
    if (entity.readOnly || csvRows.length === 0) return
    setCsvImporting(true)
    setCsvProgress(0)
    setCsvFailures([])
    setCsvCreatedCount(0)
    let createdCount = 0
    const failures: CsvImportFailure[] = []

    for (let index = 0; index < csvRows.length; index += 1) {
      const row = csvRows[index]
      if (row.error) {
        failures.push({ line: row.line, message: row.error })
      } else {
        try {
          await apiClient.post(entity.createEndpoint, row.values)
          createdCount += 1
        } catch (error: unknown) {
          failures.push({ line: row.line, message: getErrorMessage(error) })
        }
      }
      setCsvProgress(Math.round(((index + 1) / csvRows.length) * 100))
      setCsvCreatedCount(createdCount)
      setCsvFailures([...failures])
    }

    setCsvImporting(false)
    if (createdCount > 0) await loadRecords()
    if (failures.length === 0) {
      messageApi.success(`Đã tạo ${createdCount} ${entity.label.toLowerCase()} từ file CSV`)
    } else {
      messageApi.warning(`Đã tạo ${createdCount}/${csvRows.length} dòng; ${failures.length} dòng cần kiểm tra`)
    }
  }

  const initialValues: Partial<FormValues> = {
    si_so: 0,
    capacity: 0,
    is_thuc_hanh: false,
    credits: 3,
  }

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      {contextHolder}
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>Quản lý dữ liệu</Typography.Title>
        <Typography.Text type="secondary">
          Quản lý danh mục hệ thống và đăng ký môn học.
        </Typography.Text>
      </div>

      <Tabs
        activeKey={pathname === '/admin/registrations' ? 'course-registrations' : 'entities'}
        onChange={(key) => navigate(
          key === 'course-registrations' ? '/admin/registrations' : '/admin/data',
        )}
        items={[
          {
            key: 'entities',
            label: 'Danh mục dữ liệu',
            children: (
              <>
      <Card>
        <Space direction="vertical" size={16} style={{ display: 'flex' }}>
          <Typography.Title level={5} style={{ margin: 0 }}>Chọn loại dữ liệu</Typography.Title>
          <SearchFilterSelect
            id="data-entity-selector"
            value={selectedKey}
            disabled={csvImporting}
            onChange={(value: EntityKey) => {
              setLoadError(null)
              setOptionsError(null)
              setRecords([])
              setLoading(true)
              setEditingRecord(null)
              setCsvFile(null)
              setCsvFileList([])
              setCsvRows([])
              setCsvParseError(null)
              setCsvFailures([])
              setCsvCreatedCount(null)
              setSelectedKey(value)
              form.resetFields()
              editForm.resetFields()
            }}
            options={entities.map(({ key, label }) => ({ value: key, label }))}
            style={{ width: '100%', maxWidth: 360 }}
          />
        </Space>
      </Card>

      <Row id="data-actions" gutter={[16, 16]} align="top">
        {!entity.readOnly && (
        <Col xs={24} xl={9}>
          <Space direction="vertical" size={16} style={{ display: 'flex' }}>
            <Card id="data-create-form" title={`Tạo ${entity.label.toLowerCase()}`}>
              {optionsError && <Alert type="error" showIcon message={optionsError} style={{ marginBottom: 16 }} />}
              <Form
                key={selectedKey}
                form={form}
                layout="vertical"
                initialValues={initialValues}
                onFinish={handleCreate}
              >
                <EntityFields
                  entity={selectedKey}
                  faculties={faculties}
                  majors={majors}
                  campuses={campuses}
                />
                <Button type="primary" htmlType="submit" loading={submitting} block>
                  Tạo mới
                </Button>
              </Form>
            </Card>
            <Card
              id="data-csv-import"
              title="Tạo hàng loạt từ CSV"
              extra={
                <Button icon={<DownloadOutlined />} onClick={downloadCsvTemplate}>
                  Tải file mẫu
                </Button>
              }
            >
              <Space direction="vertical" size={12} style={{ display: 'flex' }}>
                <Typography.Text type="secondary">
                  Tải mẫu cho loại dữ liệu đang chọn, điền mỗi bản ghi trên một dòng rồi tải file CSV lên.
                  Tối đa {MAX_CSV_ROWS} dòng và 5 MB mỗi lần.
                </Typography.Text>
                <Typography.Text type="secondary">
                  Giữ nguyên tên cột; ngày dùng YYYY-MM-DD, giờ dùng HH:mm:ss, giá trị đúng/sai dùng true/false.
                  Các cột liên kết dùng tên khoa, ngành hoặc cơ sở đã tồn tại.
                </Typography.Text>
                <Upload.Dragger
                  accept=".csv,text/csv"
                  maxCount={1}
                  fileList={csvFileList}
                  disabled={csvImporting}
                  beforeUpload={(file) => {
                    setCsvFileList([{ uid: file.uid, name: file.name, status: 'done' }])
                    void selectCsvFile(file)
                    return false
                  }}
                  onRemove={() => {
                    setCsvFile(null)
                    setCsvFileList([])
                    setCsvRows([])
                    setCsvParseError(null)
                    setCsvFailures([])
                    setCsvCreatedCount(null)
                    return true
                  }}
                >
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text">Nhấn hoặc kéo thả file CSV vào đây</p>
                  <p className="ant-upload-hint">Dùng đúng tên cột trong file mẫu để tránh lỗi khi nhập.</p>
                </Upload.Dragger>
                {csvParseError && <Alert type="error" showIcon message={csvParseError} />}
                {csvFile && !csvParseError && (
                  <Alert
                    type="info"
                    showIcon
                    message={`${csvRows.length} dòng dữ liệu trong ${csvFile.name}`}
                    description="Các dòng sai định dạng sẽ được bỏ qua và báo lỗi riêng; các dòng hợp lệ vẫn được gửi lên API."
                  />
                )}
                {csvImporting && (
                  <div>
                    <Typography.Text>Đang tạo: {csvCreatedCount ?? 0}/{csvRows.length}</Typography.Text>
                    <Progress percent={csvProgress} status="active" />
                  </div>
                )}
                {csvCreatedCount !== null && !csvImporting && (
                  <Alert
                    type={csvFailures.length > 0 ? 'warning' : 'success'}
                    showIcon
                    message={`Đã tạo ${csvCreatedCount}/${csvRows.length} dòng`}
                    description={
                      csvFailures.length > 0 ? (
                        <div style={{ maxHeight: 180, overflow: 'auto' }}>
                          {csvFailures.map((failure) => (
                            <div key={`${failure.line}-${failure.message}`}>
                              Dòng {failure.line}: {failure.message}
                            </div>
                          ))}
                        </div>
                      ) : undefined
                    }
                  />
                )}
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => void importCsv()}
                  disabled={!csvFile || csvRows.length === 0 || Boolean(csvParseError) || csvImporting}
                  loading={csvImporting}
                  block
                >
                  Tạo từ file CSV
                </Button>
              </Space>
            </Card>
          </Space>
        </Col>
        )}
        <Col xs={24} xl={entity.readOnly ? 24 : 15}>
          <Card
            id="data-record-list"
            title={`Danh sách ${entity.label.toLowerCase()}`}
          >
            {loadError ? (
              <Alert type="error" showIcon message={loadError} />
            ) : loading ? (
              <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
            ) : records.length === 0 ? (
              <Empty description="Chưa có dữ liệu" />
            ) : (
              <SearchableTable<EntityRecord>
                rowKey={(record) => record.id}
                columns={columns}
                dataSource={records}
                searchPlaceholder={`Tìm ${entity.label.toLowerCase()}...`}
                getSearchText={(record) => {
                  const values = entity.columns.map(({ key }) => {
                    if (key === 'khoa_id' && typeof record[key] === 'number') {
                      return faculties.find((item) => item.id === record[key])?.name ?? ''
                    }
                    if (key === 'nganh_id' && typeof record[key] === 'number') {
                      return majors.find((item) => item.id === record[key])?.name ?? ''
                    }
                    if (key === 'campus_id' && typeof record[key] === 'number') {
                      return campuses.find((item) => item.id === record[key])?.name ?? ''
                    }
                    return String(record[key] ?? '')
                  })
                  return values.join(' ')
                }}
                onBulkDelete={entity.readOnly || !canDelete ? undefined : handleBulkDelete}
                emptyText="Không tìm thấy dữ liệu"
                pagination={{ pageSize: 8, showSizeChanger: false }}
              />
            )}
          </Card>
        </Col>
      </Row>
      <Modal
        title={`Sửa ${entity.label.toLowerCase()}`}
        open={editingRecord !== null}
        onCancel={() => {
          setEditingRecord(null)
          editForm.resetFields()
        }}
        onOk={() => editForm.submit()}
        confirmLoading={submitting}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form
          key={`${selectedKey}-${editingRecord?.id ?? 'new'}`}
          form={editForm}
          layout="vertical"
          onFinish={handleUpdate}
        >
          <EntityFields
            entity={selectedKey}
            faculties={faculties}
            majors={majors}
            campuses={campuses}
          />
        </Form>
      </Modal>
              </>
            ),
          },
          {
            key: 'course-registrations',
            label: 'Đăng ký môn học',
            children: <CourseRegistrationTab />,
          },
        ]}
      />
    </Space>
  )
}
