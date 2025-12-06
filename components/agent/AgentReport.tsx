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
  const users = FirebaseUtils.objectToArray(usersData || {});
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const currentAgent = agents.find(a => a.id === agentId);

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Filter state - default to today for display, but don't filter initially
  const [dateFrom, setDateFrom] = useState<string>(getTodayDate());
  const [dateTo, setDateTo] = useState<string>(getTodayDate());
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedPointOfSaleName, setSelectedPointOfSaleName] = useState<string>('all');
  
  // Data state
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 20;

  // Get users that have bills for this agent
  const agentUsers = React.useMemo(() => {
    if (!agentCode) return [];
    return users.filter(u => {
      // Filter users that have report records for this agent
      return true; // Will be filtered by agentCode in the service
    });
  }, [users, agentCode]);

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

  // Load reports
  useEffect(() => {
    if (!agentCode) return;
    loadReports();
  }, [agentCode, dateFrom, dateTo, dateFilterActive, statusFilter, selectedUserId, selectedPointOfSaleName, currentPage]);

  const loadReports = async () => {
    if (!agentCode) return;
    
    setLoading(true);
    try {
      const filters = {
        agentCode,
        userId: selectedUserId !== 'all' ? selectedUserId : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
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

  const handleClearFilters = () => {
    setDateFrom(getTodayDate());
    setDateTo(getTodayDate());
    setDateFilterActive(false);
    setStatusFilter('all');
    setSelectedUserId('all');
    setSelectedPointOfSaleName('all');
    setCurrentPage(1);
  };

  const handleFilterChange = (newFilters: {
    dateFrom: string;
    dateTo: string;
    status: ReportStatus | 'all';
    agentId?: string;
    userId?: string;
    pointOfSaleName?: string;
  }) => {
    const today = getTodayDate();
    const datesChanged = newFilters.dateFrom !== today || newFilters.dateTo !== today;
    
    setDateFrom(newFilters.dateFrom);
    setDateTo(newFilters.dateTo);
    setDateFilterActive(datesChanged);
    setStatusFilter(newFilters.status);
    setSelectedUserId(newFilters.userId || 'all');
    setSelectedPointOfSaleName(newFilters.pointOfSaleName || 'all');
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
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Báo cáo</h2>
            <p className="text-sm text-slate-500 mt-1">
              Đại lý: {currentAgent?.name || agentCode} ({agentCode})
            </p>
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
          pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined
        }}
        users={agentUsers}
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
            role="AGENT"
            records={records}
            users={users}
            agents={agents}
            pagination={totalPages > 1 ? {
              currentPage,
              totalPages,
              onPageChange: setCurrentPage
            } : undefined}
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

