import React, { useState } from 'react';
import { CreditCard, CheckCircle, Clock } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { UserBill, Agent, AgentPaymentToUser } from '../../types';

const PaymentStatus: React.FC = () => {
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: paymentsData } = useRealtimeData<Record<string, AgentPaymentToUser>>('/agent_payments_to_users');

  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const allBills = FirebaseUtils.objectToArray(billsData || {});
  const allPayments = FirebaseUtils.objectToArray(paymentsData || {});

  // Get user's bills grouped by agent
  const userBills = allBills.filter(bill => bill.userId === userId);
  const paidBills = userBills.filter(bill => bill.isPaidByAgent);
  const unpaidBills = userBills.filter(bill => !bill.isPaidByAgent && bill.status === 'MATCHED');

  // Group by agent
  const billsByAgent = paidBills.reduce((acc, bill) => {
    if (!acc[bill.agentId]) {
      acc[bill.agentId] = [];
    }
    acc[bill.agentId].push(bill);
    return acc;
  }, {} as Record<string, UserBill[]>);

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Tổng số bill</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{userBills.length}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
        </div>

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
        
        {Object.keys(billsByAgent).length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            Chưa có bill nào được thanh toán
          </div>
        ) : (
          Object.entries(billsByAgent).map(([agentId, bills]) => {
            const totalAmount = bills.reduce((sum, bill) => sum + bill.amount, 0);
            const payment = allPayments.find(p => p.userId === userId && p.agentId === agentId);
            
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
          })
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

