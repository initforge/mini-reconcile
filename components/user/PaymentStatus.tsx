import React, { useState, useMemo } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { UserBill, Agent, AgentPaymentToUser } from '../../types';
import Pagination from '../Pagination';

const PaymentStatus: React.FC = () => {
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: paymentsData } = useRealtimeData<Record<string, AgentPaymentToUser>>('/agent_payments_to_users');

  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const allBills = FirebaseUtils.objectToArray(billsData || {});
  const allPayments = FirebaseUtils.objectToArray(paymentsData || {});

  // Pagination state for paid bills
  const [paidBillsPage, setPaidBillsPage] = useState(1);
  const paidBillsItemsPerPage = 5;

  // Get user's bills
  const userBills = allBills.filter(bill => bill.userId === userId);
  
  // Build a Set of billIds from payments where payment.status === 'PAID'
  const paidFromPayments = useMemo(() => {
    const paidBillIds = new Set<string>();
    allPayments.forEach(payment => {
      if (payment.status === 'PAID' && payment.billIds && Array.isArray(payment.billIds)) {
        payment.billIds.forEach(billId => paidBillIds.add(billId));
      }
    });
    return paidBillIds;
  }, [allPayments]);
  
  // Helper function to determine if a bill is paid from user's perspective
  const isPaidByUserView = (bill: UserBill): boolean => {
    // Check if bill.isPaidByAgent is true (legacy or direct flag)
    if (bill.isPaidByAgent === true) {
      return true;
    }
    
    // Check if bill is in any paid payment record
    if (paidFromPayments.has(bill.id)) {
      return true;
    }
    
    return false;
  };
  
  // Separate bills into paid and pending
  const paidBills = userBills.filter(isPaidByUserView);
  const unpaidBills = userBills.filter(bill => !isPaidByUserView(bill) && bill.status === 'MATCHED');

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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Đã thanh toán</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{paidBills.length}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Chờ thanh toán</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{unpaidBills.length}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Paid Bills by Agent */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Bills đã được thanh toán</h2>
        
        {totalPaidAgents === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            Chưa có bill nào được thanh toán
          </div>
        ) : (
          <>
            {paginatedAgentEntries.map(([agentId, bills]) => {
            const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);
            // Find payment that includes any of these bills
            const payment = allPayments.find(p => 
              (p.userId === userId || bills.some(b => p.billIds?.includes(b.id))) && 
              p.agentId === agentId &&
              p.status === 'PAID'
            );
            
            return (
              <div key={agentId} className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{getAgentName(agentId)}</h3>
                    <p className="text-sm text-slate-500">Mã đại lý: {getAgentCode(agentId)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Tổng tiền</p>
                    <p className="text-xl font-bold text-green-600">{formatAmount(totalAmount)}</p>
                  </div>
                </div>

                {payment && payment.note && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-800">
                      <strong>Ghi chú:</strong> {payment.note}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Thanh toán lúc: {formatDate(payment.paidAt)}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {bills.map(bill => (
                    <div key={bill.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Mã GD: {bill.transactionCode}</p>
                        <p className="text-xs text-slate-500">{formatDate(bill.paidByAgentAt || bill.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{formatAmount(bill.amount)}</p>
                        {bill.paidByAgentNote && (
                          <p className="text-xs text-slate-500">{bill.paidByAgentNote}</p>
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
              <div className="mt-6">
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
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Bills chờ thanh toán</h2>
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="space-y-2">
              {unpaidBills.map(bill => (
                <div key={bill.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {getAgentName(bill.agentId)} - Mã GD: {bill.transactionCode}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(bill.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatAmount(bill.amount)}</p>
                    <p className="text-xs text-yellow-600">Chờ thanh toán</p>
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

