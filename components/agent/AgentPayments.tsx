import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, CheckCircle, AlertCircle, Save, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import { ReportService } from '../../src/lib/reportServices';
import { ref, push, update } from 'firebase/database';
import { database } from '../../src/lib/firebase';
import type { UserBill, AgentPaymentToUser, ReportRecord, User } from '../../types';
import Pagination from '../Pagination';

const AgentPayments: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;

  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const users = FirebaseUtils.objectToArray(usersData || {});
  
  const [unpaidReports, setUnpaidReports] = useState<ReportRecord[]>([]);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Load matched report_records that haven't been paid
  useEffect(() => {
    const loadUnpaidReports = async () => {
      if (!agentId) return;
      
      try {
        const result = await ReportService.getReportRecords(
          { status: 'MATCHED', agentId },
          { limit: 10000 }
        );
        
        // Filter out reports that are already paid
        const allBills = FirebaseUtils.objectToArray(billsData || {});
        const unpaid = result.records.filter(report => {
          const bill = allBills.find(b => b.id === report.userBillId);
          return bill && !bill.isPaidByAgent;
        });
        
        setUnpaidReports(unpaid);
      } catch (error) {
        console.error('Error loading unpaid reports:', error);
      }
    };
    
    loadUnpaidReports();
  }, [agentId, billsData]);

  const [note, setNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Group reports by user
  const reportsByUser = useMemo(() => {
    const groups: Record<string, { reports: ReportRecord[]; user: User | undefined }> = {};
    unpaidReports.forEach(report => {
      if (!groups[report.userId]) {
        groups[report.userId] = {
          reports: [],
          user: users.find(u => u.id === report.userId)
        };
      }
      groups[report.userId].reports.push(report);
    });
    return groups;
  }, [unpaidReports, users]);

  // Calculate totals for each user group
  const userTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    Object.entries(reportsByUser).forEach(([userId, group]) => {
      totals[userId] = group.reports.reduce((sum, r) => sum + r.amount, 0);
    });
    return totals;
  }, [reportsByUser]);

  const handlePayBills = async () => {
    if (selectedReports.length === 0) {
      alert('Vui lòng chọn ít nhất một giao dịch để thanh toán');
      return;
    }

    setIsProcessing(true);

    try {
      const selectedReportsList = unpaidReports.filter(r => selectedReports.includes(r.id));
      const totalAmount = selectedReportsList.reduce((sum, report) => sum + report.amount, 0);

      // Group by userId
      const reportsByUserMap = selectedReportsList.reduce((acc, report) => {
        if (!acc[report.userId]) {
          acc[report.userId] = [];
        }
        acc[report.userId].push(report);
        return acc;
      }, {} as Record<string, ReportRecord[]>);

      // Create payment record for each user
      for (const [userId, userReports] of Object.entries(reportsByUserMap)) {
        const paymentRef = await push(ref(database, 'agent_payments_to_users'), {
          agentId: agentId!,
          userId,
          billIds: userReports.map(r => r.userBillId),
          totalAmount: userReports.reduce((sum, r) => sum + r.amount, 0),
          note,
          paidAt: FirebaseUtils.getServerTimestamp()
        });

        // Update bills
        const updates: any = {};
        userReports.forEach(report => {
          updates[`user_bills/${report.userBillId}/isPaidByAgent`] = true;
          updates[`user_bills/${report.userBillId}/paidByAgentAt`] = FirebaseUtils.getServerTimestamp();
          updates[`user_bills/${report.userBillId}/paidByAgentNote`] = note;
        });
        await update(ref(database), updates);
      }

      alert('Đánh dấu thanh toán thành công!');
      setSelectedReports([]);
      setNote('');
      setShowModal(false);
      // Reload data
      window.location.reload();
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
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const selectedTotal = unpaidReports
    .filter(r => selectedReports.includes(r.id))
    .reduce((sum, r) => sum + r.amount, 0);

  if (!agentId) {
    return null;
  }

  // Filter and paginate users
  const userEntries = Object.entries(reportsByUser);
  const totalUsers = userEntries.length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = userEntries.slice(startIndex, endIndex);
  const totalPages = Math.ceil(totalUsers / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Tổng số bill chờ thanh toán</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{unpaidReports.length}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Đã chọn</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{selectedReports.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Tổng tiền đã chọn</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatAmount(selectedTotal)}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Cards by User */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Bills chờ thanh toán ({unpaidReports.length} giao dịch từ {totalUsers} khách hàng)
          </h3>
          {selectedReports.length > 0 && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Đánh dấu thanh toán ({selectedReports.length})
            </button>
          )}
        </div>

        <div className="space-y-4">
          {paginatedUsers.map(([userId, group]) => {
            const user = group.user;
            const total = userTotals[userId];
            const isExpanded = expandedUsers.has(userId);
            const isAllSelected = group.reports.every(r => selectedReports.includes(r.id));
            const someSelected = group.reports.some(r => selectedReports.includes(r.id));
            
            return (
              <div key={userId} className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Card Header */}
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
                      <p className="text-lg font-bold text-slate-900">
                        {formatAmount(total)}
                      </p>
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
                
                {/* Expanded Content */}
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
                              <td className="px-3 py-2">
                                {formatDate(report.transactionDate)}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {formatAmount(report.amount)}
                              </td>
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
        
        {/* Pagination */}
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

      {/* Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Đánh dấu thanh toán</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-slate-600 mb-2">
                  Số giao dịch đã chọn: <strong>{selectedReports.length}</strong>
                </p>
                <p className="text-sm text-slate-600">
                  Tổng tiền: <strong>{formatAmount(selectedTotal)}</strong>
                </p>
              </div>

              {/* QR Code của khách hàng */}
              {(() => {
                // Lấy user đầu tiên từ selected reports để hiển thị QR
                const firstReport = unpaidReports.find(r => selectedReports.includes(r.id));
                const selectedUser = firstReport ? users.find(u => u.id === firstReport.userId) : null;
                
                // Nếu có nhiều user, hiển thị cảnh báo
                const selectedUserIds = new Set(
                  unpaidReports
                    .filter(r => selectedReports.includes(r.id))
                    .map(r => r.userId)
                );
                const hasMultipleUsers = selectedUserIds.size > 1;
                
                return selectedUser?.qrCodeBase64 ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Mã QR thanh toán {hasMultipleUsers ? `(${selectedUser.fullName})` : 'của khách hàng'}
                    </div>
                    {hasMultipleUsers && (
                      <p className="text-xs text-blue-600 mb-2">
                        ⚠️ Có {selectedUserIds.size} khách hàng. Đang hiển thị QR của {selectedUser.fullName}
                      </p>
                    )}
                    <div className="bg-white rounded-lg p-4 flex justify-center border-2 border-blue-200">
                      <img 
                        src={selectedUser.qrCodeBase64} 
                        alt="QR Code thanh toán" 
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                    <p className="text-xs text-blue-600 text-center mt-2">
                      Quét mã QR để chuyển khoản nhanh
                    </p>
                  </div>
                ) : null;
              })()}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Ghi chú (tùy chọn)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                  placeholder="Nhập ghi chú về việc thanh toán..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handlePayBills}
                  disabled={isProcessing}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isProcessing ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentPayments;

