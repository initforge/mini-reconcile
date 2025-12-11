import React, { useState, useMemo, useEffect } from 'react';
import { CheckCircle, Clock, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import { ReportService } from '../../src/lib/reportServices';
import type { UserBill, Agent, ReportRecord } from '../../types';
import Pagination from '../Pagination';

const PaymentStatus: React.FC = () => {
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');

  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const allBills = FirebaseUtils.objectToArray(billsData || {});

  // Pagination state for paid bills
  const [paidBillsPage, setPaidBillsPage] = useState(1);
  const paidBillsItemsPerPage = 10;
  const [expandedPaidAgents, setExpandedPaidAgents] = useState<Set<string>>(new Set());

  // Filter states for unpaid bills
  const [unpaidDateFrom, setUnpaidDateFrom] = useState<string>('');
  const [unpaidDateTo, setUnpaidDateTo] = useState<string>('');
  const [unpaidSearchTerm, setUnpaidSearchTerm] = useState<string>('');
  const [selectedUnpaidAgentId, setSelectedUnpaidAgentId] = useState<string>('all');
  const [unpaidBillsPage, setUnpaidBillsPage] = useState(1);
  const unpaidBillsItemsPerPage = 10;
  const [expandedUnpaidAgents, setExpandedUnpaidAgents] = useState<Set<string>>(new Set());
  
  // Filter states for paid bills
  const [paidDateFrom, setPaidDateFrom] = useState<string>('');
  const [paidDateTo, setPaidDateTo] = useState<string>('');
  const [paidSearchTerm, setPaidSearchTerm] = useState<string>('');
  const [selectedPaidAgentId, setSelectedPaidAgentId] = useState<string>('all');

  // Get user's bills
  const userBills = allBills.filter(bill => bill.userId === userId);
  
  // Get paid bills from user_bills
  const paidBills = userBills.filter(bill => bill.agentPaymentStatus === 'PAID');
  
  // Get unpaid bills from ReportRecord (truy vấn từ report_records với agentPaymentStatus = 'UNPAID')
  const [unpaidReportRecords, setUnpaidReportRecords] = useState<ReportRecord[]>([]);
  
  useEffect(() => {
    const loadUnpaidReports = async () => {
      if (!userId) return;
      
      try {
        const result = await ReportService.getAllReportRecordsWithMerchants(
          { userId },
          { limit: 10000 }
        );
        
        // Filter: chỉ lấy records có merchantTransactionId (đã có file merchants) và agentPaymentStatus = 'UNPAID'
        const unpaid = result.records.filter(r => {
          // PHẢI có merchantTransactionId (đã có file merchants)
          if (!r.merchantTransactionId) return false;
          
          // PHẢI có userBillId (có bill)
          if (!r.userBillId) return false;
          
          // Chưa thanh toán: không có agentPaymentStatus hoặc agentPaymentStatus !== 'PAID'
          // Lấy từ user_bills thông qua userBillId
          const bill = allBills.find(b => b.id === r.userBillId);
          if (!bill) return false;
          
          return !bill.agentPaymentStatus || bill.agentPaymentStatus !== 'PAID';
        });
        
        setUnpaidReportRecords(unpaid);
      } catch (error) {
        console.error('Error loading unpaid reports:', error);
      }
    };
    
    loadUnpaidReports();
  }, [userId, allBills]);
  
  // Convert ReportRecords to UserBills format for display
  const unpaidBills = useMemo(() => {
    return unpaidReportRecords.map(report => {
      const bill = allBills.find(b => b.id === report.userBillId);
      if (!bill) return null;
      return bill;
    }).filter(Boolean) as UserBill[];
  }, [unpaidReportRecords, allBills]);

  // Filter paid bills
  const filteredPaidBills = useMemo(() => {
    let filtered = paidBills;

    // Filter by date
    if (paidDateFrom || paidDateTo) {
      filtered = filtered.filter(bill => {
        const billDate = bill.agentPaidAt || bill.createdAt || bill.transactionDate;
        if (!billDate) return true;
        try {
          const dateStr = typeof billDate === 'string' ? billDate : billDate.toISOString();
          const date = dateStr.split('T')[0];
          if (paidDateFrom && date < paidDateFrom) return false;
          if (paidDateTo && date > paidDateTo) return false;
          return true;
        } catch {
          return true;
        }
      });
    }

    // Filter by agent
    if (selectedPaidAgentId !== 'all') {
      filtered = filtered.filter(bill => bill.agentId === selectedPaidAgentId);
    }

    // Filter by search term (transaction code)
    if (paidSearchTerm.trim()) {
      const searchLower = paidSearchTerm.toLowerCase();
      filtered = filtered.filter(bill => 
        bill.transactionCode?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [paidBills, paidDateFrom, paidDateTo, selectedPaidAgentId, paidSearchTerm]);

  // Group paid bills by agent
  const billsByAgent = useMemo(() => {
    return filteredPaidBills.reduce((acc, bill) => {
    if (!acc[bill.agentId]) {
      acc[bill.agentId] = [];
    }
    acc[bill.agentId].push(bill);
    return acc;
  }, {} as Record<string, UserBill[]>);
  }, [filteredPaidBills]);

  // Filter and group unpaid bills by agent
  const filteredUnpaidBills = useMemo(() => {
    let filtered = unpaidBills;

    // Filter by date
    if (unpaidDateFrom || unpaidDateTo) {
      filtered = filtered.filter(bill => {
        const billDate = bill.createdAt || bill.transactionDate;
        if (!billDate) return true;
        try {
          const dateStr = typeof billDate === 'string' ? billDate : billDate.toISOString();
          const date = dateStr.split('T')[0];
          if (unpaidDateFrom && date < unpaidDateFrom) return false;
          if (unpaidDateTo && date > unpaidDateTo) return false;
          return true;
        } catch {
          return true;
        }
      });
    }

    // Filter by agent
    if (selectedUnpaidAgentId !== 'all') {
      filtered = filtered.filter(bill => bill.agentId === selectedUnpaidAgentId);
    }

    // Filter by search term (transaction code)
    if (unpaidSearchTerm.trim()) {
      const searchLower = unpaidSearchTerm.toLowerCase();
      filtered = filtered.filter(bill => 
        bill.transactionCode?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [unpaidBills, unpaidDateFrom, unpaidDateTo, selectedUnpaidAgentId, unpaidSearchTerm]);

  // Group unpaid bills by agent
  const unpaidBillsByAgent = useMemo(() => {
    return filteredUnpaidBills.reduce((acc, bill) => {
      if (!acc[bill.agentId]) {
        acc[bill.agentId] = [];
      }
      acc[bill.agentId].push(bill);
      return acc;
    }, {} as Record<string, UserBill[]>);
  }, [filteredUnpaidBills]);

  // Get unique agents from unpaid bills for filter
  const unpaidAgents = useMemo(() => {
    const agentIds = new Set(filteredUnpaidBills.map(bill => bill.agentId));
    return agents.filter(agent => agentIds.has(agent.id));
  }, [filteredUnpaidBills, agents]);

  // Paginate agent groups
  const agentEntries = Object.entries(billsByAgent);
  const totalPaidAgents = agentEntries.length;
  const paidBillsTotalPages = Math.ceil(totalPaidAgents / paidBillsItemsPerPage);
  const paginatedAgentEntries = useMemo(() => {
    const startIndex = (paidBillsPage - 1) * paidBillsItemsPerPage;
    const endIndex = startIndex + paidBillsItemsPerPage;
    return agentEntries.slice(startIndex, endIndex);
  }, [agentEntries, paidBillsPage, paidBillsItemsPerPage]);

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? agent.name : 'N/A';
  };

  const getAgentCode = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? agent.code : 'N/A';
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

  if (!userId) {
    return <div>Vui lòng đăng nhập</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
        <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-slate-500">Đã thanh toán</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600 mt-0.5 sm:mt-1">{paidBills.length}</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-slate-500">Chờ thanh toán</p>
              <p className="text-xl sm:text-2xl font-bold text-yellow-600 mt-0.5 sm:mt-1">
                {formatAmount(unpaidBills.reduce((sum, bill) => sum + (bill.amount || 0), 0))}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">{unpaidBills.length} giao dịch</p>
            </div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Paid Bills by Agent */}
      <div className="space-y-3 sm:space-y-4">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 px-1">Bills đã được thanh toán</h2>
        
        {/* Filters for paid bills */}
        {totalPaidAgents > 0 && (
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
                <input
                  type="date"
                  value={paidDateFrom}
                  onChange={(e) => setPaidDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
                <input
                  type="date"
                  value={paidDateTo}
                  onChange={(e) => setPaidDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Đại lý</label>
                <select
                  value={selectedPaidAgentId}
                  onChange={(e) => setSelectedPaidAgentId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                >
                  <option value="all">Tất cả</option>
                  {Array.from(new Set(paidBills.map(b => b.agentId))).map(agentId => {
                    const agent = agents.find(a => a.id === agentId);
                    return (
                      <option key={agentId} value={agentId}>
                        {agent ? `${agent.name} (${agent.code})` : agentId}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tìm kiếm mã GD</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={paidSearchTerm}
                    onChange={(e) => setPaidSearchTerm(e.target.value)}
                    placeholder="Nhập mã giao dịch"
                    className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        
        {totalPaidAgents === 0 ? (
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-6 sm:p-8 text-center text-slate-500 text-sm sm:text-base">
            Chưa có bill nào được thanh toán
          </div>
        ) : (
          <>
            {paginatedAgentEntries.map(([agentId, bills]) => {
            const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);
            // Lấy note và paidAt từ bill đầu tiên (nếu có)
            const firstBill = bills[0];
            const paidNote = firstBill?.agentPaidNote;
            const paidAt = firstBill?.agentPaidAt;
            const isExpanded = expandedPaidAgents.has(agentId);
            
            return (
              <div key={agentId} className="bg-white rounded-lg sm:rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-green-50 p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{getAgentName(agentId)}</h3>
                      <p className="text-xs sm:text-sm text-slate-500">Mã đại lý: {getAgentCode(agentId)}</p>
                      <p className="text-xs sm:text-sm text-slate-600 mt-1">{bills.length} giao dịch</p>
                    </div>
                    <div className="text-right mr-4">
                      <p className="text-xs sm:text-sm text-slate-500">Tổng tiền</p>
                      <p className="text-lg sm:text-xl font-bold text-green-600">{formatAmount(totalAmount)}</p>
                    </div>
                    <button
                      onClick={() => {
                        const newExpanded = new Set(expandedPaidAgents);
                        if (isExpanded) {
                          newExpanded.delete(agentId);
                        } else {
                          newExpanded.add(agentId);
                        }
                        setExpandedPaidAgents(newExpanded);
                      }}
                      className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>

                  {paidNote && (
                    <div className="mt-2 text-sm text-slate-600">
                      <strong>Ghi chú:</strong> {paidNote}
                      {paidAt && (
                        <span className="text-xs text-slate-500 ml-2">
                          • {formatDate(paidAt)}
                        </span>
                      )}
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
                            <th className="px-3 py-2 text-left">Ngày GD</th>
                            <th className="px-3 py-2 text-right">Số tiền</th>
                            <th className="px-3 py-2 text-left">Phương thức</th>
                            <th className="px-3 py-2 text-left">Điểm thu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {bills.map(bill => {
                            return (
                              <tr key={bill.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono text-xs">{bill.transactionCode}</td>
                                <td className="px-3 py-2">{formatDate(bill.agentPaidAt || bill.createdAt)}</td>
                                <td className="px-3 py-2 text-right font-medium">{formatAmount(bill.amount)}</td>
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
            
            {/* Pagination for paid bills */}
            {paidBillsTotalPages > 1 && (
              <div className="mt-4 sm:mt-6">
                <Pagination
                  currentPage={paidBillsPage}
                  totalPages={paidBillsTotalPages}
                  onPageChange={setPaidBillsPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Unpaid Bills by Agent */}
      {filteredUnpaidBills.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 px-1">Bills chờ thanh toán</h2>
          
          {/* Filters for unpaid bills */}
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Từ ngày</label>
                <input
                  type="date"
                  value={unpaidDateFrom}
                  onChange={(e) => {
                    setUnpaidDateFrom(e.target.value);
                    setUnpaidBillsPage(1);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Đến ngày</label>
                <input
                  type="date"
                  value={unpaidDateTo}
                  onChange={(e) => {
                    setUnpaidDateTo(e.target.value);
                    setUnpaidBillsPage(1);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Đại lý</label>
                <select
                  value={selectedUnpaidAgentId}
                  onChange={(e) => {
                    setSelectedUnpaidAgentId(e.target.value);
                    setUnpaidBillsPage(1);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="all">Tất cả</option>
                  {unpaidAgents.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name} ({agent.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tìm kiếm (mã GD)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={unpaidSearchTerm}
                    onChange={(e) => {
                      setUnpaidSearchTerm(e.target.value);
                      setUnpaidBillsPage(1);
                    }}
                    placeholder="Nhập mã giao dịch..."
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Unpaid Bills Cards by Agent */}
          {(() => {
            const unpaidAgentEntries = Object.entries(unpaidBillsByAgent);
            const unpaidBillsTotalPages = Math.ceil(unpaidAgentEntries.length / unpaidBillsItemsPerPage);
            const paginatedUnpaidAgentEntries = unpaidAgentEntries.slice(
              (unpaidBillsPage - 1) * unpaidBillsItemsPerPage,
              unpaidBillsPage * unpaidBillsItemsPerPage
            );
            
            if (unpaidAgentEntries.length === 0) {
              return (
                <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-6 sm:p-8 text-center text-slate-500 text-sm sm:text-base">
                  Không có bill nào chờ thanh toán
                </div>
              );
            }
            
            return (
              <>
                {paginatedUnpaidAgentEntries.map(([agentId, bills]) => {
                  const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);
                  const isExpanded = expandedUnpaidAgents.has(agentId);
                  
                  return (
                    <div key={agentId} className="bg-white rounded-lg sm:rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-yellow-50 p-4 border-b border-yellow-200">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-base sm:text-lg font-semibold text-slate-900">{getAgentName(agentId)}</h3>
                            <p className="text-xs sm:text-sm text-slate-500">Mã đại lý: {getAgentCode(agentId)}</p>
                            <p className="text-xs sm:text-sm text-slate-600 mt-1">{bills.length} giao dịch</p>
                          </div>
                          <div className="text-right mr-4">
                            <p className="text-xs sm:text-sm text-slate-500">Tổng tiền</p>
                            <p className="text-lg sm:text-xl font-bold text-yellow-600">{formatAmount(totalAmount)}</p>
                          </div>
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedUnpaidAgents);
                              if (isExpanded) {
                                newExpanded.delete(agentId);
                              } else {
                                newExpanded.add(agentId);
                              }
                              setExpandedUnpaidAgents(newExpanded);
                            }}
                            className="p-2 hover:bg-yellow-100 rounded-lg transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          <div className="space-y-2">
                            {bills.map(bill => (
                              <div key={bill.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 p-2.5 sm:p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs sm:text-sm font-medium text-slate-900 break-all">Mã GD: {bill.transactionCode}</p>
                                  <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">{formatDate(bill.createdAt)}</p>
                                </div>
                                <div className="text-left sm:text-right flex-shrink-0">
                                  <p className="text-xs sm:text-sm font-semibold text-slate-900">{formatAmount(bill.amount)}</p>
                                  <p className="text-[10px] sm:text-xs text-yellow-600 mt-0.5">Chờ thanh toán</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {unpaidBillsTotalPages > 1 && (
                  <div className="mt-4 sm:mt-6">
                    <Pagination
                      currentPage={unpaidBillsPage}
                      totalPages={unpaidBillsTotalPages}
                      onPageChange={setUnpaidBillsPage}
                    />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default PaymentStatus;

