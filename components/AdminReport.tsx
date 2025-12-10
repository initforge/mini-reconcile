import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ReportService } from '../src/lib/reportServices';
import { useRealtimeData, FirebaseUtils } from '../src/lib/firebaseHooks';
import { SettingsService } from '../src/lib/firebaseServices';
import type { ReportRecord, ReportStatus, User, Agent } from '../types';
import ReportFilters from './shared/ReportFilters';
import ReportTable from './shared/ReportTable';
import Pagination from './Pagination';
import { createStyledWorkbook, addMetadataSheet, exportWorkbook, identifyNumberColumns, identifyDateColumns } from '../src/utils/excelExportUtils';

const AdminReport: React.FC = () => {
  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  // Thêm realtime listener cho report_records để tự động reload khi có thay đổi
  const { data: reportRecordsData } = useRealtimeData<Record<string, ReportRecord>>('/report_records');
  const users = FirebaseUtils.objectToArray(usersData || {});
  const agents = FirebaseUtils.objectToArray(agentsData || {});

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Filter state - start empty, only filter when user explicitly sets dates
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedPointOfSaleName, setSelectedPointOfSaleName] = useState<string>('all');
  
  // Data state
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 20;
  
  // Sorting state - Admin: sort by agent
  const [sortBy, setSortBy] = useState<'agent' | 'date' | 'amount'>('agent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Get unique point of sales from all report records (load separately)
  const [allPointOfSales, setAllPointOfSales] = useState<string[]>([]);

  // Load all point of sales from database
  useEffect(() => {
    const loadPointOfSales = async () => {
      try {
        const result = await ReportService.getReportRecords({}, { limit: 10000 });
        const posSet = new Set<string>();
        result.records.forEach(r => {
          if (r.pointOfSaleName) posSet.add(r.pointOfSaleName);
          if (r.merchantPointOfSaleName) posSet.add(r.merchantPointOfSaleName);
        });
        setAllPointOfSales(Array.from(posSet).sort());
      } catch (error) {
        console.error('Error loading point of sales:', error);
      }
    };
    loadPointOfSales();
  }, []);

  // Get unique point of sales from current filtered records (for dynamic updates)
  const availablePointOfSales = React.useMemo(() => {
    const posSet = new Set<string>(allPointOfSales);
    records.forEach(r => {
      if (r.pointOfSaleName) posSet.add(r.pointOfSaleName);
      if (r.merchantPointOfSaleName) posSet.add(r.merchantPointOfSaleName);
    });
    return Array.from(posSet).sort();
  }, [records, allPointOfSales]);

  // Load reports - reload when filters change hoặc khi report_records thay đổi
  useEffect(() => {
    loadReports();
  }, [dateFrom, dateTo, statusFilter, selectedAgentId, selectedUserId, selectedPointOfSaleName, currentPage, sortBy, sortOrder, reportRecordsData]);

  const loadReports = async () => {
    setLoading(true);
    try {
      // Load ALL records first (no date filter on server)
      const filters = {
        agentId: selectedAgentId !== 'all' ? selectedAgentId : undefined,
        agentCode: selectedAgentId !== 'all' ? agents.find(a => a.id === selectedAgentId)?.code : undefined,
        userId: selectedUserId !== 'all' ? selectedUserId : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
        // Don't filter by date on server - do it client-side
        dateFrom: undefined,
        dateTo: undefined
      };
      
      // Load TẤT CẢ merchant_transactions và merge với report_records
      // Logic mới: Hiển thị TẤT CẢ merchant transactions, không phụ thuộc vào phiên
      const result = await ReportService.getAllReportRecordsWithMerchants(filters, {
        limit: 10000 // Load all for sorting, then paginate
      });
      
      // KHÔNG filter UNMATCHED - hiển thị TẤT CẢ records (bao gồm cả merchant transactions chưa có bill)
      // NHƯNG loại bỏ các records hoàn toàn trống (không có merchant data và không có bill data)
      let filteredRecords = result.records.filter(r => {
        // Loại bỏ records hoàn toàn trống: không có merchantTransactionId và không có userBillId
        // Và không có merchantAmount hoặc amount
        const hasMerchantData = r.merchantTransactionId || (r.merchantAmount && !isNaN(r.merchantAmount) && r.merchantAmount > 0) || (r.merchantsFileData && Object.keys(r.merchantsFileData).length > 0);
        const hasBillData = r.userBillId || (r.amount && !isNaN(r.amount) && r.amount > 0);
        const hasTransactionCode = r.transactionCode && r.transactionCode.trim() !== '';
        
        // Chỉ giữ lại nếu có ít nhất merchant data HOẶC bill data, và có transactionCode hợp lệ
        // Và phải có ít nhất một giá trị amount hợp lệ (> 0)
        const hasValidAmount = (r.merchantAmount && !isNaN(r.merchantAmount) && r.merchantAmount > 0) || 
                               (r.amount && !isNaN(r.amount) && r.amount > 0);
        
        return (hasMerchantData || hasBillData) && hasTransactionCode && hasValidAmount;
      });
      
      // Apply date filter client-side (simple logic like "Đợt chi trả" tab)
      if (dateFrom || dateTo) {
        filteredRecords = filteredRecords.filter(r => {
          const dateToCheck = r.transactionDate || r.userBillCreatedAt || r.reconciledAt || r.createdAt || r.merchantTransactionDate;
          if (!dateToCheck) return true;
          
          try {
            const dateStr = typeof dateToCheck === 'string' ? dateToCheck : dateToCheck.toISOString();
            const date = dateStr.split('T')[0];
            if (dateFrom && date < dateFrom) return false;
            if (dateTo && date > dateTo) return false;
            return true;
          } catch (error) {
            return true;
          }
        });
      }
      
      // DEDUPLICATE: Chỉ giữ lại 1 ReportRecord cho mỗi transactionCode (chỉ dựa trên mã chuẩn chi)
      // Không quan tâm userBillId, agentId - chỉ cần transactionCode unique
      const seenTransactionCodes = new Map<string, ReportRecord>();
      filteredRecords.forEach(report => {
        if (!report.transactionCode) return;
        
        const code = String(report.transactionCode).trim();
        if (!code) return;
        
        const existing = seenTransactionCodes.get(code);
        if (!existing) {
          // Chưa có → thêm vào
          seenTransactionCodes.set(code, report);
        } else {
          // Đã có → giữ record đầu tiên (hoặc có thể giữ record có merchantTransactionId nếu muốn)
          // Logic đơn giản: giữ record đầu tiên tìm thấy
          // Nếu muốn ưu tiên record có merchant data: giữ record có merchantTransactionId
          if (report.merchantTransactionId && !existing.merchantTransactionId) {
            seenTransactionCodes.set(code, report);
          }
          // Nếu không, giữ record cũ (đã có trước)
        }
      });
      
      const deduplicatedRecords = Array.from(seenTransactionCodes.values());
      console.log(`📊 [AdminReport] Loaded ${filteredRecords.length} records, after deduplication: ${deduplicatedRecords.length}`);
      if (filteredRecords.length !== deduplicatedRecords.length) {
        const duplicates = filteredRecords.length - deduplicatedRecords.length;
        console.warn(`⚠️ [AdminReport] Removed ${duplicates} duplicate transaction codes`);
      }
      
      // Sort records by agent (default for Admin)
      let sortedRecords = [...deduplicatedRecords];
      if (sortBy === 'agent') {
        sortedRecords.sort((a, b) => {
          const agentA = agents.find(ag => ag.id === a.agentId);
          const agentB = agents.find(ag => ag.id === b.agentId);
          const nameA = String(agentA?.name || a.agentCode || a.agentId || '');
          const nameB = String(agentB?.name || b.agentCode || b.agentId || '');
          const comparison = nameA.localeCompare(nameB, 'vi');
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      } else if (sortBy === 'date') {
        sortedRecords.sort((a, b) => {
          const dateA = new Date(a.transactionDate || a.createdAt || 0).getTime();
          const dateB = new Date(b.transactionDate || b.createdAt || 0).getTime();
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
      } else if (sortBy === 'amount') {
        sortedRecords.sort((a, b) => {
          const amountA = Number(a.amount) || 0;
          const amountB = Number(b.amount) || 0;
          return sortOrder === 'asc' ? amountA - amountB : amountB - amountA;
        });
      }
      
      // Paginate after sorting
      const startIndex = (currentPage - 1) * itemsPerPage;
      const paginatedRecords = sortedRecords.slice(startIndex, startIndex + itemsPerPage);
      
      setRecords(paginatedRecords);
      setTotalRecords(sortedRecords.length);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id: string, updates: Partial<ReportRecord>) => {
    try {
      await ReportService.updateReportRecord(id, updates);
      await loadReports(); // Reload to show updated data
    } catch (error) {
      console.error('Error updating record:', error);
      throw error; // Let ReportTable handle the error display
    }
  };

  const handleFilterChange = (newFilters: {
    dateFrom: string;
    dateTo: string;
    status: ReportStatus | 'all';
    agentId?: string;
    userId?: string;
    pointOfSaleName?: string;
  }) => {
    setDateFrom(newFilters.dateFrom);
    setDateTo(newFilters.dateTo);
    setStatusFilter(newFilters.status);
    setSelectedAgentId(newFilters.agentId || 'all');
    setSelectedUserId(newFilters.userId || 'all');
    setSelectedPointOfSaleName(newFilters.pointOfSaleName || 'all');
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setDateFrom(''); // Clear date filter
    setDateTo(''); // Clear date filter
    setStatusFilter('all');
    setSelectedAgentId('all');
    setSelectedUserId('all');
    setSelectedPointOfSaleName('all');
    setSortBy('agent'); // Reset to default: sort by agent
    setSortOrder('asc'); // Reset to default: ascending
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      // Load all records (not paginated) for export
      const filters = {
        agentId: selectedAgentId !== 'all' ? selectedAgentId : undefined,
        agentCode: selectedAgentId !== 'all' ? agents.find(a => a.id === selectedAgentId)?.code : undefined,
        userId: selectedUserId !== 'all' ? selectedUserId : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
        dateFrom: (dateFrom && dateFrom.trim() !== '') ? dateFrom : undefined,
        dateTo: (dateTo && dateTo.trim() !== '') ? dateTo : undefined
      };
      
      const result = await ReportService.getReportRecords(filters, { limit: 100000 });
      const allRecords = result.records.filter(r => r.status !== 'UNMATCHED');
      
      if (allRecords.length === 0) {
        alert('Không có dữ liệu để xuất');
        return;
      }

      // Calculate summary totals
      let totalTransactions = allRecords.length;
      let totalAmount = 0;
      let totalFee = 0;
      let totalNet = 0;

      allRecords.forEach(record => {
        totalAmount += record.amount || 0;
        
        // Calculate fee
        const agent = agents.find(a => a.id === record.agentId);
        let feePercentage = 0;
        if (agent) {
          const paymentMethod = record.paymentMethod;
          const pointOfSaleName = record.pointOfSaleName;
          if (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
            feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
          } else if (agent.discountRates) {
            feePercentage = agent.discountRates[paymentMethod] || 0;
          }
        }
        const fee = (record.amount * feePercentage) / 100;
        totalFee += fee;
        totalNet += (record.amount - fee);
      });

      // Prepare data for Excel
      const excelData = allRecords.map((record, index) => {
        const agent = agents.find(a => a.id === record.agentId);
        const user = users.find(u => u.id === record.userId);
        
        // Calculate fee for this record
        let feePercentage = 0;
        if (agent) {
          const paymentMethod = record.paymentMethod;
          const pointOfSaleName = record.pointOfSaleName;
          if (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
            feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
          } else if (agent.discountRates) {
            feePercentage = agent.discountRates[paymentMethod] || 0;
          }
        }
        const feeAmount = (record.amount * feePercentage) / 100;
        const netAmount = record.amount - feeAmount;

        // Format thời gian giao dịch đầy đủ (ngày + giờ)
        const formatDateTime = (dateString: string | undefined): string => {
          if (!dateString) return '';
          try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';
            // Format: dd/mm/yyyy HH:mm:ss
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
          } catch {
            return '';
          }
        };

        // Sắp xếp cột theo đúng thứ tự của file Excel gốc
        return {
          // Thứ tự theo file Excel gốc
          'Thời gian GD': formatDateTime(record.transactionDate || record.merchantTransactionDate || record.createdAt),
          'Mã giao dịch': record.transactionCode || '',
          'Chi nhánh': record.merchantBranchName || record.branchName || '',
          'Mã điểm thu': record.merchantCode || record.agentCode || '',
          'Điểm thu': record.merchantPointOfSaleName || record.pointOfSaleName || '',
          'Số hóa đơn': record.merchantInvoiceNumber || record.invoiceNumber || '',
          'Mã trừ tiền/M': record.transactionCode || '',
          
          // Các cột bổ sung (không có trong file Excel gốc nhưng cần cho báo cáo)
          'Đại Lý': record.agentCode || '',
          'Tên đại lý': agent?.name || '',
          'Loại thanh toán': record.paymentMethod || '',
          'Số tiền giao dịch': record.amount || 0,
          'Ngày đối soát': record.reconciledAt ? new Date(record.reconciledAt).toLocaleDateString('vi-VN') : '',
          'Phí (%)': feePercentage,
          'Phí (₫)': feeAmount,
          'Còn lại': netAmount,
          'Trạng thái': record.status === 'MATCHED' ? 'Khớp' : record.status === 'ERROR' ? 'Lỗi' : 'Chờ đối soát',
          'Người dùng': user?.fullName || user?.phone || '',
          'SĐT': user?.phone || '',
          'Ngày TT từ Admin': record.adminPaidAt ? new Date(record.adminPaidAt).toLocaleDateString('vi-VN') : '',
          'Trạng thái TT từ Admin': record.adminPaymentStatus === 'PAID' ? 'Đã thanh toán' : record.adminPaymentStatus === 'UNPAID' ? 'Chưa thanh toán' : record.adminPaymentStatus === 'PARTIAL' ? 'Thanh toán một phần' : record.adminPaymentStatus === 'CANCELLED' ? 'Đã hủy' : 'Chưa thanh toán',
          'Ghi chú': record.errorMessage || record.note || ''
        };
      });

      // Định nghĩa thứ tự cột theo đúng file Excel gốc
      const columnOrder = [
        'Thời gian GD',
        'Mã giao dịch',
        'Chi nhánh',
        'Mã điểm thu',
        'Điểm thu',
        'Số hóa đơn',
        'Mã trừ tiền/M',
        'Đại Lý',
        'Tên đại lý',
        'Loại thanh toán',
        'Số tiền giao dịch',
        'Ngày đối soát',
        'Phí (%)',
        'Phí (₫)',
        'Còn lại',
        'Trạng thái',
        'Người dùng',
        'SĐT',
        'Ngày TT từ Admin',
        'Trạng thái TT từ Admin',
        'Ghi chú'
      ];

      // Sắp xếp lại excelData theo thứ tự cột đã định nghĩa
      const orderedExcelData = excelData.map(row => {
        const orderedRow: Record<string, any> = {};
        columnOrder.forEach(key => {
          if (key in row) {
            orderedRow[key] = row[key];
          }
        });
        return orderedRow;
      });

      const headers = columnOrder.filter(key => orderedExcelData[0] && key in orderedExcelData[0]);
      const numberColumns = identifyNumberColumns(headers);
      const dateColumns = identifyDateColumns(headers);

      // Create workbook with xlsx-js-style (supports real styling)
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([[]]);

      // Add summary row at the top with colored highlights
      const summaryCells = [
        { col: 0, label: 'Tổng lệnh báo có', value: totalTransactions, color: 'FFFF00' }, // Yellow
        { col: 7, label: 'Tổng số tiền', value: totalAmount, color: '00FF00' }, // Green
        { col: 10, label: 'Phí', value: totalFee, color: 'FF0000' }, // Red
        { col: 13, label: 'Số tiền sau khi trừ phí', value: totalNet, color: 'FFFF00' } // Yellow
      ];

      // Add summary row (without styling for now - regular xlsx doesn't support it)
      summaryCells.forEach(({ col, label, value }) => {
        const labelAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        sheet[labelAddress] = { v: `[${label}: ${typeof value === 'number' ? new Intl.NumberFormat('vi-VN').format(value) : value}]`, t: 's' };
        
        const valueAddress = XLSX.utils.encode_cell({ r: 0, c: col + 1 });
        sheet[valueAddress] = { v: value, t: 'n', z: '#,##0' };
      });

      // Add headers at row 2
      headers.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: 1, c: colIndex });
        sheet[cellAddress] = { v: header, t: 's' };
      });

      // Find status column index for conditional formatting
      const statusColIndex = headers.indexOf('Trạng thái');
      
      // Add data rows starting from row 3
      orderedExcelData.forEach((row, rowIndex) => {
        const statusValue = row['Trạng thái' as keyof typeof row];
        const isError = statusValue === 'Lỗi';
        const isMatched = statusValue === 'Khớp';
        
        headers.forEach((header, colIndex) => {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 2, c: colIndex });
          const value = row[header as keyof typeof row];
          
          let cellData: any = {};
          
          if (numberColumns.includes(colIndex)) {
            const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
            if (!isNaN(numValue)) {
              cellData = { v: numValue, t: 'n', z: '#,##0' };
            } else {
              cellData = { v: value, t: 's' };
            }
          } else if (dateColumns.includes(colIndex)) {
            const dateValue = value instanceof Date ? value : new Date(value as string);
            if (!isNaN(dateValue.getTime())) {
              cellData = { v: dateValue, t: 'd', z: 'dd/mm/yyyy' };
            } else {
              cellData = { v: value, t: 's' };
            }
          } else {
            cellData = { v: value, t: 's' };
          }
          
          // Add text markers for status highlighting (regular xlsx doesn't support colors)
          if (colIndex === statusColIndex) {
            if (isError) {
              cellData.v = `🔴 ${cellData.v}`;
            } else if (isMatched) {
              cellData.v = `✅ ${cellData.v}`;
            }
          }
          
          sheet[cellAddress] = cellData;
        });
      });

      // Set sheet range - CRITICAL: This tells Excel where the data is
      const maxRow = Math.max(1, orderedExcelData.length + 1); // Row 0 (summary), Row 1 (headers), Row 2+ (data)
      const maxCol = headers.length - 1;
      sheet['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: maxRow, c: maxCol }
      });

      // Set column widths
      if (!sheet['!cols']) {
        sheet['!cols'] = [];
      }
      headers.forEach((header, colIndex) => {
        let maxLength = header.length;
        
        // Check summary cells
        const summaryCell = summaryCells.find(sc => sc.col === colIndex || sc.col + 1 === colIndex);
        if (summaryCell) {
          const summaryValue = colIndex === summaryCell.col ? summaryCell.label : summaryCell.value;
          if (summaryValue !== undefined && summaryValue !== '') {
            maxLength = Math.max(maxLength, String(summaryValue).length);
          }
        }
        
        // Check all data rows
        orderedExcelData.forEach(row => {
          const value = row[header as keyof typeof row];
          if (value !== null && value !== undefined) {
            const length = String(value).length;
            maxLength = Math.max(maxLength, length);
          }
        });
        
        sheet['!cols'][colIndex] = {
          wch: Math.min(Math.max(maxLength + 3, 12), 50)
        };
      });

      XLSX.utils.book_append_sheet(workbook, sheet, 'Báo cáo đối soát');

      // Add metadata sheet
      const settings = await SettingsService.getSettings();
      const dateRange = (dateFrom && dateFrom.trim() !== '') || (dateTo && dateTo.trim() !== '')
        ? `${dateFrom || ''} - ${dateTo || ''}`
        : 'Tất cả';
      addMetadataSheet(workbook, settings, {
        exportDate: new Date().toISOString(),
        dateRange,
        reportType: 'Báo cáo đối soát'
      });

      // Export
      const fileName = `Bao_Cao_Doi_Soat_${new Date().toISOString().split('T')[0]}.xlsx`;
      exportWorkbook(workbook, fileName);
    } catch (error) {
      console.error('Error exporting Excel:', error);
      alert('Có lỗi khi xuất file Excel. Vui lòng thử lại.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Báo cáo đối soát</h2>
            <p className="text-xs md:text-sm text-slate-500 mt-1">Xem và quản lý tất cả bản ghi đối soát</p>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-2 px-3 md:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm md:text-base w-full sm:w-auto justify-center"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <ReportFilters
          role="ADMIN"
          filters={{
            dateFrom,
            dateTo,
            status: statusFilter,
            agentId: selectedAgentId !== 'all' ? selectedAgentId : undefined,
            userId: selectedUserId !== 'all' ? selectedUserId : undefined,
            pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined
          }}
          users={users}
          agents={agents}
          pointOfSales={availablePointOfSales}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
        />
        
        {/* Sorting Controls */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Sắp xếp theo:</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'agent' | 'date' | 'amount');
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="agent">Đại lý</option>
              <option value="date">Ngày giao dịch</option>
              <option value="amount">Số tiền</option>
            </select>
            <button
              onClick={() => {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              {sortOrder === 'asc' ? '↑ Tăng dần' : '↓ Giảm dần'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-slate-500">Đang tải dữ liệu...</p>
        </div>
      ) : (
        <>
          <ReportTable
            role="ADMIN"
            records={records}
            users={users}
            agents={agents}
            pagination={totalPages > 1 ? {
              currentPage,
              totalPages,
              onPageChange: setCurrentPage
            } : undefined}
            onEdit={handleEdit}
            onPaymentStatusChange={() => {
              loadReports();
              // Also reload unpaid reports in Payouts if on that page
              // This will be handled by realtime data updates
            }}
          />
          {totalPages > 1 && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminReport;

