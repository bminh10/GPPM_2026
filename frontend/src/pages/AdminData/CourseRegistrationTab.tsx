import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Space,
  Spin,
  Typography,
  Upload,
  message,
} from 'antd'
import { DownloadOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'
import SearchableTable from '../../components/common/SearchableTable'
import { csvTemplate, parseCsv } from './csvUtils'

type Registration = {
  id: number
  lop_id: number
  mon_id: number
  hoc_ky_id: number | null
  so_luong: number
}

type RegistrationFormValues = Omit<Registration, 'id'>
type ParsedRow = { line: number; values: RegistrationFormValues; error?: string }
type ImportFailure = { line: number; message: string }
type NamedOption = { id: number; name: string }
type ClassOption = NamedOption & { si_so: number | null }
type SubjectOption = NamedOption & { code: string }

const MAX_CSV_SIZE = 5 * 1024 * 1024
const MAX_CSV_ROWS = 500
const CSV_COLUMNS = ['lop_name', 'mon_name', 'hoc_ky_name', 'so_luong']

function resolveName(options: NamedOption[], name: string, label: string) {
  const matches = options.filter((option) => option.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Không tìm thấy ${label} "${name}".`
        : `${label} "${name}" không duy nhất.`,
    )
  }
  return matches[0].id
}

function parseRegistrationCsv(
  text: string,
  classes: ClassOption[],
  subjects: NamedOption[],
  semesters: NamedOption[],
): ParsedRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('File CSV cần có dòng tiêu đề và ít nhất một dòng dữ liệu.')

  const headers = rows[0].cells.map((header) => header.trim())
  if (new Set(headers).size !== headers.length) throw new Error('File CSV có tên cột bị trùng.')
  const unsupported = headers.filter((header) => !CSV_COLUMNS.includes(header))
  if (unsupported.length > 0) throw new Error(`Cột không được hỗ trợ: ${unsupported.join(', ')}.`)
  const missing = ['lop_name', 'mon_name', 'hoc_ky_name', 'so_luong']
    .filter((header) => !headers.includes(header))
  if (missing.length > 0) throw new Error(`Thiếu cột bắt buộc: ${missing.join(', ')}.`)

  const dataRows = rows.slice(1)
  if (dataRows.length > MAX_CSV_ROWS) {
    throw new Error(`Mỗi lần chỉ nhập tối đa ${MAX_CSV_ROWS} dòng dữ liệu.`)
  }

  return dataRows.map(({ cells, line }) => {
    if (cells.length !== headers.length) {
      return {
        line,
        values: { lop_id: 0, mon_id: 0, hoc_ky_id: 0, so_luong: 0 },
        error: `Dòng ${line} có ${cells.length} giá trị, cần ${headers.length} giá trị.`,
      }
    }

    try {
      const className = cells[headers.indexOf('lop_name')].trim()
      const subjectName = cells[headers.indexOf('mon_name')].trim()
      const semesterName = cells[headers.indexOf('hoc_ky_name')].trim()
      const countValue = cells[headers.indexOf('so_luong')].trim()
      const count = Number(countValue)
      if (!className || !subjectName || !semesterName) {
        throw new Error('Thiếu tên lớp, tên môn học hoặc tên học kỳ.')
      }
      if (!countValue || !Number.isInteger(count) || count < 0) {
        throw new Error('so_luong phải là số nguyên không âm.')
      }
      const classId = resolveName(classes, className, 'lớp')
      const schoolClass = classes.find((item) => item.id === classId)
      if (schoolClass?.si_so != null && count > schoolClass.si_so) {
        throw new Error(`so_luong không được vượt quá sĩ số lớp (${schoolClass.si_so}).`)
      }
      return {
        line,
        values: {
          lop_id: classId,
          mon_id: resolveName(subjects, subjectName, 'môn học'),
          hoc_ky_id: resolveName(semesters, semesterName, 'học kỳ'),
          so_luong: count,
        },
      }
    } catch (error: unknown) {
      return {
        line,
        values: { lop_id: 0, mon_id: 0, hoc_ky_id: 0, so_luong: 0 },
        error: `Dòng ${line}: ${error instanceof Error ? error.message : 'Dữ liệu không hợp lệ.'}`,
      }
    }
  })
}

function downloadTemplate() {
  const blob = new Blob(
    [csvTemplate(CSV_COLUMNS, ['Lớp CNTT01', 'Nhập môn lập trình', 'Học kỳ 1 năm 2026', '45'])],
    { type: 'text/csv;charset=utf-8' },
  )
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'mau-dang-ky-mon-hoc.csv'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function CourseRegistrationTab() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [semesters, setSemesters] = useState<NamedOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [referencesError, setReferencesError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [createdCount, setCreatedCount] = useState<number | null>(null)
  const [failures, setFailures] = useState<ImportFailure[]>([])
  const [editing, setEditing] = useState<Registration | null>(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm<RegistrationFormValues>()
  const [createForm] = Form.useForm<RegistrationFormValues>()
  const createClassId = Form.useWatch('lop_id', createForm)
  const editClassId = Form.useWatch('lop_id', form)
  const createClassSize = classes.find((item) => item.id === createClassId)?.si_so
  const editClassSize = classes.find((item) => item.id === editClassId)?.si_so

  const loadRegistrations = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data } = await apiClient.get<Registration[]>('/course-registrations')
      setRegistrations(data)
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.allSettled([
      apiClient.get<Registration[]>('/course-registrations'),
      apiClient.get<ClassOption[]>('/classes'),
      apiClient.get<SubjectOption[]>('/subjects'),
      apiClient.get<NamedOption[]>('/semesters'),
    ])
      .then(([registrationsResult, classesResult, subjectsResult, semestersResult]) => {
        if (!active) return
        if (registrationsResult.status === 'fulfilled') {
          setRegistrations(registrationsResult.value.data)
        } else {
          setLoadError(getErrorMessage(registrationsResult.reason))
        }
        const referenceErrors: string[] = []
        if (classesResult.status === 'fulfilled') {
          setClasses(classesResult.value.data)
        } else {
          referenceErrors.push(`Lớp: ${getErrorMessage(classesResult.reason)}`)
        }
        if (subjectsResult.status === 'fulfilled') {
          setSubjects(subjectsResult.value.data)
        } else {
          referenceErrors.push(`Môn học: ${getErrorMessage(subjectsResult.reason)}`)
        }
        if (semestersResult.status === 'fulfilled') {
          setSemesters(semestersResult.value.data)
        } else {
          referenceErrors.push(`Học kỳ: ${getErrorMessage(semestersResult.reason)}`)
        }
        if (referenceErrors.length > 0) setReferencesError(referenceErrors.join(' · '))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile)
    setRows([])
    setFailures([])
    setCreatedCount(null)
    setParseError(null)
    if (selectedFile.size > MAX_CSV_SIZE) {
      setParseError('File vượt quá giới hạn 5 MB.')
      return
    }
    try {
      setRows(parseRegistrationCsv(await selectedFile.text(), classes, subjects, semesters))
    } catch (error: unknown) {
      setParseError(error instanceof Error ? error.message : 'Không thể đọc file CSV.')
    }
  }

  const importFile = async () => {
    if (rows.length === 0) return
    setImporting(true)
    setProgress(0)
    setFailures([])
    setCreatedCount(0)
    let succeeded = 0
    const failed: ImportFailure[] = []

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      if (row.error) {
        failed.push({ line: row.line, message: row.error })
      } else {
        try {
          await apiClient.post('/course-registrations', row.values)
          succeeded += 1
        } catch (error: unknown) {
          failed.push({ line: row.line, message: getErrorMessage(error) })
        }
      }
      setProgress(Math.round(((index + 1) / rows.length) * 100))
      setCreatedCount(succeeded)
      setFailures([...failed])
    }

    setImporting(false)
    if (succeeded > 0) await loadRegistrations()
    if (failed.length === 0) {
      messageApi.success(`Đã tạo ${succeeded} đăng ký môn học`)
    } else {
      messageApi.warning(`Đã tạo ${succeeded}/${rows.length} dòng; ${failed.length} dòng cần kiểm tra`)
    }
  }

  const handleUpdate = async (values: RegistrationFormValues) => {
    if (!editing) return
    setSaving(true)
    try {
      await apiClient.patch(`/course-registrations/${editing.id}`, values)
      messageApi.success('Đã cập nhật đăng ký môn học')
      setEditing(null)
      await loadRegistrations()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async (values: RegistrationFormValues) => {
    setCreating(true)
    try {
      await apiClient.post('/course-registrations', values)
      messageApi.success('Đã tạo đăng ký môn học')
      createForm.resetFields()
      await loadRegistrations()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = useCallback(async (registration: Registration) => {
    try {
      await apiClient.delete(`/course-registrations/${registration.id}`)
      messageApi.success('Đã xóa đăng ký môn học')
      await loadRegistrations()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    }
  }, [loadRegistrations, messageApi])

  const handleBulkDelete = useCallback(async (selected: Registration[]) => {
    const deletedIds: number[] = []
    const failures: string[] = []
    for (const registration of selected) {
      try {
        await apiClient.delete(`/course-registrations/${registration.id}`)
        deletedIds.push(registration.id)
      } catch (error: unknown) {
        const className = classes.find((item) => item.id === registration.lop_id)?.name ?? 'Lớp'
        const subjectName = subjects.find((item) => item.id === registration.mon_id)?.name ?? 'Môn học'
        failures.push(`${className} - ${subjectName}: ${getErrorMessage(error)}`)
      }
    }
    if (deletedIds.length > 0) await loadRegistrations()
    if (failures.length > 0) {
      messageApi.warning(
        `Đã xóa ${deletedIds.length}/${selected.length} mục. ${failures.join(' · ')}`,
        8,
      )
    } else {
      messageApi.success(`Đã xóa ${deletedIds.length} đăng ký môn học`)
    }
    return deletedIds
  }, [classes, loadRegistrations, messageApi, subjects])

  const columns = useMemo<ColumnsType<Registration>>(
    () => [
      {
        title: 'Lớp',
        dataIndex: 'lop_id',
        key: 'lop_id',
        render: (id: number) => classes.find((item) => item.id === id)?.name ?? 'Không tìm thấy lớp',
      },
      {
        title: 'Môn học',
        dataIndex: 'mon_id',
        key: 'mon_id',
        render: (id: number) => subjects.find((item) => item.id === id)?.name ?? 'Không tìm thấy môn học',
      },
      {
        title: 'Học kỳ',
        dataIndex: 'hoc_ky_id',
        key: 'hoc_ky_id',
        render: (id: number | null) =>
          semesters.find((item) => item.id === id)?.name ?? 'Chưa gán học kỳ',
      },
      { title: 'Số lượng', dataIndex: 'so_luong', key: 'so_luong' },
      {
        title: 'Thao tác',
        key: 'actions',
        render: (_, registration) => (
          <Space>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setEditing(registration)
                form.setFieldsValue({
                  lop_id: registration.lop_id,
                  mon_id: registration.mon_id,
                  hoc_ky_id: registration.hoc_ky_id ?? undefined,
                  so_luong: registration.so_luong,
                })
              }}
            >
              Sửa
            </Button>
            <Popconfirm
              title="Xóa đăng ký môn học?"
              description="Không thể xóa nếu đăng ký đã có thời khóa biểu."
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDelete(registration)}
            >
              <Button type="link" danger size="small">Xóa</Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [classes, form, handleDelete, semesters, subjects],
  )

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      {contextHolder}
      {/* <Card title="Tạo đăng ký môn học">
        {referencesError && (
          <Alert
            type="error"
            showIcon
            message="Không tải được danh sách tham chiếu"
            description={referencesError}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="lop_id" label="Lớp" rules={[{ required: true, message: 'Vui lòng chọn lớp' }]}>
            <SearchFilterSelect
              options={classes.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="Chọn lớp"
            />
          </Form.Item>
          <Form.Item name="mon_id" label="Môn học" rules={[{ required: true, message: 'Vui lòng chọn môn học' }]}>
            <SearchFilterSelect
              options={subjects.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="Chọn môn học"
            />
          </Form.Item>
          <Form.Item
            name="hoc_ky_id"
            label="Học kỳ"
            rules={[{ required: true, message: 'Vui lòng chọn học kỳ' }]}
          >
            <SearchFilterSelect
              options={semesters.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="Chọn học kỳ"
            />
          </Form.Item>
          <Form.Item
            name="so_luong"
            label="Số lượng"
            rules={[
              { required: true, message: 'Vui lòng nhập số lượng' },
              {
                validator: (_, value: number | null | undefined) =>
                  value === undefined || value === null || createClassSize == null || value <= createClassSize
                    ? Promise.resolve()
                    : Promise.reject(new Error(`Số lượng không được vượt quá sĩ số lớp (${createClassSize}).`)),
              },
            ]}
          >
            <InputNumber
              min={0}
              max={createClassSize ?? undefined}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={creating}>
            Tạo đăng ký
          </Button>
        </Form>
      </Card> */}
      <Card
        title="Nhập đăng ký môn học bằng CSV"
        extra={
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
            Tải file mẫu
          </Button>
        }
      >
        <Space direction="vertical" size={12} style={{ display: 'flex' }}>
          {referencesError && (
            <Alert
              type="error"
              showIcon
              message="Không tải được danh sách tham chiếu"
              description={referencesError}
            />
          )}
          <Typography.Text type="secondary">
            Mỗi dòng gồm tên lớp, tên môn học, học kỳ và số lượng sinh viên. Tên lớp, môn học và học kỳ cần khớp với dữ liệu đã có.
            File hỗ trợ tối đa {MAX_CSV_ROWS} dòng, 5 MB.
          </Typography.Text>
          <Typography.Text type="secondary">
            Thay tên ví dụ trong file mẫu bằng tên thực tế; nếu tên bị trùng, hệ thống sẽ báo dòng đó để kiểm tra.
          </Typography.Text>
          <Upload.Dragger
            accept=".csv,text/csv"
            maxCount={1}
            fileList={fileList}
            disabled={importing}
            beforeUpload={(selectedFile) => {
              setFileList([{ uid: selectedFile.uid, name: selectedFile.name, status: 'done' }])
              void handleFile(selectedFile)
              return false
            }}
            onRemove={() => {
              setFile(null)
              setFileList([])
              setRows([])
              setParseError(null)
              setFailures([])
              setCreatedCount(null)
              return true
            }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Nhấn hoặc kéo thả file CSV vào đây</p>
            <p className="ant-upload-hint">Giữ nguyên tên cột: lop_name, mon_name, hoc_ky_name, so_luong.</p>
          </Upload.Dragger>
          {parseError && <Alert type="error" showIcon message={parseError} />}
          {file && !parseError && (
            <Alert
              type="info"
              showIcon
              message={`${rows.length} dòng dữ liệu trong ${file.name}`}
              description="Mỗi dòng được gửi riêng; dòng lỗi sẽ được báo lại và không ngăn các dòng hợp lệ."
            />
          )}
          {importing && (
            <div>
              <Typography.Text>Đang tạo: {createdCount ?? 0}/{rows.length}</Typography.Text>
              <Progress percent={progress} status="active" />
            </div>
          )}
          {createdCount !== null && !importing && (
            <Alert
              type={failures.length > 0 ? 'warning' : 'success'}
              showIcon
              message={`Đã tạo ${createdCount}/${rows.length} dòng`}
              description={
                failures.length > 0 ? (
                  <div style={{ maxHeight: 180, overflow: 'auto' }}>
                    {failures.map((failure) => (
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
            onClick={() => void importFile()}
            disabled={!file || rows.length === 0 || Boolean(parseError) || importing}
            loading={importing}
            block
          >
            Tạo đăng ký từ CSV
          </Button>
        </Space>
      </Card>

      <Card
        title="Danh sách đăng ký môn học"
        extra={<Button onClick={() => void loadRegistrations()} loading={loading}>Tải lại</Button>}
      >
        {loadError ? (
          <Alert type="error" showIcon message={loadError} />
        ) : loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
        ) : registrations.length === 0 ? (
          <Empty description="Chưa có đăng ký môn học" />
        ) : (
          <SearchableTable<Registration>
            rowKey={(registration) => registration.id}
            columns={columns}
            dataSource={registrations}
            getSearchText={(registration) => [
              classes.find((item) => item.id === registration.lop_id)?.name,
              subjects.find((item) => item.id === registration.mon_id)?.name,
              semesters.find((item) => item.id === registration.hoc_ky_id)?.name,
              registration.so_luong,
            ].join(' ')}
            searchPlaceholder="Tìm theo lớp, môn học hoặc học kỳ..."
            onBulkDelete={handleBulkDelete}
            emptyText="Không tìm thấy đăng ký môn học"
            pagination={{ pageSize: 8, showSizeChanger: false }}
          />
        )}
      </Card>

      <Modal
        title="Sửa đăng ký môn học"
        open={editing !== null}
        onCancel={() => {
          setEditing(null)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="lop_id" label="Lớp" rules={[{ required: true, message: 'Vui lòng chọn lớp' }]}>
            <SearchFilterSelect
              options={classes.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="Chọn lớp"
            />
          </Form.Item>
          <Form.Item name="mon_id" label="Môn học" rules={[{ required: true, message: 'Vui lòng chọn môn học' }]}>
            <SearchFilterSelect
              options={subjects.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="Chọn môn học"
            />
          </Form.Item>
          <Form.Item
            name="hoc_ky_id"
            label="Học kỳ"
            rules={[{ required: true, message: 'Vui lòng chọn học kỳ' }]}
          >
            <SearchFilterSelect
              options={semesters.map((item) => ({ value: item.id, label: item.name }))}
              placeholder="Chọn học kỳ"
            />
          </Form.Item>
          <Form.Item
            name="so_luong"
            label="Số lượng"
            rules={[
              { required: true, message: 'Vui lòng nhập số lượng' },
              {
                validator: (_, value: number | null | undefined) =>
                  value === undefined || value === null || editClassSize == null || value <= editClassSize
                    ? Promise.resolve()
                    : Promise.reject(new Error(`Số lượng không được vượt quá sĩ số lớp (${editClassSize}).`)),
              },
            ]}
          >
            <InputNumber min={0} max={editClassSize ?? undefined} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
