import React, { useState, useEffect, useMemo } from 'react';
import { Building2, ChevronDown, ChevronUp, Search, Calendar } from 'lucide-react';
import { ReportService } from '../../src/lib/reportServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { ReportRecord } from '../../types';
import Pagination from '../Pagination';

const AgentAdminPayments: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;
  const agentCode = agentAuth ? JSON.parse(agentAuth).agentCode : null;

  // Filter states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  // Data state
  const [reportRecords, setReportRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Helper function to generate batch ID from payment date (HHmm_ddMMyyyy)
  const generateBatchId = (paidAt: string): string => {
    if (!paidAt) return '';
    try {
      const date = new Date(paidAt);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${hours}${minutes}_${day}${month}${year}`;
    } catch {
      return '';
    }
  };

  // Load report records with adminPaymentStatus = 'PAID' for this agent
  useEffect(() => {
    const loadReports = async () => {
      if (!agentId || !agentCode) return;
      
      setLoading(true);
      try {
        const result = await ReportService.getAllReportRecordsWithMerchants({
          agentId,
          agentCode,
          dateFrom: undefined,
          dateTo: undefined,
          status: undefined,
          userId: undefined,
          pointOfSaleName: undefined
        }, {
          limit: 10000
        });
        
        // Filter only paid reports
        const paidReports = result.records.filter(r => r.adminPaymentStatus === 'PAID');
        setReportRecords(paidReports);
      } catch (error) {
        console.error('Error loading admin payments:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadReports();
  }, [agentId, agentCode]);

  // Group reports by batch ID (giờ + ngày/tháng/năm)
  const batchesByTime = useMemo(() => {
    const groups: Record<string, ReportRecord[]> = {};
    
    reportRecords.forEach((report: ReportRecord) => {
      if (!report.adminPaidAt) return;
      const batchId = generateBatchId(report.adminPaidAt);
      if (!batchId) return;
      
      if (!groups[batchId]) {
        groups[batchId] = [];
      }
      groups[batchId].push(report);
    });
    
    return groups;
  }, [reportRecords]);

  // Convert to batch array
  const batches = useMemo(() => {
    return Object.entries(batchesByTime).map(([batchId, reports]) => {
      const firstReport = reports[0];
      const totalAmount = reports.reduce((sum, r) => sum + (r.amount || 0), 0);
      const totalFees = reports.reduce((sum, r) => sum + (r.feeAmount || 0), 0);
      const netAmount = reports.reduce((sum, r) => sum + (r.netAmount || r.amount || 0), 0);
      
      return {
        id: batchId,
        approvalCode: batchId,
        paidAt: firstReport.adminPaidAt,
        createdAt: firstReport.adminPaidAt || firstReport.createdAt,
        totalAmount,
        totalFees,
        netAmount,
        paymentCount: reports.length,
        reports
      };
    });
  }, [batchesByTime]);

  // Filter batches
  const filteredBatches = useMemo(() => {
    let filtered = batches;
    
    // Filter by date
    if (dateFrom || dateTo) {
      filtered = filtered.filter(batch => {
        const batchDate = batch.paidAt || batch.createdAt;
        if (!batchDate) return true;
        try {
          const dateStr = typeof batchDate === 'string' ? batchDate : batchDate.toISOString();
          const date = dateStr.split('T')[0];
          if (dateFrom && date < dateFrom) return false;
          if (dateTo && date > dateTo) return false;
          return true;
        } catch {
          return true;
        }
      });
    }
    
    // Filter by search term (approval code or transaction codes)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(batch => {
        if (batch.approvalCode?.toLowerCase().includes(searchLower)) return true;
        return batch.reports.some(r => 
          r.transactionCode?.toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Sort by date (newest first)
    filtered.sort((a, b) => {
      const dateA = new Date(a.paidAt || a.createdAt).getTime();
      const dateB = new Date(b.paidAt || b.createdAt).getTime();
      return dateB - dateA;
    });
    
    return filtered;
  }, [batches, dateFrom, dateTo, searchTerm]);

  // Paginate
  const totalPages = Math.ceil(filteredBatches.length / itemsPerPage);
  const paginatedBatches = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredBatches.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredBatches, currentPage, itemsPerPage]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateOnly = (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  // Format batch ID for display (HHmm_ddMMyyyy -> HH:mm dd/MM/yyyy)
  const formatBatchId = (batchId: string): string => {
    if (!batchId || !batchId.includes('_')) return batchId;
    const [time, date] = batchId.split('_');
    if (time.length === 4 && date.length === 8) {
      const hours = time.substring(0, 2);
      const minutes = time.substring(2, 4);
      const day = date.substring(0, 2);
      const month = date.substring(2, 4);
      const year = date.substring(4, 8);
      return `${hours}:${minutes} ${day}/${month}/${year}`;
    }
    return batchId;
  };

  if (!agentId || !agentCode) {
    return <div>Vui lòng đăng nhập</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Admin thanh toán cho đại lý</h2>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tìm kiếm (mã chuẩn chi/mã GD)</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Nhập mã chuẩn chi hoặc mã giao dịch..."
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 text-slate-500">Đang tải dữ liệu...</div>
      )}

      {/* Batches Cards */}
      {!loading && (
        <div className="space-y-4">
          {paginatedBatches.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
              Chưa có đợt chi trả nào từ admin
            </div>
          ) : (
            paginatedBatches.map((batch) => {
              const isExpanded = expandedBatches.has(batch.id);
              
              return (
                <div key={batch.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-indigo-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">Mã chi trả: {batch.approvalCode || batch.id}</h4>
                        <p className="text-sm text-slate-600 mt-1">
                          {batch.paidAt ? formatDate(batch.paidAt) : formatDate(batch.createdAt || '')}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {formatBatchId(batch.id)} • {batch.paymentCount} giao dịch
                        </p>
                      </div>
                      <div className="text-right mr-4 space-y-1">
                        <div>
                          <p className="text-xs text-slate-500">Tổng tiền</p>
                          <p className="text-lg font-bold text-slate-900">{formatAmount(batch.totalAmount)}</p>
                        </div>
                        {batch.totalFees > 0 && (
                          <div>
                            <p className="text-xs text-slate-500">Tổng phí</p>
                            <p className="text-sm font-medium text-slate-600">{formatAmount(batch.totalFees)}</p>
                          </div>
                        )}
                        <div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Đã thanh toán
                        </span>
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedBatches);
                            if (isExpanded) {
                              newExpanded.delete(batch.id);
                            } else {
                              newExpanded.add(batch.id);
                            }
                            setExpandedBatches(newExpanded);
                          }}
                          className="p-2 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="p-4 bg-white border-t border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">Mã GD</th>
                              <th className="px-3 py-2 text-left">Ngày GD</th>
                              <th className="px-3 py-2 text-right">Số tiền</th>
                              <th className="px-3 py-2 text-right">Phí</th>
                              <th className="px-3 py-2 text-left">Loại</th>
                              <th className="px-3 py-2 text-left">Điểm thu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {batch.reports.map((report) => (
                              <tr key={report.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono text-xs">{report.transactionCode}</td>
                                <td className="px-3 py-2">{formatDateOnly(report.transactionDate || report.createdAt)}</td>
                                <td className="px-3 py-2 text-right font-medium">{formatAmount(report.amount || 0)}</td>
                                <td className="px-3 py-2 text-right">{formatAmount(report.feeAmount || 0)}</td>
                                <td className="px-3 py-2">{report.paymentMethod}</td>
                                <td className="px-3 py-2 font-mono text-xs">{report.pointOfSaleName || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && filteredBatches.length > 0 && totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
};

export default AgentAdminPayments;

