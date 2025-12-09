import React, { useState, useEffect } from 'react';
import { X, Calendar, Filter, Clock, CheckCircle, XCircle, AlertCircle, Plus, Edit2, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { UserService } from '../../src/lib/userServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { UserBill, PaymentMethod, ReportRecord } from '../../types';
import { getBillImageUrl, isBillImageExpired } from '../../src/utils/billImageUtils';

interface UserBillsModalProps {
  userId: string;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
}

const UserBillsModal: React.FC<UserBillsModalProps> = ({ userId, userName, isOpen, onClose }) => {
  const [bills, setBills] = useState<UserBill[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [editingBill, setEditingBill] = useState<UserBill | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  
  // Load report records to check UNMATCHED status
  const { data: reportRecordsData } = useRealtimeData<Record<string, ReportRecord>>('/report_records');
  
  // Get report records map by userBillId
  const reportRecordsByBillId = React.useMemo(() => {
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
  
  // Form state for add/edit
  const [formData, setFormData] = useState({
    transactionCode: '',
    amount: '',
    paymentMethod: 'QR 1 (VNPay)' as PaymentMethod,
    pointOfSaleName: '',
    invoiceNumber: ''
  });

  useEffect(() => {
    if (isOpen && userId) {
      loadBills();
    }
  }, [isOpen, userId, dateFrom, dateTo]);

  const loadBills = async () => {
    setLoading(true);
    try {
      const data = await UserService.getUserPendingBills(
        userId,
        dateFrom || undefined,
        dateTo || undefined
      );
      setBills(data);
    } catch (error) {
      console.error('Error loading user bills:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const getStatusBadge = (bill: UserBill) => {
    // Check if bill has been reconciled
    const reportRecord = reportRecordsByBillId.get(bill.id);
    
    if (reportRecord) {
      // Bill đã có ReportRecord
      // Kiểm tra xem có merchant data không (merchantTransactionId, merchantAmount, hoặc merchantsFileData)
      const hasMerchantData = !!(
        reportRecord.merchantTransactionId || 
        reportRecord.merchantAmount || 
        reportRecord.merchantsFileData ||
        reportRecord.merchantCode ||
        reportRecord.merchantPointOfSaleName ||
        reportRecord.merchantBranchName
      );
      
      if (hasMerchantData) {
        // Đã có merchant data → hiển thị status dựa trên reconciliationStatus
        if (reportRecord.reconciliationStatus === 'MATCHED' || reportRecord.status === 'MATCHED') {
          // Đã khớp
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Khớp
          </span>
        );
        } else if (reportRecord.reconciliationStatus === 'ERROR' || reportRecord.status === 'ERROR') {
          // Đã có merchant nhưng không khớp - hiển thị "Chưa khớp"
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <XCircle className="w-3 h-3 mr-1" />
              Chưa khớp
            </span>
          );
        } else {
          // UNMATCHED nhưng đã có merchant data → hiển thị "Chưa khớp" (không phải "Chờ đối soát")
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
              Chưa khớp
            </span>
          );
        }
      } else {
        // Chưa có merchant data
        if (reportRecord.reconciliationStatus === 'UNMATCHED') {
          // Chưa có merchant transaction - hiển thị "Chờ đối soát"
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              <Clock className="w-3 h-3 mr-1" />
              Chờ đối soát
            </span>
          );
        } else if (reportRecord.reconciliationStatus === 'MATCHED' || reportRecord.status === 'MATCHED') {
          // Đã khớp
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              Khớp
          </span>
        );
        }
      }
    }
    
    // Bill chưa có ReportRecord - chưa có merchant transaction
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Chờ đối soát
          </span>
        );
  };

  const handleAddBill = () => {
    setFormData({
      transactionCode: '',
      amount: '',
      paymentMethod: 'QR 1 (VNPay)' as PaymentMethod,
      pointOfSaleName: '',
      invoiceNumber: ''
    });
    setEditingBill(null);
    setShowAddModal(true);
  };

  const handleEditBill = (bill: UserBill) => {
    setFormData({
      transactionCode: bill.transactionCode,
      amount: bill.amount.toString(),
      paymentMethod: bill.paymentMethod,
      pointOfSaleName: bill.pointOfSaleName || '',
      invoiceNumber: bill.invoiceNumber || ''
    });
    setEditingBill(bill);
    setShowAddModal(true);
  };

  const handleDeleteBill = async (billId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bill này?')) return;
    
    try {
      await UserService.deleteUserBill(billId);
      await loadBills();
      alert('Đã xóa bill thành công!');
    } catch (error) {
      console.error('Error deleting bill:', error);
      alert('Có lỗi khi xóa bill');
    }
  };

  const handleSaveBill = async () => {
    if (!formData.transactionCode.trim() || !formData.amount.trim()) {
      alert('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    try {
      if (editingBill) {
        // Update existing bill
        await UserService.updateUserBill(editingBill.id, {
          transactionCode: formData.transactionCode,
          amount: parseFloat(formData.amount),
          paymentMethod: formData.paymentMethod,
          pointOfSaleName: formData.pointOfSaleName || undefined,
          invoiceNumber: formData.invoiceNumber || undefined,
          status: 'PENDING' // Reset to PENDING when editing
        });
        alert('Đã cập nhật bill thành công!');
      } else {
        // Create new bill - need to get agentId from first bill or fetch user data
        const firstBill = bills[0];
        if (!firstBill) {
          alert('Không thể tạo bill mới. Vui lòng thử lại.');
          return;
        }
        
        await UserService.createUserBill({
          userId,
          agentId: firstBill.agentId,
          agentCode: firstBill.agentCode,
          transactionCode: formData.transactionCode,
          amount: parseFloat(formData.amount),
          paymentMethod: formData.paymentMethod,
          pointOfSaleName: formData.pointOfSaleName || undefined,
          invoiceNumber: formData.invoiceNumber || undefined,
          imageUrl: '', // Empty for manually created bills
          timestamp: new Date().toISOString(),
          status: 'PENDING',
          isPaidByAgent: false,
          createdAt: new Date().toISOString()
        });
        alert('Đã thêm bill thành công!');
      }
      
      setShowAddModal(false);
      setEditingBill(null);
      await loadBills();
    } catch (error) {
      console.error('Error saving bill:', error);
      alert('Có lỗi khi lưu bill');
    }
  };

  const toggleBillExpansion = (billId: string) => {
    const newExpanded = new Set(expandedBills);
    if (newExpanded.has(billId)) {
      newExpanded.delete(billId);
    } else {
      newExpanded.add(billId);
    }
    setExpandedBills(newExpanded);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-slate-900">Chi tiết bills - {userName}</h3>
                <p className="text-sm text-slate-500 mt-1">User ID: {userId}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleAddBill}
                  className="flex items-center space-x-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm bill</span>
                </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-500"
              >
                <X className="w-6 h-6" />
              </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <div className="flex items-center space-x-2 mb-3">
                <Filter className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-700">Lọc theo ngày</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="w-full px-4 py-2 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                  >
                    Xóa bộ lọc
                  </button>
                </div>
              </div>
            </div>

            {/* Bills Table */}
            {loading ? (
              <div className="p-8 text-center">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                <p className="mt-2 text-sm text-slate-500">Đang tải...</p>
              </div>
            ) : bills.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-500">Không có bills đang chờ đối soát</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase w-12"></th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Mã giao dịch
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Số tiền
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Phương thức
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Điểm thu
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Ngày tạo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Trạng thái
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bills.map((bill) => {
                      const isExpanded = expandedBills.has(bill.id);
                      return (
                        <React.Fragment key={bill.id}>
                          <tr className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleBillExpansion(bill.id)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {bill.transactionCode}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {formatAmount(bill.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {bill.paymentMethod}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {bill.pointOfSaleName || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {formatDate(bill.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {getStatusBadge(bill)}
                        </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => handleEditBill(bill)}
                                  className="text-indigo-600 hover:text-indigo-800"
                                  title="Sửa"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteBill(bill.id)}
                                  className="text-red-600 hover:text-red-800"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="px-4 py-3 bg-slate-50">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="font-medium text-slate-600">Số hóa đơn:</span>
                                    <span className="ml-2 text-slate-900">{bill.invoiceNumber || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-slate-600">Agent Code:</span>
                                    <span className="ml-2 text-slate-900">{bill.agentCode}</span>
                                  </div>
                                  {(() => {
                                    const imageUrl = getBillImageUrl(bill);
                                    const expired = isBillImageExpired(bill);
                                    
                                    if (imageUrl) {
                                      return (
                                    <div className="col-span-2">
                                      <span className="font-medium text-slate-600">Ảnh bill:</span>
                                      <img 
                                            src={imageUrl} 
                                        alt="Bill" 
                                        className="mt-2 max-w-xs rounded-lg border border-slate-200"
                                      />
                                    </div>
                                      );
                                    } else if (expired) {
                                      return (
                                        <div className="col-span-2">
                                          <span className="font-medium text-slate-600">Ảnh bill:</span>
                                          <p className="mt-2 text-sm text-slate-500 italic">Quá hạn 1 tuần, hệ thống đã xoá</p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                        </td>
                      </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Bill Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={() => {
              setShowAddModal(false);
              setEditingBill(null);
            }}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">
                    {editingBill ? 'Sửa bill' : 'Thêm bill mới'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingBill(null);
                    }}
                    className="text-slate-400 hover:text-slate-500"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Mã giao dịch *
                    </label>
                    <input
                      type="text"
                      value={formData.transactionCode}
                      onChange={(e) => setFormData({ ...formData, transactionCode: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nhập mã giao dịch"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Số tiền *
                    </label>
                    <input
                      type="number"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nhập số tiền"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Phương thức thanh toán
                    </label>
                    <select
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="QR 1 (VNPay)">QR 1 (VNPay)</option>
                      <option value="QR 2 (App Bank)">QR 2 (App Bank)</option>
                      <option value="Sofpos">Sofpos</option>
                      <option value="POS">POS</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Điểm thu
                    </label>
                    <input
                      type="text"
                      value={formData.pointOfSaleName}
                      onChange={(e) => setFormData({ ...formData, pointOfSaleName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nhập điểm thu (tùy chọn)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Số hóa đơn
                    </label>
                    <input
                      type="text"
                      value={formData.invoiceNumber}
                      onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="Nhập số hóa đơn (tùy chọn)"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleSaveBill}
                  className="w-full inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingBill ? 'Cập nhật' : 'Thêm'}
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingBill(null);
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserBillsModal;

