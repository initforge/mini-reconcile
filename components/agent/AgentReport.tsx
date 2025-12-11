import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { ReportService } from '../../src/lib/reportServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { ReportRecord, ReportStatus, User, Agent } from '../../types';
import ReportFilters from '../shared/ReportFilters';
import ReportTable from '../shared/ReportTable';
import Pagination from '../Pagination';

const AgentReport: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;
  const agentCode = agentAuth ? JSON.parse(agentAuth).agentCode : null;

  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: billsData } = useRealtimeData<Record<string, any>>('/user_bills');
  const users = FirebaseUtils.objectToArray(usersData || {});
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const allBills = FirebaseUtils.objectToArray(billsData || {});
  const currentAgent = agents.find(a => a.id === agentId);

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Filter state - start empty, only filter when user explicitly sets dates
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedPointOfSaleName, setSelectedPointOfSaleName] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>(''); // Search by transaction code
  
  // Data state
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 20;
  
  // Sorting state - Agent: sort by user (customer)
  const [sortBy, setSortBy] = useState<'user' | 'date' | 'amount'>('user');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Get users that have bills for this agent (only users who have uploaded bills)
  const agentUsers = React.useMemo(() => {
    if (!agentId && !agentCode) return [];
    
    // Get all bills for this agent
    const agentBills = allBills.filter((bill: any) => 
      bill.agentId === agentId || bill.agentCode === agentCode
    );
    
    // Get unique user IDs from bills
    const userIds = new Set(agentBills.map((bill: any) => bill.userId).filter(Boolean));
    
    // Filter users to only those who have uploaded bills for this agent
    return users.filter(u => userIds.has(u.id));
  }, [users, agentId, agentCode, allBills]);

  // Get unique point of sales from all report records
  const [allPointOfSales, setAllPointOfSales] = useState<string[]>([]);

  // Load all point of sales from database
  useEffect(() => {
    const loadPointOfSales = async () => {
      if (!agentCode) return;
      try {
        const result = await ReportService.getReportRecords({ agentCode }, { limit: 10000 });
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
  }, [agentCode]);

  // Get unique point of sales from current filtered records
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
    if (!agentCode) return;
    loadReports();
  }, [agentCode, dateFrom, dateTo, statusFilter, selectedUserId, selectedPointOfSaleName, currentPage, sortBy, sortOrder, searchTerm]);

  const loadReports = async () => {
    if (!agentCode) return;
    
    setLoading(true);
    try {
      // Load ALL records first (no date filter on server)
      const filters = {
        agentCode,
        userId: selectedUserId !== 'all' ? selectedUserId : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
        // Don't filter by date on server - do it client-side
        dateFrom: undefined,
        dateTo: undefined
      };
      
      // Load TẤT CẢ records (bao gồm cả MATCHED, ERROR, UNMATCHED)
      // Dùng getAllReportRecordsWithMerchants để hiển thị tất cả merchant data như AdminReport
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
        if (!r.transactionCode || r.transactionCode.trim() === '') return false;
        
        // Phải có ít nhất một giá trị amount hợp lệ (> 0)
        const hasValidAmount = (r.merchantAmount && !isNaN(r.merchantAmount) && r.merchantAmount > 0) || 
                               (r.amount && !isNaN(r.amount) && r.amount > 0);
        
        return hasValidAmount;
      });
      
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
      
      // Apply search term filter (transaction code)
      if (searchTerm && searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        filteredRecords = filteredRecords.filter(r => {
          const code = r.transactionCode ? String(r.transactionCode).toLowerCase() : '';
          return code.includes(searchLower);
        });
      }
      
      // Filter by search term (transaction code)
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        filteredRecords = filteredRecords.filter(r => 
          r.transactionCode?.toLowerCase().includes(searchLower)
        );
      }
      
      // Sort records by user (default for Agent)
      let sortedRecords = [...filteredRecords];
      if (sortBy === 'user') {
        sortedRecords.sort((a, b) => {
          const userA = users.find(u => u.id === a.userId);
          const userB = users.find(u => u.id === b.userId);
          const nameA = userA?.fullName || userA?.phone || a.userId;
          const nameB = userB?.fullName || userB?.phone || b.userId;
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

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setSelectedUserId('all');
    setSelectedPointOfSaleName('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleFilterChange = (newFilters: {
    dateFrom: string;
    dateTo: string;
    status: ReportStatus | 'all';
    agentId?: string;
    userId?: string;
    pointOfSaleName?: string;
    searchTerm?: string;
  }) => {
    // If dates are provided and different from today, activate date filter
    setDateFrom(newFilters.dateFrom);
    setDateTo(newFilters.dateTo);
    setStatusFilter(newFilters.status);
    setSelectedUserId(newFilters.userId || 'all');
    setSelectedPointOfSaleName(newFilters.pointOfSaleName || 'all');
    setSearchTerm(newFilters.searchTerm || '');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  if (!agentCode) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-500">Không tìm thấy thông tin đại lý</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Báo cáo</h2>
          </div>
        </div>
      </div>

      <div className="space-y-4">
                {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                        Tìm kiếm theo mã chuẩn chi
                      </label>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Nhập mã chuẩn chi (mã giao dịch)..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
                
                <ReportFilters
                  role="AGENT"
                  filters={{
                    dateFrom,
                    dateTo,
                    status: statusFilter,
                    userId: selectedUserId !== 'all' ? selectedUserId : undefined,
                    pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
                    searchTerm
                  }}
                  users={agentUsers}
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
                        setSortBy(e.target.value as 'user' | 'date' | 'amount');
                        setCurrentPage(1);
                      }}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="user">Khách hàng</option>
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
                    role="AGENT"
                    records={records}
                    users={users}
                    agents={agents}
                    pagination={totalPages > 1 ? {
                      currentPage,
                      totalPages,
                      onPageChange: setCurrentPage
                    } : undefined}
                    onPaymentStatusChange={loadReports}
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

export default AgentReport;

