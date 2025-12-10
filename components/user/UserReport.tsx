import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { ReportService } from '../../src/lib/reportServices';
import type { ReportRecord, ReportStatus } from '../../types';
import ReportFilters from '../shared/ReportFilters';
import ReportTable from '../shared/ReportTable';
import Pagination from '../Pagination';

const UserReport: React.FC = () => {
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Filter state - KHÔNG filter date mặc định, để hiển thị tất cả
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('all');
  const [selectedPointOfSaleName, setSelectedPointOfSaleName] = useState<string>('all');
  
  // Data state
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const itemsPerPage = 20;

  // Get unique point of sales from all report records
  const [allPointOfSales, setAllPointOfSales] = useState<string[]>([]);

  // Load all point of sales from database
  useEffect(() => {
    const loadPointOfSales = async () => {
      if (!userId) return;
      try {
        const result = await ReportService.getReportRecords({ userId }, { limit: 10000 });
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
  }, [userId]);

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
    if (!userId) return;
    loadReports();
  }, [userId, dateFrom, dateTo, statusFilter, selectedPointOfSaleName, currentPage]);

  const loadReports = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // Load ALL records first (no date filter on server)
      const filters = {
        userId,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined,
        // Don't filter by date on server - do it client-side
        dateFrom: undefined,
        dateTo: undefined
      };
      
      // Load TẤT CẢ records (bao gồm cả MATCHED, ERROR, UNMATCHED)
      // Dùng getAllReportRecordsWithMerchants để hiển thị tất cả merchant data như AdminReport
      const result = await ReportService.getAllReportRecordsWithMerchants(filters, {
        limit: 10000 // Load all for client-side filtering
      });
      
      console.log(`📊 [UserReport] Loaded ${result.records.length} records for userId: ${userId}`);
      
      // Filter: CHỈ hiển thị records có userId match
      let filteredRecords = result.records.filter(r => {
        // Loại bỏ records không có transactionCode hoặc amount hợp lệ
        if (!r.transactionCode || r.transactionCode.trim() === '') return false;
        if (!r.amount || isNaN(r.amount) || !isFinite(r.amount) || r.amount <= 0) return false;
        
        // QUAN TRỌNG: Filter theo userId
        if (r.userId && r.userId !== userId) return false;
        
        return true;
      });
      
      console.log(`📊 [UserReport] After filtering: ${filteredRecords.length} records`);
      
      // Apply date filter client-side
      if (dateFrom || dateTo) {
        filteredRecords = filteredRecords.filter(r => {
          const dateToCheck = r.transactionDate || r.userBillCreatedAt || r.reconciledAt || r.createdAt;
          if (!dateToCheck) return true;
          
          try {
            // Tất cả date fields trong ReportRecord đều là string (ISO format)
            const dateStr = String(dateToCheck);
            const date = dateStr.split('T')[0];
            if (dateFrom && date < dateFrom) return false;
            if (dateTo && date > dateTo) return false;
            return true;
          } catch (error) {
            return true;
          }
        });
      }
      
      // Paginate client-side
      const startIndex = (currentPage - 1) * itemsPerPage;
      const paginatedRecords = filteredRecords.slice(startIndex, startIndex + itemsPerPage);
      
      setRecords(paginatedRecords);
      setTotalRecords(filteredRecords.length);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setDateFilterActive(false);
    setStatusFilter('all');
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
    setDateFrom(newFilters.dateFrom);
    setDateTo(newFilters.dateTo);
    setStatusFilter(newFilters.status);
    setSelectedPointOfSaleName(newFilters.pointOfSaleName || 'all');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  return (
    <div className="space-y-6">
      <ReportFilters
        role="USER"
        filters={{
          dateFrom,
          dateTo,
          status: statusFilter,
          pointOfSaleName: selectedPointOfSaleName !== 'all' ? selectedPointOfSaleName : undefined
        }}
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
            role="USER"
            records={records}
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
                itemsPerPage={itemsPerPage}
                totalItems={totalRecords}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserReport;
