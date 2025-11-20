import React, { useState, useEffect, useMemo } from 'react';
import { Download, Plus, Search, Eye, DollarSign, Users, Clock, CheckCircle, Package, AlertCircle, Copy, CreditCard, Building2, Phone, X, Trash2 } from 'lucide-react';
import { Payment, PaymentBatch, ReconciliationRecord, Agent } from '../types';
import { PaymentsService, SettingsService } from '../src/lib/firebaseServices';
import { useRealtimeData, FirebaseUtils } from '../src/lib/firebaseHooks';
import { createStyledWorkbook, createStyledSheet, addMetadataSheet, exportWorkbook, identifyNumberColumns } from '../src/utils/excelExportUtils';
import { update, ref } from 'firebase/database';
import { database } from '../src/lib/firebase';

const Payouts: React.FC = () => {
  // Firebase hooks for agents data
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  
  const [activeTab, setActiveTab] = useState<'unpaid' | 'batches'>('unpaid');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Unpaid Transactions State
  const [unpaidTransactions, setUnpaidTransactions] = useState<ReconciliationRecord[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  
  // Payment Batches State
  const [paymentBatches, setPaymentBatches] = useState<PaymentBatch[]>([]);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  
  // Convert Firebase agents to array
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  
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

  // Load data - UI first, then data
  useEffect(() => {
    // Load UI immediately (skeleton will show)
    setLoading(true);
    
    // Load data asynchronously
    loadUnpaidTransactions();
    loadPaymentBatches();
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

  const loadPaymentBatches = async () => {
    try {
      const batches = await PaymentsService.getBatches();
      setPaymentBatches(batches);
    } catch (error) {
      console.error('Error loading payment batches:', error);
      setPaymentBatches([]);
    }
  };

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

  // Handle batch creation
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
        createdBy: 'current_user'
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
      
      // Reload data
      await loadUnpaidTransactions();
      await loadPaymentBatches();
      
      alert('Tạo đợt chi trả thành công!');
    } catch (error) {
      console.error('Error creating batch:', error);
      alert('Có lỗi khi tạo đợt chi trả');
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Delete batch
  const handleDeleteBatch = async (batchId: string) => {
    try {
      await PaymentsService.deleteBatch(batchId);
      alert('Xóa đợt chi trả thành công!');
      // Reload data
      await loadUnpaidTransactions();
      await loadPaymentBatches();
    } catch (error) {
      console.error('Error deleting batch:', error);
      alert('Có lỗi khi xóa đợt chi trả');
    }
  };

  // Export batch to Excel
  const handleExportBatch = async (batchId: string) => {
    try {
      const exportData = await PaymentsService.exportBatch(batchId);
      const settings = await SettingsService.getSettings();
      const workbook = createStyledWorkbook();
      
      // Payment details sheet
      const paymentHeaders = ['Mã đại lý', 'Tên đại lý', 'Số tài khoản', 'Tổng tiền', 'Phí', 'Thực trả', 'Số GD'];
      const paymentData = exportData.data.map(p => ({
        'Mã đại lý': p.agentCode,
        'Tên đại lý': p.agentName,
        'Số tài khoản': p.bankAccount,
        'Tổng tiền': p.totalAmount,
        'Phí': p.feeAmount,
        'Thực trả': p.netAmount,
        'Số GD': p.transactionCount
      }));
      const paymentNumberCols = identifyNumberColumns(paymentHeaders);
      createStyledSheet(workbook, 'Chi trả', paymentHeaders, paymentData, {
        numberColumns: paymentNumberCols,
        highlightTotalRow: false
      });
      
      // Summary sheet
      const summaryHeaders = ['Thông tin', 'Giá trị'];
      const summaryData = [
        { 'Thông tin': 'Tên đợt', 'Giá trị': exportData.summary.batchInfo.name },
        { 'Thông tin': 'Tổng brutto', 'Giá trị': exportData.summary.totalGross },
        { 'Thông tin': 'Tổng phí', 'Giá trị': exportData.summary.totalFees },
        { 'Thông tin': 'Tổng netto', 'Giá trị': exportData.summary.totalNet },
        { 'Thông tin': 'Số đại lý', 'Giá trị': exportData.summary.agentCount }
      ];
      const summaryNumberCols = identifyNumberColumns(summaryHeaders);
      createStyledSheet(workbook, 'Tổng kết', summaryHeaders, summaryData, {
        numberColumns: summaryNumberCols.filter(i => i === 1), // Only 'Giá trị' column
        highlightTotalRow: false
      });
      
      // Add metadata
      addMetadataSheet(workbook, settings, {
        exportDate: new Date().toISOString(),
        dateRange: exportData.metadata.dateRange,
        reportType: 'Báo cáo đợt chi trả'
      });
      
      const fileName = `Payment_Batch_${batchId}_${new Date().toISOString().split('T')[0]}.xlsx`;
      exportWorkbook(workbook, fileName);
    } catch (error) {
      console.error('Error exporting batch:', error);
      alert('Có lỗi khi export dữ liệu');
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Thanh toán & Công nợ</h2>
          <p className="text-slate-500">Quản lý thanh toán cho đại lý và tạo đợt chi trả</p>
        </div>
        
        {activeTab === 'unpaid' && selectedTransactions.length > 0 && (
          <button
            onClick={() => setShowBatchModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Package className="w-4 h-4" />
            <span>Tạo đợt chi trả ({selectedTransactions.length})</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('unpaid')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'unpaid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Chưa thanh toán ({unpaidTransactions.length})
        </button>
        <button
          onClick={() => setActiveTab('batches')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'batches' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Đợt chi trả ({paymentBatches.length})
        </button>
      </div>

      {/* Search and Filters */}
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

      {/* Content */}
      {activeTab === 'unpaid' ? (
        <div className="space-y-4">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <DollarSign className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600">Không có giao dịch chưa thanh toán</h3>
              <p className="text-slate-400 mt-2">Tất cả giao dịch đã được thanh toán hoặc chưa có dữ liệu đối soát</p>
            </div>
          ) : (
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
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedGroup(null)}>
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
                          return agent ? (
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
                          ) : null;
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
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {paymentBatches.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <Package className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600">Chưa có đợt chi trả nào</h3>
              <p className="text-slate-400 mt-2">Tạo đợt chi trả đầu tiên từ các giao dịch chưa thanh toán</p>
            </div>
          ) : (
            paymentBatches.map((batch) => (
              <div key={batch.id} className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">{batch.name}</h3>
                    <p className="text-sm text-slate-500">
                      {new Date(batch.createdAt).toLocaleDateString('vi-VN')} • 
                      {batch.agentCount} đại lý • {batch.paymentCount} thanh toán
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-800">
                        {batch.netAmount.toLocaleString('vi-VN')} VNĐ
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        batch.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                        batch.status === 'EXPORTED' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {batch.status === 'COMPLETED' ? 'Hoàn thành' :
                         batch.status === 'EXPORTED' ? 'Đã xuất' : 'Nháp'}
                      </span>
                    </div>
                    
                    <button
                      onClick={() => handleExportBatch(batch.id)}
                      className="flex items-center space-x-2 px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Xuất</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        if (window.confirm(`Bạn có chắc chắn muốn xóa đợt chi trả "${batch.name}"? Tất cả payments và dữ liệu liên quan sẽ bị xóa.`)) {
                          handleDeleteBatch(batch.id);
                        }
                      }}
                      className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
              
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-sm text-slate-600 mb-2">Tóm tắt:</div>
                <div className="space-y-1 text-sm">
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
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowBatchModal(false)}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={isCreatingBatch || !batchName.trim()}
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