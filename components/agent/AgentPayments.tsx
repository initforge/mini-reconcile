import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, CheckCircle, AlertCircle, Save, ChevronDown, ChevronUp, X, Search, Calendar, FileText, Clock, QrCode } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import { ReportService } from '../../src/lib/reportServices';
import { ref, push, update, get } from 'firebase/database';
import { database } from '../../src/lib/firebase';
import type { UserBill, AgentPaymentToUser, ReportRecord, User, AgentPaymentStatus } from '../../types';
import Pagination from '../Pagination';

const AgentPayments: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;

  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: agentPaymentsData } = useRealtimeData<Record<string, AgentPaymentToUser>>('/agent_payments_to_users');
  const users = FirebaseUtils.objectToArray(usersData || {});
  
  const [activeTab, setActiveTab] = useState<'unpaid' | 'batches'>('unpaid');
  
  // Tab 1: Chưa thanh toán
  const [unpaidReports, setUnpaidReports] = useState<ReportRecord[]>([]);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Filters for unpaid tab
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Tab 2: Đợt chi trả
  const [paymentBatches, setPaymentBatches] = useState<AgentPaymentToUser[]>([]);
  const [batchesPage, setBatchesPage] = useState(1);
  const [batchesItemsPerPage, setBatchesItemsPerPage] = useState<number>(5);
  const [batchesDateFrom, setBatchesDateFrom] = useState<string>('');
  const [batchesDateTo, setBatchesDateTo] = useState<string>('');
  const [batchesSearchTerm, setBatchesSearchTerm] = useState<string>('');

  const [note, setNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ qrCode: string; userName: string; totalAmount: number } | null>(null);

  // Load matched user_bills that haven't been paid by agent
  useEffect(() => {
    const loadUnpaidBills = async () => {
      if (!agentId) return;
      
      try {
        // Load from user_bills directly (not ReportRecord)
        // Điều kiện: agentId === currentAgent.id, isPaidByAgent !== true
        // Không phụ thuộc vào admin reconciliation status - đây là luồng riêng giữa đại lý và khách hàng
        const allBills = FirebaseUtils.objectToArray(billsData || {});
        const unpaidBills = allBills.filter((bill: UserBill) => {
          return bill.agentId === agentId && 
                 (bill.isPaidByAgent !== true || !bill.isPaidByAgent);
        });
        
        // Convert to ReportRecord-like structure for display
        const reports: ReportRecord[] = unpaidBills.map((bill: UserBill) => ({
          id: bill.id,
          userBillId: bill.id,
          userId: bill.userId,
          agentId: bill.agentId,
          agentCode: bill.agentCode,
          transactionCode: bill.transactionCode,
          amount: bill.amount,
          paymentMethod: bill.paymentMethod,
          pointOfSaleName: bill.pointOfSaleName,
          transactionDate: bill.timestamp,
          userBillCreatedAt: bill.createdAt,
          status: bill.status as 'MATCHED',
          reconciledAt: bill.createdAt,
          reconciledBy: 'ADMIN',
          createdAt: bill.createdAt
        }));
        
        setUnpaidReports(reports);
      } catch (error) {
        console.error('Error loading unpaid bills:', error);
      }
    };
    
    loadUnpaidBills();
  }, [agentId, billsData]);

  // Load AgentPaymentToUser batches (only PAID ones for "Đợt chi trả" tab)
  useEffect(() => {
    const loadBatches = () => {
      if (!agentId) return;
      
      const allPayments = FirebaseUtils.objectToArray(agentPaymentsData || {});
      const agentPayments = allPayments.filter((payment: AgentPaymentToUser) => 
        payment.agentId === agentId && payment.status === 'PAID' // Only show PAID batches in "Đợt chi trả" tab
      );
      
      // Sort by createdAt descending
      agentPayments.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.paidAt || 0).getTime();
        const dateB = new Date(b.createdAt || b.paidAt || 0).getTime();
        return dateB - dateA;
      });
      
      setPaymentBatches(agentPayments);
    };
    
    loadBatches();
  }, [agentId, agentPaymentsData]);

  // Filter unpaid reports (simple logic like "Đợt chi trả" tab)
  const filteredUnpaidReports = useMemo(() => {
    let filtered = unpaidReports;

    if (dateFrom || dateTo) {
      filtered = filtered.filter(report => {
        const dateToCheck = report.transactionDate || report.userBillCreatedAt || report.reconciledAt || report.createdAt;
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

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(report =>
        (report.transactionCode && report.transactionCode.toLowerCase().includes(searchLower)) ||
        (report.pointOfSaleName && report.pointOfSaleName.toLowerCase().includes(searchLower))
      );
    }
    return filtered;
  }, [unpaidReports, dateFrom, dateTo, searchTerm]);

  // Filter payment batches
  const filteredBatches = useMemo(() => {
    let filtered = paymentBatches;

    if (batchesDateFrom || batchesDateTo) {
      filtered = filtered.filter(batch => {
        const dateToCheck = batch.paidAt || batch.createdAt;
        if (!dateToCheck) return true; // Include if no date
        
        try {
          // Handle both ISO string and Date object
          const dateStr = typeof dateToCheck === 'string' ? dateToCheck : dateToCheck.toISOString();
          const batchDate = dateStr.split('T')[0]; // Extract YYYY-MM-DD
          // Include records where date is >= dateFrom and <= dateTo (inclusive)
          if (batchesDateFrom && batchDate < batchesDateFrom) return false;
          if (batchesDateTo && batchDate > batchesDateTo) return false;
          return true;
        } catch (error) {
          console.warn('Error parsing batch date:', error);
          return true; // Include if parsing fails
        }
      });
    }

    if (batchesSearchTerm) {
      const searchLower = batchesSearchTerm.toLowerCase();
      // Search by transaction codes from bills in the batch
      filtered = filtered.filter(batch => {
        if (!batch.billIds || batch.billIds.length === 0) return false;
        
        // Get all bills for this batch
        const allBills = FirebaseUtils.objectToArray(billsData || {});
        const batchBills = allBills.filter((bill: UserBill) => 
          batch.billIds?.includes(bill.id)
        );
        
        // Check if any bill's transactionCode matches search
        return batchBills.some((bill: UserBill) =>
          bill.transactionCode && bill.transactionCode.toLowerCase().includes(searchLower)
        );
      });
    }
    return filtered;
  }, [paymentBatches, batchesDateFrom, batchesDateTo, batchesSearchTerm]);

  // Group reports by user
  const reportsByUser = useMemo(() => {
    const groups: Record<string, { reports: ReportRecord[]; user: User | undefined }> = {};
    filteredUnpaidReports.forEach(report => {
      if (!groups[report.userId]) {
        groups[report.userId] = {
          reports: [],
          user: users.find(u => u.id === report.userId)
        };
      }
      groups[report.userId].reports.push(report);
    });
    return groups;
  }, [filteredUnpaidReports, users]);

  // Calculate totals for each user group
  const userTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(reportsByUser).forEach(([userId, group]) => {
      totals[userId] = group.reports.reduce((sum, r) => sum + r.amount, 0);
    });
    return totals;
  }, [reportsByUser]);

  // Paginate batches
  const paginatedBatches = useMemo(() => {
    const startIndex = (batchesPage - 1) * batchesItemsPerPage;
    return filteredBatches.slice(startIndex, startIndex + batchesItemsPerPage);
  }, [filteredBatches, batchesPage, batchesItemsPerPage]);

  const totalBatchesPages = Math.ceil(filteredBatches.length / batchesItemsPerPage);

  const handlePayBills = async () => {
    if (selectedReports.length === 0) {
      alert('Vui lòng chọn ít nhất một giao dịch để thanh toán');
      return;
    }

    const selectedReportsList = filteredUnpaidReports.filter(r => selectedReports.includes(r.id));
    
    // Check if all selected bills belong to the same user
    const userIds = new Set(selectedReportsList.map(r => r.userId));
    if (userIds.size > 1) {
      alert('Vui lòng chọn các giao dịch của cùng một khách hàng để thanh toán');
      return;
    }

    const userId = selectedReportsList[0].userId;
    const user = users.find(u => u.id === userId);
    
    if (!user || !user.qrCodeBase64) {
      alert('Khách hàng chưa có mã QR thanh toán. Vui lòng liên hệ khách hàng để cập nhật mã QR.');
      return;
    }

    const totalAmount = selectedReportsList.reduce((sum, report) => sum + report.amount, 0);
    
    // Show QR code modal first
    setQrCodeData({
      qrCode: user.qrCodeBase64,
      userName: user.fullName || user.phone || userId,
      totalAmount
    });
    setShowQRModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!qrCodeData) return;

    setIsProcessing(true);
    setShowQRModal(false);

    try {
      const selectedReportsList = filteredUnpaidReports.filter(r => selectedReports.includes(r.id));
      const totalAmount = selectedReportsList.reduce((sum, report) => sum + report.amount, 0);
      const billIds = selectedReportsList.map(r => r.userBillId);

      // Create AgentPaymentToUser record
      const paymentRef = await push(ref(database, 'agent_payments_to_users'), {
        agentId: agentId!,
        billIds,
        totalAmount,
        status: 'PAID' as AgentPaymentStatus,
        note,
        createdAt: FirebaseUtils.getServerTimestamp(),
        paidAt: FirebaseUtils.getServerTimestamp()
      });

      // Update user_bills
      const updates: any = {};
      selectedReportsList.forEach(report => {
        updates[`user_bills/${report.userBillId}/isPaidByAgent`] = true;
        updates[`user_bills/${report.userBillId}/paidByAgentAt`] = FirebaseUtils.getServerTimestamp();
        updates[`user_bills/${report.userBillId}/paidByAgentNote`] = note;
        updates[`user_bills/${report.userBillId}/agentPaymentId`] = paymentRef.key;
        
        // Update ReportRecord với agentPaymentId, agentPaidAt, agentPaymentStatus (nếu có)
        if (report.id) {
          updates[`report_records/${report.id}/agentPaymentId`] = paymentRef.key;
          updates[`report_records/${report.id}/agentPaidAt`] = FirebaseUtils.getServerTimestamp();
          updates[`report_records/${report.id}/agentPaymentStatus`] = 'PAID';
        }
      });
      await update(ref(database), updates);

      alert('Đánh dấu thanh toán thành công!');
      setSelectedReports([]);
      setNote('');
      setQrCodeData(null);
      setShowQRModal(false);
    } catch (error: any) {
      alert(`Đã xảy ra lỗi: ${error.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
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
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const selectedTotal = filteredUnpaidReports
    .filter(r => selectedReports.includes(r.id))
    .reduce((sum, r) => sum + r.amount, 0);

  if (!agentId) {
    return null;
  }

  // Filter and paginate users for unpaid tab
  const userEntries = Object.entries(reportsByUser);
  const totalUsers = userEntries.length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = userEntries.slice(startIndex, endIndex);
  const totalPages = Math.ceil(totalUsers / itemsPerPage);

  // Calculate summary stats
  const totalBills = filteredUnpaidReports.length;
  const totalPaidBills = paymentBatches.reduce((sum, batch) => sum + (batch.billIds?.length || 0), 0);
  const totalUnpaidAmount = filteredUnpaidReports.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Tổng số bill chờ thanh toán</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalBills}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Đã thanh toán cho user</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{totalPaidBills}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Còn chờ thanh toán</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{formatAmount(totalUnpaidAmount)}</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="border-b border-slate-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('unpaid')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'unpaid'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Chưa thanh toán ({filteredUnpaidReports.length})
            </button>
            <button
              onClick={() => setActiveTab('batches')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'batches'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Đợt chi trả ({filteredBatches.length})
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Tab 1: Chưa thanh toán */}
          {activeTab === 'unpaid' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tìm kiếm (mã GD, điểm thu)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Nhập mã giao dịch hoặc điểm thu..."
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  Bills chờ thanh toán ({filteredUnpaidReports.length} giao dịch từ {totalUsers} khách hàng)
                </h3>
                {selectedReports.length > 0 && (
                  <button
                    onClick={handlePayBills}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Hiển thị mã QR ({selectedReports.length})
                  </button>
                )}
              </div>

              {/* User Cards */}
              <div className="space-y-4">
                {paginatedUsers.map(([userId, group]) => {
                  const user = group.user;
                  const total = userTotals[userId];
                  const isExpanded = expandedUsers.has(userId);
                  const isAllSelected = group.reports.every(r => selectedReports.includes(r.id));
                  const someSelected = group.reports.some(r => selectedReports.includes(r.id));
                  
                  return (
                    <div key={userId} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 flex-1">
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected && !isAllSelected;
                              }}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedReports(prev => [...prev, ...group.reports.map(r => r.id).filter(id => !prev.includes(id))]);
                                } else {
                                  setSelectedReports(prev => prev.filter(id => !group.reports.some(r => r.id === id)));
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <div className="flex-1">
                              <h4 className="font-semibold text-slate-900">{user?.fullName || userId}</h4>
                              <p className="text-sm text-slate-500">SĐT: {user?.phone || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="text-right mr-4">
                            <p className="text-sm text-slate-500">Tổng tiền</p>
                            <p className="text-lg font-bold text-slate-900">{formatAmount(total)}</p>
                          </div>
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedUsers);
                              if (isExpanded) {
                                newExpanded.delete(userId);
                              } else {
                                newExpanded.add(userId);
                              }
                              setExpandedUsers(newExpanded);
                            }}
                            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </button>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          {group.reports.length} giao dịch
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-slate-200">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-3 py-2 text-left">
                                    <input
                                      type="checkbox"
                                      checked={isAllSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedReports(prev => [...prev, ...group.reports.map(r => r.id).filter(id => !prev.includes(id))]);
                                        } else {
                                          setSelectedReports(prev => prev.filter(id => !group.reports.some(r => r.id === id)));
                                        }
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                  </th>
                                  <th className="px-3 py-2 text-left">Mã GD</th>
                                  <th className="px-3 py-2 text-left">Ngày GD</th>
                                  <th className="px-3 py-2 text-right">Số tiền</th>
                                  <th className="px-3 py-2 text-left">Phương thức</th>
                                  <th className="px-3 py-2 text-left">Điểm thu</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.reports.map((report) => (
                                  <tr key={report.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2">
                                      <input
                                        type="checkbox"
                                        checked={selectedReports.includes(report.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedReports(prev => [...prev, report.id]);
                                          } else {
                                            setSelectedReports(prev => prev.filter(id => id !== report.id));
                                          }
                                        }}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs">{report.transactionCode}</td>
                                    <td className="px-3 py-2">{formatDateOnly(report.transactionDate)}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatAmount(report.amount)}</td>
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
                })}
              </div>
              
              {totalPages > 1 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Đợt chi trả */}
          {activeTab === 'batches' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={batchesDateFrom}
                    onChange={(e) => setBatchesDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={batchesDateTo}
                    onChange={(e) => setBatchesDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tìm kiếm (mã trừ tiền/mã chuẩn chi)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={batchesSearchTerm}
                      onChange={(e) => setBatchesSearchTerm(e.target.value)}
                      placeholder="Nhập mã trừ tiền hoặc mã chuẩn chi..."
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Số dòng/trang</label>
                  <select
                    value={batchesItemsPerPage}
                    onChange={(e) => {
                      setBatchesItemsPerPage(Number(e.target.value));
                      setBatchesPage(1);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              {/* Batches Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left">Mã chuẩn chi</th>
                      <th className="px-4 py-3 text-left">Ngày tạo</th>
                      <th className="px-4 py-3 text-left">Ngày thanh toán</th>
                      <th className="px-4 py-3 text-right">Số bill</th>
                      <th className="px-4 py-3 text-right">Tổng tiền</th>
                      <th className="px-4 py-3 text-right">Tổng phí</th>
                      <th className="px-4 py-3 text-right">Thực trả</th>
                      <th className="px-4 py-3 text-left">Trạng thái</th>
                      <th className="px-4 py-3 text-left">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedBatches.map((batch) => {
                      // Get transaction codes from bills in the batch
                      const allBills = FirebaseUtils.objectToArray(billsData || {});
                      const batchBills = allBills.filter((bill: UserBill) => 
                        batch.billIds?.includes(bill.id)
                      );
                      // Use first bill's transactionCode as display, or show multiple if different
                      const transactionCodes = batchBills.map((bill: UserBill) => bill.transactionCode).filter(Boolean);
                      const displayCode = transactionCodes.length > 0 
                        ? (transactionCodes.length === 1 ? transactionCodes[0] : `${transactionCodes[0]} (+${transactionCodes.length - 1})`)
                        : (batch.approvalCode || batch.id);
                      
                      return (
                      <tr key={batch.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs">{displayCode}</td>
                        <td className="px-4 py-3">{formatDate(batch.createdAt || '')}</td>
                        <td className="px-4 py-3">{batch.paidAt ? formatDate(batch.paidAt) : '-'}</td>
                        <td className="px-4 py-3 text-right">{batch.billIds?.length || 0}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatAmount(batch.totalAmount)}</td>
                        <td className="px-4 py-3 text-right">{formatAmount(batch.feeAmount || 0)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatAmount(batch.netAmount || batch.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            batch.status === 'PAID'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}>
                            {batch.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {batch.status === 'PAID' ? (
                            <button
                              onClick={async () => {
                                if (window.confirm('Bạn có chắc chắn muốn đổi trạng thái từ "Đã thanh toán" về "Chưa thanh toán"?')) {
                                  try {
                                    const updates: any = {};
                                    updates[`agent_payments_to_users/${batch.id}/status`] = 'UNPAID';
                                    updates[`agent_payments_to_users/${batch.id}/paidAt`] = null;
                                    
                                    // Update user_bills
                                    if (batch.billIds) {
                                      batch.billIds.forEach((billId: string) => {
                                        updates[`user_bills/${billId}/isPaidByAgent`] = false;
                                        updates[`user_bills/${billId}/paidByAgentAt`] = null;
                                      });
                                    }
                                    
                                    // Update report_records
                                    const allReportsSnapshot = await get(ref(database, 'report_records'));
                                    const allReports = FirebaseUtils.objectToArray(allReportsSnapshot.val() || {});
                                    const relatedReports = allReports.filter((r: any) => 
                                      batch.billIds?.includes(r.userBillId) && r.agentPaymentId === batch.id
                                    );
                                    relatedReports.forEach((r: any) => {
                                      updates[`report_records/${r.id}/agentPaymentStatus`] = 'UNPAID';
                                      updates[`report_records/${r.id}/agentPaidAt`] = null;
                                    });
                                    
                                    await update(ref(database), updates);
                                    // Reload unpaid reports to show reverted bills in "Chưa thanh toán" tab
                                    // Note: paymentBatches will automatically update via realtime listener
                                    // and the batch will disappear from "Đợt chi trả" tab because we filter by status === 'PAID'
                                    alert('Đã đổi trạng thái thành công! Batch đã được chuyển về tab "Chưa thanh toán".');
                                  } catch (error) {
                                    console.error('Error reverting payment status:', error);
                                    alert('Có lỗi khi đổi trạng thái. Vui lòng thử lại.');
                                  }
                                }
                              }}
                              className="px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-xs font-medium"
                            >
                              Revert
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>

              {totalBatchesPages > 1 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={batchesPage}
                    totalPages={totalBatchesPages}
                    onPageChange={setBatchesPage}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal - Hiển thị ngay khi bấm nút */}
      {showQRModal && qrCodeData && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={() => {
              setShowQRModal(false);
              setQrCodeData(null);
            }}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">
                    Mã QR thanh toán
                  </h3>
                  <button
                    onClick={() => {
                      setShowQRModal(false);
                      setQrCodeData(null);
                    }}
                    className="text-slate-400 hover:text-slate-500"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-2">
                      Khách hàng: <span className="font-medium">{qrCodeData.userName}</span>
                    </p>
                    <p className="text-sm text-slate-600 mb-4">
                      Tổng tiền: <span className="font-bold text-indigo-600">{formatAmount(qrCodeData.totalAmount)}</span>
                    </p>
                    <div className="bg-white rounded-lg p-4 flex justify-center border-2 border-indigo-200">
                      <img 
                        src={qrCodeData.qrCode} 
                        alt="QR Code thanh toán" 
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Quét mã QR để chuyển khoản nhanh
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 sm:px-6 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Ghi chú (tùy chọn)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    rows={2}
                    placeholder="Nhập ghi chú về việc thanh toán..."
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowQRModal(false);
                      setQrCodeData(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleConfirmPayment}
                    disabled={isProcessing}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isProcessing ? 'Đang xử lý...' : 'Xác nhận đã thanh toán'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentPayments;
