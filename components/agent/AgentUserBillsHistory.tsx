import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, User as UserIcon, FileText, CheckCircle, XCircle, AlertCircle, Edit2, Trash2, Save, X, Plus } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import { UserService } from '../../src/lib/userServices';
import { ReportService } from '../../src/lib/reportServices';
import type { UserBill, User, ReportRecord, PaymentMethod } from '../../types';
import Pagination from '../Pagination';

interface AgentUserBillsHistoryProps {
  agentId: string | null;
}

type BillStatus = 'PENDING' | 'MATCHED' | 'ERROR';

interface UserGroup {
  bills: UserBill[];
  user: User | undefined;
}

interface UserTotals {
  count: number;
  amount: number;
}

const AgentUserBillsHistory: React.FC<AgentUserBillsHistoryProps> = ({ agentId }) => {
  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const { data: reportRecordsData } = useRealtimeData<Record<string, ReportRecord>>('/report_records');
  
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>(''); // Search by transaction code
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Edit state
  const [editingBill, setEditingBill] = useState<UserBill | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    transactionCode: '',
    amount: '',
    paymentMethod: 'QR 1 (VNPay)' as PaymentMethod,
    pointOfSaleName: '',
    invoiceNumber: ''
  });

  // Memoize users array
  const users = useMemo(() => {
    return FirebaseUtils.objectToArray(usersData || {});
  }, [usersData]);

  // Filter bills by agentId
  const allBills = useMemo(() => {
    if (!agentId || !billsData) return [];
    
    return FirebaseUtils.objectToArray(billsData)
      .filter((bill: UserBill) => bill.agentId === agentId)
      .sort((a, b) => {
        // Sort by createdAt descending (newest first)
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
  }, [billsData, agentId]);

  // Filter bills by date range and search term
  const filteredBills = useMemo(() => {
    let filtered = allBills;

    // Filter by date range
    if (dateFrom || dateTo) {
      filtered = filtered.filter((bill: UserBill) => {
        // Use createdAt, timestamp, or paidByAgentAt as fallback
        const dateToCheck = bill.createdAt || bill.timestamp || bill.paidByAgentAt;
        if (!dateToCheck) return true; // Include if no date
        
        try {
          // Handle both ISO string and Date object
          const dateStr = typeof dateToCheck === 'string' ? dateToCheck : dateToCheck.toISOString();
          const billDate = dateStr.split('T')[0]; // Extract YYYY-MM-DD
          // Include records where date is >= dateFrom and <= dateTo (inclusive)
        if (dateFrom && billDate < dateFrom) return false;
        if (dateTo && billDate > dateTo) return false;
        return true;
        } catch (error) {
          console.warn('Error parsing bill date:', error);
          return true; // Include if parsing fails
        }
      });
    }
    
    // Filter by search term (transaction code)
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((bill: UserBill) => 
        bill.transactionCode?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [allBills, dateFrom, dateTo, searchTerm]);

  // Group bills by user
  const billsByUser = useMemo(() => {
    const groups: Record<string, UserGroup> = {};
    
    filteredBills.forEach((bill: UserBill) => {
      if (!bill.userId) return; // Skip bills without userId
      
      if (!groups[bill.userId]) {
        groups[bill.userId] = {
          bills: [],
          user: users.find(u => u.id === bill.userId)
        };
      }
      groups[bill.userId].bills.push(bill);
    });
    
    return groups;
  }, [filteredBills, users]);

  // Calculate totals for each user
  const userTotals = useMemo(() => {
    const totals: Record<string, UserTotals> = {};
    
    Object.entries(billsByUser).forEach(([userId, group]) => {
      totals[userId] = {
        count: group.bills.length,
        amount: group.bills.reduce((sum, bill) => sum + (bill.amount || 0), 0)
      };
    });
    
    return totals;
  }, [billsByUser]);

  // Paginate users - reset to page 1 when filters change
  const paginatedUsers = useMemo(() => {
  const userEntries = Object.entries(billsByUser);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
    return userEntries.slice(startIndex, endIndex);
  }, [billsByUser, currentPage, itemsPerPage]);

  const totalUsers = Object.keys(billsByUser).length;
  const totalPages = Math.ceil(totalUsers / itemsPerPage);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo]);

  // Format functions - memoized
  const formatAmount = useCallback((amount: number) => {
    if (!amount || isNaN(amount)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { 
      style: 'currency', 
      currency: 'VND' 
    }).format(amount);
  }, []);

  const formatDate = useCallback((dateString: string | undefined) => {
    if (!dateString) return '-';
    
    try {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  }, []);

  // Get report records map by userBillId
  const reportRecordsByBillId = useMemo(() => {
    if (!reportRecordsData) return new Map<string, ReportRecord>();
    const records = FirebaseUtils.objectToArray(reportRecordsData);
    const map = new Map<string, ReportRecord>();
    records.forEach((record: ReportRecord) => {
      if (record.userBillId) {
        map.set(record.userBillId, record);
      }
    });
    return map;
  }, [reportRecordsData]);

  const getStatusBadge = useCallback((bill: UserBill) => {
    // Check if bill has been reconciled but unmatched
    const reportRecord = reportRecordsByBillId.get(bill.id);
    if (reportRecord && reportRecord.status === 'UNMATCHED') {
      // Đã đối soát nhưng chưa khớp - hiển thị "Chưa khớp"
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          Chưa khớp
        </span>
      );
    }
    
    // Otherwise use bill status
    switch (bill.status as BillStatus) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Đã đối soát
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Chờ đối soát
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Lỗi
          </span>
        );
      default:
        return <span className="text-slate-400">-</span>;
    }
  }, [reportRecordsByBillId]);

  const getPaymentStatusBadge = useCallback((isPaid: boolean | undefined) => {
    if (isPaid) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Đã thanh toán
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
        Chưa thanh toán
      </span>
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setDateFrom('');
    setDateTo('');
    setSearchTerm('');
    setCurrentPage(1);
  }, []);
  
  // Check if bill can be edited (not reconciled by admin)
  const canEditBill = useCallback((bill: UserBill) => {
    const reportRecord = reportRecordsByBillId.get(bill.id);
    // Không cho phép edit nếu đã có reportRecord với status MATCHED hoặc ERROR (admin đã đối soát)
    if (reportRecord && (reportRecord.status === 'MATCHED' || reportRecord.status === 'ERROR')) {
      return false;
    }
    // Cho phép edit nếu chưa có reportRecord hoặc status là UNMATCHED hoặc PENDING
    return true;
  }, [reportRecordsByBillId]);
  
  const handleEditBill = useCallback((bill: UserBill) => {
    if (!canEditBill(bill)) {
      alert('Bill này đã được admin đối soát, không thể chỉnh sửa');
      return;
    }
    setEditingBill(bill);
    setFormData({
      transactionCode: bill.transactionCode || '',
      amount: bill.amount?.toString() || '',
      paymentMethod: bill.paymentMethod || 'QR 1 (VNPay)' as PaymentMethod,
      pointOfSaleName: bill.pointOfSaleName || '',
      invoiceNumber: bill.invoiceNumber || ''
    });
    setShowEditModal(true);
  }, [canEditBill]);
  
  const handleDeleteBill = useCallback((bill: UserBill) => {
    if (!canEditBill(bill)) {
      alert('Bill này đã được admin đối soát, không thể xóa');
      return;
    }
    if (window.confirm('Bạn có chắc chắn muốn xóa bill này?')) {
      setDeletingBillId(bill.id);
    }
  }, [canEditBill]);
  
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingBillId) return;
    
    try {
      await UserService.deleteUserBill(deletingBillId);
      setDeletingBillId(null);
      alert('Đã xóa bill thành công!');
    } catch (error) {
      console.error('Error deleting bill:', error);
      alert('Có lỗi khi xóa bill');
    }
  }, [deletingBillId]);
  
  const handleSaveBill = useCallback(async () => {
    if (!editingBill) return;
    
    if (!formData.transactionCode.trim() || !formData.amount.trim()) {
      alert('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    
    try {
      // Check duplicate transaction code (exclude current bill)
      const isDuplicate = await UserService.checkTransactionCodeExists(formData.transactionCode, editingBill.id);
      if (isDuplicate) {
        alert(`Mã giao dịch ${formData.transactionCode} đã tồn tại`);
        return;
      }
      
      await UserService.updateUserBill(editingBill.id, {
        transactionCode: formData.transactionCode.trim(),
        amount: amount,
        paymentMethod: formData.paymentMethod,
        pointOfSaleName: formData.pointOfSaleName.trim() || undefined,
        invoiceNumber: formData.invoiceNumber.trim() || undefined,
        status: 'PENDING' // Reset to PENDING when editing
      });
      
      alert('Đã cập nhật bill thành công!');
      setShowEditModal(false);
      setEditingBill(null);
    } catch (error: any) {
      console.error('Error saving bill:', error);
      alert(error.message || 'Có lỗi khi lưu bill');
    }
  }, [editingBill, formData]);

  const toggleUserExpanded = useCallback((userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  // Calculate summary totals
  const summaryTotal = useMemo(() => {
    return filteredBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  }, [filteredBills]);

  // Early return if no agentId
  if (!agentId) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
        <p className="text-slate-500">Không tìm thấy thông tin đại lý</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <label className="block text-xs font-medium text-slate-700 mb-1">
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
        
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Từ ngày
            </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Đến ngày
            </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex items-end">
          <button
              onClick={handleClearFilters}
              disabled={!dateFrom && !dateTo && !searchTerm}
              className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Xóa bộ lọc
          </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-slate-500">Tổng số khách hàng</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalUsers}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Tổng số bill</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{filteredBills.length}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Tổng số tiền</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {formatAmount(summaryTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* User Cards */}
      {paginatedUsers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-slate-300">
          <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500">Không có bill nào</p>
          {(dateFrom || dateTo) && (
            <button
              onClick={handleClearFilters}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 underline"
            >
              Xóa bộ lọc để xem tất cả
            </button>
          )}
        </div>
      ) : (
      <div className="space-y-4">
        {paginatedUsers.map(([userId, group]) => {
          const user = group.user;
          const total = userTotals[userId];
          const isExpanded = expandedUsers.has(userId);
            
            if (!total) return null;
          
          return (
              <div key={userId} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
              {/* Card Header */}
              <div className="bg-slate-50 p-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <UserIcon className="w-5 h-5 text-indigo-600" />
                    </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-900 truncate">
                        {user?.fullName || user?.phone || userId}
                      </h4>
                        <p className="text-sm text-slate-500 truncate">
                        {user?.phone && user?.fullName ? `SĐT: ${user.phone}` : userId}
                      </p>
                    </div>
                  </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                    <p className="text-sm text-slate-500">Tổng số bill</p>
                    <p className="text-lg font-bold text-slate-900">{total.count}</p>
                  </div>
                      <div className="text-right">
                    <p className="text-sm text-slate-500">Tổng tiền</p>
                    <p className="text-lg font-bold text-green-600">{formatAmount(total.amount)}</p>
                  </div>
                  <button
                        onClick={() => toggleUserExpanded(userId)}
                        className="p-2 hover:bg-slate-200 rounded-lg transition-colors flex-shrink-0"
                        aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                  >
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-600" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-600" />
                        )}
                  </button>
                    </div>
                </div>
              </div>
              
              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-4 bg-white border-t border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-700">Mã giao dịch</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700">Thời gian up</th>
                            <th className="px-3 py-2 text-right font-medium text-slate-700">Số tiền</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700">Điểm thu</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700">Trạng thái đối soát</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700">Trạng thái thanh toán</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700">Ngày giờ thanh toán</th>
                            <th className="px-3 py-2 text-left font-medium text-slate-700">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {group.bills.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                                Không có bill nào
                              </td>
                            </tr>
                          ) : (
                            group.bills.map((bill) => {
                              const canEdit = canEditBill(bill);
                              return (
                                <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-3 py-2 font-mono text-xs text-slate-900">
                                    {bill.transactionCode || '-'}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">
                                    {formatDate(bill.createdAt)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium text-slate-900">
                                    {formatAmount(bill.amount || 0)}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                                    {bill.pointOfSaleName || '-'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {getStatusBadge(bill)}
                                  </td>
                                  <td className="px-3 py-2">
                                    {getPaymentStatusBadge(bill.isPaidByAgent)}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-slate-500">
                                    {formatDate(bill.paidByAgentAt)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleEditBill(bill)}
                                        disabled={!canEdit}
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          canEdit
                                            ? 'text-indigo-600 hover:bg-indigo-50'
                                            : 'text-slate-300 cursor-not-allowed'
                                        }`}
                                        title={canEdit ? 'Chỉnh sửa' : 'Bill đã được admin đối soát, không thể chỉnh sửa'}
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteBill(bill)}
                                        disabled={!canEdit}
                                        className={`p-1.5 rounded-lg transition-colors ${
                                          canEdit
                                            ? 'text-red-600 hover:bg-red-50'
                                            : 'text-slate-300 cursor-not-allowed'
                                        }`}
                                        title={canEdit ? 'Xóa' : 'Bill đã được admin đối soát, không thể xóa'}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                          </tr>
                              );
                            })
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
      
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

      {/* Edit Bill Modal */}
      {showEditModal && editingBill && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={() => {
              setShowEditModal(false);
              setEditingBill(null);
            }}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">Chỉnh sửa Bill</h3>
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingBill(null);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Mã giao dịch <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.transactionCode}
                      onChange={(e) => setFormData({ ...formData, transactionCode: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Số tiền (VND) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      required
                      min="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Loại thanh toán <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="QR 1 (VNPay)">QR 1 (VNPay)</option>
                      <option value="QR 2 (App Bank)">QR 2 (App Bank)</option>
                      <option value="POS">POS</option>
                      <option value="Sofpos">Sofpos</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Điểm thu
                    </label>
                    <input
                      type="text"
                      value={formData.pointOfSaleName}
                      onChange={(e) => setFormData({ ...formData, pointOfSaleName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Số hóa đơn
                    </label>
                    <input
                      type="text"
                      value={formData.invoiceNumber}
                      onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
              <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingBill(null);
                    }}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
              >
                    Hủy
              </button>
              <button
                    onClick={handleSaveBill}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
              >
                    <Save className="w-4 h-4" />
                    <span>Lưu</span>
              </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBillId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={() => setDeletingBillId(null)}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">Xác nhận xóa</h3>
                </div>

                <p className="text-slate-600 mb-6">
                  Bạn có chắc chắn muốn xóa bill này? Hành động này không thể hoàn tác.
                </p>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setDeletingBillId(null)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa</span>
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

export default AgentUserBillsHistory;
