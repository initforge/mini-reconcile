import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Plus, Search, Eye, DollarSign, Users, Clock, CheckCircle, Package, AlertCircle, Copy, CreditCard, Building2, Phone, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Payment, PaymentBatch, ReconciliationRecord, Agent, UserBill, AdminPaymentToAgent, PaymentMethod, ReportRecord } from '../types';
import { PaymentsService, SettingsService } from '../src/lib/firebaseServices';
import { ReportService } from '../src/lib/reportServices';
import { useRealtimeData, FirebaseUtils } from '../src/lib/firebaseHooks';
import { createStyledWorkbook, createStyledSheet, addMetadataSheet, exportWorkbook, identifyNumberColumns } from '../src/utils/excelExportUtils';
import { update, ref, push } from 'firebase/database';
import { database } from '../src/lib/firebase';
import Pagination from './Pagination';

const Payouts: React.FC = () => {
  const location = useLocation();
  // Firebase hooks for agents data and user bills
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: userBillsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  // XÓA: Không cần adminPaymentsData nữa vì chỉ dùng report_records
  
  const [activeTab, setActiveTab] = useState<'unpaid' | 'batches'>('unpaid');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states for unpaid tab
  const [unpaidDateFrom, setUnpaidDateFrom] = useState<string>('');
  const [unpaidDateTo, setUnpaidDateTo] = useState<string>('');
  const [unpaidTransactionCodeSearch, setUnpaidTransactionCodeSearch] = useState<string>('');
  
  // Filter states for batches tab
  const [batchesDateFrom, setBatchesDateFrom] = useState<string>('');
  const [batchesDateTo, setBatchesDateTo] = useState<string>('');
  const [batchesSearchTerm, setBatchesSearchTerm] = useState<string>('');
  const [batchesItemsPerPage, setBatchesItemsPerPage] = useState<number>(5);
  
  // Unpaid Bills State (matched report_records that haven't been paid by admin)
  const [unpaidReports, setUnpaidReports] = useState<ReportRecord[]>([]);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Legacy: Unpaid Transactions State (for backward compatibility)
  const [unpaidTransactions, setUnpaidTransactions] = useState<ReconciliationRecord[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  
  // Payment Batches State (lazy loading)
  const [paymentBatches, setPaymentBatches] = useState<PaymentBatch[]>([]);
  const [batchesPage, setBatchesPage] = useState(1);
  const [batchesHasMore, setBatchesHasMore] = useState(false);
  const [batchesTotal, setBatchesTotal] = useState(0);
  const [allLoadedBatches, setAllLoadedBatches] = useState<PaymentBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  
  // Helper function to copy to clipboard
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Convert Firebase data to arrays - memoize to prevent infinite loops
  const agents = useMemo(() => FirebaseUtils.objectToArray(agentsData || {}), [agentsData]);
  const allUserBills = useMemo(() => FirebaseUtils.objectToArray(userBillsData || {}), [userBillsData]);
  // XÓA: Không cần allAdminPayments nữa

  // Reset state when route changes (force re-render)
  useEffect(() => {
    // Reset UI state when navigating to this route
    setSelectedGroup(null);
    setShowBatchModal(false);
    setSelectedReports([]);
    setSelectedTransactions([]);
  }, [location.pathname]);

  // Load matched report_records that haven't been paid by admin
  // ĐƠN GIẢN HÓA: Chỉ check adminPaymentStatus trong report_records
  const loadUnpaidReports = React.useCallback(async () => {
    try {
      const result = await ReportService.getReportRecords(
        { status: 'MATCHED' },
        { limit: 10000 } // Get all for now, can optimize later
      );
      
      // ĐƠN GIẢN: Chỉ filter theo adminPaymentStatus trong report_records
      // Chưa thanh toán = không có adminPaymentStatus hoặc adminPaymentStatus !== 'PAID'
      const unpaid = result.records.filter(report => {
        return !report.adminPaymentStatus || report.adminPaymentStatus !== 'PAID';
      });
      
      setUnpaidReports(unpaid);
    } catch (error) {
      console.error('Error loading unpaid reports:', error);
    }
  }, []);

  useEffect(() => {
    loadUnpaidReports();
  }, [loadUnpaidReports]);

  // Load data - UI first, then data
  useEffect(() => {
    // Load UI immediately (skeleton will show)
    setLoading(true);
    
    // Load data asynchronously
    loadUnpaidTransactions();
    loadPaymentBatches(1, true);
  }, []);

  const loadUnpaidTransactions = async () => {
    try {
      const transactions = await PaymentsService.getUnpaidTransactions();
      setUnpaidTransactions(transactions);
    } catch (error) {
      console.error('Error loading unpaid transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPaymentBatches = async (page: number = 1, reset: boolean = false) => {
    try {
      setLoadingBatches(true);
      
      // ĐƠN GIẢN: Load từ report_records với adminPaymentStatus = 'PAID', group theo ngày thanh toán
      const result = await ReportService.getReportRecords({}, { limit: 10000 });
      const paidReports = result.records.filter(r => r.adminPaymentStatus === 'PAID');
      
      // Group theo ngày thanh toán (adminPaidAt date) - ĐƠN GIẢN, không dùng batch
      const batchesByDate = new Map<string, ReportRecord[]>();
      paidReports.forEach(report => {
        const dateKey = report.adminPaidAt ? report.adminPaidAt.split('T')[0] : 'no-date';
        if (!batchesByDate.has(dateKey)) {
          batchesByDate.set(dateKey, []);
        }
        batchesByDate.get(dateKey)!.push(report);
      });
      
      // Convert to batch-like structure
      const batches: Array<{
        id: string;
        name: string;
        paidAt?: string;
        createdAt: string;
        totalAmount: number;
        totalFees: number;
        netAmount: number;
        paymentCount: number;
        agentCount: number;
        paymentStatus: 'PAID';
      }> = [];
      
      batchesByDate.forEach((reports, dateKey) => {
        const firstReport = reports[0];
        const totalAmount = reports.reduce((sum, r) => sum + (r.amount || 0), 0);
        const totalFees = reports.reduce((sum, r) => sum + (r.feeAmount || 0), 0);
        const netAmount = reports.reduce((sum, r) => sum + (r.netAmount || r.amount || 0), 0);
        const uniqueAgents = new Set(reports.map(r => r.agentId).filter(Boolean));
        
        batches.push({
          id: dateKey,
          name: `Đợt chi trả ${firstReport.adminPaidAt ? new Date(firstReport.adminPaidAt).toLocaleDateString('vi-VN') : 'Chưa xác định'}`,
          paidAt: firstReport.adminPaidAt,
          createdAt: firstReport.adminPaidAt || firstReport.createdAt,
          totalAmount,
          totalFees,
          netAmount,
          paymentCount: reports.length,
          agentCount: uniqueAgents.size,
          paymentStatus: 'PAID' as const
        });
      });
      
      // Apply filters
      let filteredBatches = batches;
      
      // Filter by date range (paidAt or createdAt)
      if (batchesDateFrom || batchesDateTo) {
        filteredBatches = filteredBatches.filter(batch => {
          const batchDate = batch.paidAt || batch.createdAt;
          if (!batchDate) return true; // Include if no date
          
          try {
            // Handle both ISO string and Date object
            const dateStr = typeof batchDate === 'string' ? batchDate : batchDate.toISOString();
            const date = dateStr.split('T')[0]; // Extract YYYY-MM-DD
            // Include records where date is >= dateFrom and <= dateTo (inclusive)
            if (batchesDateFrom && date < batchesDateFrom) return false;
            if (batchesDateTo && date > batchesDateTo) return false;
            return true;
          } catch (error) {
            console.warn('Error parsing batch date:', error);
            return true; // Include if parsing fails
          }
        });
      }
      
      // Filter by search term (name only - không còn approvalCode)
      if (batchesSearchTerm) {
        const searchLower = batchesSearchTerm.toLowerCase();
        filteredBatches = filteredBatches.filter(batch => 
          batch.name.toLowerCase().includes(searchLower)
        );
      }
      
      // Sort by date (newest first)
      filteredBatches.sort((a, b) => {
        const dateA = new Date(a.paidAt || a.createdAt).getTime();
        const dateB = new Date(b.paidAt || b.createdAt).getTime();
        return dateB - dateA;
      });
      
      if (reset) {
        setAllLoadedBatches(filteredBatches);
        // Paginate
        const startIndex = (page - 1) * batchesItemsPerPage;
        const endIndex = startIndex + batchesItemsPerPage;
        setPaymentBatches(filteredBatches.slice(startIndex, endIndex));
        setBatchesTotal(filteredBatches.length);
      } else {
        // Append: thêm vào danh sách đã load, nhưng chỉ hiển thị trang hiện tại
        const updatedBatches = [...allLoadedBatches, ...filteredBatches];
        setAllLoadedBatches(updatedBatches);
        // Chỉ hiển thị trang hiện tại (page)
        const startIndex = (page - 1) * batchesItemsPerPage;
        const endIndex = startIndex + batchesItemsPerPage;
        setPaymentBatches(updatedBatches.slice(startIndex, endIndex));
        setBatchesTotal(updatedBatches.length);
      }
      
      setBatchesHasMore(false); // No pagination needed since we load all
    } catch (error) {
      console.error('Error loading payment batches:', error);
      setPaymentBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  };
  
  const handleBatchesPageChange = async (newPage: number) => {
    setBatchesPage(newPage);
    // Apply filters to all loaded batches
    let filteredBatches = allLoadedBatches;
    
    if (batchesDateFrom || batchesDateTo) {
      filteredBatches = filteredBatches.filter(batch => {
        const batchDate = batch.paidAt || batch.createdAt;
        if (!batchDate) return true; // Include if no date
        try {
          const dateStr = typeof batchDate === 'string' ? batchDate : batchDate.toISOString();
          const date = dateStr.split('T')[0]; // Extract YYYY-MM-DD
          if (batchesDateFrom && date < batchesDateFrom) return false;
          if (batchesDateTo && date > batchesDateTo) return false;
          return true;
        } catch (error) {
          return true; // Include if parsing fails
        }
      });
    }
    
    if (batchesSearchTerm) {
      const searchLower = batchesSearchTerm.toLowerCase();
      filteredBatches = filteredBatches.filter(batch => 
        (batch.approvalCode && batch.approvalCode.toLowerCase().includes(searchLower)) ||
        batch.name.toLowerCase().includes(searchLower)
      );
    }
    
    // Paginate filtered results
    const startIndex = (newPage - 1) * batchesItemsPerPage;
    const endIndex = startIndex + batchesItemsPerPage;
    setPaymentBatches(filteredBatches.slice(startIndex, endIndex));
    setBatchesTotal(filteredBatches.length);
  };
  
  // Re-filter batches when filters change
  useEffect(() => {
    if (activeTab === 'batches') {
      setBatchesPage(1);
      loadPaymentBatches(1, true);
    }
  }, [batchesDateFrom, batchesDateTo, batchesSearchTerm, batchesItemsPerPage]);

  // Define interface for grouped data
  interface AgentGroup {
    agentInfo: any;
    transactions: ReconciliationRecord[];
    totalAmount: number;
    feeAmount: number;
    netAmount: number;
  }

  // Group transactions by agent
  const groupedTransactions: Record<string, AgentGroup> = unpaidTransactions.reduce((groups, transaction) => {
    const agentId = transaction.agentData?.agentId || 'unknown';
    if (!groups[agentId]) {
      groups[agentId] = {
        agentInfo: transaction.agentData,
        transactions: [],
        totalAmount: 0,
        feeAmount: 0,
        netAmount: 0
      };
    }
    
    groups[agentId].transactions.push(transaction);
    const amount = transaction.merchantData?.amount || 0;
    groups[agentId].totalAmount += amount;
    
    // Calculate fee from agent's discount rate for this payment method
    const agent = agents.find(a => a.id === agentId || a.code === agentId);
    const paymentMethod = transaction.paymentMethod || transaction.merchantData?.method || 'QR 1 (VNPay)';
    const feePercentage = agent?.discountRates?.[paymentMethod] || 2.0; // Default to 2% if not found
    const fee = (amount * feePercentage) / 100;
    
    groups[agentId].feeAmount += fee;
    groups[agentId].netAmount += amount - fee;
    
    return groups;
  }, {} as Record<string, AgentGroup>);

  // Filter by point of sale
  const [pointOfSaleFilter, setPointOfSaleFilter] = useState<string>('');
  
  // Get all unique point of sales from transactions
  const allPointOfSales = useMemo(() => {
    const posSet = new Set<string>();
    unpaidTransactions.forEach(tx => {
      if (tx.pointOfSaleName) posSet.add(tx.pointOfSaleName);
    });
    return Array.from(posSet).sort();
  }, [unpaidTransactions]);

  // Filter transactions
  const filteredGroups: [string, AgentGroup][] = Object.entries(groupedTransactions).filter(([agentId, group]) => {
    const matchesSearch = group.agentInfo?.agentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      agentId.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPointOfSale = !pointOfSaleFilter || 
      group.transactions.some(tx => tx.pointOfSaleName === pointOfSaleFilter);
    
    return matchesSearch && matchesPointOfSale;
  });

  // Filter unpaid reports by date and transaction code (simple logic like "Đợt chi trả" tab)
  const filteredUnpaidReports = useMemo(() => {
    let filtered = unpaidReports;
    
    if (unpaidDateFrom || unpaidDateTo) {
      filtered = filtered.filter(report => {
        const dateToCheck = report.transactionDate || report.userBillCreatedAt || report.reconciledAt || report.createdAt;
        if (!dateToCheck) return true;
        
        try {
          const dateStr = typeof dateToCheck === 'string' ? dateToCheck : dateToCheck.toISOString();
          const date = dateStr.split('T')[0];
          if (unpaidDateFrom && date < unpaidDateFrom) return false;
          if (unpaidDateTo && date > unpaidDateTo) return false;
          return true;
        } catch (error) {
          return true;
        }
      });
    }
    
    // Filter by transaction code
    if (unpaidTransactionCodeSearch) {
      const searchLower = unpaidTransactionCodeSearch.toLowerCase();
      filtered = filtered.filter(report => 
        report.transactionCode.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  }, [unpaidReports, unpaidDateFrom, unpaidDateTo, unpaidTransactionCodeSearch]);

  // Group matched reports by agent for new system
  const reportsByAgent = useMemo(() => {
    const groups: Record<string, { reports: ReportRecord[]; agent: Agent | undefined }> = {};
    filteredUnpaidReports.forEach(report => {
      if (!groups[report.agentId]) {
        groups[report.agentId] = {
          reports: [],
          agent: agents.find(a => a.id === report.agentId)
        };
      }
      groups[report.agentId].reports.push(report);
    });
    return groups;
  }, [filteredUnpaidReports, agents]);

  // Calculate totals for each agent group
  const agentTotals = useMemo(() => {
    const totals: Record<string, { totalAmount: number; feeAmount: number; netAmount: number }> = {};
    Object.entries(reportsByAgent).forEach(([agentId, group]) => {
      let totalAmount = 0;
      let totalFee = 0;
      
      group.reports.forEach(report => {
        totalAmount += report.amount;
        
        // Calculate fee based on paymentMethod and discountRatesByPointOfSale
        const agent = group.agent;
        const paymentMethod = report.paymentMethod;
        const pointOfSaleName = report.pointOfSaleName;
        
        let feePercentage = 0;
        if (agent?.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
          feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
        } else if (agent?.discountRates) {
          feePercentage = agent.discountRates[paymentMethod] || 0;
        }
        
        const fee = (report.amount * feePercentage) / 100;
        totalFee += fee;
      });
      
      totals[agentId] = {
        totalAmount,
        feeAmount: totalFee,
        netAmount: totalAmount - totalFee
      };
    });
    return totals;
  }, [reportsByAgent]);

  // Handle batch creation from matched reports (new system)
  const handleCreateBatchFromReports = async () => {
    if (selectedReports.length === 0) {
      alert('Vui lòng chọn ít nhất một giao dịch');
      return;
    }

    if (!batchName.trim()) {
      alert('Vui lòng nhập tên đợt chi trả');
      return;
    }

    try {
      setIsCreatingBatch(true);
      
      const selectedReportsList = unpaidReports.filter(r => selectedReports.includes(r.id));
      
      // Group by agent
      const reportsByAgentMap: Record<string, ReportRecord[]> = {};
      selectedReportsList.forEach(report => {
        if (!reportsByAgentMap[report.agentId]) {
          reportsByAgentMap[report.agentId] = [];
        }
        reportsByAgentMap[report.agentId].push(report);
      });

      // ĐƠN GIẢN: Chỉ update adminPaymentStatus và adminPaidAt trong report_records
      const updates: any = {};
      let totalReports = 0;
      
      selectedReportsList.forEach(report => {
        // Chỉ update nếu report.id là ID thật (không phải virtual)
        if (report.id && !report.id.startsWith('virtual_')) {
          updates[`report_records/${report.id}/adminPaymentStatus`] = 'PAID';
          updates[`report_records/${report.id}/adminPaidAt`] = FirebaseUtils.getServerTimestamp();
          totalReports++;
        }
      });
      
      // Batch update tất cả report_records
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
      }

      alert(`Đã đánh dấu thanh toán "${batchName}" thành công cho ${totalReports} giao dịch!`);
      setSelectedReports([]);
      setBatchName('');
      setShowBatchModal(false);
      
      // Clear filters to show new batch
      setBatchesDateFrom('');
      setBatchesDateTo('');
      setBatchesSearchTerm('');
      setBatchesPage(1);
      
      // Reload data - QUAN TRỌNG: Reload cả unpaid và batches
      await loadUnpaidReports();
      await loadPaymentBatches(1, true); // Reload batches để hiển thị trong "Đợt chi trả"
    } catch (error: any) {
      alert(`Đã xảy ra lỗi: ${error.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Handle batch creation (legacy - for ReconciliationRecord)
  const handleCreateBatch = async () => {
    if (selectedTransactions.length === 0) {
      alert('Vui lòng chọn ít nhất một giao dịch');
      return;
    }

    if (!batchName.trim()) {
      alert('Vui lòng nhập tên đợt chi trả');
      return;
    }

    try {
      setIsCreatingBatch(true);
      
      // Create payments for selected transactions
      const payments: Omit<Payment, 'id'>[] = [];
      const selectedTxs = unpaidTransactions.filter(tx => selectedTransactions.includes(tx.id));
      
      // Group by agent
      const agentGroups: Record<string, ReconciliationRecord[]> = selectedTxs.reduce((groups, tx) => {
        const agentId = tx.agentData?.agentId || 'unknown';
        if (!groups[agentId]) groups[agentId] = [];
        groups[agentId].push(tx);
        return groups;
      }, {} as Record<string, ReconciliationRecord[]>);

      // Create payment for each agent
      for (const [agentId, txs] of Object.entries(agentGroups)) {
        const agent = agents.find(a => a.id === agentId || a.code === agentId);
        
        // Calculate fee based on agent's discount rates for each transaction
        let totalAmount = 0;
        let totalFee = 0;
        
        txs.forEach(tx => {
          const amount = tx.merchantData?.amount || 0;
          totalAmount += amount;
          
          const paymentMethod = tx.paymentMethod || tx.merchantData?.method || 'QR 1 (VNPay)';
          const feePercentage = agent?.discountRates?.[paymentMethod] || 2.0;
          const fee = (amount * feePercentage) / 100;
          totalFee += fee;
        });
        
        payments.push({
          agentId,
          agentName: agent?.name || txs[0].agentData?.agentId || 'Unknown',
          agentCode: agent?.code || agentId,
          bankAccount: agent?.bankAccount || '',
          totalAmount,
          feeAmount: totalFee,
          netAmount: totalAmount - totalFee,
          transactionIds: txs.map(tx => tx.id),
          transactionCount: txs.length,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          createdBy: 'current_user' // TODO: Get from auth
        });
      }

      // Create payments and batch
      const paymentIds: string[] = [];
      const paymentIdToRecordIds = new Map<string, string[]>(); // Map paymentId -> recordIds
      
      for (const payment of payments) {
        const paymentId = await PaymentsService.createPayment(payment);
        paymentIds.push(paymentId);
        // Lưu mapping paymentId -> transactionIds
        if (payment.transactionIds) {
          paymentIdToRecordIds.set(paymentId, payment.transactionIds);
        }
      }

      // Generate approval code for batch
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      const approvalCode = `BATCH-${timestamp}-${random}`;

      // Create batch
      await PaymentsService.createBatch({
        name: batchName,
        totalAmount: payments.reduce((sum, p) => sum + p.totalAmount, 0),
        totalFees: payments.reduce((sum, p) => sum + p.feeAmount, 0),
        netAmount: payments.reduce((sum, p) => sum + p.netAmount, 0),
        paymentIds,
        paymentCount: paymentIds.length,
        agentCount: payments.length,
        status: 'DRAFT',
        createdAt: new Date().toISOString(),
        createdBy: 'current_user',
        paymentStatus: 'PAID' as const,
        paidAt: new Date().toISOString(),
        approvalCode
      });

      // Update records với paymentId để đánh dấu đã được thêm vào payment
      const updates: any = {};
      for (const [paymentId, recordIds] of paymentIdToRecordIds.entries()) {
        recordIds.forEach(recordId => {
          updates[`reconciliation_records/${recordId}/paymentId`] = paymentId;
          // Không set isPaid = true vì payment mới tạo có status PENDING, chưa thanh toán
        });
      }
      
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        console.log('✅ Đã update paymentId cho', Object.keys(updates).length / 2, 'records');
      }

      // Reset state
      setSelectedTransactions([]);
      setBatchName('');
      setShowBatchModal(false);
      
      // Clear filters to show new batch
      setBatchesDateFrom('');
      setBatchesDateTo('');
      setBatchesSearchTerm('');
      setBatchesPage(1);
      
      // Reload data
      await loadUnpaidTransactions();
      await loadPaymentBatches(1, true);
      
      alert('Tạo đợt chi trả thành công!');
    } catch (error) {
      console.error('Error creating batch:', error);
      alert('Có lỗi khi tạo đợt chi trả');
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Revert payment - đổi status về UNPAID (ĐƠN GIẢN, không cần batch)
  const handleRevertPayment = async (dateKey: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn đổi trạng thái thanh toán này về "Chưa thanh toán"? Tất cả giao dịch trong ngày này sẽ được chuyển về "Chưa thanh toán".')) {
      return;
    }

    try {
      // Load tất cả reports đã thanh toán trong ngày này
      const result = await ReportService.getReportRecords({}, { limit: 10000 });
      const reportsToRevert = result.records.filter(r => {
        if (r.adminPaymentStatus !== 'PAID' || !r.adminPaidAt) return false;
        const paidDate = r.adminPaidAt.split('T')[0];
        return paidDate === dateKey;
      });

      // Update status về UNPAID
      const updates: any = {};
      reportsToRevert.forEach(report => {
        if (report.id && !report.id.startsWith('virtual_')) {
          updates[`report_records/${report.id}/adminPaymentStatus`] = 'UNPAID';
          updates[`report_records/${report.id}/adminPaidAt`] = null;
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        alert(`Đã đổi trạng thái thành công! ${reportsToRevert.length} giao dịch đã được chuyển về "Chưa thanh toán".`);
      }

      // Reload data
      await loadUnpaidReports();
      await loadPaymentBatches(1, true);
    } catch (error: any) {
      console.error('Error reverting payment:', error);
      alert(`Có lỗi khi đổi trạng thái: ${error.message || 'Vui lòng thử lại'}`);
    }
  };

  // Delete payment - xóa tất cả records đã thanh toán trong ngày này (ĐƠN GIẢN, không cần batch)
  const handleDeletePayment = async (dateKey: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa thanh toán này? Tất cả giao dịch trong ngày này sẽ bị xóa khỏi lịch sử thanh toán.`)) {
      return;
    }

    try {
      // Load tất cả reports đã thanh toán trong ngày này
      const result = await ReportService.getReportRecords({}, { limit: 10000 });
      const reportsToDelete = result.records.filter(r => {
        if (r.adminPaymentStatus !== 'PAID' || !r.adminPaidAt) return false;
        const paidDate = r.adminPaidAt.split('T')[0];
        return paidDate === dateKey;
      });

      // Xóa payment info (không xóa report record, chỉ xóa payment status)
      const updates: any = {};
      reportsToDelete.forEach(report => {
        if (report.id && !report.id.startsWith('virtual_')) {
          updates[`report_records/${report.id}/adminPaymentStatus`] = null;
          updates[`report_records/${report.id}/adminPaidAt`] = null;
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        alert(`Xóa thanh toán thành công! ${reportsToDelete.length} giao dịch đã được xóa khỏi lịch sử thanh toán.`);
      }

      // Reload data
      await loadUnpaidReports();
      await loadPaymentBatches(1, true);
    } catch (error: any) {
      console.error('Error deleting payment:', error);
      alert(`Có lỗi khi xóa: ${error.message || 'Vui lòng thử lại'}`);
    }
  };


  // Skeleton loading component
  const SkeletonCard = () => (
    <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-4 h-4 bg-slate-200 rounded"></div>
          <div>
            <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
            <div className="h-4 w-24 bg-slate-200 rounded"></div>
          </div>
        </div>
        <div className="h-6 w-24 bg-slate-200 rounded"></div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="h-4 w-20 bg-slate-200 rounded mb-2"></div>
          <div className="h-5 w-28 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="h-4 w-20 bg-slate-200 rounded mb-2"></div>
          <div className="h-5 w-28 bg-slate-200 rounded"></div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="h-4 w-20 bg-slate-200 rounded mb-2"></div>
          <div className="h-5 w-28 bg-slate-200 rounded"></div>
        </div>
      </div>
      </div>
    );

  return (
    <div className="space-y-6" style={{ position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div className="flex justify-between items-center relative z-10">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Thanh toán & Công nợ</h2>
          <p className="text-slate-500">Quản lý thanh toán cho đại lý và tạo đợt chi trả</p>
        </div>
        
        {activeTab === 'unpaid' && (
          <>
            {selectedReports.length > 0 && (
              <button
                onClick={() => setShowBatchModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Package className="w-4 h-4" />
                <span>Tạo đợt chi trả ({selectedReports.length} giao dịch)</span>
              </button>
            )}
            {selectedTransactions.length > 0 && selectedReports.length === 0 && (
              <button
                onClick={() => setShowBatchModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Package className="w-4 h-4" />
                <span>Tạo đợt chi trả ({selectedTransactions.length})</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit relative z-10">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('unpaid');
            setSelectedGroup(null); // Close modal if open
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'unpaid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Chưa thanh toán ({unpaidReports.length > 0 ? unpaidReports.length : unpaidTransactions.length})
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('batches');
            setSelectedGroup(null); // Close modal if open
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'batches' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Đợt chi trả ({batchesTotal > 0 ? batchesTotal : paymentBatches.length})
        </button>
      </div>

      {/* Search and Filters */}
      {activeTab === 'unpaid' ? (
        <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                placeholder="Tìm kiếm đại lý..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                placeholder="Tìm theo mã chuẩn chi..."
                value={unpaidTransactionCodeSearch}
                onChange={(e) => setUnpaidTransactionCodeSearch(e.target.value)}
              />
            </div>
            
            {/* Point of Sale Filter */}
            {allPointOfSales.length > 0 && (
              <select
                className="px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                value={pointOfSaleFilter}
                onChange={(e) => setPointOfSaleFilter(e.target.value)}
              >
                <option value="">Tất cả điểm thu</option>
                {allPointOfSales.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            )}
          </div>
          
          {/* Date Range Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                value={unpaidDateFrom}
                onChange={(e) => setUnpaidDateFrom(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                value={unpaidDateTo}
                onChange={(e) => setUnpaidDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-slate-200">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                placeholder="Tìm theo mã chuẩn chi hoặc tên đợt..."
                value={batchesSearchTerm}
                onChange={(e) => setBatchesSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Số dòng mỗi trang</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                value={batchesItemsPerPage}
                onChange={(e) => {
                  setBatchesItemsPerPage(Number(e.target.value));
                  setBatchesPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
          
          {/* Date Range Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                value={batchesDateFrom}
                onChange={(e) => setBatchesDateFrom(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                value={batchesDateTo}
                onChange={(e) => setBatchesDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab === 'unpaid' ? (
        <div className="space-y-4">
          {/* New System: Matched Reports by Agent - Card Expandable */}
          {unpaidReports.length > 0 && (() => {
            // Filter and paginate agents
            const agentEntries = Object.entries(reportsByAgent).filter(([agentId, group]) => {
              const agent = group.agent;
              const matchesSearch = !searchTerm || 
                (agent?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (agent?.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                agentId.toLowerCase().includes(searchTerm.toLowerCase());
              return matchesSearch;
            });
            
            const totalAgents = agentEntries.length;
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedAgents = agentEntries.slice(startIndex, endIndex);
            const totalPages = Math.ceil(totalAgents / itemsPerPage);
            
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Giao dịch đã khớp chờ thanh toán ({filteredUnpaidReports.length} giao dịch từ {totalAgents} đại lý)
                </h3>
                
                <div className="space-y-4">
                  {paginatedAgents.map(([agentId, group]) => {
                    const agent = group.agent;
                    const totals = agentTotals[agentId];
                    if (!totals) return null;
                    
                    const isExpanded = expandedAgents.has(agentId);
                    const isAllSelected = group.reports.every(r => selectedReports.includes(r.id));
                    const someSelected = group.reports.some(r => selectedReports.includes(r.id));
                    
                    return (
                      <div key={agentId} className="border border-slate-200 rounded-lg overflow-hidden">
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
                                <h4 className="font-semibold text-slate-900">{agent?.name || agentId}</h4>
                                <p className="text-sm text-slate-500">Mã: {agent?.code || agentId}</p>
                              </div>
                            </div>
                            <div className="text-right mr-4">
                              <p className="text-sm text-slate-500">Tổng tiền</p>
                              <p className="text-lg font-bold text-slate-900">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totals.totalAmount)}
                              </p>
                              <p className="text-xs text-slate-500">
                                Phí: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totals.feeAmount)} | 
                                Thực trả: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totals.netAmount)}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                const newExpanded = new Set(expandedAgents);
                                if (isExpanded) {
                                  newExpanded.delete(agentId);
                                } else {
                                  newExpanded.add(agentId);
                                }
                                setExpandedAgents(newExpanded);
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
                                      <td className="px-3 py-2 font-mono text-xs">{report.transactionCode}</td>
                                      <td className="px-3 py-2">
                                        {new Date(report.transactionDate).toLocaleDateString('vi-VN')}
                                      </td>
                                      <td className="px-3 py-2 text-right font-medium">
                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(report.amount)}
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
            );
          })()}

          {/* Legacy System: Reconciliation Records */}
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filteredGroups.length === 0 && unpaidReports.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <DollarSign className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600">Không có giao dịch chưa thanh toán</h3>
              <p className="text-slate-400 mt-2">Tất cả giao dịch đã được thanh toán hoặc chưa có dữ liệu đối soát</p>
            </div>
          ) : filteredGroups.length > 0 && unpaidReports.length === 0 ? (
            <>
              {/* Table tổng quát */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={filteredGroups.every(([_, g]) => g.transactions.every(tx => selectedTransactions.includes(tx.id)))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const allIds = filteredGroups.flatMap(([_, g]) => g.transactions.map(tx => tx.id));
                              setSelectedTransactions(allIds);
                            } else {
                              setSelectedTransactions([]);
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500"
                        />
                      </th>
                      <th className="p-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Đại lý</th>
                      <th className="p-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Điểm thu</th>
                      <th className="p-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Số GD</th>
                      <th className="p-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Tổng tiền</th>
                      <th className="p-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Phí</th>
                      <th className="p-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Thực nhận</th>
                      <th className="p-4 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGroups.map(([agentId, group]) => {
                      const agent = agents.find(a => a.id === agentId || a.code === agentId);
                      const pointOfSales = Array.from(new Set(group.transactions.map(tx => tx.pointOfSaleName).filter(Boolean)));
                      
                      return (
                        <tr key={agentId} className="hover:bg-slate-50">
                          <td className="p-4">
                    <input
                      type="checkbox"
                      checked={group.transactions.every((tx) => selectedTransactions.includes(tx.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTransactions(prev => [
                            ...prev,
                            ...group.transactions.map((tx) => tx.id).filter((id: string) => !prev.includes(id))
                          ]);
                        } else {
                          setSelectedTransactions(prev => 
                            prev.filter(id => !group.transactions.some((tx) => tx.id === id))
                          );
                        }
                      }}
                      className="w-4 h-4 text-indigo-600 bg-slate-100 border-slate-300 rounded focus:ring-indigo-500"
                    />
                          </td>
                          <td className="p-4">
                            <div className="font-medium text-slate-800">{agent?.name || agentId}</div>
                            <div className="text-xs text-slate-500">{agent?.code || agentId}</div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {pointOfSales.slice(0, 2).map(pos => (
                                <span key={pos} className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                  {pos}
                                </span>
                              ))}
                              {pointOfSales.length > 2 && (
                                <span className="text-xs text-slate-400">+{pointOfSales.length - 2}</span>
                              )}
                    </div>
                          </td>
                          <td className="p-4 text-slate-700">{group.transactions.length}</td>
                          <td className="p-4 text-right font-medium text-slate-800">{group.totalAmount.toLocaleString('vi-VN')} đ</td>
                          <td className="p-4 text-right font-medium text-red-600">-{group.feeAmount.toLocaleString('vi-VN')} đ</td>
                          <td className="p-4 text-right font-bold text-emerald-700">{group.netAmount.toLocaleString('vi-VN')} đ</td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => setSelectedGroup(agentId)}
                              className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-1"
                            >
                              <Eye className="w-4 h-4" />
                              <span>Chi tiết</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                  </div>
                  
              {/* Popup chi tiết */}
              {selectedGroup && (() => {
                const [agentId, group] = filteredGroups.find(([id]) => id === selectedGroup) || [null, null];
                if (!agentId || !group) return null;
                
                return (
                  <div 
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" 
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setSelectedGroup(null);
                      }
                    }}
                  >
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
                        <h3 className="text-xl font-bold text-slate-800">
                          Chi tiết thanh toán - {agents.find(a => a.id === agentId || a.code === agentId)?.name || agentId}
                        </h3>
                        <button
                          onClick={() => setSelectedGroup(null)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5 text-slate-500" />
                        </button>
                </div>
                
                      <div className="p-6 space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-slate-50 rounded-lg p-4">
                            <div className="text-sm text-slate-500 mb-1">Tổng giao dịch</div>
                            <div className="text-xl font-bold text-slate-800">{group.totalAmount.toLocaleString('vi-VN')} đ</div>
                  </div>
                          <div className="bg-red-50 rounded-lg p-4">
                            <div className="text-sm text-slate-500 mb-1">Phí chiết khấu</div>
                            <div className="text-xl font-bold text-red-600">-{group.feeAmount.toLocaleString('vi-VN')} đ</div>
                  </div>
                          <div className="bg-emerald-50 rounded-lg p-4">
                            <div className="text-sm text-slate-500 mb-1">Thực nhận</div>
                            <div className="text-xl font-bold text-emerald-700">{group.netAmount.toLocaleString('vi-VN')} đ</div>
                  </div>
                </div>

                        {/* Agent Bank Info */}
                        {(() => {
                          const agent = agents.find(a => a.id === agentId || a.code === agentId);
                          if (!agent) return null;
                          
                          return (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
                                <CreditCard className="w-4 h-4 mr-2" />
                                Thông tin chuyển khoản
                              </h4>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="text-xs text-blue-600 font-medium">Số tài khoản</label>
                                    <div className="flex items-center space-x-2 mt-1">
                                      <span className="font-mono text-sm font-bold text-blue-900 bg-white px-3 py-1 rounded border">
                                        {agent.bankAccount || 'Chưa cập nhật'}
                                      </span>
                                      {agent.bankAccount && (
                                        <button
                                          onClick={() => copyToClipboard(agent.bankAccount, `STK-${agentId}`)}
                                          className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                                        >
                                          <Copy className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-xs text-blue-600 font-medium">Tên người nhận</label>
                                    <div className="flex items-center space-x-2 mt-1">
                                      <span className="text-sm font-medium text-blue-900 bg-white px-3 py-1 rounded border">
                                        {agent.name}
                                      </span>
                                      <button
                                        onClick={() => copyToClipboard(agent.name, `Name-${agentId}`)}
                                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded"
                                      >
                                        <Copy className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* QR Code Display */}
                                {agent.qrCodeBase64 && (
                                  <div className="pt-3 border-t border-blue-200">
                                    <label className="text-xs text-blue-600 font-medium block mb-2">Mã QR thanh toán</label>
                                    <div className="bg-white rounded-lg p-4 flex justify-center border-2 border-blue-200">
                                      <img 
                                        src={agent.qrCodeBase64} 
                                        alt="QR Code thanh toán" 
                                        className="w-48 h-48 object-contain"
                                      />
                                    </div>
                                    <p className="text-xs text-blue-600 text-center mt-2">
                                      Quét mã QR để chuyển khoản nhanh
                                    </p>
                                  </div>
                                )}

                                {/* Quick Copy All Button */}
                                <div className="pt-2 border-t border-blue-200">
                                  <button
                                    onClick={() => {
                                      const allInfo = `STK: ${agent.bankAccount}\nTên: ${agent.name}\nSố tiền: ${group.netAmount.toLocaleString('vi-VN')} VNĐ${agent.bankBranch ? `\nChi nhánh: ${agent.bankBranch}` : ''}${agent.contactPhone ? `\nSĐT: ${agent.contactPhone}` : ''}`;
                                      copyToClipboard(allInfo, `All-${agentId}`);
                                    }}
                                    className="w-full bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                                  >
                                    <Copy className="w-4 h-4" />
                                    <span>Copy tất cả thông tin chuyển khoản</span>
                                  </button>
                                  {copiedText === `All-${agentId}` && (
                                    <div className="text-center text-xs text-green-600 font-medium mt-1">
                                      ✅ Đã copy tất cả thông tin!
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Transactions Table */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 mb-3">Chi tiết giao dịch ({group.transactions.length})</h4>
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="p-3 text-left text-xs font-semibold text-slate-600">Mã chuẩn chi</th>
                                  <th className="p-3 text-left text-xs font-semibold text-slate-600">Điểm thu</th>
                                  <th className="p-3 text-left text-xs font-semibold text-slate-600">Phương thức</th>
                                  <th className="p-3 text-right text-xs font-semibold text-slate-600">Số tiền</th>
                                  <th className="p-3 text-center text-xs font-semibold text-slate-600">Trạng thái</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {group.transactions.map((tx) => (
                                  <tr key={tx.id} className={tx.isPaid ? 'bg-yellow-50' : ''}>
                                    <td className="p-3 font-mono text-sm text-slate-800">{tx.transactionCode}</td>
                                    <td className="p-3">
                                      {tx.pointOfSaleName ? (
                                        <span className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                                          {tx.pointOfSaleName}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-slate-400">N/A</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-sm text-slate-600">{tx.merchantData?.method || 'QR 1 (VNPay)'}</td>
                                    <td className="p-3 text-right font-medium text-slate-800">{tx.merchantAmount?.toLocaleString('vi-VN')} đ</td>
                                    <td className="p-3 text-center">
                                      {tx.isPaid ? (
                                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Đã thanh toán</span>
                                      ) : (
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">Chưa thanh toán</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                );
              })()}
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {loadingBatches ? (
            <div className="text-center py-8 text-slate-400">Đang tải đợt chi trả...</div>
          ) : paymentBatches.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <Package className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600">Chưa có đợt chi trả nào</h3>
              <p className="text-slate-400 mt-2">Tạo đợt chi trả đầu tiên từ các giao dịch chưa thanh toán</p>
            </div>
          ) : (
            <>
              {paymentBatches.map((batch) => (
                <div key={batch.id} className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">{batch.name}</h3>
                    <p className="text-sm text-slate-500">
                      {batch.paidAt 
                        ? `Thanh toán: ${new Date(batch.paidAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                        : `Tạo: ${new Date(batch.createdAt).toLocaleDateString('vi-VN')}`
                      } • 
                      {batch.agentCount} đại lý • {batch.paymentCount} thanh toán
                      {batch.approvalCode && (
                        <span className="ml-2 text-xs font-mono text-slate-400">({batch.approvalCode})</span>
                      )}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-800">
                        {batch.netAmount.toLocaleString('vi-VN')} VNĐ
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          batch.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                          batch.status === 'EXPORTED' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {batch.status === 'COMPLETED' ? 'Hoàn thành' :
                           batch.status === 'EXPORTED' ? 'Đã xuất' : 'Nháp'}
                        </span>
                        {batch.paymentStatus && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            batch.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' :
                            batch.paymentStatus === 'UNPAID' ? 'bg-red-100 text-red-700' :
                            batch.paymentStatus === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {batch.paymentStatus === 'PAID' ? 'Đã thanh toán' :
                             batch.paymentStatus === 'UNPAID' ? 'Chưa thanh toán' :
                             batch.paymentStatus === 'PARTIAL' ? 'Thanh toán một phần' :
                             'Đã hủy'}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {batch.paymentStatus === 'PAID' && (
                    <button
                          onClick={() => handleRevertPayment(batch.id)}
                          className="flex items-center space-x-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                        >
                          <span>Revert</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeletePayment(batch.id)}
                      className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa</span>
                    </button>
                    </div>
                  </div>
                </div>
              </div>
              ))}
              
              {/* Pagination for batches */}
              {batchesTotal > batchesItemsPerPage && (
                <div className="mt-4">
                  <Pagination
                    currentPage={batchesPage}
                    totalPages={Math.ceil(batchesTotal / batchesItemsPerPage)}
                    onPageChange={handleBatchesPageChange}
                    itemsPerPage={batchesItemsPerPage}
                    totalItems={batchesTotal}
                  />
                  {loadingBatches && (
                    <div className="text-center text-sm text-slate-500 mt-2">
                      Đang tải thêm dữ liệu...
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Create Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Tạo đợt chi trả mới</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tên đợt chi trả
                </label>
                <input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="VD: Chi trả tháng 11/2024"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              {/* QR Code của đại lý */}
              {(() => {
                // Lấy agent đầu tiên từ selected reports để hiển thị QR
                const firstReport = unpaidReports.find(r => selectedReports.includes(r.id));
                const selectedAgent = firstReport ? agents.find(a => a.id === firstReport.agentId) : null;
                
                // Nếu có nhiều agent, hiển thị cảnh báo
                const selectedAgentIds = new Set(
                  unpaidReports
                    .filter(r => selectedReports.includes(r.id))
                    .map(r => r.agentId)
                );
                const hasMultipleAgents = selectedAgentIds.size > 1;
                
                return selectedAgent?.qrCodeBase64 ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm font-semibold text-green-800 mb-2 flex items-center">
                      <CreditCard className="w-4 h-4 mr-2" />
                      Mã QR thanh toán {hasMultipleAgents ? `(${selectedAgent.name})` : 'của đại lý'}
                    </div>
                    {hasMultipleAgents && (
                      <p className="text-xs text-green-600 mb-2">
                        ⚠️ Có {selectedAgentIds.size} đại lý. Đang hiển thị QR của {selectedAgent.name}
                      </p>
                    )}
                    <div className="bg-white rounded-lg p-4 flex justify-center border-2 border-green-200">
                      <img 
                        src={selectedAgent.qrCodeBase64} 
                        alt="QR Code thanh toán" 
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                    <p className="text-xs text-green-600 text-center mt-2">
                      Quét mã QR để chuyển khoản nhanh
                    </p>
                  </div>
                ) : null;
              })()}

              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-sm text-slate-600 mb-2">Tóm tắt:</div>
                <div className="space-y-1 text-sm">
                  {selectedReports.length > 0 ? (
                    <>
                      <div className="flex justify-between">
                        <span>Giao dịch đã chọn:</span>
                        <span className="font-medium">{selectedReports.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tổng giá trị:</span>
                        <span className="font-medium">
                          {unpaidReports
                            .filter(r => selectedReports.includes(r.id))
                            .reduce((sum, r) => sum + r.amount, 0)
                            .toLocaleString('vi-VN')} VNĐ
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Số đại lý:</span>
                        <span className="font-medium">
                          {new Set(unpaidReports.filter(r => selectedReports.includes(r.id)).map(r => r.agentId)).size}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Giao dịch đã chọn:</span>
                        <span className="font-medium">{selectedTransactions.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tổng giá trị:</span>
                        <span className="font-medium">
                          {unpaidTransactions
                            .filter(tx => selectedTransactions.includes(tx.id))
                            .reduce((sum, tx) => sum + (tx.merchantData?.amount || 0), 0)
                            .toLocaleString('vi-VN')} VNĐ
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowBatchModal(false);
                  setBatchName('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (selectedReports.length > 0) {
                    handleCreateBatchFromReports();
                  } else {
                    handleCreateBatch();
                  }
                }}
                disabled={isCreatingBatch || !batchName.trim() || (selectedReports.length === 0 && selectedTransactions.length === 0)}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingBatch ? 'Đang tạo...' : 'Tạo đợt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payouts;