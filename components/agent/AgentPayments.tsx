import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, CheckCircle, AlertCircle, Save, ChevronDown, ChevronUp, X, Search, Calendar, FileText, Clock, QrCode, Image as ImageIcon } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import { ReportService } from '../../src/lib/reportServices';
import { ref, push, update, get } from 'firebase/database';
import { database } from '../../src/lib/firebase';
import type { UserBill, AgentPaymentToUser, ReportRecord, User, AgentPaymentStatus } from '../../types';
import Pagination from '../Pagination';
import { cleanupExpiredBillImages, getBillImageUrl, isBillImageExpired } from '../../src/utils/billImageUtils';

const AgentPayments: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;
  const agentCode = agentAuth ? JSON.parse(agentAuth).agentCode : null;

  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  // XÓA: Không cần agentPaymentsData nữa vì chỉ dùng user_bills.agentPaymentStatus
  const users = FirebaseUtils.objectToArray(usersData || {});
  
  // TRUY VẤN TRỰC TIẾP TỪ BẢNG BÁO CÁO: Load ReportRecords từ getAllReportRecordsWithMerchants
  const [reportRecordsFromDB, setReportRecordsFromDB] = useState<ReportRecord[]>([]);
  
  useEffect(() => {
    const loadReportRecords = async () => {
      if (!agentId || !agentCode) return;
      
      try {
        console.log(`📊 [AgentPayments] Querying report records from database (getAllReportRecordsWithMerchants) for agent ${agentCode}...`);
        const result = await ReportService.getAllReportRecordsWithMerchants({
          agentCode,
          agentId,
          dateFrom: undefined,
          dateTo: undefined,
          status: undefined,
          userId: undefined,
          pointOfSaleName: undefined
        }, {
          limit: 10000
        });
        
        console.log(`📊 [AgentPayments] Got ${result.records.length} report records from getAllReportRecordsWithMerchants`);
        
        // Debug: Log sample ReportRecords
        if (result.records.length > 0) {
          console.log(`📊 [AgentPayments] Sample ReportRecords:`, result.records.slice(0, 5).map((r: ReportRecord) => ({
            id: r.id,
            userBillId: r.userBillId,
            transactionCode: r.transactionCode,
            agentCode: r.agentCode,
            agentId: r.agentId,
            merchantTransactionId: r.merchantTransactionId,
            merchantAmount: r.merchantAmount,
            hasMerchantsFileData: !!(r.merchantsFileData && Object.keys(r.merchantsFileData).length > 0),
            reconciliationStatus: r.reconciliationStatus || r.status
          })));
        }
        
        setReportRecordsFromDB(result.records);
      } catch (error) {
        console.error('[AgentPayments] Error loading report records:', error);
      }
    };
    
    loadReportRecords();
  }, [agentId, agentCode]);
  
  const [activeTab, setActiveTab] = useState<'unpaid' | 'batches'>('unpaid');
  
  // Tab 1: Chưa thanh toán
  const [unpaidReports, setUnpaidReports] = useState<ReportRecord[]>([]);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [previewBillImage, setPreviewBillImage] = useState<string | null>(null);
  
  // Edit state
  const [editingRecord, setEditingRecord] = useState<ReportRecord | null>(null);
  const [editForm, setEditForm] = useState({
    transactionCode: '',
    transactionDate: '',
    amount: '',
    paymentMethod: '',
    pointOfSaleName: ''
  });
  
  // Filters for unpaid tab
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Tab 2: Đợt chi trả
  const [paymentBatches, setPaymentBatches] = useState<AgentPaymentToUser[]>([]);
  const [batchesPage, setBatchesPage] = useState(1);
  const [batchesItemsPerPage, setBatchesItemsPerPage] = useState<number>(10);
  const [batchesDateFrom, setBatchesDateFrom] = useState<string>('');
  const [batchesDateTo, setBatchesDateTo] = useState<string>('');
  const [batchesSearchTerm, setBatchesSearchTerm] = useState<string>('');
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  const [note, setNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ qrCode: string; userName: string; totalAmount: number } | null>(null);

  // Load matched user_bills that haven't been paid by agent
  useEffect(() => {
    const loadUnpaidBills = async () => {
      if (!agentId || !agentCode) return;
      
      try {
        // Auto-cleanup expired bill images (only for agent's bills)
        const allBills = FirebaseUtils.objectToArray(billsData || {});
        const agentBills = allBills.filter((bill: UserBill) => bill.agentId === agentId || bill.agentCode === agentCode);
        console.log(`📊 Agent ${agentCode} (${agentId}): Found ${agentBills.length} bills out of ${allBills.length} total bills`);
        
        if (agentBills.length > 0) {
          await cleanupExpiredBillImages(agentBills);
        }
        
        // TRUY VẤN TRỰC TIẾP TỪ BẢNG BÁO CÁO: Dùng reportRecordsFromDB đã load từ getAllReportRecordsWithMerchants
        // Tạo maps: userBillId -> ReportRecord và transactionCode -> ReportRecord
        const reportsByBillId = new Map<string, ReportRecord>();
        const reportsByTransactionCode = new Map<string, ReportRecord>();
        
        reportRecordsFromDB.forEach((report: ReportRecord) => {
          // Map bằng userBillId (nếu có)
          if (report.userBillId) {
            reportsByBillId.set(report.userBillId, report);
          }
          // Map bằng transactionCode
          if (report.transactionCode) {
            const code = String(report.transactionCode).trim();
            if (code) {
              // Ưu tiên record có userBillId hoặc merchantTransactionId
              const existing = reportsByTransactionCode.get(code);
              if (!existing || report.userBillId || report.merchantTransactionId) {
                reportsByTransactionCode.set(code, report);
              }
            }
          }
        });
        
        console.log(`📊 [AgentPayments] Mapped ${reportsByBillId.size} by billId, ${reportsByTransactionCode.size} by transactionCode from getAllReportRecordsWithMerchants`);
        
        // Debug: Log sample bills
        if (agentBills.length > 0) {
          console.log(`📊 [AgentPayments] Sample bills for agent ${agentCode}:`, agentBills.slice(0, 3).map((b: UserBill) => ({
            id: b.id,
            transactionCode: b.transactionCode,
            agentCode: b.agentCode,
            agentId: b.agentId,
            amount: b.amount
          })));
        }
        
        // ĐƠN GIẢN HÓA: Chỉ check agentPaymentStatus trong user_bills
        const unpaidBills = agentBills.filter((bill: UserBill) => {
          // Chưa thanh toán nếu: không có agentPaymentStatus hoặc agentPaymentStatus !== 'PAID'
          return !bill.agentPaymentStatus || bill.agentPaymentStatus !== 'PAID';
        });
        console.log(`📊 Found ${unpaidBills.length} unpaid bills for agent ${agentCode}`);
        
        // Create ReportRecord array: TRUY VẤN TRỰC TIẾP bằng transactionCode
        const reports: ReportRecord[] = unpaidBills.map((bill: UserBill) => {
          // TRUY VẤN TRỰC TIẾP: Tìm bằng transactionCode trước (vì đây là key chính để match)
          let existingReport: ReportRecord | undefined;
          
          if (bill.transactionCode) {
            const code = String(bill.transactionCode).trim();
            if (code) {
              // Tìm trực tiếp trong map
              existingReport = reportsByTransactionCode.get(code);
              
              if (existingReport) {
                console.log(`✅ [AgentPayments] Found ReportRecord ${existingReport.id} for bill ${bill.id} by transactionCode: ${code}`, {
                  hasMerchantAmount: !!existingReport.merchantAmount,
                  merchantAmount: existingReport.merchantAmount,
                  hasMerchantsFileData: !!(existingReport.merchantsFileData && Object.keys(existingReport.merchantsFileData).length > 0),
                  merchantTransactionId: existingReport.merchantTransactionId,
                  reconciliationStatus: existingReport.reconciliationStatus || existingReport.status
                });
              } else {
                // Nếu không tìm thấy bằng transactionCode, thử tìm bằng userBillId
                existingReport = reportsByBillId.get(bill.id);
                if (existingReport) {
                  console.log(`✅ [AgentPayments] Found ReportRecord ${existingReport.id} for bill ${bill.id} by userBillId (transactionCode: ${code})`);
                } else {
                  console.log(`❌ [AgentPayments] No ReportRecord found for bill ${bill.id} with transactionCode: ${code}`);
                  // Debug: Kiểm tra xem có ReportRecord nào có transactionCode tương tự không
                  const similarCodes = Array.from(reportsByTransactionCode.keys()).filter(k => k.includes(code) || code.includes(k));
                  if (similarCodes.length > 0) {
                    console.log(`⚠️ [AgentPayments] Found similar transactionCodes:`, similarCodes);
                  }
                }
              }
            }
          }
          
          // Nếu vẫn không tìm thấy, thử tìm bằng userBillId
          if (!existingReport) {
            existingReport = reportsByBillId.get(bill.id);
            if (existingReport) {
              console.log(`✅ [AgentPayments] Found ReportRecord ${existingReport.id} for bill ${bill.id} by userBillId`);
            }
          }
          
          // Nếu tìm thấy ReportRecord → return với merchant data
          if (existingReport) {
            // Đảm bảo userBillId được set đúng
            if (!existingReport.userBillId || existingReport.userBillId !== bill.id) {
              return {
                ...existingReport,
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
                invoiceNumber: bill.invoiceNumber
              };
            }
            return existingReport;
          }
          
          // Không tìm thấy ReportRecord → tạo từ bill (chưa có merchant data)
          return {
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
            status: (bill.status as ReportRecord['status']) || 'UNMATCHED',
            reconciliationStatus: 'UNMATCHED',
            reconciledAt: bill.createdAt,
            reconciledBy: 'ADMIN',
            createdAt: bill.createdAt,
            merchantAmount: undefined,
            merchantTransactionId: undefined,
            merchantsFileData: undefined
          };
        });
        
        console.log(`📊 Setting ${reports.length} unpaid reports for agent ${agentCode}`);
        setUnpaidReports(reports);
      } catch (error) {
        console.error('Error loading unpaid bills:', error);
      }
    };
    
    loadUnpaidBills();
  }, [agentId, agentCode, billsData, reportRecordsFromDB]);

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

  // Load paid bills (for "Đợt chi trả" tab) - Group by batch ID (giờ + ngày/tháng/năm)
  useEffect(() => {
    const loadBatches = () => {
      if (!agentId) return;
      
      const allBills = FirebaseUtils.objectToArray(billsData || {});
      const agentBills = allBills.filter((bill: UserBill) => 
        bill.agentId === agentId && bill.agentPaymentStatus === 'PAID'
      );
      
      // Group by batch ID (giờ + ngày/tháng/năm)
      const batchesByTime: Record<string, UserBill[]> = {};
      agentBills.forEach((bill: UserBill) => {
        if (!bill.agentPaidAt) return;
        const batchId = generateBatchId(bill.agentPaidAt);
        if (!batchesByTime[batchId]) {
          batchesByTime[batchId] = [];
        }
        batchesByTime[batchId].push(bill);
      });
      
      // Convert to AgentPaymentToUser format, grouped by batch
      const batches: AgentPaymentToUser[] = Object.entries(batchesByTime).map(([batchId, bills]) => {
        const firstBill = bills[0];
        const totalAmount = bills.reduce((sum, b) => sum + (b.amount || 0), 0);
        const totalFee = 0; // Fee calculation would need to be added if needed
        const netAmount = totalAmount - totalFee;
        
        return {
          id: batchId, // Use batch ID as the ID
          agentId: firstBill.agentId,
          userId: firstBill.userId, // For single-user batches, or could be 'multiple'
          billIds: bills.map(b => b.id),
          totalAmount,
          feeAmount: totalFee,
          netAmount,
          status: 'PAID' as AgentPaymentStatus,
          note: firstBill.agentPaidNote || '',
          createdAt: firstBill.agentPaidAt || firstBill.createdAt,
          paidAt: firstBill.agentPaidAt,
          approvalCode: batchId // Use batch ID as approval code
        };
      });
      
      // Sort by paidAt descending
      batches.sort((a, b) => {
        const dateA = new Date(a.paidAt || 0).getTime();
        const dateB = new Date(b.paidAt || 0).getTime();
        return dateB - dateA;
      });
      
      setPaymentBatches(batches);
    };
    
    loadBatches();
  }, [agentId, billsData]);

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

  // Calculate totals for each user group (bill amount and merchant amount)
  const userTotals = useMemo(() => {
    const totals: Record<string, { billAmount: number; merchantAmount: number }> = {};
    Object.entries(reportsByUser).forEach(([userId, group]) => {
      let sumBillAmount = 0;
      let sumMerchantAmount = 0;
      
      group.reports.forEach(report => {
        // Bill amount (always from report.amount which is from bill)
        sumBillAmount += report.amount || 0;
        
        // Merchant amount (from report.merchantAmount if available)
        if (report.merchantAmount !== undefined && report.merchantAmount !== null) {
          sumMerchantAmount += report.merchantAmount;
        }
      });
      
      totals[userId] = { billAmount: sumBillAmount, merchantAmount: sumMerchantAmount };
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

      // ĐƠN GIẢN HÓA: Chỉ update user_bills với agentPaymentStatus = 'PAID'
      const updates: any = {};
      selectedReportsList.forEach(report => {
        if (report.userBillId) {
          updates[`user_bills/${report.userBillId}/agentPaymentStatus`] = 'PAID';
          updates[`user_bills/${report.userBillId}/agentPaidAt`] = FirebaseUtils.getServerTimestamp();
          if (note) {
            updates[`user_bills/${report.userBillId}/agentPaidNote`] = note;
          }
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }

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

  // Edit handlers
  const handleEdit = (report: ReportRecord) => {
    setEditingRecord(report);
    setEditForm({
      transactionCode: report.transactionCode || '',
      transactionDate: report.transactionDate ? new Date(report.transactionDate).toISOString().split('T')[0] : '',
      amount: String(report.amount || 0),
      paymentMethod: report.paymentMethod || '',
      pointOfSaleName: report.pointOfSaleName || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setEditForm({
      transactionCode: '',
      transactionDate: '',
      amount: '',
      paymentMethod: '',
      pointOfSaleName: ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;

    try {
      const updates: Partial<ReportRecord> = {};
      const editedFields: string[] = [];

      if (editForm.transactionCode !== editingRecord.transactionCode) {
        updates.transactionCode = editForm.transactionCode;
        editedFields.push('transactionCode');
      }
      if (editForm.transactionDate) {
        const newDate = new Date(editForm.transactionDate).toISOString();
        if (newDate !== editingRecord.transactionDate) {
          updates.transactionDate = newDate;
          editedFields.push('transactionDate');
        }
      }
      if (parseFloat(editForm.amount) !== editingRecord.amount) {
        updates.amount = parseFloat(editForm.amount);
        editedFields.push('amount');
      }
      if (editForm.paymentMethod !== editingRecord.paymentMethod) {
        updates.paymentMethod = editForm.paymentMethod as any;
        editedFields.push('paymentMethod');
      }
      if (editForm.pointOfSaleName !== (editingRecord.pointOfSaleName || '')) {
        updates.pointOfSaleName = editForm.pointOfSaleName || undefined;
        editedFields.push('pointOfSaleName');
      }

      if (editedFields.length > 0) {
        updates.isManuallyEdited = true;
        updates.editedFields = editedFields;
        await ReportService.updateReportRecord(editingRecord.id, updates);
        alert('Đã cập nhật thành công!');
        handleCancelEdit();
        // Reload data
        window.location.reload();
      } else {
        handleCancelEdit();
      }
    } catch (error) {
      console.error('Error updating record:', error);
      alert('Có lỗi khi cập nhật bản ghi');
    }
  };

  const selectedTotal = filteredUnpaidReports
    .filter(r => selectedReports.includes(r.id))
    .reduce((sum, r) => sum + (r.amount || 0), 0);

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
                          <div className="text-right mr-4 space-y-1">
                            <div>
                              <p className="text-xs text-slate-500">Số tiền từ bill</p>
                              <p className="text-lg font-bold text-slate-900">{formatAmount(total.billAmount)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Tiền từ file merchants</p>
                              <p className="text-sm font-medium text-indigo-600">
                                {total.merchantAmount > 0 ? formatAmount(total.merchantAmount) : 'Chưa có file merchants'}
                              </p>
                            </div>
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
                                  <th className="px-3 py-2 text-right">Số tiền từ bill</th>
                                  <th className="px-3 py-2 text-right">Tiền từ file merchants</th>
                                  <th className="px-3 py-2 text-left">Phương thức</th>
                                  <th className="px-3 py-2 text-left">Điểm thu</th>
                                  <th className="px-3 py-2 text-center">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.reports.map((report) => {
                                  // Get bill image URL with expiration check
                                  const allBills = FirebaseUtils.objectToArray(billsData || {});
                                  const bill = allBills.find((b: UserBill) => b.id === report.userBillId);
                                  const billImageUrl = bill ? getBillImageUrl(bill) : null;
                                  const imageExpired = bill ? isBillImageExpired(bill) : false;
                                  
                                  return (
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
                                      <td className="px-3 py-2 text-right">
                                        {report.merchantAmount !== undefined && report.merchantAmount !== null && report.merchantAmount > 0
                                          ? formatAmount(report.merchantAmount)
                                          : '-'}
                                      </td>
                                    <td className="px-3 py-2">{report.paymentMethod}</td>
                                    <td className="px-3 py-2 font-mono text-xs">{report.pointOfSaleName || '-'}</td>
                                      <td className="px-3 py-2 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          {billImageUrl ? (
                                            <button
                                              onClick={() => setPreviewBillImage(billImageUrl)}
                                              className="px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                                              title="Hiện ảnh bill"
                                            >
                                              Hiện ảnh
                                            </button>
                                          ) : imageExpired ? (
                                            <span className="px-2 py-1 text-xs font-medium text-slate-500 italic" title="Quá hạn 1 tuần, hệ thống đã xoá">
                                              Quá hạn 1 tuần, hệ thống đã xoá
                                            </span>
                                          ) : null}
                                          <button
                                            onClick={() => handleEdit(report)}
                                            className="px-2 py-1 text-xs font-medium text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                                            title="Sửa thông tin"
                                          >
                                            Sửa
                                          </button>
                                        </div>
                                      </td>
                                  </tr>
                                  );
                                })}
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

              {/* Batches Cards */}
              <div className="space-y-4">
                {paginatedBatches.map((batch) => {
                  const allBills = FirebaseUtils.objectToArray(billsData || {});
                  const batchBills = allBills.filter((bill: UserBill) => 
                    batch.billIds?.includes(bill.id)
                  );
                  const isExpanded = expandedBatches.has(batch.id);
                  
                  // Get ReportRecords for these bills to get merchantAmount
                  const batchReports = reportRecordsFromDB.filter((report: ReportRecord) =>
                    batchBills.some((bill: UserBill) => bill.id === report.userBillId)
                  );
                  
                  // Calculate totals including merchantAmount
                  const totalMerchantAmount = batchReports.reduce((sum, report) => 
                    sum + (report.merchantAmount || 0), 0
                  );
                  
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
                  
                  return (
                    <div key={batch.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-green-50 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-900">Mã chi trả: {batch.approvalCode || batch.id}</h4>
                            <p className="text-sm text-slate-600 mt-1">
                              {batch.paidAt ? formatDate(batch.paidAt) : formatDate(batch.createdAt || '')}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {formatBatchId(batch.id)} • {batch.billIds?.length || 0} giao dịch
                            </p>
                          </div>
                          <div className="text-right mr-4 space-y-1">
                            <div>
                              <p className="text-xs text-slate-500">Tổng tiền</p>
                              <p className="text-lg font-bold text-slate-900">{formatAmount(batch.totalAmount)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Tiền từ file merchants</p>
                              <p className="text-sm font-medium text-indigo-600">
                                {totalMerchantAmount > 0 ? formatAmount(totalMerchantAmount) : 'Chưa có file merchants'}
                              </p>
                            </div>
                            {batch.feeAmount && batch.feeAmount > 0 ? (
                              <div>
                                <p className="text-xs text-slate-500">Tổng phí</p>
                                <p className="text-sm font-medium text-slate-600">{formatAmount(batch.feeAmount)}</p>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              batch.status === 'PAID'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}>
                              {batch.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                            </span>
                            <div className="flex items-center space-x-2">
                              {batch.status === 'PAID' && (
                                <button
                                  onClick={async () => {
                                    if (window.confirm('Bạn có chắc chắn muốn đổi trạng thái từ "Đã thanh toán" về "Chưa thanh toán"? Toàn bộ đợt chi trả này sẽ được chuyển về tab "Chưa thanh toán".')) {
                                      try {
                                        const updates: any = {};
                                        if (batch.billIds) {
                                          batch.billIds.forEach((billId: string) => {
                                            updates[`user_bills/${billId}/agentPaymentStatus`] = 'UNPAID';
                                            updates[`user_bills/${billId}/agentPaidAt`] = null;
                                            updates[`user_bills/${billId}/agentPaidNote`] = null;
                                          });
                                        }
                                        await update(ref(database), updates);
                                        alert('Đã đổi trạng thái thành công! Đợt chi trả đã được chuyển về tab "Chưa thanh toán".');
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
                              )}
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
                                className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                        {batch.note && (
                          <div className="mt-2 text-sm text-slate-600">
                            <strong>Ghi chú:</strong> {batch.note}
                          </div>
                        )}
                      </div>
                      
                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-slate-200">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-3 py-2 text-left">Mã GD</th>
                                  <th className="px-3 py-2 text-left">Người dùng</th>
                                  <th className="px-3 py-2 text-left">Ngày GD</th>
                                  <th className="px-3 py-2 text-right">Số tiền từ bill</th>
                                  <th className="px-3 py-2 text-right">Tiền từ file merchants</th>
                                  <th className="px-3 py-2 text-left">Loại</th>
                                  <th className="px-3 py-2 text-left">Điểm thu</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {batchBills.map((bill: UserBill) => {
                                  const user = users.find(u => u.id === bill.userId);
                                  // Find corresponding ReportRecord for merchantAmount
                                  const report = batchReports.find((r: ReportRecord) => r.userBillId === bill.id);
                                  return (
                                    <tr key={bill.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2 font-mono text-xs">{bill.transactionCode}</td>
                                      <td className="px-3 py-2">
                                        <div>
                                          <div className="font-medium">{user?.fullName || bill.userId}</div>
                                          {user?.phone && (
                                            <div className="text-xs text-slate-500">{user.phone}</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">{formatDateOnly(bill.createdAt || '')}</td>
                                      <td className="px-3 py-2 text-right font-medium">{formatAmount(bill.amount)}</td>
                                      <td className="px-3 py-2 text-right">
                                        {report?.merchantAmount !== undefined && report.merchantAmount !== null && report.merchantAmount > 0
                                          ? <span className="font-medium text-indigo-600">{formatAmount(report.merchantAmount)}</span>
                                          : <span className="text-slate-400">-</span>}
                                      </td>
                                      <td className="px-3 py-2">{bill.paymentMethod}</td>
                                      <td className="px-3 py-2 font-mono text-xs">{bill.pointOfSaleName || '-'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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

      {/* Bill Image Preview Modal */}
      {previewBillImage && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 transition-opacity bg-slate-900 bg-opacity-75" 
              onClick={() => setPreviewBillImage(null)}
            ></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">
                    Ảnh bill
                  </h3>
                  <button
                    onClick={() => setPreviewBillImage(null)}
                    className="text-slate-400 hover:text-slate-500"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex justify-center">
                  <img 
                    src={previewBillImage} 
                    alt="Bill image" 
                    className="max-w-full h-auto rounded-lg border border-slate-200"
                    style={{ maxHeight: '80vh' }}
                  />
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 sm:px-6">
                <button
                  onClick={() => setPreviewBillImage(null)}
                  className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" 
              onClick={handleCancelEdit}
            ></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-slate-900">
                    Sửa thông tin giao dịch
                  </h3>
                  <button
                    onClick={handleCancelEdit}
                    className="text-slate-400 hover:text-slate-500"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Mã GD <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.transactionCode}
                      onChange={(e) => setEditForm({ ...editForm, transactionCode: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nhập mã giao dịch"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Ngày GD <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editForm.transactionDate}
                      onChange={(e) => setEditForm({ ...editForm, transactionDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Số tiền từ bill <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nhập số tiền"
                      min="0"
                      step="1000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Phương thức <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editForm.paymentMethod}
                      onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Chọn phương thức</option>
                      <option value="QR 1 (VNPay)">QR 1 (VNPay)</option>
                      <option value="QR 2 (Momo)">QR 2 (Momo)</option>
                      <option value="QR 3 (ZaloPay)">QR 3 (ZaloPay)</option>
                      <option value="QR 4 (ShopeePay)">QR 4 (ShopeePay)</option>
                      <option value="QR 5 (ViettelPay)">QR 5 (ViettelPay)</option>
                      <option value="QR 6 (Bank Transfer)">QR 6 (Bank Transfer)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Điểm thu
                    </label>
                    <input
                      type="text"
                      value={editForm.pointOfSaleName}
                      onChange={(e) => setEditForm({ ...editForm, pointOfSaleName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Nhập điểm thu"
                    />
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-800">
                      <strong>Lưu ý:</strong> Cột "Tiền từ file merchants" không thể chỉnh sửa vì đây là dữ liệu từ file merchants đã upload.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-4 py-3 sm:px-6 flex justify-end space-x-3">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Lưu
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
