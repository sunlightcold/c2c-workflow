import * as ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

export function readExcelData(buffer: Buffer) {
  const workbook = XLSX.read(buffer)
  const sheetNameList = workbook.SheetNames
  const data = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetNameList[0]])
  return data
}

export interface ExcelHeaderConfig<D> {
  key: keyof D
  title: string
  width?: number
  formatter?: (opts: { value: any; row: D; rowIndex: number }) => any
}

export function exportToExcel<D extends object>(headers: ExcelHeaderConfig<D>[], data: D[]) {
  const workbook = new ExcelJS.Workbook()
  // 默认行高
  const worksheet = workbook.addWorksheet('Sheet1', { properties: { defaultRowHeight: 20 } })

  const headerTitles = headers.map((header) => header.title)
  const headerRow = worksheet.addRow(headerTitles)
  // 单独设置表头的样式
  headerRow.height = 30
  headers.forEach((_header, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.style = {
      font: { size: 14, bold: true },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCCCCC' },
      },
      alignment: {
        vertical: 'middle',
      },
    }
  })

  // 通用列配置
  worksheet.columns.forEach((column, index) => {
    column.width = headers[index].width ?? 20
    // 垂直居中
    column.alignment = { vertical: 'middle' }
  })

  data.forEach((item, index) => {
    const values = headers.map((header) => {
      if (typeof header.formatter === 'function') {
        return header.formatter({ value: item[header.key], row: item, rowIndex: index })
      }
      return item[header.key]
    })
    const row = worksheet.addRow(values)
    row.height = 20
    row.font = { size: 11, name: 'Calibri' }
  })

  return workbook.xlsx.writeBuffer()
}
