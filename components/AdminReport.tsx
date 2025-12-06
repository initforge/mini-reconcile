import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { ReportService } from '../src/lib/reportServices';
import { useRealtimeData, FirebaseUtils } from '../src/lib/firebaseHooks';
import type { ReportRecord, ReportStatus, User, Agent } from '../types';
import ReportFilters from './shared/ReportFilters';
import ReportTable from './shared/ReportTable';
import Pagination from './Pagination';

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

  // Filter state - default to today for display, but don't filter initially
  const [dateFrom, setDateFrom] = useState<string>(getTodayDate());
  const [dateTo, setDateTo] = useState<string>(getTodayDate());
  const [dateFilterActive, setDateFilterActive] = useState(false); // Track if user has changed dates
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

  // Load reports
  useEffect(() => {
    loadReports();
  }, [dateFrom, dateTo, dateFilterActive, statusFilter, selectedAgentId, selectedUserId, selectedPointOfSaleName, currentPage]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const filters = {
        agentId: selectedAgentId !== 'all' ? selectedAgentId : undefined,
        agentCode: selectedAgentId !== 'all' ? agents.find(a => a.id === selectedAgentId)?.code : undefined,
        userId: selectedUserId !== 'all' ? selectedUserId : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
        // Only filter by date if user has explicitly changed dates from default
        dateFrom: dateFilterActive ? dateFrom : undefined,
        dateTo: dateFilterActive ? dateTo : undefined
      };
      
      const result = await ReportService.getReportRecords(filters, {
        limit: itemsPerPage,
        cursor: currentPage > 1 ? records[records.length - 1]?.id : undefined
      });
      
      setRecords(result.records);
      setTotalRecords(result.total || 0);
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
    // If dates are changed from default, activate date filter
    const today = getTodayDate();
    const datesChanged = newFilters.dateFrom !== today || newFilters.dateTo !== today;
    setDateFilterActive(datesChanged);
    
    setDateFrom(newFilters.dateFrom);
    setDateTo(newFilters.dateTo);
    setStatusFilter(newFilters.status);
    setSelectedAgentId(newFilters.agentId || 'all');
    setSelectedUserId(newFilters.userId || 'all');
    setSelectedPointOfSaleName(newFilters.pointOfSaleName || 'all');
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    const today = getTodayDate();
    setDateFrom(today); // Reset to today (for display)
    setDateTo(today); // Reset to today (for display)
    setDateFilterActive(false); // Disable date filter
    setStatusFilter('all');
    setSelectedAgentId('all');
    setSelectedUserId('all');
    setSelectedPointOfSaleName('all');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalRecords / itemsPerPage);

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
            onClick={() => {
              // TODO: Implement Excel export
              alert('Tính năng export Excel sẽ được triển khai');
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

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

