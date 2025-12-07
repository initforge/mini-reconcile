import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Edit2, Save, X, User as UserIcon, CreditCard } from 'lucide-react';
import type { ReportRecord, ReportStatus, User, Agent, AdminPaymentStatus, AgentPaymentStatus } from '../../types';
import { ReportService } from '../../src/lib/reportServices';

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
  onPaymentStatusChange?: () => void; // Callback để reload data sau khi update payment status
}

const ReportTable: React.FC<ReportTableProps> = ({
  role,
  records,
  users = [],
  agents = [],
  pagination,
  onEdit,
  onPaymentStatusChange
}) => {
  const [editingRecord, setEditingRecord] = useState<ReportRecord | null>(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    transactionCode: '',
    pointOfSaleName: '',
    note: ''
  });
  
  // Payment status edit state
  const [editingPaymentStatus, setEditingPaymentStatus] = useState<{
    record: ReportRecord;
    type: 'admin' | 'agent';
  } | null>(null);

  const formatAmount = (amount: number | undefined | null) => {
    if (amount === null || amount === undefined || isNaN(amount) || !isFinite(amount)) {
      return '0 ₫';
    }
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '-';
      }
      return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return '-';
    }
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.fullName || userId;
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? `${agent.name} (${agent.code})` : agentId;
  };

  // Calculate fee and net amount for a record
  const calculateFeeAndNet = (record: ReportRecord) => {
    // Validate amount
    const amount = record.amount;
    if (!amount || isNaN(amount) || !isFinite(amount)) {
      return { feeAmount: 0, netAmount: 0 };
    }

    // If already calculated, use stored values
    if (record.feeAmount !== undefined && record.netAmount !== undefined) {
      const fee = record.feeAmount;
      const net = record.netAmount;
      return {
        feeAmount: (isNaN(fee) || !isFinite(fee)) ? 0 : fee,
        netAmount: (isNaN(net) || !isFinite(net)) ? amount : net
      };
    }

    // Otherwise calculate from agent's discount rates
    const agent = agents.find(a => a.id === record.agentId);
    if (!agent) {
      return { feeAmount: 0, netAmount: amount };
    }

    const paymentMethod = record.paymentMethod;
    const pointOfSaleName = record.pointOfSaleName;

    let feePercentage = 0;
    if (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
      feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
    } else if (agent.discountRates) {
      feePercentage = agent.discountRates[paymentMethod] || 0;
    }

    const feeAmount = (amount * feePercentage) / 100;
    const netAmount = amount - feeAmount;

    return { 
      feeAmount: (isNaN(feeAmount) || !isFinite(feeAmount)) ? 0 : feeAmount, 
      netAmount: (isNaN(netAmount) || !isFinite(netAmount)) ? amount : netAmount 
    };
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

  const handleEditPaymentStatus = (record: ReportRecord, type: 'admin' | 'agent') => {
    if (role !== 'ADMIN' && role !== 'AGENT') return;
    
    // Chỉ cho phép edit nếu đã có payment (đã tạo payment ở tab thanh toán)
    if (type === 'admin' && !record.adminPaymentId) {
      alert('Giao dịch này chưa được thêm vào đợt thanh toán. Vui lòng tạo đợt thanh toán ở tab "Thanh toán & Công nợ" trước.');
      return;
    }
    
    if (type === 'agent' && !record.agentPaymentId) {
      alert('Giao dịch này chưa được thêm vào đợt thanh toán. Vui lòng tạo đợt thanh toán ở tab "Thanh toán" của đại lý trước.');
      return;
    }
    
    setEditingPaymentStatus({ record, type });
  };

  const handleSavePaymentStatus = async (newStatus: AdminPaymentStatus | AgentPaymentStatus) => {
    if (!editingPaymentStatus) return;

    try {
      if (editingPaymentStatus.type === 'admin') {
        await ReportService.updateAdminPaymentStatus(
          editingPaymentStatus.record.id,
          newStatus as AdminPaymentStatus
        );
      } else {
        await ReportService.updateAgentPaymentStatus(
          editingPaymentStatus.record.id,
          newStatus as AgentPaymentStatus
        );
      }

      alert('Đã cập nhật trạng thái thanh toán thành công!');
      setEditingPaymentStatus(null);
      
      // Reload data
      if (onPaymentStatusChange) {
        onPaymentStatusChange();
      } else {
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Error updating payment status:', error);
      alert(`Có lỗi khi cập nhật trạng thái thanh toán: ${error.message || 'Vui lòng thử lại'}`);
    }
  };

  // Determine columns based on role
  const showUserColumn = role === 'ADMIN' || role === 'AGENT';
  const showAgentColumn = role === 'ADMIN';
  const showMerchantColumn = role === 'ADMIN' || role === 'AGENT';
  const showReconciledAtColumn = role === 'ADMIN';
  const showEditColumn = role === 'ADMIN' && onEdit !== undefined;
  const showFeeColumns = role === 'ADMIN'; // Show Fee and Net Amount columns for Admin only
  const showAdminPaymentStatus = role === 'ADMIN'; // Admin payment status column
  const showAgentPaymentFromAdmin = role === 'AGENT'; // Agent: payment from Admin
  const showAgentPaymentToUser = role === 'AGENT'; // Agent: payment to User

  // Calculate summary totals
  const summaryTotals = React.useMemo(() => {
    let totalTransactions = 0;
    let totalAmount = 0;
    let totalFee = 0;
    let totalNet = 0;

    records.forEach(record => {
      const amount = record.amount;
      if (amount !== null && amount !== undefined && !isNaN(amount) && isFinite(amount) && amount > 0) {
        totalTransactions++;
        totalAmount += amount;
        
        // Calculate fee inline (same logic as calculateFeeAndNet)
        let feeAmount = 0;
        let netAmount = amount;
        
        if (record.feeAmount !== undefined && record.netAmount !== undefined) {
          feeAmount = (isNaN(record.feeAmount) || !isFinite(record.feeAmount)) ? 0 : record.feeAmount;
          netAmount = (isNaN(record.netAmount) || !isFinite(record.netAmount)) ? amount : record.netAmount;
        } else {
          const agent = agents.find(a => a.id === record.agentId);
          if (agent) {
            const paymentMethod = record.paymentMethod;
            const pointOfSaleName = record.pointOfSaleName;
            let feePercentage = 0;
            if (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
              feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
            } else if (agent.discountRates) {
              feePercentage = agent.discountRates[paymentMethod] || 0;
            }
            feeAmount = (amount * feePercentage) / 100;
            netAmount = amount - feeAmount;
          }
        }
        
        if (!isNaN(feeAmount) && isFinite(feeAmount)) {
          totalFee += feeAmount;
        }
        if (!isNaN(netAmount) && isFinite(netAmount)) {
          totalNet += netAmount;
        } else {
          totalNet += amount; // Fallback to amount if netAmount is invalid
        }
      }
    });

    return {
      totalTransactions,
      totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
      totalFee: isNaN(totalFee) ? 0 : totalFee,
      totalNet: isNaN(totalNet) ? 0 : totalNet
    };
  }, [records, agents]);

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-3 sm:p-4 md:p-6 border-b border-slate-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900">
              Kết quả báo cáo ({records.length} bản ghi)
            </h2>
            
            {/* Summary Totals */}
            {role === 'ADMIN' && records.length > 0 && (
              <div className="flex items-center gap-4 flex-wrap text-xs sm:text-sm">
                <div className="bg-yellow-50 px-3 py-2 rounded-lg border border-yellow-200">
                  <span className="text-slate-600">Tổng lệnh: </span>
                  <span className="font-bold text-slate-900">{summaryTotals.totalTransactions}</span>
                </div>
                <div className="bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                  <span className="text-slate-600">Tổng tiền: </span>
                  <span className="font-bold text-blue-700">{formatAmount(summaryTotals.totalAmount)}</span>
                </div>
                <div className="bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                  <span className="text-slate-600">Phí: </span>
                  <span className="font-bold text-red-700">{formatAmount(summaryTotals.totalFee)}</span>
                </div>
                <div className="bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                  <span className="text-slate-600">Sau phí: </span>
                  <span className="font-bold text-green-700">{formatAmount(summaryTotals.totalNet)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {records.length === 0 ? (
          <div className="p-6 sm:p-8 md:p-12 text-center">
            <p className="text-sm text-slate-500">Không có dữ liệu báo cáo</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full border-collapse text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b-2 border-slate-300">
                  {/* Header row with 2 main columns */}
                  <tr>
                    <th colSpan={(showUserColumn && showAgentColumn ? 3 : showUserColumn ? 2 : 1) + (role === 'USER' || role === 'AGENT' ? 1 : 0)} className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-center text-xs sm:text-sm font-bold text-slate-700 bg-blue-50 border-r-2 border-slate-300">
                      Thông tin từ Bill
                    </th>
                    <th colSpan={showMerchantColumn ? 8 : 0} className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-center text-xs sm:text-sm font-bold text-slate-700 bg-green-50">
                      Thông tin từ Merchants (File Excel)
                    </th>
                    <th colSpan={3 + (showFeeColumns ? 2 : 0) + (showReconciledAtColumn ? 1 : 0) + (showAdminPaymentStatus ? 2 : 0) + (showAgentPaymentFromAdmin ? 2 : 0) + (showAgentPaymentToUser ? 2 : 0) + (showEditColumn ? 1 : 0)} className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-center text-xs sm:text-sm font-bold text-slate-700 bg-slate-50 border-l-2 border-slate-300">
                      Kết quả đối soát
                    </th>
                  </tr>
                  {/* Sub-header row with individual columns */}
                  <tr>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r border-slate-200">
                      Mã giao dịch
                    </th>
                    {(role === 'USER' || role === 'AGENT') && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r border-slate-200">
                        Điểm thu
                      </th>
                    )}
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
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Mã GD
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Tiền sau KM
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Tiền trước KM
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Điểm thu
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Chi nhánh
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          Hóa đơn
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50">
                          SĐT
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r-2 border-slate-300">
                          Mã KM
                        </th>
                      </>
                    )}
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Số tiền
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Phương thức
                    </th>
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Trạng thái
                    </th>
                    {showFeeColumns && (
                      <>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-right text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Phí
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-right text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Sau phí
                        </th>
                      </>
                    )}
                    {showReconciledAtColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Đối soát lúc
                      </th>
                    )}
                    {showAdminPaymentStatus && (
                      <>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Ngày thanh toán
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Trạng thái TT
                        </th>
                      </>
                    )}
                    {showAgentPaymentFromAdmin && (
                      <>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Ngày TT từ Admin
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Trạng thái TT từ Admin
                        </th>
                      </>
                    )}
                    {showAgentPaymentToUser && (
                      <>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Ngày TT cho User
                        </th>
                        <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                          Trạng thái TT cho User
                        </th>
                      </>
                    )}
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Ghi chú
                    </th>
                    {showEditColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Thao tác
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      {/* Thông tin từ Bill - Cột màu xanh dương */}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm font-medium text-slate-900 bg-blue-50 border-r border-slate-200">
                        <span className="font-mono text-[9px] sm:text-[10px] md:text-xs">{record.transactionCode}</span>
                      </td>
                      {(role === 'USER' || role === 'AGENT') && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-blue-50 border-r border-slate-200">
                          <span className="truncate block max-w-[100px] sm:max-w-none">{record.pointOfSaleName || record.merchantPointOfSaleName || '-'}</span>
                        </td>
                      )}
                      {showUserColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-blue-50 border-r border-slate-200">
                          <div className="flex items-center space-x-1 sm:space-x-2">
                            <UserIcon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="truncate max-w-[80px] sm:max-w-none">{getUserName(record.userId)}</span>
                          </div>
                        </td>
                      )}
                      {showAgentColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-blue-50 border-r-2 border-slate-300">
                          <span className="truncate block max-w-[100px] sm:max-w-none">{getAgentName(record.agentId)}</span>
                        </td>
                      )}
                      
                      {/* Thông tin từ Merchants - Cột màu xanh lá */}
                      {showMerchantColumn && (
                        <>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-900 bg-green-50">
                            {record.merchantTransactionId ? <span className="font-mono">{record.transactionCode}</span> : '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-900 bg-green-50">
                            {record.merchantAmount && !isNaN(record.merchantAmount) ? formatAmount(record.merchantAmount) : '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-900 bg-green-50">
                            {record.merchantAmountBeforeDiscount && !isNaN(record.merchantAmountBeforeDiscount) ? formatAmount(record.merchantAmountBeforeDiscount) : '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-green-50">
                            {record.merchantPointOfSaleName || '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-green-50">
                            {record.merchantBranchName || '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-green-50">
                            {record.merchantInvoiceNumber || '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-green-50">
                            {record.merchantPhoneNumber || '-'}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-green-50 border-r-2 border-slate-300">
                            {record.merchantPromotionCode || '-'}
                          </td>
                        </>
                      )}
                      
                      {/* Kết quả đối soát - Cột màu xám */}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-900 bg-slate-50">
                        {formatAmount(record.amount || 0)}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-slate-50">
                        {record.paymentMethod}
                      </td>
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm bg-slate-50">
                        {getStatusBadge(record.status)}
                        {record.errorMessage && (
                          <p className="text-xs text-red-600 mt-1">{record.errorMessage}</p>
                        )}
                      </td>
                      {showFeeColumns && (() => {
                        const { feeAmount, netAmount } = calculateFeeAndNet(record);
                        return (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-600 bg-slate-50">
                              {formatAmount(feeAmount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-emerald-700 bg-slate-50">
                              {formatAmount(netAmount)}
                            </td>
                          </>
                        );
                      })()}
                      {showReconciledAtColumn && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 bg-slate-50">
                          {formatDate(record.reconciledAt)}
                        </td>
                      )}
                      {showAdminPaymentStatus && (
                        <>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-slate-50">
                            {record.adminPaidAt ? (
                              <span className="text-[10px] sm:text-xs md:text-sm text-slate-900">{formatDate(record.adminPaidAt)}</span>
                            ) : (
                              <span className="text-[10px] sm:text-xs md:text-sm text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-slate-50">
                            {record.adminPaymentId ? (
                              <button
                                onClick={() => handleEditPaymentStatus(record, 'admin')}
                                className="inline-flex items-center hover:opacity-80 transition-opacity"
                                title="Click để chỉnh sửa trạng thái thanh toán"
                              >
                                {record.adminPaymentStatus === 'PAID' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Đã thanh toán
                                  </span>
                                ) : record.adminPaymentStatus === 'UNPAID' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                    Chưa thanh toán
                                  </span>
                                ) : record.adminPaymentStatus === 'PARTIAL' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Thanh toán một phần
                                  </span>
                                ) : record.adminPaymentStatus === 'CANCELLED' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    Đã hủy
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                    Chưa thanh toán
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                Chưa thanh toán
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      {showAgentPaymentFromAdmin && (
                        <>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-slate-50">
                            {record.adminPaidAt ? (
                              <span className="text-[10px] sm:text-xs md:text-sm text-slate-900">{formatDate(record.adminPaidAt)}</span>
                            ) : (
                              <span className="text-[10px] sm:text-xs md:text-sm text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-slate-50">
                            {/* Agent không thể chỉnh sửa trạng thái thanh toán từ Admin - chỉ hiển thị */}
                            {record.adminPaymentStatus === 'PAID' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Đã thanh toán
                              </span>
                            ) : record.adminPaymentStatus === 'UNPAID' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                Chưa thanh toán
                              </span>
                            ) : record.adminPaymentStatus === 'PARTIAL' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Thanh toán một phần
                              </span>
                            ) : record.adminPaymentStatus === 'CANCELLED' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Đã hủy
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                Chưa thanh toán
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      {showAgentPaymentToUser && (
                        <>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-slate-50">
                            {record.agentPaidAt ? (
                              <span className="text-[10px] sm:text-xs md:text-sm text-slate-900">{formatDate(record.agentPaidAt)}</span>
                            ) : (
                              <span className="text-[10px] sm:text-xs md:text-sm text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-slate-50">
                            {record.agentPaymentId ? (
                              <button
                                onClick={() => handleEditPaymentStatus(record, 'agent')}
                                className="inline-flex items-center hover:opacity-80 transition-opacity"
                                title="Click để chỉnh sửa trạng thái thanh toán cho User"
                              >
                                {record.agentPaymentStatus === 'PAID' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Đã thanh toán
                                  </span>
                                ) : record.agentPaymentStatus === 'UNPAID' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                    Chưa thanh toán
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                    Chưa thanh toán
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                Chưa thanh toán
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 text-[10px] sm:text-xs md:text-sm text-slate-500 bg-slate-50">
                        <span className="truncate block max-w-[120px] sm:max-w-[150px] md:max-w-none">{record.note || '-'}</span>
                      </td>
                      {showEditColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm bg-slate-50">
                          <button
                            onClick={() => handleEdit(record)}
                            className="text-indigo-600 hover:text-indigo-800"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="w-3 h-3 sm:w-4 sm:h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="p-6 border-t border-slate-200">
                {/* Pagination component would go here - using existing Pagination component */}
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Status Edit Modal */}
      {editingPaymentStatus && (role === 'ADMIN' || role === 'AGENT') && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={() => setEditingPaymentStatus(null)}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">
                    {editingPaymentStatus.type === 'admin' ? 'Chỉnh sửa trạng thái thanh toán từ Admin' : 'Chỉnh sửa trạng thái thanh toán cho User'}
                  </h3>
                  <button
                    onClick={() => setEditingPaymentStatus(null)}
                    className="text-slate-400 hover:text-slate-500"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-600 mb-2">
                      Mã giao dịch: <span className="font-mono font-medium">{editingPaymentStatus.record.transactionCode}</span>
                    </p>
                    <p className="text-sm text-slate-600">
                      Số tiền: <span className="font-medium">{formatAmount(editingPaymentStatus.record.amount)}</span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Trạng thái thanh toán
                    </label>
                    {editingPaymentStatus.type === 'admin' ? (
                      <select
                        value={editingPaymentStatus.record.adminPaymentStatus || 'UNPAID'}
                        onChange={(e) => {
                          const newStatus = e.target.value as AdminPaymentStatus;
                          handleSavePaymentStatus(newStatus);
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      >
                        {/* Nếu đã có payment batch (adminPaymentId), chỉ cho 2 trạng thái để revert */}
                        {editingPaymentStatus.record.adminPaymentId ? (
                          <>
                            <option value="UNPAID">Chưa thanh toán</option>
                            <option value="PAID">Đã thanh toán</option>
                          </>
                        ) : (
                          <>
                            <option value="UNPAID">Chưa thanh toán</option>
                            <option value="PAID">Đã thanh toán</option>
                            <option value="PARTIAL">Thanh toán một phần</option>
                            <option value="CANCELLED">Đã hủy</option>
                          </>
                        )}
                      </select>
                    ) : (
                      <select
                        value={editingPaymentStatus.record.agentPaymentStatus || 'UNPAID'}
                        onChange={(e) => {
                          const newStatus = e.target.value as AgentPaymentStatus;
                          handleSavePaymentStatus(newStatus);
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="UNPAID">Chưa thanh toán</option>
                        <option value="PAID">Đã thanh toán</option>
                      </select>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {editingPaymentStatus.type === 'admin' 
                        ? 'Khi chuyển về "Chưa thanh toán", giao dịch sẽ quay lại tab "Chưa thanh toán" trong Thanh toán & Công nợ.'
                        : 'Khi chuyển về "Chưa thanh toán", giao dịch sẽ quay lại tab "Chưa thanh toán" trong Thanh toán của đại lý.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={() => setEditingPaymentStatus(null)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

