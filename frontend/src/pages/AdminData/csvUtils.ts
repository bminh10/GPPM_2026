export type CsvRow = { cells: string[]; line: number }

export function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  let line = 1
  let rowLine = 1

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"'
          index += 1
        } else {
          quoted = false
        }
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && text[index + 1] === '\n') {
          value += '\r\n'
          index += 1
        } else {
          value += character
        }
        line += 1
      } else {
        value += character
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell.trim() !== '')) rows.push({ cells: row, line: rowLine })
      row = []
      value = ''
      line += 1
      rowLine = line
    } else if (character === '"') {
      throw new Error(`Dấu ngoặc kép không hợp lệ tại ký tự ${index + 1}.`)
    } else {
      value += character
    }
  }

  if (quoted) throw new Error('File CSV có dấu ngoặc kép chưa được đóng.')
  row.push(value)
  if (row.some((cell) => cell.trim() !== '')) rows.push({ cells: row, line: rowLine })
  return rows
}

function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function csvTemplate(columns: string[], sample: string[]) {
  return `\uFEFF${[columns, sample].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`
}
