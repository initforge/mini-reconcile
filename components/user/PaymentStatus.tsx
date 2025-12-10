import React, { useState, useMemo } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { UserBill, Agent } from '../../types';
import Pagination from '../Pagination';

const PaymentStatus: React.FC = () => {
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  // XÓA: Không cần paymentsData nữa vì chỉ dùng user_bills.agentPaymentStatus

  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const allBills = FirebaseUtils.objectToArray(billsData || {});

  // Pagination state for paid bills
  const [paidBillsPage, setPaidBillsPage] = useState(1);
  const paidBillsItemsPerPage = 5;

  // Get user's bills
  const userBills = allBills.filter(bill => bill.userId === userId);
  
  // ĐƠN GIẢN HÓA: Chỉ check agentPaymentStatus trong user_bills
  const paidBills = userBills.filter(bill => bill.agentPaymentStatus === 'PAID');
  const unpaidBills = userBills.filter(bill => 
    (!bill.agentPaymentStatus || bill.agentPaymentStatus !== 'PAID') && bill.status === 'MATCHED'
  );

  // Group by agent
  const billsByAgent = useMemo(() => {
    return paidBills.reduce((acc, bill) => {
    if (!acc[bill.agentId]) {
      acc[bill.agentId] = [];
    }
    acc[bill.agentId].push(bill);
    return acc;
  }, {} as Record<string, UserBill[]>);
  }, [paidBills]);

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
              <p className="text-xl sm:text-2xl font-bold text-yellow-600 mt-0.5 sm:mt-1">{unpaidBills.length}</p>
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
            
            return (
              <div key={agentId} className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{getAgentName(agentId)}</h3>
                    <p className="text-xs sm:text-sm text-slate-500">Mã đại lý: {getAgentCode(agentId)}</p>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <p className="text-xs sm:text-sm text-slate-500">Tổng tiền</p>
                    <p className="text-lg sm:text-xl font-bold text-green-600">{formatAmount(totalAmount)}</p>
                  </div>
                </div>

                {paidNote && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 sm:p-3 mb-3 sm:mb-4">
                    <p className="text-xs sm:text-sm text-blue-800 break-words">
                      <strong>Ghi chú:</strong> {paidNote}
                    </p>
                    {paidAt && (
                      <p className="text-[10px] sm:text-xs text-blue-600 mt-1">
                        Thanh toán lúc: {formatDate(paidAt)}
                    </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {bills.map(bill => (
                    <div key={bill.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 p-2.5 sm:p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-slate-900 break-all">Mã GD: {bill.transactionCode}</p>
                        <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">{formatDate(bill.agentPaidAt || bill.createdAt)}</p>
                      </div>
                      <div className="text-left sm:text-right flex-shrink-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900">{formatAmount(bill.amount)}</p>
                        {bill.agentPaidNote && (
                          <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 break-words">{bill.agentPaidNote}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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

      {/* Unpaid Bills */}
      {unpaidBills.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 px-1">Bills chờ thanh toán</h2>
          <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-4 sm:p-6">
            <div className="space-y-2">
              {unpaidBills.map(bill => (
                <div key={bill.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 p-2.5 sm:p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 break-words">
                      {getAgentName(bill.agentId)} - Mã GD: {bill.transactionCode}
                    </p>
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
        </div>
      )}
    </div>
  );
};

export default PaymentStatus;

