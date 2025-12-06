import React, { useState, useEffect } from 'react';
import { X, Calendar, Filter, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { UserService } from '../../src/lib/userServices';
import type { UserBill } from '../../types';

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Khớp
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Lỗi
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Chờ đối soát
          </span>
        );
    }
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
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-500"
              >
                <X className="w-6 h-6" />
              </button>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bills.map((bill) => (
                      <tr key={bill.id} className="hover:bg-slate-50">
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
                          {getStatusBadge(bill.status)}
                        </td>
                      </tr>
                    ))}
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
    </div>
  );
};

export default UserBillsModal;

