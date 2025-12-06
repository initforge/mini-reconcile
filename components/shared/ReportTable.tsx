import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Edit2, Save, X, User as UserIcon } from 'lucide-react';
import type { ReportRecord, ReportStatus, User, Agent } from '../../types';

export interface ReportTableProps {
  role: 'USER' | 'AGENT' | 'ADMIN';
  records: ReportRecord[];
  users?: User[];
  agents?: Agent[];
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
  onEdit?: (id: string, updates: Partial<ReportRecord>) => Promise<void>;
}

const ReportTable: React.FC<ReportTableProps> = ({
  role,
  records,
  users = [],
  agents = [],
  pagination,
  onEdit
}) => {
  const [editingRecord, setEditingRecord] = useState<ReportRecord | null>(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    transactionCode: '',
    pointOfSaleName: '',
    note: ''
  });

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

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.fullName || userId;
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? `${agent.name} (${agent.code})` : agentId;
  };

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Khớp
          </span>
        );
      case 'UNMATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Chưa khớp
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
        return null;
    }
  };

  const handleEdit = (record: ReportRecord) => {
    if (role !== 'ADMIN' || !onEdit) return;
    setEditingRecord(record);
    setEditForm({
      amount: record.amount.toString(),
      transactionCode: record.transactionCode,
      pointOfSaleName: record.pointOfSaleName || '',
      note: record.note || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecord || !onEdit) return;

    try {
      const updates: Partial<ReportRecord> = {};
      const editedFields: string[] = [];

      if (parseFloat(editForm.amount) !== editingRecord.amount) {
        updates.amount = parseFloat(editForm.amount);
        editedFields.push('amount');
      }
      if (editForm.transactionCode !== editingRecord.transactionCode) {
        updates.transactionCode = editForm.transactionCode;
        editedFields.push('transactionCode');
      }
      if (editForm.pointOfSaleName !== (editingRecord.pointOfSaleName || '')) {
        updates.pointOfSaleName = editForm.pointOfSaleName || undefined;
        editedFields.push('pointOfSaleName');
      }
      if (editForm.note !== (editingRecord.note || '')) {
        updates.note = editForm.note || undefined;
        editedFields.push('note');
      }

      if (editedFields.length > 0) {
        updates.editedFields = editedFields;
        await onEdit(editingRecord.id, updates);
      }

      setEditingRecord(null);
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Có lỗi khi cập nhật bản ghi');
    }
  };

  // Determine columns based on role
  const showUserColumn = role === 'ADMIN' || role === 'AGENT';
  const showAgentColumn = role === 'ADMIN';
  const showMerchantColumn = role === 'ADMIN' || role === 'AGENT';
  const showReconciledAtColumn = role === 'ADMIN';
  const showEditColumn = role === 'ADMIN' && onEdit !== undefined;

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Kết quả báo cáo ({records.length} bản ghi)
          </h2>
        </div>

        {records.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">Không có dữ liệu báo cáo</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-slate-50 border-b-2 border-slate-300">
                  {/* Header row with 2 main columns */}
                  <tr>
                    <th colSpan={showUserColumn && showAgentColumn ? 3 : showUserColumn ? 2 : 1} className="px-6 py-3 text-center text-sm font-bold text-slate-700 bg-blue-50 border-r-2 border-slate-300">
                      Thông tin từ Bill
                    </th>
                    <th colSpan={showMerchantColumn ? 8 : 0} className="px-6 py-3 text-center text-sm font-bold text-slate-700 bg-green-50">
                      Thông tin từ Merchants (File Excel)
                    </th>
                    <th colSpan={3 + (showReconciledAtColumn ? 1 : 0) + (showEditColumn ? 1 : 0)} className="px-6 py-3 text-center text-sm font-bold text-slate-700 bg-slate-50 border-l-2 border-slate-300">
                      Kết quả đối soát
                    </th>
                  </tr>
                  {/* Sub-header row with individual columns */}
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r border-slate-200">
                      Mã giao dịch
                    </th>
                    {showUserColumn && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r border-slate-200">
                        Người dùng
                      </th>
                    )}
                    {showAgentColumn && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r-2 border-slate-300">
                        Đại lý
                      </th>
                    )}
                    {showMerchantColumn && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Mã giao dịch
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Số tiền sau KM
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Số tiền trước KM
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Điểm thu
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Chi nhánh
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Số hóa đơn
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Số điện thoại
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r-2 border-slate-300">
                          Mã khuyến mại
                        </th>
                      </>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Số tiền
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Phương thức
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Trạng thái
                    </th>
                    {showReconciledAtColumn && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Đối soát lúc
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Ghi chú
                    </th>
                    {showEditColumn && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Thao tác
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      {/* Thông tin từ Bill - Cột màu xanh dương */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 bg-blue-50 border-r border-slate-200">
                        {record.transactionCode}
                      </td>
                      {showUserColumn && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-blue-50 border-r border-slate-200">
                          <div className="flex items-center space-x-2">
                            <UserIcon className="w-4 h-4" />
                            <span>{getUserName(record.userId)}</span>
                          </div>
                        </td>
                      )}
                      {showAgentColumn && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-blue-50 border-r-2 border-slate-300">
                          {getAgentName(record.agentId)}
                        </td>
                      )}
                      
                      {/* Thông tin từ Merchants - Cột màu xanh lá */}
                      {showMerchantColumn && (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 bg-green-50">
                            {record.merchantTransactionId ? record.transactionCode : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 bg-green-50">
                            {record.merchantAmount ? formatAmount(record.merchantAmount) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 bg-green-50">
                            {record.merchantAmountBeforeDiscount ? formatAmount(record.merchantAmountBeforeDiscount) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-green-50">
                            {record.merchantPointOfSaleName || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-green-50">
                            {record.merchantBranchName || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-green-50">
                            {record.merchantInvoiceNumber || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-green-50">
                            {record.merchantPhoneNumber || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-green-50 border-r-2 border-slate-300">
                            {record.merchantPromotionCode || '-'}
                          </td>
                        </>
                      )}
                      
                      {/* Kết quả đối soát - Cột màu xám */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 bg-slate-50">
                        {formatAmount(record.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-slate-50">
                        {record.paymentMethod}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm bg-slate-50">
                        {getStatusBadge(record.status)}
                        {record.errorMessage && (
                          <p className="text-xs text-red-600 mt-1">{record.errorMessage}</p>
                        )}
                      </td>
                      {showReconciledAtColumn && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-slate-50">
                          {formatDate(record.reconciledAt)}
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-slate-500 bg-slate-50">
                        {record.note || '-'}
                      </td>
                      {showEditColumn && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm bg-slate-50">
                          <button
                            onClick={() => handleEdit(record)}
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="p-6 border-t border-slate-200">
                {/* Pagination component would go here - using existing Pagination component */}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Modal for Admin */}
      {editingRecord && role === 'ADMIN' && onEdit && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={() => setEditingRecord(null)}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">Chỉnh sửa bản ghi</h3>
                  <button
                    onClick={() => setEditingRecord(null)}
                    className="text-slate-400 hover:text-slate-500"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Mã giao dịch
                    </label>
                    <input
                      type="text"
                      value={editForm.transactionCode}
                      onChange={(e) => setEditForm({ ...editForm, transactionCode: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Số tiền
                    </label>
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Điểm thu
                    </label>
                    <input
                      type="text"
                      value={editForm.pointOfSaleName}
                      onChange={(e) => setEditForm({ ...editForm, pointOfSaleName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Ghi chú
                    </label>
                    <textarea
                      value={editForm.note}
                      onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleSaveEdit}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Lưu
                </button>
                <button
                  onClick={() => setEditingRecord(null)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReportTable;

