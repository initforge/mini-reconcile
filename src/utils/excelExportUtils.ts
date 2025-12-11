import * as XLSX from 'xlsx-js-style';
import { AppSettings } from '../../types';

// Note: Styling constants removed - regular xlsx doesn't support cell styling
// These can be re-added when xlsx-js-style is properly installed

/**
 * Create a styled workbook
 */
export const createStyledWorkbook = (): XLSX.WorkBook => {
  return XLSX.utils.book_new();
};

/**
 * Calculate optimal column width based on content
 */
const calculateColumnWidth = (sheet: XLSX.WorkSheet, colIndex: number, header: string, data: any[]): number => {
  let maxLength = header ? header.length : 10;
  
  // Check all data rows in this column
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let row = 0; row <= range.e.r; row++) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: colIndex });
    const cell = sheet[cellAddress];
    if (cell && cell.v !== null && cell.v !== undefined) {
      const cellValue = String(cell.v);
      // Count characters, accounting for Vietnamese characters
      const length = cellValue.length;
      // Add some padding for numbers (they're narrower)
      const adjustedLength = cell.t === 'n' ? length + 2 : length;
      maxLength = Math.max(maxLength, adjustedLength);
    }
  }
  
  // Minimum width of 10, maximum of 50, add padding
  return Math.min(Math.max(maxLength + 3, 12), 50);
};

/**
 * Add header row (without styles - XLSX doesn't support !styles)
 */
export const addHeaderRow = (sheet: XLSX.WorkSheet, headers: string[], startRow: number = 0, data?: any[]): void => {
  // Add headers with text formatting
  headers.forEach((header, colIndex) => {
    const cellAddress = XLSX.utils.encode_cell({ r: startRow, c: colIndex });
    if (!sheet[cellAddress]) {
      sheet[cellAddress] = { v: `📋 ${header.toUpperCase()}`, t: 's' }; // Add marker for headers
    } else {
      sheet[cellAddress].v = `📋 ${header.toUpperCase()}`;
    }
  });
  
  // Set column widths with auto-sizing
  if (!sheet['!cols']) {
    sheet['!cols'] = [];
  }
  headers.forEach((header, colIndex) => {
    const width = data ? calculateColumnWidth(sheet, colIndex, header, data) : Math.max(header.length + 3, 12);
    sheet['!cols'][colIndex] = {
      wch: width,
      wpx: undefined
    };
  });
};

/**
 * Add data rows (without styles - XLSX doesn't support !styles)
 */
export const addDataRows = (
  sheet: XLSX.WorkSheet,
  data: any[],
  headers: string[],
  startRow: number = 1,
  options?: {
    numberColumns?: number[];
    dateColumns?: number[];
    highlightTotalRow?: boolean;
  }
): void => {
  data.forEach((row, rowIndex) => {
    const actualRow = startRow + rowIndex;
    const isTotalRow = options?.highlightTotalRow && rowIndex === data.length - 1;
    
    headers.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: actualRow, c: colIndex });
      let value = row[header] ?? '';
      
      // Handle number formatting
      if (options?.numberColumns?.includes(colIndex)) {
        const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
        if (!isNaN(numValue)) {
          sheet[cellAddress] = { v: numValue, t: 'n', z: '#,##0' };
        } else {
          sheet[cellAddress] = { v: value, t: 's' };
        }
      } else if (options?.dateColumns?.includes(colIndex)) {
        // Date formatting
        const dateValue = value instanceof Date ? value : new Date(value);
        if (!isNaN(dateValue.getTime())) {
          sheet[cellAddress] = { v: dateValue, t: 'd', z: 'dd/mm/yyyy' };
        } else {
          sheet[cellAddress] = { v: value, t: 's' };
        }
      } else {
        // Add text markers for total row
        if (isTotalRow) {
          value = `⭐ ${value}`;
        }
        sheet[cellAddress] = { v: value, t: 's' };
      }
    });
  });
};

/**
 * Create a complete styled sheet
 */
export const createStyledSheet = (
  workbook: XLSX.WorkBook,
  sheetName: string,
  headers: string[],
  data: any[],
  options?: {
    numberColumns?: number[];
    dateColumns?: number[];
    highlightTotalRow?: boolean;
  }
): void => {
  const sheet = XLSX.utils.aoa_to_sheet([[]]);
  
  // Add data first (to calculate column widths accurately)
  if (data.length > 0) {
    addDataRows(sheet, data, headers, 1, options);
  }
  
  // Add header after data (so we can calculate widths based on all content)
  addHeaderRow(sheet, headers, 0, data);
  
  // Recalculate column widths after all data is added
  if (!sheet['!cols']) {
    sheet['!cols'] = [];
  }
  headers.forEach((header, colIndex) => {
    const width = calculateColumnWidth(sheet, colIndex, header, data);
    sheet['!cols'][colIndex] = {
      wch: width,
      wpx: undefined
    };
  });
  
  // Set sheet range
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  if (data.length > 0) {
    range.e.r = headers.length > 0 ? data.length : 0;
    range.e.c = headers.length - 1;
  }
  sheet['!ref'] = XLSX.utils.encode_range(range);
  
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
};

/**
 * Add metadata sheet
 */
export const addMetadataSheet = (
  workbook: XLSX.WorkBook,
  settings?: AppSettings,
  metadata?: {
    exportDate?: string;
    dateRange?: string;
    reportType?: string;
  }
): void => {
  const metadataData = [
    ['Thông tin xuất báo cáo'],
    [],
    ['Tên công ty', settings?.companyName || 'PayReconcile Pro'],
    ['Ngày xuất', metadata?.exportDate ? new Date(metadata.exportDate).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN')],
    ['Khoảng thời gian', metadata?.dateRange || 'Tất cả'],
    ['Loại báo cáo', metadata?.reportType || 'Báo cáo tổng hợp'],
    ['Múi giờ', settings?.timezone || 'Asia/Ho_Chi_Minh'],
    ['Đơn vị tiền tệ', settings?.currency || 'VNĐ'],
  ];
  
  const sheet = XLSX.utils.aoa_to_sheet(metadataData);
  
  // Note: XLSX doesn't support !styles, so we use text formatting instead
  // Title row is already bold via text formatting in metadataData
  
  // Set column widths
  sheet['!cols'] = [
    { wch: 20 },
    { wch: 40 }
  ];
  
  XLSX.utils.book_append_sheet(workbook, sheet, 'Thông tin');
};

/**
 * Export workbook to file
 */
export const exportWorkbook = (workbook: XLSX.WorkBook, fileName: string): void => {
  XLSX.writeFile(workbook, fileName);
};

/**
 * Helper to identify number columns from headers
 */
export const identifyNumberColumns = (headers: string[]): number[] => {
  const numberKeywords = ['tiền', 'amount', 'phí', 'fee', 'giá trị', 'value', 'tổng', 'total', 'số', 'count', 'số lượng'];
  return headers
    .map((header, index) => {
      const normalized = header.toLowerCase();
      return numberKeywords.some(keyword => normalized.includes(keyword)) ? index : -1;
    })
    .filter(index => index !== -1);
};

/**
 * Helper to identify date columns from headers
 */
export const identifyDateColumns = (headers: string[]): number[] => {
  const dateKeywords = ['ngày', 'date', 'thời gian', 'time', 'datetime', 'created', 'updated'];
  return headers
    .map((header, index) => {
      const normalized = header.toLowerCase();
      return dateKeywords.some(keyword => normalized.includes(keyword)) ? index : -1;
    })
    .filter(index => index !== -1);
};

