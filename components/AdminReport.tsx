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

  // Load reports - reload when filters change
  useEffect(() => {
    loadReports();
  }, [dateFrom, dateTo, statusFilter, selectedAgentId, selectedUserId, selectedPointOfSaleName, currentPage, sortBy, sortOrder]);

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
      
      const result = await ReportService.getReportRecords(filters, {
        limit: 10000 // Load all for sorting, then paginate
      });
      
      // Filter out UNMATCHED records - không hiển thị trong báo cáo
      let filteredRecords = result.records.filter(r => r.status !== 'UNMATCHED');
      
      // Apply date filter client-side (simple logic like "Đợt chi trả" tab)
      if (dateFrom || dateTo) {
        filteredRecords = filteredRecords.filter(r => {
          const dateToCheck = r.transactionDate || r.userBillCreatedAt || r.reconciledAt || r.createdAt;
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
      
      // Sort records by agent (default for Admin)
      let sortedRecords = [...filteredRecords];
      if (sortBy === 'agent') {
        sortedRecords.sort((a, b) => {
          const agentA = agents.find(ag => ag.id === a.agentId);
          const agentB = agents.find(ag => ag.id === b.agentId);
          const nameA = agentA?.name || a.agentCode || a.agentId;
          const nameB = agentB?.name || b.agentCode || b.agentId;
          const comparison = nameA.localeCompare(nameB, 'vi');
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      } else if (sortBy === 'date') {
        sortedRecords.sort((a, b) => {
          const dateA = new Date(a.transactionDate || a.createdAt).getTime();
          const dateB = new Date(b.transactionDate || b.createdAt).getTime();
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
      } else if (sortBy === 'amount') {
        sortedRecords.sort((a, b) => {
          return sortOrder === 'asc' ? a.amount - b.amount : b.amount - a.amount;
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
        dateFrom: dateFilterActive ? dateFrom : undefined,
        dateTo: dateFilterActive ? dateTo : undefined
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

        return {
          'STT': index + 1,
          'Ngày nhập lệnh': record.transactionDate ? new Date(record.transactionDate).toLocaleDateString('vi-VN') : (record.createdAt ? new Date(record.createdAt).toLocaleDateString('vi-VN') : ''),
          'Mã thanh toán': record.transactionCode || '',
          'Đại Lý': record.agentCode || '',
          'Tên đại lý': agent?.name || '',
          'điểm bán': record.pointOfSaleName || '',
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

      const headers = Object.keys(excelData[0] || {});
      const numberColumns = identifyNumberColumns(headers);
      const dateColumns = identifyDateColumns(headers);

      // Create workbook
      const workbook = createStyledWorkbook();
      const sheet = XLSX.utils.aoa_to_sheet([[]]);

      // Add summary row at the top with colored highlights
      const summaryCells = [
        { col: 0, label: 'Tổng lệnh báo có', value: totalTransactions, color: 'FFFF00' }, // Yellow
        { col: 7, label: 'Tổng số tiền', value: totalAmount, color: '00FF00' }, // Green
        { col: 10, label: 'Phí', value: totalFee, color: 'FF0000' }, // Red
        { col: 13, label: 'Số tiền sau khi trừ phí', value: totalNet, color: 'FFFF00' } // Yellow
      ];

      summaryCells.forEach(({ col, label, value, color }) => {
        // Label cell
        const labelAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        sheet[labelAddress] = { v: label, t: 's' };
        
        // Value cell
        const valueAddress = XLSX.utils.encode_cell({ r: 0, c: col + 1 });
        sheet[valueAddress] = { v: value, t: 'n', z: '#,##0' };
        
        // Style label cell
        if (!sheet['!styles']) sheet['!styles'] = [];
        if (!sheet['!styles'][labelAddress]) sheet['!styles'][labelAddress] = {};
        Object.assign(sheet['!styles'][labelAddress], {
          font: { name: 'Arial', bold: true, sz: 11, color: { rgb: '000000' } },
          fill: { fgColor: { rgb: color } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        });
        
        // Style value cell
        if (!sheet['!styles'][valueAddress]) sheet['!styles'][valueAddress] = {};
        Object.assign(sheet['!styles'][valueAddress], {
          font: { name: 'Arial', bold: true, sz: 11, color: { rgb: '000000' } },
          fill: { fgColor: { rgb: color } },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        });
      });

      // Add headers at row 2
      headers.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: 1, c: colIndex });
        sheet[cellAddress] = { v: header, t: 's' };
        
        // Apply header style
        if (!sheet['!styles']) {
          sheet['!styles'] = [];
        }
        if (!sheet['!styles'][cellAddress]) {
          sheet['!styles'][cellAddress] = {};
        }
        Object.assign(sheet['!styles'][cellAddress], {
          fill: { fgColor: { rgb: '2563EB' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Arial' },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: {
            top: { style: 'thin', color: { rgb: '1E40AF' } },
            bottom: { style: 'thin', color: { rgb: '1E40AF' } },
            left: { style: 'thin', color: { rgb: '1E40AF' } },
            right: { style: 'thin', color: { rgb: '1E40AF' } }
          }
        });
      });

      // Find status column index for conditional formatting
      const statusColIndex = headers.indexOf('Trạng thái');
      
      // Add data rows starting from row 3
      excelData.forEach((row, rowIndex) => {
        const statusValue = row['Trạng thái' as keyof typeof row];
        const isError = statusValue === 'Lỗi';
        const isMatched = statusValue === 'Khớp';
        
        headers.forEach((header, colIndex) => {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 2, c: colIndex });
          const value = row[header as keyof typeof row];
          
          if (numberColumns.includes(colIndex)) {
            const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
            if (!isNaN(numValue)) {
              sheet[cellAddress] = { v: numValue, t: 'n', z: '#,##0' };
            } else {
              sheet[cellAddress] = { v: value, t: 's' };
            }
          } else if (dateColumns.includes(colIndex)) {
            const dateValue = value instanceof Date ? value : new Date(value as string);
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
            font: {
              name: 'Arial',
              sz: 10,
              color: { rgb: '000000' }
            },
            alignment: {
              horizontal: numberColumns.includes(colIndex) ? 'right' : 'left',
              vertical: 'center',
              wrapText: true
            },
            border: {
              top: { style: 'thin', color: { rgb: 'E2E8F0' } },
              bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
              left: { style: 'thin', color: { rgb: 'E2E8F0' } },
              right: { style: 'thin', color: { rgb: 'E2E8F0' } }
            }
          };
          
          // Alternating row colors
          if (rowIndex % 2 === 1) {
            cellStyle.fill = { fgColor: { rgb: 'F8FAFC' } }; // Slate 50
          }
          
          // Highlight status column based on value
          if (colIndex === statusColIndex) {
            if (isError) {
              cellStyle.fill = { fgColor: { rgb: 'FEE2E2' } }; // Red 100
              cellStyle.font = { ...cellStyle.font, bold: true, color: { rgb: '991B1B' } }; // Red 800
            } else if (isMatched) {
              cellStyle.fill = { fgColor: { rgb: 'D1FAE5' } }; // Green 100
              cellStyle.font = { ...cellStyle.font, bold: true, color: { rgb: '065F46' } }; // Green 800
            }
          }
          
          Object.assign(sheet['!styles'][cellAddress], cellStyle);
        });
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
        excelData.forEach(row => {
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

      // Set sheet range
      sheet['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: excelData.length + 1, c: headers.length - 1 }
      });

      // Freeze header row
      sheet['!freeze'] = { xSplit: 0, ySplit: 2, topLeftCell: 'A3', activePane: 'bottomLeft', state: 'frozen' };

      XLSX.utils.book_append_sheet(workbook, sheet, 'Báo cáo đối soát');

      // Add metadata sheet
      const settings = await SettingsService.getSettings();
      const dateRange = dateFilterActive 
        ? `${dateFrom} - ${dateTo}`
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
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Báo cáo đối soát</h2>
            <p className="text-sm text-slate-500 mt-1">Xem và quản lý tất cả bản ghi đối soát</p>
          </div>
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
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
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-slate-700">Sắp xếp theo:</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'agent' | 'date' | 'amount');
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
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
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition-colors"
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

