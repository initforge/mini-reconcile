import * as XLSX from 'xlsx';
import { AppSettings } from '../../types';

// Excel styling constants
const HEADER_STYLE = {
  fill: {
    fgColor: { rgb: '2563EB' } // Indigo
  },
  font: {
    bold: true,
    color: { rgb: 'FFFFFF' },
    sz: 11
  },
  alignment: {
    horizontal: 'center',
    vertical: 'center',
    wrapText: true
  },
  border: {
    top: { style: 'thin', color: { rgb: '1E40AF' } },
    bottom: { style: 'thin', color: { rgb: '1E40AF' } },
    left: { style: 'thin', color: { rgb: '1E40AF' } },
    right: { style: 'thin', color: { rgb: '1E40AF' } }
  }
};

const ALTERNATE_ROW_COLOR = 'F8FAFC'; // Slate 50
const TOTAL_ROW_COLOR = 'EFF6FF'; // Blue 50

/**
 * Create a styled workbook
 */
export const createStyledWorkbook = (): XLSX.WorkBook => {
  return XLSX.utils.book_new();
};

/**
 * Add header row with styling
 */
export const addHeaderRow = (sheet: XLSX.WorkSheet, headers: string[], startRow: number = 0): void => {
  // Add headers
  headers.forEach((header, colIndex) => {
    const cellAddress = XLSX.utils.encode_cell({ r: startRow, c: colIndex });
    if (!sheet[cellAddress]) {
      sheet[cellAddress] = { v: header, t: 's' };
    } else {
      sheet[cellAddress].v = header;
    }
    
    // Apply header style
    if (!sheet['!styles']) {
      sheet['!styles'] = [];
    }
    if (!sheet['!styles'][cellAddress]) {
      sheet['!styles'][cellAddress] = {};
    }
    Object.assign(sheet['!styles'][cellAddress], HEADER_STYLE);
  });
  
  // Set column widths
  if (!sheet['!cols']) {
    sheet['!cols'] = [];
  }
  headers.forEach((header, colIndex) => {
    sheet['!cols'][colIndex] = {
      wch: Math.max(header.length + 2, 12),
      wpx: undefined
    };
  });
  
  // Freeze header row
  if (!sheet['!freeze']) {
    sheet['!freeze'] = { xSplit: 0, ySplit: startRow + 1, topLeftCell: 'A1', activePane: 'bottomLeft', state: 'frozen' };
  }
};

/**
 * Add data rows with alternating colors
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
      const value = row[header] ?? '';
      
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
        sheet[cellAddress] = { v: value, t: 's' };
      }
      
      // Apply cell style
      if (!sheet['!styles']) {
        sheet['!styles'] = [];
      }
      if (!sheet['!styles'][cellAddress]) {
        sheet['!styles'][cellAddress] = {};
      }
      
      const cellStyle: any = {
        alignment: {
          horizontal: options?.numberColumns?.includes(colIndex) ? 'right' : 'left',
          vertical: 'center'
        },
        border: {
          top: { style: 'thin', color: { rgb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
          left: { style: 'thin', color: { rgb: 'E2E8F0' } },
          right: { style: 'thin', color: { rgb: 'E2E8F0' } }
        }
      };
      
      // Alternating row colors or total row highlight
      if (isTotalRow) {
        cellStyle.fill = { fgColor: { rgb: TOTAL_ROW_COLOR } };
        cellStyle.font = { bold: true };
      } else if (rowIndex % 2 === 1) {
        cellStyle.fill = { fgColor: { rgb: ALTERNATE_ROW_COLOR } };
      }
      
      Object.assign(sheet['!styles'][cellAddress], cellStyle);
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
  
  // Add header
  addHeaderRow(sheet, headers, 0);
  
  // Add data
  if (data.length > 0) {
    addDataRows(sheet, data, headers, 1, options);
  }
  
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
  
  // Style the title
  if (!sheet['!styles']) {
    sheet['!styles'] = [];
  }
  sheet['!styles']['A1'] = {
    font: { bold: true, sz: 14, color: { rgb: '2563EB' } },
    alignment: { horizontal: 'left', vertical: 'center' }
  };
  
  // Style metadata rows
  for (let i = 2; i < metadataData.length; i++) {
    const labelCell = XLSX.utils.encode_cell({ r: i, c: 0 });
    const valueCell = XLSX.utils.encode_cell({ r: i, c: 1 });
    
    if (!sheet['!styles'][labelCell]) {
      sheet['!styles'][labelCell] = {};
    }
    sheet['!styles'][labelCell].font = { bold: true };
    
    if (!sheet['!styles'][valueCell]) {
      sheet['!styles'][valueCell] = {};
    }
  }
  
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

