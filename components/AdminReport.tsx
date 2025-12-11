import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
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
  const [searchTerm, setSearchTerm] = useState<string>(''); // Search by transaction code
  
  // Data state
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 20;
  
  // Sorting state - Admin: sort by agent, default ascending
  // Load from localStorage if available
  const [sortBy, setSortBy] = useState<'agent' | 'date' | 'amount'>(() => {
    const saved = localStorage.getItem('adminReport_sortBy');
    return (saved as 'agent' | 'date' | 'amount') || 'agent';
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => {
    const saved = localStorage.getItem('adminReport_sortOrder');
    return (saved as 'asc' | 'desc') || 'asc'; // Default: ascending
  });

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
  }, [dateFrom, dateTo, statusFilter, selectedAgentId, selectedUserId, selectedPointOfSaleName, searchTerm, currentPage, sortBy, sortOrder, reportRecordsData]);

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
      
      // CHỈ hiển thị records đã có file merchants khớp (có merchantTransactionId)
      // Bills chưa có merchants KHÔNG được hiển thị trong báo cáo
      let filteredRecords = result.records.filter(r => {
        // PHẢI có merchantTransactionId (đã có file merchants)
        if (!r.merchantTransactionId) {
          return false;
        }
        
        // Phải có transactionCode hợp lệ
        if (!r.transactionCode || r.transactionCode.trim() === '') {
          return false;
        }
        
        // Phải có ít nhất một giá trị amount hợp lệ (> 0)
        const hasValidAmount = (r.merchantAmount && !isNaN(r.merchantAmount) && r.merchantAmount > 0) || 
                               (r.amount && !isNaN(r.amount) && r.amount > 0);
        
        return hasValidAmount;
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
      
      // Apply search term filter (transaction code)
      if (searchTerm && searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        filteredRecords = filteredRecords.filter(r => {
          const code = r.transactionCode ? String(r.transactionCode).toLowerCase() : '';
          return code.includes(searchLower);
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
    setSearchTerm(newFilters.searchTerm || '');
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
      
      // Dùng getAllReportRecordsWithMerchants để có đầy đủ dữ liệu như khi hiển thị
      const result = await ReportService.getAllReportRecordsWithMerchants(filters, { limit: 100000 });
      // Filter giống như khi hiển thị - CHỈ records có merchantTransactionId
      const allRecords = result.records.filter(r => {
        // PHẢI có merchantTransactionId (đã có file merchants)
        if (!r.merchantTransactionId) {
          return false;
        }
        
        // Phải có transactionCode hợp lệ
        if (!r.transactionCode || r.transactionCode.trim() === '') {
          return false;
        }
        
        // Phải có ít nhất một giá trị amount hợp lệ (> 0)
        const hasValidAmount = (r.merchantAmount && !isNaN(r.merchantAmount) && r.merchantAmount > 0) || 
                               (r.amount && !isNaN(r.amount) && r.amount > 0);
        
        return hasValidAmount;
      });
      
      if (allRecords.length === 0) {
        alert('Không có dữ liệu để xuất');
        return;
      }

      // Calculate summary totals - sử dụng merchantAmount || amount giống như trên web
      let totalTransactions = allRecords.length;
      let totalAmount = 0;
      let totalFee = 0;
      let totalNet = 0;

      allRecords.forEach(record => {
        // Sử dụng merchantAmount || amount giống như trên web
        const amount = record.merchantAmount || record.amount || 0;
        totalAmount += amount;
        
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
        const fee = (amount * feePercentage) / 100;
        totalFee += fee;
        totalNet += (amount - fee);
      });

      // Helper function để format datetime
      const formatDateTime = (dateString: string | undefined): string => {
        if (!dateString) return '';
        try {
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return '';
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

      // Helper function để format date (không có giờ)
      const formatDate = (dateString: string | undefined): string => {
        if (!dateString) return '';
        try {
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return '';
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        } catch {
          return '';
        }
      };

      // Helper function để lấy giá trị từ merchantsFileData với nhiều key variations
      const getMerchantFileValue = (record: ReportRecord, keys: string[]): string => {
        if (!record.merchantsFileData) return '';
        for (const key of keys) {
          const value = record.merchantsFileData[key];
          if (value !== null && value !== undefined && String(value).trim() !== '') {
            return String(value);
          }
        }
        return '';
      };

      // Helper function để lấy số tiền từ merchantsFileData (Số tiền trước/sau KM)
      const getMerchantAmount = (record: ReportRecord, isBeforeDiscount: boolean): number => {
        if (!record.merchantsFileData) {
          // Fallback to record fields
          return isBeforeDiscount ? (record.merchantAmountBeforeDiscount || 0) : (record.merchantAmount || 0);
        }
        
        // Tìm key phù hợp
        const keys = isBeforeDiscount 
          ? ['Số tiền trước KM', 'số tiền trước km', 'Số tiền trước khuyến mại', 'số tiền trước khuyến mại']
          : ['Số tiền sau KM', 'số tiền sau km', 'Số tiền sau khuyến mại', 'số tiền sau khuyến mại'];
        
        for (const key of keys) {
          const value = record.merchantsFileData[key];
          if (value !== null && value !== undefined) {
            const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : Number(value);
            if (!isNaN(numValue) && numValue > 0) return numValue;
          }
        }
        
        // Fallback: tìm bằng normalized comparison
        const normalizedTarget = isBeforeDiscount ? 'tien truoc' : 'tien sau';
        for (const key in record.merchantsFileData) {
          const normalizedKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          if (normalizedKey.includes(normalizedTarget)) {
            const value = record.merchantsFileData[key];
            if (value !== null && value !== undefined) {
              const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : Number(value);
              if (!isNaN(numValue) && numValue > 0) return numValue;
            }
          }
        }
        
        // Final fallback
        return isBeforeDiscount ? (record.merchantAmountBeforeDiscount || 0) : (record.merchantAmount || 0);
      };

      // Tìm tất cả merchantFileColumns từ records để xác định các cột dynamic
      const allMerchantFileColumns = new Set<string>();
      allRecords.forEach(record => {
        if (record.merchantsFileData) {
          Object.keys(record.merchantsFileData).forEach(key => allMerchantFileColumns.add(key));
        }
      });

      // Xác định cột "Số tiền trước KM" và "Số tiền sau KM" từ merchantFileColumns
      let tienTruocKMColumn: string | null = null;
      let tienSauKMColumn: string | null = null;
      
      for (const col of Array.from(allMerchantFileColumns)) {
        const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (!tienTruocKMColumn && (norm.includes('tien truoc') || norm.includes('tiền trước') || norm.includes('truoc km') || norm.includes('trước km'))) {
          tienTruocKMColumn = col;
        }
        if (!tienSauKMColumn && (norm.includes('tien sau') || norm.includes('tiền sau') || norm.includes('sau km') || norm.includes('sau khuyen mai'))) {
          tienSauKMColumn = col;
        }
      }

      // Định nghĩa thứ tự cột CHÍNH XÁC theo báo cáo trên web
      // NHÓM 1: Thông tin từ Bill (màu xanh dương - bg-blue-50)
      // NHÓM 2: Thông tin từ Merchants (màu xanh lá - bg-green-50)
      // NHÓM 3: Kết quả đối soát (màu xám - bg-slate-50)
      // LƯU Ý: Trên web có 2 cột "Mã giao dịch" (một trong nhóm Bill, một trong nhóm Merchants)
      // Trong Excel, để tránh nhầm lẫn, cột trong nhóm Merchants sẽ được đổi tên thành "Mã GD"
      const columnOrder: string[] = [
        // NHÓM 1: Thông tin từ Bill
        'Mã giao dịch',      // Từ Bill (record.transactionCode nếu có userBillId)
        'Người dùng',        // Từ Bill (user.fullName)
        'Tên đại lý',        // Từ Bill (agent.name)
        
        // NHÓM 2: Thông tin từ Merchants
        'Thời gian GD',      // Từ Merchants
        'Mã GD',             // Từ Merchants (merchantsFileData['Mã giao dịch']) - đổi tên để tránh trùng với cột Bill
        'Chi nhánh',         // Từ Merchants
        'Mã điểm thu',       // Từ Merchants
        'Điểm thu',          // Từ Merchants
        'Số hóa đơn',        // Từ Merchants
        'Mã chuẩn chi',      // Từ Merchants (merchantsFileData['Mã chuẩn chi'])
        'Số điện thoại',     // Từ Merchants
      ];

      // Thêm cột dynamic "Số tiền trước KM" và "Số tiền sau KM" nếu có
      if (tienTruocKMColumn) {
        columnOrder.push('Số tiền trước KM');
      }
      if (tienSauKMColumn) {
        columnOrder.push('Số tiền sau KM');
      }

      // NHÓM 3: Kết quả đối soát
      columnOrder.push(
        'Loại thanh toán',
        'Số tiền giao dịch',
        'Ngày đối soát',
        'Phí (%)',
        'Phí',
        'Còn lại',
        'Trạng thái',
        'Ngày TT từ Admin',
        'Trạng thái TT từ Admin',
        'Ghi chú'
      );

      // Prepare data for Excel - mapping chính xác theo thứ tự cột trên web
      const excelData = allRecords.map((record) => {
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
        const amount = record.merchantAmount || record.amount || 0;
        const feeAmount = (amount * feePercentage) / 100;
        const netAmount = amount - feeAmount;

        // Build row data theo đúng thứ tự columnOrder
        const rowData: Record<string, any> = {};

        // NHÓM 1: Thông tin từ Bill
        // Mã giao dịch (từ Bill - record.transactionCode nếu có userBillId)
        rowData['Mã giao dịch'] = record.userBillId ? (record.transactionCode || '') : '';
        rowData['Người dùng'] = user ? (user.fullName || user.email || '') : '';
        rowData['Tên đại lý'] = agent ? (agent.name || '') : '';
        
        // NHÓM 2: Thông tin từ Merchants
        // Thời gian GD
        rowData['Thời gian GD'] = formatDateTime(
          record.merchantTransactionDate || 
          getMerchantFileValue(record, ['Thời gian GD', 'thời gian gd', 'Thoi gian GD']) ||
          record.transactionDate ||
          record.createdAt
        );
        
        // Mã GD (từ Merchants - merchantsFileData['Mã giao dịch'])
        rowData['Mã GD'] = getMerchantFileValue(record, ['Mã giao dịch', 'mã giao dịch', 'Ma giao dich']) || '';
        
        // Chi nhánh
        rowData['Chi nhánh'] = record.merchantBranchName || 
          getMerchantFileValue(record, ['Chi nhánh', 'chi nhánh']) || '';
        
        // Mã điểm thu
        rowData['Mã điểm thu'] = record.merchantCode || 
          getMerchantFileValue(record, ['Mã điểm thu', 'mã điểm thu']) || '';
        
        // Điểm thu
        rowData['Điểm thu'] = record.merchantPointOfSaleName || 
          getMerchantFileValue(record, ['Điểm thu', 'điểm thu']) || '';
        
        // Số hóa đơn - ưu tiên merchantsFileData trước, sau đó mới đến merchantInvoiceNumber
        rowData['Số hóa đơn'] = getMerchantFileValue(record, ['Số hóa đơn', 'số hóa đơn', 'SỐ HÓA ĐƠN']) || 
          record.merchantInvoiceNumber || '';
        
        // Mã chuẩn chi
        rowData['Mã chuẩn chi'] = getMerchantFileValue(record, [
          'Mã trừ tiền_Mã chuẩn chi',
          'Mã trừ tiền Mã chuẩn chi',
          'Mã chuẩn chi',
          'mã chuẩn chi',
          'MÃ CHUẨN CHI'
        ]) || '';
        
        // Số điện thoại - ưu tiên merchantsFileData trước, sau đó mới đến merchantPhoneNumber
        rowData['Số điện thoại'] = getMerchantFileValue(record, ['Số điện thoại', 'số điện thoại', 'SĐT', 'sđt', 'SỐ ĐIỆN THOẠI']) || 
          record.merchantPhoneNumber || '';
        
        // Số tiền trước KM (dynamic)
        if (tienTruocKMColumn) {
          rowData['Số tiền trước KM'] = getMerchantAmount(record, true);
        }
        
        // Số tiền sau KM (dynamic)
        if (tienSauKMColumn) {
          rowData['Số tiền sau KM'] = getMerchantAmount(record, false);
        }
        
        // NHÓM 3: Kết quả đối soát
        rowData['Loại thanh toán'] = record.paymentMethod || '';
        rowData['Số tiền giao dịch'] = amount;
        rowData['Ngày đối soát'] = formatDate(record.reconciledAt);
        rowData['Phí (%)'] = feePercentage;
        rowData['Phí'] = feeAmount;
        rowData['Còn lại'] = netAmount;
        rowData['Trạng thái'] = record.status === 'MATCHED' ? 'Khớp' : 
                                 record.status === 'ERROR' ? 'Lỗi' : 'Chờ đối soát';
        rowData['Ngày TT từ Admin'] = formatDate(record.adminPaidAt);
        rowData['Trạng thái TT từ Admin'] = record.adminPaymentStatus === 'PAID' ? 'Đã thanh toán' : 
                                            record.adminPaymentStatus === 'UNPAID' ? 'Chưa thanh toán' : 
                                            record.adminPaymentStatus === 'PARTIAL' ? 'Thanh toán một phần' : 
                                            record.adminPaymentStatus === 'CANCELLED' ? 'Đã hủy' : 'Chưa thanh toán';
        rowData['Ghi chú'] = record.errorMessage || record.note || '';

        return rowData;
      });

      // Sắp xếp lại excelData theo thứ tự cột đã định nghĩa
      // Đảm bảo TẤT CẢ cột trong columnOrder đều có trong output (ngay cả khi giá trị rỗng)
      const orderedExcelData = excelData.map(row => {
        const orderedRow: Record<string, any> = {};
        columnOrder.forEach(key => {
          // Luôn thêm cột vào output, ngay cả khi không có trong row
          orderedRow[key] = key in row ? row[key] : '';
        });
        return orderedRow;
      });

      // Headers phải là TẤT CẢ cột trong columnOrder (không filter)
      const headers = [...columnOrder];
      const numberColumns = identifyNumberColumns(headers);
      const dateColumns = identifyDateColumns(headers);

      // Create workbook with xlsx-js-style (supports real styling)
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([[]]);

      // Define column groups with colors (khớp với báo cáo trên web) - PHẢI KHAI BÁO TRƯỚC
      // Nhóm 1: Thông tin từ Bill - màu xanh dương (bg-blue-50)
      const billGroupStart = headers.indexOf('Mã giao dịch');
      const billGroupEnd = headers.indexOf('Tên đại lý');
      const billGroupColor = 'E3F2FD'; // Light blue (tương đương bg-blue-50)
      
      // Nhóm 2: Thông tin từ Merchants (File Excel) - màu xanh lá (bg-green-50)
      const merchantGroupStart = headers.indexOf('Thời gian GD');
      // Tìm cột cuối cùng của nhóm Merchants (có thể là "Số tiền sau KM" hoặc "Số điện thoại" nếu không có cột dynamic)
      let merchantGroupEnd = headers.indexOf('Số tiền sau KM');
      if (merchantGroupEnd === -1) {
        merchantGroupEnd = headers.indexOf('Số tiền trước KM');
        if (merchantGroupEnd === -1) {
          merchantGroupEnd = headers.indexOf('Số điện thoại');
        }
      }
      const merchantGroupColor = 'E8F5E9'; // Light green (tương đương bg-green-50)
      
      // Nhóm 3: Kết quả đối soát - màu xám (bg-slate-50)
      const resultGroupStart = headers.indexOf('Loại thanh toán');
      const resultGroupEnd = headers.indexOf('Ghi chú');
      const resultGroupColor = 'F5F5F5'; // Light gray (tương đương bg-slate-50)

      // Add summary row at the top with colored highlights (khớp với nhóm cột)
      const totalTransactionsCol = headers.indexOf('Mã giao dịch'); // Cột đầu tiên (Bill group)
      const totalAmountCol = headers.indexOf('Số tiền giao dịch'); // Cột số tiền giao dịch (Result group)
      const totalFeeCol = headers.indexOf('Phí'); // Cột phí (Result group)
      const totalNetCol = headers.indexOf('Còn lại'); // Cột còn lại (Result group)
      
      const summaryCells = [
        { col: totalTransactionsCol, label: 'Tổng cộng GD', value: totalTransactions, color: billGroupColor }, // Bill group color
        { col: totalAmountCol, label: 'Tổng số tiền', value: totalAmount, color: resultGroupColor }, // Result group color
        { col: totalFeeCol, label: 'Tổng phí', value: totalFee, color: resultGroupColor }, // Result group color
        { col: totalNetCol, label: 'Tổng tiền sau phí', value: totalNet, color: resultGroupColor } // Result group color
      ].filter(cell => cell.col !== -1); // Chỉ thêm các cột tồn tại

      // Add summary row with styling
      summaryCells.forEach(({ col, label, value, color }) => {
        const labelAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        sheet[labelAddress] = { 
          v: label, 
          t: 's',
          s: {
            fill: { fgColor: { rgb: color } },
            font: { bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'left', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          }
        };
        
        const valueAddress = XLSX.utils.encode_cell({ r: 0, c: col + 1 });
        sheet[valueAddress] = { 
          v: value, 
          t: 'n', 
          z: '#,##0',
          s: {
            fill: { fgColor: { rgb: color } },
            font: { bold: true, color: { rgb: '000000' } },
            alignment: { horizontal: 'right', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          }
        };
      });

      // Add headers at row 2 with group colors
      headers.forEach((header, colIndex) => {
        const cellAddress = XLSX.utils.encode_cell({ r: 1, c: colIndex });
        
        // Determine which group this column belongs to (khớp với báo cáo trên web)
        let bgColor = 'FFFFFF'; // Default white
        if (billGroupStart !== -1 && billGroupEnd !== -1 && colIndex >= billGroupStart && colIndex <= billGroupEnd) {
          bgColor = billGroupColor; // Nhóm 1: Bill (xanh dương)
        } else if (merchantGroupStart !== -1 && merchantGroupEnd !== -1 && colIndex >= merchantGroupStart && colIndex <= merchantGroupEnd) {
          bgColor = merchantGroupColor; // Nhóm 2: Merchants (xanh lá)
        } else if (resultGroupStart !== -1 && resultGroupEnd !== -1 && colIndex >= resultGroupStart && colIndex <= resultGroupEnd) {
          bgColor = resultGroupColor; // Nhóm 3: Kết quả đối soát (xám)
        }
        
        sheet[cellAddress] = { 
          v: header, 
          t: 's',
          s: {
            fill: { fgColor: { rgb: bgColor } },
            font: { bold: true, color: { rgb: '000000' }, sz: 11 },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
              top: { style: 'medium', color: { rgb: '000000' } },
              bottom: { style: 'medium', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          }
        };
      });

      // Find status column index for conditional formatting
      const statusColIndex = headers.indexOf('Trạng thái');
      
      // Add data rows starting from row 3 with group colors
      orderedExcelData.forEach((row, rowIndex) => {
        const statusValue = row['Trạng thái' as keyof typeof row];
        const isError = statusValue === 'Lỗi';
        const isMatched = statusValue === 'Khớp';
        
        headers.forEach((header, colIndex) => {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 2, c: colIndex });
          const value = row[header as keyof typeof row];
          
          // Determine which group this column belongs to (khớp với báo cáo trên web)
          let bgColor = 'FFFFFF'; // Default white
          if (billGroupStart !== -1 && billGroupEnd !== -1 && colIndex >= billGroupStart && colIndex <= billGroupEnd) {
            bgColor = billGroupColor; // Nhóm 1: Bill (xanh dương)
          } else if (merchantGroupStart !== -1 && merchantGroupEnd !== -1 && colIndex >= merchantGroupStart && colIndex <= merchantGroupEnd) {
            bgColor = merchantGroupColor; // Nhóm 2: Merchants (xanh lá)
          } else if (resultGroupStart !== -1 && resultGroupEnd !== -1 && colIndex >= resultGroupStart && colIndex <= resultGroupEnd) {
            bgColor = resultGroupColor; // Nhóm 3: Kết quả đối soát (xám)
          }
          
          // Special colors for status column (khớp với báo cáo trên web)
          let statusBgColor = bgColor;
          let statusTextColor = '000000';
          if (colIndex === statusColIndex) {
            if (isError) {
              statusBgColor = 'FFCDD2'; // Light red (Lỗi)
              statusTextColor = 'C62828'; // Dark red
            } else if (isMatched) {
              statusBgColor = 'C8E6C9'; // Light green (Khớp)
              statusTextColor = '2E7D32'; // Dark green
            } else {
              // Chờ đối soát - màu vàng nhạt (khớp với web)
              statusBgColor = 'FFF9C4'; // Light yellow
              statusTextColor = 'F57F17'; // Dark yellow
            }
          }
          
          // Special colors for money columns (màu xanh dương giống web)
          let moneyTextColor = '000000';
          if (numberColumns.includes(colIndex) && typeof value === 'number' && value > 0) {
            moneyTextColor = '1976D2'; // Blue for money (giống web)
          }
          
          // Đảm bảo màu nền cho các cột số tiền trong nhóm Kết quả đối soát
          if (numberColumns.includes(colIndex) && resultGroupStart !== -1 && resultGroupEnd !== -1 && colIndex >= resultGroupStart && colIndex <= resultGroupEnd) {
            // Giữ màu nền xám cho nhóm Kết quả đối soát
            bgColor = resultGroupColor;
          }
          
          let cellData: any = {};
          let cellStyle: any = {
            fill: { fgColor: { rgb: statusColIndex === colIndex ? statusBgColor : bgColor } },
            font: { 
              color: { rgb: statusColIndex === colIndex ? statusTextColor : (numberColumns.includes(colIndex) ? moneyTextColor : '000000') },
              sz: 10
            },
            alignment: { 
              horizontal: numberColumns.includes(colIndex) ? 'right' : 'left', 
              vertical: 'center' 
            },
            border: {
              top: { style: 'thin', color: { rgb: 'CCCCCC' } },
              bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
              left: { style: 'thin', color: { rgb: 'CCCCCC' } },
              right: { style: 'thin', color: { rgb: 'CCCCCC' } }
            }
          };
          
          if (numberColumns.includes(colIndex)) {
            const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
            if (!isNaN(numValue)) {
              cellData = { v: numValue, t: 'n', z: '#,##0', s: cellStyle };
            } else {
              cellData = { v: value, t: 's', s: cellStyle };
            }
          } else if (dateColumns.includes(colIndex)) {
            const dateValue = value instanceof Date ? value : new Date(value as string);
            if (!isNaN(dateValue.getTime())) {
              cellData = { v: dateValue, t: 'd', z: 'dd/mm/yyyy', s: cellStyle };
            } else {
              cellData = { v: value, t: 's', s: cellStyle };
            }
          } else {
            cellData = { v: value, t: 's', s: cellStyle };
          }
          
          sheet[cellAddress] = cellData;
        });
      });

      // Set sheet range - CRITICAL: This tells Excel where the data is
      // Row 0: Summary, Row 1: Headers, Row 2+: Data
      const maxRow = Math.max(1, orderedExcelData.length + 1); // +1 for header row
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
            pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
            searchTerm
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
                const newSortBy = e.target.value as 'agent' | 'date' | 'amount';
                setSortBy(newSortBy);
                localStorage.setItem('adminReport_sortBy', newSortBy);
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
                const newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
                setSortOrder(newSortOrder);
                localStorage.setItem('adminReport_sortOrder', newSortOrder);
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

