import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Edit2, Save, X, User as UserIcon, CreditCard } from 'lucide-react';
import { update, ref } from 'firebase/database';
import { database } from '../../src/lib/firebase';
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

  // Handle confirm match for agent
  const handleConfirmMatch = async (record: ReportRecord) => {
    if (!window.confirm('Bạn có chắc chắn muốn xác nhận khớp cho giao dịch này? Sau khi xác nhận, giao dịch sẽ chuyển sang trạng thái khớp và xuất hiện trong thanh toán cho admin.')) {
      return;
    }

    try {
      // Update reconciliationStatus to MATCHED and status to MATCHED
      // Also update UserBill status if userBillId exists
      const updates: any = {};
      
      // Update ReportRecord
      updates[`report_records/${record.id}/reconciliationStatus`] = 'MATCHED';
      updates[`report_records/${record.id}/status`] = 'MATCHED';
      updates[`report_records/${record.id}/errorMessage`] = null;
      
      // Update UserBill status if exists
      if (record.userBillId) {
        updates[`user_bills/${record.userBillId}/status`] = 'MATCHED';
        updates[`user_bills/${record.userBillId}/errorMessage`] = null;
      }
      
      await update(ref(database), updates);

      // Reload data
      if (onPaymentStatusChange) {
        onPaymentStatusChange();
      }

      alert('Đã xác nhận khớp thành công! Giao dịch đã chuyển sang trạng thái khớp và sẽ xuất hiện trong thanh toán cho admin.');
    } catch (error: any) {
      alert(`Đã xảy ra lỗi: ${error.message || 'Vui lòng thử lại'}`);
    }
  };

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

  const getUserName = (userId: string | undefined) => {
    if (!userId) return '-';
    const user = users.find(u => u.id === userId);
    return user?.fullName || userId;
  };

  const getAgentName = (agentId: string | undefined) => {
    if (!agentId) return '-';
    const agent = agents.find(a => a.id === agentId);
    return agent ? `${agent.name} (${agent.code})` : agentId;
  };

  // Calculate fee and net amount for a record
  const calculateFeeAndNet = (record: ReportRecord): { feeAmount: number; netAmount: number; feeNote?: string } => {
    // Validate amount
    const amount = record.amount;
    if (!amount || isNaN(amount) || !isFinite(amount)) {
      return { feeAmount: 0, netAmount: 0 };
    }

    // If already calculated, use stored values (but still check for feeNote scenarios)
    if (record.feeAmount !== undefined && record.netAmount !== undefined) {
      const fee = record.feeAmount;
      const net = record.netAmount;
      const feeAmount = (isNaN(fee) || !isFinite(fee)) ? 0 : fee;
      const netAmount = (isNaN(net) || !isFinite(net)) ? amount : net;
      
      // If fee is 0, check if it's because of missing config
      if (feeAmount === 0) {
        const agent = agents.find(a => a.id === record.agentId);
        const pointOfSaleName = record.pointOfSaleName;
        
        if (!agent || !pointOfSaleName) {
          return { feeAmount: 0, netAmount: amount, feeNote: 'Chưa có điểm bán hoặc đại lý cho vị trí này' };
        }
        
        // Check if feePercentage would be undefined
        const paymentMethod = record.paymentMethod;
        const feePercentage = 
          (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]?.[paymentMethod]) ||
          (agent.discountRates?.[paymentMethod]);
        
        if (feePercentage === undefined || feePercentage === 0) {
          return { feeAmount: 0, netAmount: amount, feeNote: 'Chưa cấu hình phí cho điểm bán này' };
        }
      }
      
      return { feeAmount, netAmount };
    }

    // Otherwise calculate from agent's discount rates
    const agent = agents.find(a => a.id === record.agentId);
    const pointOfSaleName = record.pointOfSaleName;
    
    // Check if no agent or no point of sale
    if (!agent || !pointOfSaleName) {
      return { 
        feeAmount: 0, 
        netAmount: amount,
        feeNote: 'Chưa có điểm bán hoặc đại lý cho vị trí này'
      };
    }

    const paymentMethod = record.paymentMethod;

    // Try to find feePercentage
    let feePercentage: number | undefined = undefined;
    if (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
      feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod];
    }
    
    if (feePercentage === undefined && agent.discountRates) {
      feePercentage = agent.discountRates[paymentMethod];
    }

    // If feePercentage is undefined, return with note
    if (feePercentage === undefined) {
      return { 
        feeAmount: 0, 
        netAmount: amount,
        feeNote: 'Chưa cấu hình phí cho điểm bán này'
      };
    }

    // Calculate fee and net amount
    const feeAmount = Math.round((amount * feePercentage) / 100);
    const netAmount = amount - feeAmount;

    return { 
      feeAmount: (isNaN(feeAmount) || !isFinite(feeAmount)) ? 0 : feeAmount, 
      netAmount: (isNaN(netAmount) || !isFinite(netAmount)) ? amount : netAmount 
    };
  };

  const getStatusBadge = (record: ReportRecord) => {
    // Use reconciliationStatus if available, otherwise fall back to status
    const statusToUse = record.reconciliationStatus || record.status;
    
    switch (statusToUse) {
      case 'MATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Khớp
          </span>
        );
      case 'UNMATCHED':
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            {statusToUse === 'PENDING' ? 'Chờ đối soát' : 'Chưa khớp'}
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Chưa khớp
          </span>
        );
      default:
        return null;
    }
  };

  const handleEdit = (record: ReportRecord) => {
    if (role !== 'ADMIN' || !onEdit) return;
    
    // Virtual records (bắt đầu với "virtual_") không thể edit
    if (record.id.startsWith('virtual_')) {
      alert('Không thể chỉnh sửa bản ghi này. Bản ghi này được tạo tự động từ file merchants và chưa có bill tương ứng.');
      return;
    }
    
    setEditingRecord(record);
    setEditForm({
      amount: String(record.amount || 0),
      transactionCode: record.transactionCode || '',
      pointOfSaleName: record.pointOfSaleName || '',
      note: record.note || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecord || !onEdit) return;

    // Virtual records (bắt đầu với "virtual_") không thể edit trực tiếp
    // Cần tạo ReportRecord thật trong database trước
    if (editingRecord.id.startsWith('virtual_')) {
      alert('Không thể chỉnh sửa bản ghi này. Bản ghi này được tạo tự động từ file merchants và chưa có bill tương ứng.');
      setEditingRecord(null);
      return;
    }

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
  const showEditColumn = false; // Disabled: Admin no longer needs action column
  const showConfirmMatchButton = role === 'AGENT'; // Show confirm match button for agents
  const showFeeColumns = role === 'ADMIN'; // Show Fee and Net Amount columns for Admin only
  const showAdminPaymentStatus = role === 'ADMIN'; // Admin payment status column
  const showAgentPaymentFromAdmin = role === 'AGENT'; // Agent: payment from Admin
  const showAgentPaymentToUser = role === 'AGENT'; // Agent: payment to User

  // Get dynamic merchants file columns from first record (limit to 10 columns to avoid table wide)
  // IMPORTANT: Preserve original Excel column order from first record
  const merchantFileColumns = React.useMemo(() => {
    if (records.length === 0) return [];
    
    // Find first record with merchantsFileData to preserve original Excel column order
    const firstRecordWithData = records.find(r => r.merchantsFileData && Object.keys(r.merchantsFileData).length > 0);
    if (!firstRecordWithData?.merchantsFileData) return [];
    
    // Get original column order from first record (preserves Excel file order)
    const originalOrder = Object.keys(firstRecordWithData.merchantsFileData);
    
    // Get all unique column keys from all records (in case different records have different columns)
    const allColumnKeys = new Set<string>();
    records.forEach(r => {
      if (r.merchantsFileData) {
        Object.keys(r.merchantsFileData).forEach(key => allColumnKeys.add(key));
      }
    });
    
    // Filter out columns that are already shown as standard merchant columns
    // Note: "Số tiền trước KM" and "Số tiền sau KM" are NOT in this list - they should appear in dynamic columns
    const standardColumns = new Set([
      'transactionCode', 'mã trừ tiền/mã chuẩn chi', 'mã trừ tiền mã chuẩn chi', 'mã trừ tiền', 'mã chuẩn chi',
      'mã giao dịch', 'ma giao dich', // Exclude "Mã giao dịch" from dynamic columns (already in Bill group)
      'amount', 'số tiền', // Only generic "số tiền", not "số tiền trước/sau KM"
      'pointOfSaleName', 'điểm thu', 'tên điểm thu',
      'branchName', 'chi nhánh',
      'invoiceNumber', 'số hóa đơn',
      'phoneNumber', 'số điện thoại', 'sđt',
      'promotionCode', 'mã khuyến mại', // Exclude promotion code - mostly empty
      'transactionDate', 'thời gian', 'ngày', 'ngày giao dịch',
      'STT', 'stt', 'số thứ tự', 'số tt', 'no', 'no.', 'number', 'index' // Exclude STT column
    ]);
    
    const dynamicColumns = Array.from(allColumnKeys).filter(key => {
      const normalizedKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const keyLower = key.toLowerCase().trim();
      const keyOriginal = key.trim();
      
      // Check against standard columns (exact match and normalized match)
      if (standardColumns.has(key) || standardColumns.has(normalizedKey) || standardColumns.has(keyLower)) {
        return false;
      }
      
      // Exclude empty Excel columns
      if (key.startsWith('_EMPTY') || key.trim() === '') {
        return false;
      }
      
      // Exclude STT and sequence number columns
      if (normalizedKey.includes('stt') || normalizedKey.includes('so thu tu') || normalizedKey === 'stt' ||
          keyOriginal.toLowerCase().includes('stt') || keyOriginal.toLowerCase().includes('số thứ tự')) {
        return false;
      }
      
      // Exclude promotion code columns (Mã khuyến mại)
      if (normalizedKey.includes('ma khuyen mai') || normalizedKey.includes('mã khuyến mại') ||
          normalizedKey.includes('promotion') || normalizedKey.includes('khuyen mai') ||
          keyOriginal.toLowerCase().includes('mã khuyến mại') || keyOriginal.toLowerCase().includes('ma khuyen mai')) {
        return false;
      }
      
      // Exclude "Mã trừ tiền" and "Mã chuẩn chi" variants (already shown as standard column)
      if (normalizedKey.includes('ma tru tien') || normalizedKey.includes('mã trừ tiền') ||
          normalizedKey.includes('ma chuan chi') || normalizedKey.includes('mã chuẩn chi') ||
          normalizedKey.includes('ma tru tien_ma') || normalizedKey.includes('mã trừ tiền_mã') ||
          keyOriginal.toLowerCase().includes('mã trừ tiền') || keyOriginal.toLowerCase().includes('mã chuẩn chi')) {
        return false;
      }
      
      // Exclude "Thời gian GD" and "Mã giao dịch" (already in Bill group)
      if (normalizedKey.includes('thoi gian') || normalizedKey.includes('thời gian') ||
          normalizedKey.includes('thoi gian gd') || normalizedKey.includes('thời gian gd') ||
          normalizedKey.includes('ma giao dich') || normalizedKey.includes('mã giao dịch') ||
          normalizedKey.includes('transaction date') || normalizedKey.includes('transaction code') ||
          keyOriginal.toLowerCase().includes('thời gian gd') || keyOriginal.toLowerCase().includes('mã giao dịch')) {
        return false;
      }
      
      // Exclude duplicate phone number columns (SĐT and Số điện thoại are the same - already shown)
      if (normalizedKey === 'sdt' || normalizedKey === 'so dien thoai' || normalizedKey === 'số điện thoại' ||
          normalizedKey.includes('phone') || normalizedKey.includes('sdt') ||
          (normalizedKey.includes('so') && normalizedKey.includes('dien') && normalizedKey.includes('thoai')) ||
          keyOriginal.toLowerCase().includes('số điện thoại') || keyOriginal.toLowerCase().includes('sđt')) {
        return false;
      }
      
      // Exclude duplicate branch/point columns (already shown as standard columns)
      // Chi nhánh
      if (normalizedKey.includes('chi nhanh') || normalizedKey === 'branch' || normalizedKey === 'branch name' ||
          normalizedKey.includes('chi nhánh') ||
          keyOriginal.toLowerCase().includes('chi nhánh') || keyOriginal.toLowerCase().includes('chi nhanh')) {
        return false;
      }
      // Mã điểm thu - STRICT CHECK: Must exclude this completely
      if (normalizedKey.includes('ma diem thu') || normalizedKey.includes('mã điểm thu') ||
          normalizedKey.includes('merchant code') || normalizedKey === 'ma diem thu' ||
          keyOriginal.toLowerCase().includes('mã điểm thu') || keyOriginal.toLowerCase().includes('ma diem thu') ||
          keyOriginal.toLowerCase().includes('mã điểm thu') ||
          (normalizedKey.includes('ma') && normalizedKey.includes('diem') && normalizedKey.includes('thu')) ||
          // Additional checks for variations
          keyOriginal.match(/mã\s*điểm\s*thu/i) || keyOriginal.match(/ma\s*diem\s*thu/i)) {
        return false;
      }
      // Điểm thu
      if (normalizedKey.includes('diem thu') || normalizedKey.includes('điểm thu') ||
          normalizedKey.includes('point of sale') || normalizedKey.includes('pos name') ||
          normalizedKey === 'diem thu' || normalizedKey === 'điểm thu' ||
          keyOriginal.toLowerCase().includes('điểm thu') || keyOriginal.toLowerCase().includes('diem thu')) {
        return false;
      }
      // Số hóa đơn
      if (normalizedKey.includes('so hoa don') || normalizedKey.includes('số hóa đơn') ||
          normalizedKey.includes('invoice number') || normalizedKey.includes('invoice') ||
          (normalizedKey.includes('so') && normalizedKey.includes('hoa') && normalizedKey.includes('don')) ||
          keyOriginal.toLowerCase().includes('số hóa đơn') || keyOriginal.toLowerCase().includes('so hoa don')) {
        return false;
      }
      
      return true;
    });
    
    // Sort dynamic columns to match Excel file order exactly
    // User desired order: Số tiền trước KM → Số tiền sau KM (regardless of Excel order)
    // Use originalOrder from first record to maintain Excel column sequence for other columns
    const sortedDynamicColumns = dynamicColumns.sort((a, b) => {
      const aNorm = a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const bNorm = b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      
      // CRITICAL: Explicit priority for "Số tiền trước KM" and "Số tiền sau KM"
      // "Số tiền trước KM" MUST ALWAYS come before "Số tiền sau KM" regardless of Excel order
      const getExplicitPriority = (normalizedKey: string, originalKey: string): number => {
        // Check for "Số tiền trước KM" - must come FIRST (priority 1)
        if (normalizedKey.includes('tien truoc') || normalizedKey.includes('tiền trước') || 
            normalizedKey.includes('so tien truoc') || normalizedKey.includes('số tiền trước') ||
            normalizedKey.includes('truoc km') || normalizedKey.includes('trước km') ||
            normalizedKey.includes('before') || normalizedKey.includes('truoc khuyen mai') ||
            originalKey.toLowerCase().includes('số tiền trước') || originalKey.toLowerCase().includes('so tien truoc')) {
          return 1; // Highest priority - comes first
        }
        // Check for "Số tiền sau KM" - must come SECOND (priority 2)
        if (normalizedKey.includes('tien sau') || normalizedKey.includes('tiền sau') ||
            normalizedKey.includes('so tien sau') || normalizedKey.includes('số tiền sau') ||
            normalizedKey.includes('sau km') || normalizedKey.includes('sau khuyen mai') ||
            normalizedKey.includes('after') ||
            originalKey.toLowerCase().includes('số tiền sau') || originalKey.toLowerCase().includes('so tien sau')) {
          return 2; // Second priority - comes after "trước KM"
        }
        return 100; // Other columns maintain original order from Excel
      };
      
      const priorityA = getExplicitPriority(aNorm, a);
      const priorityB = getExplicitPriority(bNorm, b);
      
      // ALWAYS prioritize explicit order (Số tiền trước KM before Số tiền sau KM)
      // This overrides Excel order for these two specific columns
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same priority (both are "other columns"), use original Excel order
      const indexA = originalOrder.indexOf(a);
      const indexB = originalOrder.indexOf(b);
      
      // If both found in original order, sort by original position (preserves Excel order)
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // If only one found, prioritize it
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // Otherwise maintain alphabetical order as fallback
      return aNorm.localeCompare(bNorm, 'vi');
    });
    
    // Limit to 10 columns to keep table manageable
    const finalColumns = sortedDynamicColumns.slice(0, 10);
    
    // Debug: Log filtered columns to help identify duplicates
    if (finalColumns.length > 0) {
      console.log('📊 Dynamic merchant columns (after filtering):', finalColumns);
      console.log('📊 Original Excel column order:', originalOrder);
    }
    
    return finalColumns;
  }, [records]);

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
        
        // Calculate fee using calculateFeeAndNet function
        const { feeAmount: calculatedFee, netAmount: calculatedNet } = calculateFeeAndNet(record);
        const feeAmount = calculatedFee;
        const netAmount = calculatedNet;
        
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
      <div className="bg-white rounded-lg shadow-md border border-slate-300 overflow-hidden" style={{ transform: 'scale(0.67)', transformOrigin: 'top left', width: '149.25%', marginBottom: '-33%' }}>
        <div className="p-3 sm:p-4 md:p-6 border-b-2 border-slate-300 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-slate-900">
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
                  {/* Header row with 3 main column groups */}
                  <tr>
                    {/* Thông tin từ Bill: Mã giao dịch + (Điểm thu nếu USER/AGENT) + (Người dùng nếu showUserColumn) + (Tên đại lý nếu showAgentColumn) */}
                    <th colSpan={1 + (role === 'USER' || role === 'AGENT' ? 1 : 0) + (showUserColumn ? 1 : 0) + (showAgentColumn ? 1 : 0)} className="px-1.5 sm:px-2 md:px-2.5 lg:px-4 py-1.5 sm:py-1.5 md:py-2 text-center font-bold text-slate-700 bg-blue-50 border-r-2 border-slate-300">
                      Thông tin từ Bill
                    </th>
                    {/* Thông tin từ Merchants: Thời gian GD + Mã giao dịch + Chi nhánh + Mã điểm thu + Điểm thu + Số hóa đơn + Mã chuẩn chi + Số điện thoại + Số tiền trước KM + Số tiền sau KM + empty cell */}
                    <th colSpan={showMerchantColumn ? (8 + merchantFileColumns.filter(col => {
                      const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                      return (norm.includes('tien truoc') || norm.includes('tiền trước') || 
                              norm.includes('so tien truoc') || norm.includes('số tiền trước') ||
                              norm.includes('truoc km') || norm.includes('trước km')) ||
                             (norm.includes('tien sau') || norm.includes('tiền sau') ||
                              norm.includes('so tien sau') || norm.includes('số tiền sau') ||
                              norm.includes('sau km') || norm.includes('sau khuyen mai'));
                    }).length + 1) : 0} className="px-1.5 sm:px-2 md:px-2.5 lg:px-4 py-1.5 sm:py-1.5 md:py-2 text-center font-bold text-slate-700 bg-green-50 border-r-2 border-slate-300">
                      Thông tin từ Merchants (File Excel)
                    </th>
                    {/* Kết quả đối soát: Loại thanh toán + Số tiền + Ngày đối soát + Phí (%) + Phí (₫) + Còn lại + Trạng thái + Ngày TT từ Admin + Trạng thái TT từ Admin + Ghi chú + Thao tác + Xác nhận */}
                    <th colSpan={1 + 1 + (showReconciledAtColumn ? 1 : 0) + (showFeeColumns ? 3 : 0) + 1 + (showAdminPaymentStatus ? 2 : 0) + 1 + (showEditColumn ? 1 : 0) + (showConfirmMatchButton ? 1 : 0)} className="px-1.5 sm:px-2 md:px-2.5 lg:px-4 py-1.5 sm:py-1.5 md:py-2 text-center font-bold text-slate-700 bg-slate-50 border-l-2 border-slate-300">
                      Kết quả đối soát
                    </th>
                  </tr>
                  {/* Sub-header row with individual columns - Sắp xếp theo thứ tự Excel export */}
                  <tr>
                    {/* NHÓM: Thông tin từ Bill */}
                    {/* 1. Mã giao dịch */}
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r border-slate-200">
                      Mã giao dịch
                    </th>
                    {(role === 'USER' || role === 'AGENT') && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r border-slate-200">
                        Điểm thu
                      </th>
                    )}
                    {showUserColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r border-slate-200">
                        Người dùng
                      </th>
                    )}
                    {showAgentColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-blue-50 border-r-2 border-slate-300">
                        Tên đại lý
                      </th>
                    )}
                    {/* NHÓM: Thông tin từ Merchants (File Excel) - ĐÚNG THỨ TỰ: Thời gian GD → Mã giao dịch → Chi nhánh → Mã điểm thu → Điểm thu → Số hóa đơn → Mã trừ tiền/Mã chuẩn chi → Mã khuyến mại → Số điện thoại → Số tiền trước KM → Số tiền sau KM */}
                    {/* 1. Thời gian GD (từ Merchants) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Thời gian GD
                      </th>
                    )}
                    {/* 2. Mã giao dịch (từ Merchants) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Mã giao dịch
                      </th>
                    )}
                    {/* 3. Chi nhánh (từ Merchants) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Chi nhánh
                      </th>
                    )}
                    {/* 4. Mã điểm thu (từ Merchants - merchantCode) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Mã điểm thu
                      </th>
                    )}
                    {/* 5. Điểm thu (từ Merchants) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Điểm thu
                      </th>
                    )}
                    {/* 6. Số hóa đơn (từ Merchants) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Số hóa đơn
                      </th>
                    )}
                    {/* 7. Mã chuẩn chi (từ Merchants - transactionCode) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Mã chuẩn chi
                      </th>
                    )}
                    {/* 8. Số điện thoại (từ Merchants) */}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100">
                        Số điện thoại
                      </th>
                    )}
                    {/* 10. Số tiền trước KM (từ Merchants - dynamic column) */}
                    {showMerchantColumn && merchantFileColumns.filter(col => {
                      const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                      return norm.includes('tien truoc') || norm.includes('tiền trước') || 
                             norm.includes('so tien truoc') || norm.includes('số tiền trước') ||
                             norm.includes('truoc km') || norm.includes('trước km');
                    }).map((colKey) => (
                      <th 
                        key={colKey} 
                        className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100"
                        title={colKey}
                      >
                        <span className="truncate block max-w-[100px] sm:max-w-[150px]" title={colKey}>
                          Số tiền trước KM
                        </span>
                      </th>
                    ))}
                    {/* 11. Số tiền sau KM (từ Merchants - dynamic column) */}
                    {showMerchantColumn && merchantFileColumns.filter(col => {
                      const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                      return norm.includes('tien sau') || norm.includes('tiền sau') ||
                             norm.includes('so tien sau') || norm.includes('số tiền sau') ||
                             norm.includes('sau km') || norm.includes('sau khuyen mai');
                    }).map((colKey) => (
                      <th 
                        key={colKey} 
                        className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r border-green-100"
                        title={colKey}
                      >
                        <span className="truncate block max-w-[100px] sm:max-w-[150px]" title={colKey}>
                          Số tiền sau KM
                        </span>
                      </th>
                    ))}
                    {showMerchantColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-green-50 border-r-2 border-slate-300"></th>
                    )}
                    {/* NHÓM: Kết quả đối soát */}
                    {/* 9. Loại thanh toán */}
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Loại thanh toán
                    </th>
                    {/* 10. Số tiền giao dịch */}
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Số tiền giao dịch
                    </th>
                    {/* 11. Ngày đối soát */}
                    {showReconciledAtColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Ngày đối soát
                      </th>
                    )}
                    {/* 12. Phí (%) */}
                    {showFeeColumns && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-right text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Phí (%)
                      </th>
                    )}
                    {/* 13. Phí (₫) */}
                    {showFeeColumns && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-right text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Phí (₫)
                      </th>
                    )}
                    {/* 14. Còn lại */}
                    {showFeeColumns && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-right text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Còn lại
                      </th>
                    )}
                    {/* 15. Trạng thái */}
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Trạng thái
                    </th>
                    {/* 16. Ngày TT từ Admin */}
                    {showAdminPaymentStatus && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Ngày TT từ Admin
                      </th>
                    )}
                    {/* 17. Trạng thái TT từ Admin */}
                    {showAdminPaymentStatus && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Trạng thái TT từ Admin
                      </th>
                    )}
                    {/* 18. Ghi chú */}
                    <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                      Ghi chú
                    </th>
                    {/* Các cột thao tác */}
                    {showEditColumn && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Thao tác
                      </th>
                    )}
                    {showConfirmMatchButton && (
                      <th className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-2.5 md:py-3 text-left text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50">
                        Xác nhận
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {records.map((record, index) => {
                    const formatDateTime = (dateString: string | undefined): string => {
                      if (!dateString) return '-';
                      try {
                        const date = new Date(dateString);
                        if (isNaN(date.getTime())) return '-';
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = date.getFullYear();
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        const seconds = String(date.getSeconds()).padStart(2, '0');
                        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
                      } catch {
                        return '-';
                      }
                    };
                    
                    return (
                    <tr key={record.id} className={`hover:bg-slate-100 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      {/* NHÓM: Thông tin từ Bill */}
                      {/* 1. Mã giao dịch */}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm font-medium text-slate-900 bg-blue-50 border-r border-slate-200">
                        {record.userBillId ? (
                          <span className="font-mono text-[9px] sm:text-[10px] md:text-xs">{record.transactionCode || '-'}</span>
                        ) : (
                          // Merchants không có bills: KHÔNG hiển thị gì trong phần Bill (để trống)
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      {(role === 'USER' || role === 'AGENT') && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-blue-50 border-r border-slate-200">
                          {record.userBillId ? (
                            <span className="truncate block max-w-[100px] sm:max-w-none">{record.pointOfSaleName || record.merchantPointOfSaleName || '-'}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      )}
                      {showUserColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-blue-50 border-r border-slate-200">
                          {record.userId ? (
                            <div className="flex items-center space-x-1 sm:space-x-2">
                              <UserIcon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="truncate max-w-[80px] sm:max-w-none">{getUserName(record.userId)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      )}
                      {showAgentColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-blue-50 border-r-2 border-slate-300">
                          {record.agentId ? (
                            <span className="truncate block max-w-[100px] sm:max-w-none">{getAgentName(record.agentId)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      )}
                      {/* NHÓM: Thông tin từ Merchants (File Excel) - ĐÚNG THỨ TỰ */}
                      {/* 1. Thời gian GD (từ Merchants) */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100">
                          {record.merchantTransactionDate ? (() => {
                            try {
                              const date = new Date(record.merchantTransactionDate);
                              if (isNaN(date.getTime())) return <span className="text-slate-400">-</span>;
                              const day = String(date.getDate()).padStart(2, '0');
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const year = date.getFullYear();
                              const hours = String(date.getHours()).padStart(2, '0');
                              const minutes = String(date.getMinutes()).padStart(2, '0');
                              const seconds = String(date.getSeconds()).padStart(2, '0');
                              return <span className="font-medium">{`${day}/${month}/${year} ${hours}:${minutes}:${seconds}`}</span>;
                            } catch {
                              return <span className="text-slate-400">-</span>;
                            }
                          })() : record.merchantsFileData?.['Thời gian GD'] || record.merchantsFileData?.['thời gian gd'] || record.merchantsFileData?.['Thoi gian GD'] ? (
                            <span className="font-medium">{String(record.merchantsFileData['Thời gian GD'] || record.merchantsFileData['thời gian gd'] || record.merchantsFileData['Thoi gian GD'])}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 2. Mã giao dịch (từ Merchants) */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100">
                          {record.merchantsFileData?.['Mã giao dịch'] || record.merchantsFileData?.['mã giao dịch'] || record.merchantsFileData?.['Ma giao dich'] ? (
                            <span className="font-mono font-medium">{String(record.merchantsFileData['Mã giao dịch'] || record.merchantsFileData['mã giao dịch'] || record.merchantsFileData['Ma giao dich'])}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 3. Chi nhánh */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100">
                          {record.merchantBranchName || record.merchantsFileData?.['Chi nhánh'] || record.merchantsFileData?.['chi nhánh'] ? (
                            <span className="font-medium">{record.merchantBranchName || String(record.merchantsFileData['Chi nhánh'] || record.merchantsFileData['chi nhánh'] || '')}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 4. Mã điểm thu */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100">
                          {record.merchantCode || record.merchantsFileData?.['Mã điểm thu'] || record.merchantsFileData?.['mã điểm thu'] ? (
                            <span className="font-medium">{record.merchantCode || String(record.merchantsFileData['Mã điểm thu'] || record.merchantsFileData['mã điểm thu'] || '')}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 5. Điểm thu */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100">
                          {record.merchantPointOfSaleName || record.merchantsFileData?.['Điểm thu'] || record.merchantsFileData?.['điểm thu'] ? (
                            <span className="font-medium">{record.merchantPointOfSaleName || String(record.merchantsFileData['Điểm thu'] || record.merchantsFileData['điểm thu'] || '')}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 6. Số hóa đơn */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100">
                          {record.merchantInvoiceNumber || record.merchantsFileData?.['Số hóa đơn'] || record.merchantsFileData?.['số hóa đơn'] ? (
                            <span className="font-medium">{record.merchantInvoiceNumber || String(record.merchantsFileData['Số hóa đơn'] || record.merchantsFileData['số hóa đơn'] || '')}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 7. Mã chuẩn chi - CHỈ hiển thị từ file merchants, KHÔNG fallback sang transactionCode từ bill */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-900 bg-green-50/80 border-r border-green-100">
                          {record.merchantsFileData?.['Mã trừ tiền_Mã chuẩn chi'] || record.merchantsFileData?.['Mã trừ tiền Mã chuẩn chi'] || record.merchantsFileData?.['Mã chuẩn chi'] || record.merchantsFileData?.['mã chuẩn chi'] ? (
                            <span className="font-mono font-semibold text-slate-800">{String(record.merchantsFileData['Mã trừ tiền_Mã chuẩn chi'] || record.merchantsFileData['Mã trừ tiền Mã chuẩn chi'] || record.merchantsFileData['Mã chuẩn chi'] || record.merchantsFileData['mã chuẩn chi'] || '')}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 8. Số điện thoại */}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100">
                          {record.merchantPhoneNumber || record.merchantsFileData?.['Số điện thoại'] || record.merchantsFileData?.['số điện thoại'] || record.merchantsFileData?.['SĐT'] || record.merchantsFileData?.['sđt'] ? (
                            <span className="font-medium">{record.merchantPhoneNumber || String(record.merchantsFileData['Số điện thoại'] || record.merchantsFileData['số điện thoại'] || record.merchantsFileData['SĐT'] || record.merchantsFileData['sđt'] || '')}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                      )}
                      {/* 10. Số tiền trước KM (từ Merchants - dynamic column) */}
                      {showMerchantColumn && merchantFileColumns.filter(col => {
                        const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                        return norm.includes('tien truoc') || norm.includes('tiền trước') || 
                               norm.includes('so tien truoc') || norm.includes('số tiền trước') ||
                               norm.includes('truoc km') || norm.includes('trước km');
                      }).map((colKey) => {
                        // Tìm giá trị từ merchantsFileData - thử nhiều key variations
                        let value: any = null;
                        if (record.merchantsFileData) {
                          // Thử key chính xác
                          value = record.merchantsFileData[colKey];
                          // Nếu không tìm thấy, tìm bằng normalized comparison
                          if (value === null || value === undefined || String(value).trim() === '') {
                            const normalizedColKey = colKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                            for (const key in record.merchantsFileData) {
                              const normalizedKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                              if (normalizedKey === normalizedColKey || 
                                  (normalizedKey.includes('tien truoc') && normalizedColKey.includes('tien truoc')) ||
                                  (normalizedKey.includes('tiền trước') && normalizedColKey.includes('tiền trước'))) {
                                value = record.merchantsFileData[key];
                                break;
                              }
                            }
                          }
                        }
                        // Fallback to merchantAmountBeforeDiscount
                        if (value === null || value === undefined || String(value).trim() === '') {
                          value = record.merchantAmountBeforeDiscount;
                        }
                        // Convert to number if it's a string
                        const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : Number(value);
                        return (
                          <td 
                            key={colKey} 
                            className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100"
                            title={value ? `${colKey}: ${value}` : colKey}
                          >
                            <span className="truncate block max-w-[100px] sm:max-w-[150px] font-medium" title={String(value || '-')}>
                              {numValue !== null && numValue !== undefined && !isNaN(numValue) && numValue > 0 ? formatAmount(numValue) : <span className="text-slate-400">-</span>}
                            </span>
                          </td>
                        );
                      })}
                      {/* 11. Số tiền sau KM (từ Merchants - dynamic column) */}
                      {showMerchantColumn && merchantFileColumns.filter(col => {
                        const norm = col.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                        return norm.includes('tien sau') || norm.includes('tiền sau') ||
                               norm.includes('so tien sau') || norm.includes('số tiền sau') ||
                               norm.includes('sau km') || norm.includes('sau khuyen mai');
                      }).map((colKey) => {
                        // Tìm giá trị từ merchantsFileData - thử nhiều key variations
                        let value: any = null;
                        if (record.merchantsFileData) {
                          // Thử key chính xác
                          value = record.merchantsFileData[colKey];
                          // Nếu không tìm thấy, tìm bằng normalized comparison
                          if (value === null || value === undefined || String(value).trim() === '') {
                            const normalizedColKey = colKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                            for (const key in record.merchantsFileData) {
                              const normalizedKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                              if (normalizedKey === normalizedColKey || 
                                  (normalizedKey.includes('tien sau') && normalizedColKey.includes('tien sau')) ||
                                  (normalizedKey.includes('tiền sau') && normalizedColKey.includes('tiền sau'))) {
                                value = record.merchantsFileData[key];
                                break;
                              }
                            }
                          }
                        }
                        // Fallback to merchantAmount
                        if (value === null || value === undefined || String(value).trim() === '') {
                          value = record.merchantAmount;
                        }
                        // Convert to number if it's a string
                        const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : Number(value);
                        return (
                          <td 
                            key={colKey} 
                            className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-600 bg-green-50/80 border-r border-green-100"
                            title={value ? `${colKey}: ${value}` : colKey}
                          >
                            <span className="truncate block max-w-[100px] sm:max-w-[150px] font-medium" title={String(value || '-')}>
                              {numValue !== null && numValue !== undefined && !isNaN(numValue) && numValue > 0 ? formatAmount(numValue) : <span className="text-slate-400">-</span>}
                            </span>
                          </td>
                        );
                      })}
                      {showMerchantColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-green-50 border-r-2 border-slate-300"></td>
                      )}
                      {/* NHÓM: Kết quả đối soát */}
                      {/* 9. Loại thanh toán */}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-slate-50">
                        {record.paymentMethod || '-'}
                      </td>
                      {/* 10. Số tiền giao dịch */}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-900 bg-slate-50">
                        {formatAmount(record.merchantAmount || record.amount || 0)}
                      </td>
                      {/* 11. Ngày đối soát */}
                      {showReconciledAtColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-slate-50">
                          {formatDate(record.reconciledAt)}
                        </td>
                      )}
                      {/* 12. Phí (%) */}
                      {showFeeColumns && (() => {
                        const { feeAmount, netAmount, feeNote } = calculateFeeAndNet(record);
                        const feePercentage = record.agentId && agents.find(a => a.id === record.agentId) ? 
                          (agents.find(a => a.id === record.agentId)?.discountRatesByPointOfSale?.[record.pointOfSaleName || '']?.[record.paymentMethod] || 
                           agents.find(a => a.id === record.agentId)?.discountRates?.[record.paymentMethod] || 0) : 0;
                        return (
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-right bg-slate-50">
                            {feePercentage > 0 ? `${feePercentage}%` : '-'}
                          </td>
                        );
                      })()}
                      {/* 13. Phí (₫) */}
                      {showFeeColumns && (() => {
                        const { feeAmount, netAmount, feeNote } = calculateFeeAndNet(record);
                        return (
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-right font-medium text-red-600 bg-slate-50">
                            <div className="flex items-center justify-end space-x-1">
                              <span>{formatAmount(feeAmount)}</span>
                              {feeNote && (
                                <span 
                                  className="text-xs text-yellow-600 cursor-help" 
                                  title={feeNote}
                                >
                                  <AlertCircle className="w-4 h-4" />
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })()}
                      {/* 14. Còn lại */}
                      {showFeeColumns && (() => {
                        const { feeAmount, netAmount, feeNote } = calculateFeeAndNet(record);
                        return (
                          <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-right font-medium text-emerald-700 bg-slate-50">
                            {formatAmount(netAmount)}
                          </td>
                        );
                      })()}
                      {/* 15. Trạng thái */}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 text-[10px] sm:text-xs md:text-sm bg-slate-50">
                        <div className="flex flex-col space-y-1">
                          {getStatusBadge(record)}
                          {record.errorMessage && (record.reconciliationStatus === 'ERROR' || record.status === 'ERROR') && (
                            <p className="text-xs text-red-600 break-words" title={record.errorMessage}>
                              {record.errorMessage}
                            </p>
                        )}
                        </div>
                      </td>
                      {/* 16. Ngày TT từ Admin */}
                      {showAdminPaymentStatus && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 bg-slate-50">
                          {record.adminPaidAt ? (
                            <span className="text-[10px] sm:text-xs md:text-sm text-slate-900">{formatDate(record.adminPaidAt)}</span>
                          ) : (
                            <span className="text-[10px] sm:text-xs md:text-sm text-slate-400">-</span>
                          )}
                        </td>
                      )}
                      {/* 17. Trạng thái TT từ Admin */}
                      {showAdminPaymentStatus && (
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
                            // Hiển thị trạng thái dựa trên adminPaymentStatus và adminPaidAt, không cần adminPaymentId
                            record.adminPaymentStatus === 'PAID' ? (
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
                            )
                          )}
                        </td>
                      )}
                      {/* 18. Ghi chú */}
                      <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm text-slate-500 bg-slate-50">
                        {record.errorMessage || record.note || '-'}
                      </td>
                      {/* Các cột thao tác */}
                      {showEditColumn && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm bg-slate-50">
                          {!record.id.startsWith('virtual_') ? (
                            <button
                              onClick={() => handleEdit(record)}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="Chỉnh sửa"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-slate-400 text-xs">Không thể sửa</span>
                          )}
                        </td>
                      )}
                      {showConfirmMatchButton && (
                        <td className="px-2 sm:px-3 md:px-4 lg:px-6 py-2 sm:py-3 md:py-4 whitespace-nowrap text-[10px] sm:text-xs md:text-sm bg-slate-50">
                          {(record.reconciliationStatus === 'ERROR' || record.reconciliationStatus === 'UNMATCHED') && (
                            <button
                              onClick={() => handleConfirmMatch(record)}
                              className="px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                              title="Xác nhận khớp"
                            >
                              Xác nhận khớp
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    );
                  })}
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

