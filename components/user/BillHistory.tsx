import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Trash2, X, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { UserService } from '../../src/lib/userServices';
import { ReportService } from '../../src/lib/reportServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { UserBill, Agent, UserBillSession, ReportRecord } from '../../types';
import { cleanupExpiredBillImages } from '../../src/utils/billImageUtils';

const BillHistory: React.FC = () => {
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: reportRecordsData } = useRealtimeData<Record<string, ReportRecord>>('/report_records');
  
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const allBills = FirebaseUtils.objectToArray(billsData || {});
  
  // Filter agents that have bills for this user
  const agentsWithBills = useMemo(() => {
    if (!userId) return [];
    return agents.filter(agent => {
      return allBills.some(bill => bill.agentId === agent.id && bill.userId === userId);
    });
  }, [agents, allBills, userId]);
  
  // TRUY VẤN TRỰC TIẾP TỪ BẢNG BÁO CÁO: Dùng getAllReportRecordsWithMerchants như AdminReport
  const [reportRecordsFromDB, setReportRecordsFromDB] = useState<ReportRecord[]>([]);
  
  useEffect(() => {
    const loadReportRecords = async () => {
      if (!userId) return;
      
      try {
        console.log(`📊 [BillHistory] Querying report records from database (getAllReportRecordsWithMerchants) for userId: ${userId}...`);
        const result = await ReportService.getAllReportRecordsWithMerchants({
          userId,
          dateFrom: undefined,
          dateTo: undefined,
          status: undefined,
          agentId: undefined,
          agentCode: undefined,
          pointOfSaleName: undefined
        }, {
          limit: 10000
        });
        
        console.log(`📊 [BillHistory] Got ${result.records.length} report records from getAllReportRecordsWithMerchants`);
        
        // Debug: Log sample ReportRecords
        if (result.records.length > 0) {
          console.log(`📊 [BillHistory] Sample ReportRecords:`, result.records.slice(0, 5).map((r: ReportRecord) => ({
            id: r.id,
            userBillId: r.userBillId,
            transactionCode: r.transactionCode,
            merchantTransactionId: r.merchantTransactionId,
            merchantAmount: r.merchantAmount,
            hasMerchantsFileData: !!(r.merchantsFileData && Object.keys(r.merchantsFileData).length > 0),
            reconciliationStatus: r.reconciliationStatus || r.status
          })));
        }
        
        setReportRecordsFromDB(result.records);
      } catch (error) {
        console.error('[BillHistory] Error loading report records:', error);
      }
    };
    
    loadReportRecords();
  }, [userId]);
  
  // Map billId -> ReportRecord và transactionCode -> ReportRecord từ data đã query
  const reportRecordsByBillId = useMemo(() => {
    const map: Record<string, ReportRecord> = {};
    reportRecordsFromDB.forEach((record: ReportRecord) => {
      if (record.userBillId) {
        map[record.userBillId] = record;
      }
    });
    console.log(`📊 [BillHistory] Mapped ${Object.keys(map).length} ReportRecords by billId`);
    return map;
  }, [reportRecordsFromDB]);
  
  // Map transactionCode -> ReportRecord
  const reportRecordsByTransactionCode = useMemo(() => {
    const map: Record<string, ReportRecord> = {};
    reportRecordsFromDB.forEach((record: ReportRecord) => {
      if (record.transactionCode) {
        const code = String(record.transactionCode).trim();
        if (code) {
          // Ưu tiên record có userBillId hoặc merchantTransactionId
          const existing = map[code];
          if (!existing || record.userBillId || record.merchantTransactionId) {
            map[code] = record;
          }
        }
      }
    });
    console.log(`📊 [BillHistory] Mapped ${Object.keys(map).length} ReportRecords by transactionCode`);
    return map;
  }, [reportRecordsFromDB]);

  // Helper function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Session workflow state - default to today
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(getTodayDate()); // 'YYYY-MM-DD'
  const [sessions, setSessions] = useState<UserBillSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionBills, setSessionBills] = useState<UserBill[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);

  // Modal state (only for delete confirmation, no edit)
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load sessions when agent and date are selected
  useEffect(() => {
    if (!userId || !selectedDate) {
      setSessions([]);
      setSelectedSessionId(null);
      setSessionBills([]);
      return;
    }

    const loadSessions = async () => {
      setLoadingSessions(true);
      try {
        const agentId = selectedAgent === 'all' ? null : selectedAgent;
        const sessionsData = await UserService.getUserBillSessionsByAgentAndDate(
          userId,
          agentId,
          selectedDate
        );
        setSessions(sessionsData);
        setSelectedSessionId(null);
        setSessionBills([]);
      } catch (error: any) {
        console.error('Error loading sessions:', error);
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    };

    loadSessions();
  }, [userId, selectedAgent, selectedDate]);

  // Load bills when session is selected
  useEffect(() => {
    if (!userId || !selectedSessionId) {
      setSessionBills([]);
      return;
    }

    const loadBills = async () => {
      setLoadingBills(true);
      try {
        const bills = await UserService.getBillsBySession(userId, selectedSessionId);
        
        // Auto-cleanup expired bill images
        if (bills.length > 0) {
          await cleanupExpiredBillImages(bills);
          // Reload after cleanup
          const billsAfterCleanup = await UserService.getBillsBySession(userId, selectedSessionId);
          setSessionBills(billsAfterCleanup);
        } else {
          setSessionBills(bills);
        }
      } catch (error: any) {
        console.error('Error loading bills:', error);
        setSessionBills([]);
      } finally {
        setLoadingBills(false);
      }
    };

    loadBills();
  }, [userId, selectedSessionId]);

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

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (bill: UserBill) => {
    // Tìm ReportRecord bằng userBillId trước (ưu tiên)
    let reportRecord = reportRecordsByBillId[bill.id];
    
    // TRUY VẤN TRỰC TIẾP: Tìm bằng transactionCode (exact match)
    if (!reportRecord && bill.transactionCode) {
      const code = String(bill.transactionCode).trim();
      if (code) {
        reportRecord = reportRecordsByTransactionCode[code];
        
        if (reportRecord) {
          console.log(`✅ [BillHistory] Found ReportRecord ${reportRecord.id} for bill ${bill.id} by transactionCode: ${code}`, {
            hasMerchantAmount: !!reportRecord.merchantAmount,
            merchantAmount: reportRecord.merchantAmount,
            hasMerchantsFileData: !!(reportRecord.merchantsFileData && Object.keys(reportRecord.merchantsFileData).length > 0),
            merchantTransactionId: reportRecord.merchantTransactionId,
            reconciliationStatus: reportRecord.reconciliationStatus || reportRecord.status
          });
        } else {
          console.log(`❌ [BillHistory] No ReportRecord found for bill ${bill.id} with transactionCode: ${code}`);
          // Debug: Kiểm tra xem có ReportRecord nào có transactionCode tương tự không
          const similarCodes = Object.keys(reportRecordsByTransactionCode).filter(k => k.includes(code) || code.includes(k));
          if (similarCodes.length > 0) {
            console.log(`⚠️ [BillHistory] Found similar transactionCodes:`, similarCodes);
          }
        }
      }
    }
    
    if (reportRecord) {
      // Kiểm tra đã match mã chuẩn chi với file merchants:
      // 1. Có merchantTransactionId (đã match với merchant transaction)
      // 2. HOẶC có merchantsFileData (thông tin từ file Excel) VÀ transactionCode match
      const hasMerchantTransactionId = !!reportRecord.merchantTransactionId;
      const hasMerchantsFileData = !!(
        reportRecord.merchantsFileData && 
        Object.keys(reportRecord.merchantsFileData).length > 0
      );
      
      // Kiểm tra transactionCode match (exact match, đơn giản)
      const transactionCodeMatch = String(reportRecord.transactionCode).trim() === String(bill.transactionCode).trim();
      
      console.log(`🔍 [BillHistory] Bill ${bill.id} (${bill.transactionCode}):`, {
        hasMerchantTransactionId,
        hasMerchantsFileData,
        transactionCodeMatch,
        merchantAmount: reportRecord.merchantAmount,
        reconciliationStatus: reportRecord.reconciliationStatus || reportRecord.status
      });
      
      // Đã match mã chuẩn chi nếu:
      // - Có merchantTransactionId, HOẶC
      // - Có merchantsFileData VÀ transactionCode match
      const hasMatchedMerchantTransaction = hasMerchantTransactionId || 
        (hasMerchantsFileData && transactionCodeMatch);
      
      if (hasMatchedMerchantTransaction) {
        // Đã match mã chuẩn chi → hiển thị trạng thái từ reconciliationStatus hoặc status
        const status = reportRecord.reconciliationStatus || reportRecord.status;
        switch (status) {
          case 'MATCHED':
          case 'DONE':
            return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Đã đối soát</span>;
          case 'ERROR':
            return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Lỗi đối soát</span>;
          case 'UNMATCHED':
            return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Chưa khớp</span>;
          case 'PENDING':
            return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Chờ đối soát</span>;
          default:
            // Có match mã chuẩn chi nhưng status không rõ → coi như đã đối soát
            return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Đã đối soát</span>;
        }
      }
      
      // Chưa match mã chuẩn chi → Chờ đối soát
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Chờ đối soát</span>;
    }
    
    // Fallback về bill.status nếu chưa có ReportRecord
    switch (bill.status) {
      case 'MATCHED':
      case 'DONE':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Đã đối soát</span>;
      case 'ERROR':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Lỗi</span>;
      case 'PENDING':
      default:
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Chờ đối soát</span>;
    }
  };

  const isBillLocked = (bill: UserBill): boolean => {
    // Check từ report_records trước (source of truth)
    const reportRecord = reportRecordsByBillId[bill.id];
    
    if (reportRecord) {
      // Có ReportRecord = đã được đối soát, khóa sửa/xóa
      return true;
    }
    
    // Also lock if bill status is not PENDING (already reconciled)
    return bill.status !== 'PENDING';
  };

  const handleDeleteBill = (billId: string) => {
    setDeletingBillId(billId);
  };

  const handleConfirmDelete = async () => {
    if (!deletingBillId) return;

    setIsDeleting(true);
    try {
      await UserService.deleteUserBill(deletingBillId);
      setDeletingBillId(null);
      // Reload bills if a session is selected
      if (selectedSessionId && userId) {
        const bills = await UserService.getBillsBySession(userId, selectedSessionId);
        setSessionBills(bills);
      }
    } catch (error: any) {
      console.error('Error deleting bill:', error);
    } finally {
      setIsDeleting(false);
    }
  };


  if (!userId) {
    return <div>Vui lòng đăng nhập</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Lịch Sử Bill</h2>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Lọc theo đại lý</label>
            <select
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setSelectedSessionId(null);
                setSessionBills([]);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Tất cả đại lý</option>
              {agentsWithBills.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name} ({agent.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Chọn ngày</label>
            <input
              type="date"
              value={selectedDate || ''}
              onChange={(e) => {
                setSelectedDate(e.target.value || null);
                setSelectedSessionId(null);
                setSessionBills([]);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Sessions List */}
      {selectedDate && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Danh sách phiên upload</h3>
          
          {loadingSessions ? (
            <div className="text-center py-8 text-slate-500">Đang tải danh sách phiên...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-2">Không có phiên upload nào trong ngày này</p>
              <p className="text-sm text-slate-400">Vui lòng chọn ngày khác hoặc upload bills mới</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const sessionDate = new Date(session.createdAt);
                const timeStr = formatTime(session.createdAt);
                const dateStr = sessionDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                
                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      selectedSessionId === session.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <span className="font-medium text-slate-900">
                            {timeStr} - {dateStr}
                          </span>
                          {selectedSessionId === session.id && (
                            <CheckCircle className="w-5 h-5 text-indigo-600" />
                          )}
                        </div>
                        <div className="text-sm text-slate-600 mb-2">
                          <span className="font-medium">{session.agentName}</span> ({session.agentCode})
                        </div>
                        <div className="flex items-center space-x-4 text-xs">
                          <span className="text-slate-500">Số bill: <span className="font-semibold text-slate-700">{session.billCount}</span></span>
                          {session.matchedCount > 0 && (
                            <span className="text-green-600">Khớp: <span className="font-semibold">{session.matchedCount}</span></span>
                          )}
                          {session.errorCount > 0 && (
                            <span className="text-red-600">Lỗi: <span className="font-semibold">{session.errorCount}</span></span>
                          )}
                          {session.pendingCount > 0 && (
                            <span className="text-yellow-600">Chờ: <span className="font-semibold">{session.pendingCount}</span></span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state when no date selected */}
      {!selectedDate && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 text-lg mb-2">Vui lòng chọn ngày để xem các phiên upload</p>
          <p className="text-sm text-slate-400">Chọn một ngày ở trên để xem danh sách các phiên upload bills trong ngày đó</p>
        </div>
      )}

      {/* Bills Table - Only show when session is selected */}
      {selectedSessionId && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-800">
              Danh sách bills trong phiên này
            </h3>
            {(() => {
              const session = sessions.find(s => s.id === selectedSessionId);
              if (session) {
                const sessionDate = new Date(session.createdAt);
                const timeStr = formatTime(session.createdAt);
                const dateStr = sessionDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                return (
                  <p className="text-sm text-slate-600 mt-1">
                    {timeStr} {dateStr} - {session.agentName} ({session.agentCode})
                  </p>
                );
              }
              return null;
            })()}
          </div>
          
          {loadingBills ? (
            <div className="text-center py-8 text-slate-500">Đang tải danh sách bills...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Đại lý</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ngày</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Mã GD</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Số tiền</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Loại bill</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Điểm thu</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {sessionBills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        Không có bill nào trong phiên này
                      </td>
                    </tr>
                  ) : (
                    sessionBills.map((bill) => {
                      const locked = isBillLocked(bill);
                      return (
                        <tr key={bill.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-slate-900">{getAgentName(bill.agentId)}</div>
                              <div className="text-sm text-slate-500">{getAgentCode(bill.agentId)}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {formatDate(bill.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                            {bill.transactionCode}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                            {formatAmount(bill.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {bill.paymentMethod}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {bill.pointOfSaleName || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(bill)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {!locked && (
                              <button
                                onClick={() => handleDeleteBill(bill.id)}
                                className="p-2 rounded-lg transition-colors text-red-600 hover:bg-red-50"
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {locked && (
                              <span className="text-xs text-slate-400">Đã khóa</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBillId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Xác nhận xóa</h3>
            </div>

            <p className="text-slate-600 mb-6">
              Bạn có chắc chắn muốn xóa bill này? Hành động này không thể hoàn tác.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingBillId(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Đang xóa...' : 'Xóa'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillHistory;
