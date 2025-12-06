import React, { useState, useEffect } from 'react';
import { Upload, FileCheck, AlertCircle, CheckCircle, Loader, Calendar, User as UserIcon, Filter, Clock } from 'lucide-react';
import { parseExcel, findKey, parseAmount, normalize } from '../../src/utils/excelParserUtils';
import { AgentReconciliationService } from '../../src/lib/agentReconciliationServices';
import { ReconciliationService } from '../../src/lib/firebaseServices';
import { UserService } from '../../src/lib/userServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import { PaymentMethod, TransactionStatus } from '../../types';
import type { UserBill, MerchantTransaction, User, UserBillSession, ReconciliationRecord } from '../../types';

const AgentReconciliation: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;

  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const allBills = FirebaseUtils.objectToArray(billsData || {});
  const allUsers = FirebaseUtils.objectToArray(usersData || {});
  
  // Filter state - Step 1: User selection
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Filter state - Step 2: Date selection
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // 'YYYY-MM-DD'
  
  // Filter state - Step 3: Session selection
  const [sessions, setSessions] = useState<UserBillSession[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  // Filter state - Step 4: Bills from selected sessions
  const [filteredUserBills, setFilteredUserBills] = useState<UserBill[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  
  // Get users that have bills for this agent
  const agentUsers = React.useMemo(() => {
    if (!agentId) return [];
    const userIds = new Set<string>();
    allBills.forEach(bill => {
      if (bill.agentId === agentId && bill.userId) {
        userIds.add(bill.userId);
      }
    });
    return allUsers.filter(u => userIds.has(u.id));
  }, [allBills, allUsers, agentId]);
  
  // Load sessions when user and date are selected
  useEffect(() => {
    if (!agentId || !selectedUserId || !selectedDate) {
      setSessions([]);
      setSelectedSessionIds(new Set());
      setFilteredUserBills([]);
      return;
    }
    
    const loadSessions = async () => {
      setLoadingSessions(true);
      try {
        const sessionsData = await UserService.getUserBillSessionsByAgentAndDate(
          selectedUserId,
          agentId,
          selectedDate
        );
        // Only show sessions with pending bills
        const sessionsWithPending = sessionsData.filter(s => s.pendingCount > 0);
        setSessions(sessionsWithPending);
        // Auto-select all sessions by default
        setSelectedSessionIds(new Set(sessionsWithPending.map(s => s.id)));
      } catch (error) {
        console.error('Error loading sessions:', error);
        setSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    };
    
    loadSessions();
  }, [agentId, selectedUserId, selectedDate]);
  
  // Load bills from selected sessions
  useEffect(() => {
    if (!agentId || !selectedUserId || selectedSessionIds.size === 0) {
      setFilteredUserBills([]);
      return;
    }
    
    const loadBillsFromSessions = async () => {
      setLoadingBills(true);
      try {
        const allBillsFromSessions: UserBill[] = [];
        
        for (const sessionId of selectedSessionIds) {
          const bills = await UserService.getBillsBySession(selectedUserId, sessionId);
          // Only get PENDING bills for reconciliation
          const pendingBills = bills.filter(b => 
            b.status === 'PENDING' && b.agentId === agentId
          );
          allBillsFromSessions.push(...pendingBills);
        }
        
        setFilteredUserBills(allBillsFromSessions);
      } catch (error) {
        console.error('Error loading bills from sessions:', error);
        setFilteredUserBills([]);
      } finally {
        setLoadingBills(false);
      }
    };
    
    loadBillsFromSessions();
  }, [agentId, selectedUserId, selectedSessionIds]);
  
  // Legacy: keep pendingBills for backward compatibility
  const pendingBills = filteredUserBills;
  
  const toggleSession = (sessionId: string) => {
    const newSelected = new Set(selectedSessionIds);
    if (newSelected.has(sessionId)) {
      newSelected.delete(sessionId);
    } else {
      newSelected.add(sessionId);
    }
    setSelectedSessionIds(newSelected);
  };
  
  const selectAllSessions = () => {
    setSelectedSessionIds(new Set(sessions.map(s => s.id)));
  };
  
  const deselectAllSessions = () => {
    setSelectedSessionIds(new Set());
  };

  const [merchantFiles, setMerchantFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseProgress, setParseProgress] = useState<{ total: number; completed: number; currentFile: string }>({ total: 0, completed: 0, currentFile: '' });
  const [reconciliationResults, setReconciliationResults] = useState<{
    matched: number;
    errors: number;
    results: Array<{ billId: string; status: 'MATCHED' | 'ERROR'; errorMessage?: string }>;
  } | null>(null);

  useEffect(() => {
    if (!agentId) {
      window.location.href = '/agent/login';
    }
  }, [agentId]);

  const handleMerchantFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter(file => !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls'));
    if (invalidFiles.length > 0) {
      alert(`Các file không hợp lệ: ${invalidFiles.map(f => f.name).join(', ')}\nVui lòng chọn file Excel (.xlsx hoặc .xls)`);
      return;
    }

    setMerchantFiles(files);
    setReconciliationResults(null);
  };

  const handleReconcile = async () => {
    // Validate filters
    if (!selectedUserId) {
      alert('Vui lòng chọn người dùng để đối soát');
      return;
    }
    
    if (!selectedDate) {
      alert('Vui lòng chọn ngày để đối soát');
      return;
    }
    
    if (selectedSessionIds.size === 0) {
      alert('Vui lòng chọn ít nhất một phiên để đối soát');
      return;
    }

    if (merchantFiles.length === 0) {
      alert('Vui lòng chọn file merchants');
      return;
    }

    if (filteredUserBills.length === 0) {
      alert('Không có bill nào trong các phiên đã chọn. Vui lòng kiểm tra lại.');
      return;
    }

    setIsProcessing(true);
    setReconciliationResults(null);
    setParseProgress({ total: merchantFiles.length, completed: 0, currentFile: '' });

    try {
      // Parse all merchant files
      const allMerchantData: MerchantTransaction[] = [];
      const parseErrors: string[] = [];

      for (let fileIdx = 0; fileIdx < merchantFiles.length; fileIdx++) {
        const file = merchantFiles[fileIdx];
        setParseProgress({ total: merchantFiles.length, completed: fileIdx, currentFile: file.name });

        try {
          console.log(`📄 Đang parse file ${fileIdx + 1}/${merchantFiles.length}: ${file.name}`);
          const rawData = await parseExcel(file);
          
          if (rawData.length === 0) {
            console.warn(`⚠️ File ${file.name} trống hoặc không có dữ liệu hợp lệ`);
            parseErrors.push(`${file.name}: File trống hoặc không có dữ liệu hợp lệ`);
            continue;
          }

          console.log(`✅ File ${file.name}: Đã parse ${rawData.length} dòng`);
          
          // Log first row để debug
          if (rawData.length > 0) {
            const firstRow = rawData[0];
            const availableColumns = Object.keys(firstRow || {});
            console.log('📋 Row đầu tiên (để debug):', firstRow);
            console.log('📋 Các cột có sẵn:', availableColumns);
            
            // Log sample values để user biết file có gì
            const sampleValues: Record<string, any> = {};
            availableColumns.slice(0, 5).forEach(col => {
              sampleValues[col] = firstRow[col];
            });
            console.log('📋 Giá trị mẫu (5 cột đầu):', sampleValues);
          }

          // Filter out empty rows (all values are null/empty)
          const validRows = rawData.filter((row: any) => {
            const values = Object.values(row || {});
            return values.some(v => v !== null && v !== undefined && String(v).trim() !== '');
          });

          console.log(`📊 Sau khi lọc row rỗng: ${validRows.length}/${rawData.length} rows hợp lệ`);

          if (validRows.length === 0) {
            console.warn(`⚠️ File ${file.name}: Tất cả rows đều rỗng`);
            parseErrors.push(`${file.name}: Tất cả rows đều rỗng hoặc không có dữ liệu`);
            continue;
          }
          
          // Check if we can find at least one transaction code in first few rows
          let foundAnyTransactionCode = false;
          for (let i = 0; i < Math.min(5, validRows.length); i++) {
            const row = validRows[i];
            let txnCode = findKey(row, [
              'mã trừ tiền/mã chuẩn chi', 'mã trừ tiền mã chuẩn chi', 'mã trừ tiền', 'mã chuẩn chi',
              'mã giao dịch', 'mã gd', 'transaction code', 'transaction', 'transaction id',
              'mã giao dịch/mã chuẩn chi', 'mã gd/mã chuẩn chi', 'mã giao dịch mã chuẩn chi'
            ]);
            if (!txnCode || String(txnCode).trim() === '') {
              txnCode = guessTransactionCode(row);
            }
            if (txnCode && String(txnCode).trim() !== '') {
              foundAnyTransactionCode = true;
              console.log(`✅ Tìm thấy mã giao dịch mẫu ở row ${i + 1}: ${txnCode}`);
              break;
            }
          }
          
          if (!foundAnyTransactionCode) {
            const sampleColumns = Object.keys(validRows[0] || {});
            console.warn(`⚠️ File ${file.name}: Không tìm thấy mã giao dịch trong 5 rows đầu`);
            parseErrors.push(`${file.name}: Không tìm thấy mã giao dịch. Các cột có sẵn: ${sampleColumns.join(', ')}`);
          }

          const mappedData: MerchantTransaction[] = validRows.map((row: any, idx: number) => {
          // Find transaction code (findKey returns the value)
          let transactionCode = findKey(row, [
            'mã trừ tiền/mã chuẩn chi', 'mã trừ tiền mã chuẩn chi', 'mã trừ tiền', 'mã chuẩn chi',
            'mã giao dịch', 'mã gd', 'transaction code', 'transaction', 'transaction id',
            'mã giao dịch/mã chuẩn chi', 'mã gd/mã chuẩn chi', 'mã giao dịch mã chuẩn chi'
          ]);
          
          if (!transactionCode || transactionCode === '' || String(transactionCode).trim() === '') {
            transactionCode = guessTransactionCode(row);
          }
          
          if (!transactionCode || String(transactionCode).trim() === '') {
            if (idx < 3) { // Chỉ log 3 row đầu để tránh spam
              console.warn(`Row ${idx + 1} không có mã giao dịch. Row data:`, row);
            }
            return null;
          }

          transactionCode = String(transactionCode).trim();

          // Find amount (findKey returns the value)
          const amountValue = findKey(row, ['so tien', 'amount', 'tong tien', 'gia tri', 'so_tien']);
          const amount = amountValue ? parseAmount(amountValue) : 0;

          // Find point of sale (findKey returns the value)
          const pointOfSaleValue = findKey(row, ['diem thu', 'point of sale', 'diem ban', 'ten diem thu', 'diem_thu']);
          const pointOfSaleName = pointOfSaleValue ? String(pointOfSaleValue).trim() : undefined;

          // Find payment method (optional)
          const methodValue = findKey(row, ['phuong thuc', 'payment method', 'loai', 'kenh']);
          let method: PaymentMethod = PaymentMethod.QR_VNPAY; // Default
          if (methodValue) {
            const methodStr = String(methodValue).toLowerCase();
            if (methodStr.includes('pos') || methodStr.includes('phone')) {
              method = PaymentMethod.POS;
            } else if (methodStr.includes('sofpos')) {
              method = PaymentMethod.SOFPOS;
            } else if (methodStr.includes('bank') || methodStr.includes('app')) {
              method = PaymentMethod.QR_BANK;
            }
          }

          return {
            id: `merchant_${Date.now()}_${idx}`,
            merchantCode: '',
            transactionCode,
            amount,
            timestamp: new Date().toISOString(),
            method,
            pointOfSaleName,
            sourceFile: file.name
          } as MerchantTransaction;
        }).filter((mt: MerchantTransaction | null): mt is MerchantTransaction => mt !== null);

          console.log(`✅ File ${file.name}: Đã map ${mappedData.length} giao dịch hợp lệ`);
          allMerchantData.push(...mappedData);
        } catch (error: any) {
          console.error(`❌ Lỗi khi parse file ${file.name}:`, error);
          parseErrors.push(`${file.name}: ${error.message || 'Lỗi không xác định'}`);
        }
      }

      setParseProgress({ total: merchantFiles.length, completed: merchantFiles.length, currentFile: '' });

      if (parseErrors.length > 0) {
        console.warn('⚠️ Có lỗi khi parse một số file:', parseErrors);
      }

      if (allMerchantData.length === 0) {
        const errorMsg = parseErrors.length > 0 
          ? `Không có dữ liệu hợp lệ từ các file Excel.\n\nLỗi chi tiết:\n${parseErrors.join('\n')}\n\nVui lòng kiểm tra:\n- File có đúng định dạng Excel (.xlsx, .xls)\n- File có dữ liệu giao dịch\n- Có cột chứa mã giao dịch (mã trừ tiền, mã chuẩn chi, mã giao dịch, transaction code)`
          : 'Không có dữ liệu hợp lệ từ các file Excel. Vui lòng kiểm tra lại file.';
        alert(errorMsg);
        setIsProcessing(false);
        return;
      }

      console.log(`✅ Tổng cộng: ${allMerchantData.length} giao dịch từ ${merchantFiles.length} file`);

      // Remove duplicates by transactionCode (keep first occurrence)
      const uniqueMerchants = new Map<string, MerchantTransaction>();
      allMerchantData.forEach(mt => {
        if (!uniqueMerchants.has(mt.transactionCode)) {
          uniqueMerchants.set(mt.transactionCode, mt);
        } else {
          console.log(`⚠️ Trùng lặp mã giao dịch: ${mt.transactionCode} (đã bỏ qua)`);
        }
      });

      console.log(`✅ Sau khi loại bỏ trùng lặp: ${uniqueMerchants.size} giao dịch duy nhất`);

      // Reconcile - use filtered bills instead of all pending bills
      console.log(`🔄 Bắt đầu đối soát với ${filteredUserBills.length} bills...`);
      
      // Temporarily update the service to use filtered bills
      // We need to modify reconcileAgentBills to accept bills parameter
      // For now, we'll create a custom reconciliation that uses filtered bills
      const results = await reconcileWithFilteredBills(
        agentId!,
        filteredUserBills,
        Array.from(uniqueMerchants.values())
      );
      console.log(`✅ Đối soát hoàn tất: ${results.matched} khớp, ${results.errors} lỗi`);

      setReconciliationResults(results);
      
      // Refresh bills data
      window.location.reload();
    } catch (error: any) {
      alert(`Đã xảy ra lỗi: ${error.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const guessTransactionCode = (row: any): string | undefined => {
    const keys = Object.keys(row);
    const excludedHeader = /(thoi\s*gian|ngay|date|time|kenh|trang\s*thai|phuong\s*thuc|loai|nguon|so\s*tien|amount|gia\s*tri|value|tong|vnd|chi\s*nhanh|diem\s*thu|stt|hoa\s*don|ngan\s*hang|ma\s*diem|ten\s*khach)/;
    const candidates = keys
      .filter(k => !excludedHeader.test(normalize(k)))
      .map(k => String(row[k] ?? '').trim())
      .filter(v => v && v.length >= 6)
      .filter(v => {
        const nv = normalize(v);
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(nv)) return false;
        if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(nv)) return false;
        if (/\d{1,2}:\d{2}(:\d{2})?/.test(nv)) return false;
        return true;
      })
      .sort((a, b) => {
        const score = (s: string) => (/[a-z]/i.test(s) ? 2 : 0) + (/-|_/i.test(s) ? 1 : 0) + Math.min(s.length, 20) / 20;
        return score(b) - score(a);
      });
    return candidates[0];
  };

  // Custom reconciliation function that uses filtered bills
  const reconcileWithFilteredBills = async (
    agentId: string,
    bills: UserBill[],
    merchantTransactions: MerchantTransaction[]
  ) => {
    const results: Array<{ billId: string; status: 'MATCHED' | 'ERROR'; errorMessage?: string }> = [];
    const reconciliationRecords: ReconciliationRecord[] = [];
    let matchedCount = 0;
    let errorCount = 0;

    // Create a map of merchant transactions by transactionCode
    const merchantMap = new Map<string, MerchantTransaction[]>();
    merchantTransactions.forEach(mt => {
      if (!merchantMap.has(mt.transactionCode)) {
        merchantMap.set(mt.transactionCode, []);
      }
      merchantMap.get(mt.transactionCode)!.push(mt);
    });

    // Process each bill
    for (const bill of bills) {
      const matchingMerchants = merchantMap.get(bill.transactionCode) || [];
      
      if (matchingMerchants.length === 0) {
        await AgentReconciliationService.updateBillStatus(bill.id, 'ERROR', 'Không tìm thấy giao dịch trong file merchants', null);
        results.push({
          billId: bill.id,
          status: 'ERROR',
          errorMessage: 'Không tìm thấy giao dịch trong file merchants'
        });
        
        // Create record for MISSING_IN_MERCHANT
        const record: ReconciliationRecord = {
          id: `REC_${bill.id}_${Date.now()}`,
          transactionCode: bill.transactionCode,
          merchantData: undefined,
          agentData: {
            id: bill.id,
            agentId: bill.agentId,
            transactionCode: bill.transactionCode,
            amount: bill.amount,
            timestamp: bill.timestamp,
            pointOfSaleName: bill.pointOfSaleName,
            invoiceNumber: bill.invoiceNumber,
            imageUrl: bill.imageUrl
          },
          status: TransactionStatus.MISSING_IN_MERCHANT,
          difference: 0,
          processedAt: new Date().toISOString(),
          errorDetail: 'Không tìm thấy giao dịch trong file merchants',
          agentId: bill.agentId,
          paymentMethod: bill.paymentMethod,
          transactionDate: bill.timestamp,
          agentAmount: bill.amount,
          pointOfSaleName: bill.pointOfSaleName
        };
        reconciliationRecords.push(record);
        errorCount++;
        continue;
      }

      // Find merchant that matches all 3 fields
      const matchedMerchant = matchingMerchants.find(mt => {
        const amountMatch = Math.abs(mt.amount - bill.amount) < 1;
        const posMatch = mt.pointOfSaleName === bill.pointOfSaleName || 
                        (!mt.pointOfSaleName && !bill.pointOfSaleName);
        return amountMatch && posMatch;
      });

      if (matchedMerchant) {
        await AgentReconciliationService.updateBillStatus(bill.id, 'MATCHED', undefined, matchedMerchant);
        results.push({
          billId: bill.id,
          status: 'MATCHED'
        });
        
        // Create record for MATCHED
        const record: ReconciliationRecord = {
          id: `REC_${bill.id}_${Date.now()}`,
          transactionCode: bill.transactionCode,
          merchantData: matchedMerchant,
          agentData: {
            id: bill.id,
            agentId: bill.agentId,
            transactionCode: bill.transactionCode,
            amount: bill.amount,
            timestamp: bill.timestamp,
            pointOfSaleName: bill.pointOfSaleName,
            invoiceNumber: bill.invoiceNumber,
            imageUrl: bill.imageUrl
          },
          status: TransactionStatus.MATCHED,
          difference: 0,
          processedAt: new Date().toISOString(),
          agentId: bill.agentId,
          paymentMethod: bill.paymentMethod || matchedMerchant.method,
          transactionDate: bill.timestamp || matchedMerchant.timestamp,
          merchantAmount: matchedMerchant.amount,
          agentAmount: bill.amount,
          pointOfSaleName: bill.pointOfSaleName || matchedMerchant.pointOfSaleName,
          sourceFile: matchedMerchant.sourceFile
        };
        reconciliationRecords.push(record);
        matchedCount++;
      } else {
        const firstMerchant = matchingMerchants[0];
        let errorMessage = '';
        let errorStatus: TransactionStatus = TransactionStatus.ERROR_AMOUNT;
        
        const amountMatch = Math.abs(firstMerchant.amount - bill.amount) < 1;
        const posMatch = firstMerchant.pointOfSaleName === bill.pointOfSaleName ||
                        (!firstMerchant.pointOfSaleName && !bill.pointOfSaleName);
        
        if (!amountMatch) {
          errorMessage = `Số tiền không khớp (Bill: ${bill.amount.toLocaleString('vi-VN')}đ - Merchants: ${firstMerchant.amount.toLocaleString('vi-VN')}đ)`;
          errorStatus = TransactionStatus.ERROR_AMOUNT;
        } else if (!posMatch) {
          errorMessage = `Điểm thu không khớp (Bill: ${bill.pointOfSaleName || 'N/A'} - Merchants: ${firstMerchant.pointOfSaleName || 'N/A'})`;
          errorStatus = TransactionStatus.ERROR_AMOUNT;
        } else {
          errorMessage = 'Không khớp thông tin';
          errorStatus = TransactionStatus.ERROR_AMOUNT;
        }
        
        await AgentReconciliationService.updateBillStatus(bill.id, 'ERROR', errorMessage, firstMerchant);
        results.push({
          billId: bill.id,
          status: 'ERROR',
          errorMessage
        });
        
        // Create record for ERROR
        const record: ReconciliationRecord = {
          id: `REC_${bill.id}_${Date.now()}`,
          transactionCode: bill.transactionCode,
          merchantData: firstMerchant,
          agentData: {
            id: bill.id,
            agentId: bill.agentId,
            transactionCode: bill.transactionCode,
            amount: bill.amount,
            timestamp: bill.timestamp,
            pointOfSaleName: bill.pointOfSaleName,
            invoiceNumber: bill.invoiceNumber,
            imageUrl: bill.imageUrl
          },
          status: errorStatus,
          difference: Math.abs(firstMerchant.amount - bill.amount),
          processedAt: new Date().toISOString(),
          errorDetail: errorMessage,
          agentId: bill.agentId,
          paymentMethod: bill.paymentMethod || firstMerchant.method,
          transactionDate: bill.timestamp || firstMerchant.timestamp,
          merchantAmount: firstMerchant.amount,
          agentAmount: bill.amount,
          pointOfSaleName: bill.pointOfSaleName || firstMerchant.pointOfSaleName,
          sourceFile: firstMerchant.sourceFile
        };
        reconciliationRecords.push(record);
        errorCount++;
      }
    }

    // Create reconciliation session FIRST
    const sessionId = await AgentReconciliationService.createReconciliationSession({
      agentId,
      performedBy: 'AGENT',
      merchantFileName: `merchants_${Date.now()}.xlsx`,
      billCount: bills.length,
      matchedCount,
      errorCount,
      status: 'COMPLETED'
    });

    // Add sessionId to all records
    reconciliationRecords.forEach(record => {
      record.sessionId = sessionId;
    });

    // Save reconciliation records to Firebase
    try {
      await ReconciliationService.saveRecords(sessionId, reconciliationRecords);
      console.log(`✅ Đã lưu ${reconciliationRecords.length} records vào reconciliation_records`);
    } catch (error) {
      console.error('❌ Lỗi khi lưu records:', error);
      // Continue even if records save fails
    }

    return {
      matched: matchedCount,
      errors: errorCount,
      results
    };
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    // dateStr is in 'YYYY-MM-DD' format from input
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  if (!agentId) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Đối Soát</h2>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Filter className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-slate-900">Bộ lọc</h3>
        </div>
        
        <div className="space-y-4">
          {/* Step 1: User Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <UserIcon className="w-4 h-4 inline mr-1" />
              Bước 1: Chọn người dùng
            </label>
            <select
              value={selectedUserId || ''}
              onChange={(e) => {
                setSelectedUserId(e.target.value || null);
                setSelectedDate(null);
                setSessions([]);
                setSelectedSessionIds(new Set());
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">-- Chọn người dùng --</option>
              {agentUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.fullName} ({user.phone})
                </option>
              ))}
            </select>
          </div>
          
          {/* Step 2: Date Selector */}
          {selectedUserId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Bước 2: Chọn ngày
              </label>
              <input
                type="date"
                value={selectedDate || ''}
                onChange={(e) => {
                  setSelectedDate(e.target.value || null);
                  setSessions([]);
                  setSelectedSessionIds(new Set());
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}
          
          {/* Step 3: Session Selector */}
          {selectedUserId && selectedDate && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Bước 3: Chọn phiên ({sessions.length} phiên)
                </label>
                {sessions.length > 0 && (
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={selectAllSessions}
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                    >
                      Chọn tất cả
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={deselectAllSessions}
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                    >
                      Bỏ chọn tất cả
                    </button>
                  </div>
                )}
              </div>
              
              {loadingSessions ? (
                <div className="text-sm text-slate-500 py-4 text-center">Đang tải phiên...</div>
              ) : sessions.length === 0 ? (
                <div className="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-lg">
                  Không có phiên nào trong ngày này
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                  {sessions.map(session => (
                    <label
                      key={session.id}
                      className={`flex items-center p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                        selectedSessionIds.has(session.id) ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSessionIds.has(session.id)}
                        onChange={() => toggleSession(session.id)}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">
                            {new Date(session.createdAt).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit'
                            })}
                          </span>
                          <div className="flex items-center space-x-3 text-xs text-slate-600">
                            <span className="flex items-center">
                              <CheckCircle className="w-3 h-3 mr-1 text-green-600" />
                              {session.matchedCount} khớp
                            </span>
                            <span className="flex items-center">
                              <AlertCircle className="w-3 h-3 mr-1 text-red-600" />
                              {session.errorCount} lỗi
                            </span>
                            <span className="flex items-center">
                              <Clock className="w-3 h-3 mr-1 text-blue-600" />
                              {session.pendingCount} chờ
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Tổng: {session.billCount} bills
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Summary */}
        {selectedUserId && selectedDate && selectedSessionIds.size > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              {loadingBills ? (
                'Đang tải bills...'
              ) : (
                <>
                  Đang đối soát với bill của{' '}
                  <strong>{agentUsers.find(u => u.id === selectedUserId)?.fullName || 'N/A'}</strong>
                  {' '}ngày {formatDate(selectedDate)} 
                  {' '}(<strong>{selectedSessionIds.size}</strong> phiên, <strong>{filteredUserBills.length}</strong> bills)
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-md">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <FileCheck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-base font-bold text-blue-900">
              {loadingBills ? 'Đang tải...' : `Có ${filteredUserBills.length} bill đang chờ đối soát`}
            </p>
            <p className="text-sm text-blue-700 mt-1">
              {selectedUserId && selectedDate && selectedSessionIds.size > 0
                ? 'Upload file merchants để đối soát với các bill đã chọn'
                : 'Vui lòng chọn người dùng, ngày và các phiên để xem bills'}
            </p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
            <FileCheck className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Upload File Merchants</h3>
            <p className="text-sm text-slate-500">Chọn file Excel để đối soát với bills</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 hover:border-indigo-400 transition-colors">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Chọn file Excel (.xlsx, .xls)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={handleMerchantFilesUpload}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 file:cursor-pointer transition-colors"
            />
            <p className="text-xs text-slate-500 mt-3 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Có thể chọn nhiều file cùng lúc. Hệ thống sẽ tự động merge và loại bỏ trùng lặp.
            </p>
          </div>

          {merchantFiles.length > 0 && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200">
              <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-600" />
                Đã chọn {merchantFiles.length} file:
              </p>
              <ul className="space-y-2">
                {merchantFiles.map((file, idx) => (
                  <li key={idx} className="text-sm text-slate-700 flex items-center space-x-2 bg-white rounded-lg p-2 shadow-sm">
                    <FileCheck className="w-4 h-4 text-green-600" />
                    <span className="font-mono">{file.name}</span>
                    <span className="text-xs text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Parse Progress */}
          {isProcessing && parseProgress.total > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">
                  {parseProgress.currentFile ? `Đang xử lý: ${parseProgress.currentFile}` : 'Đang đối soát...'}
                </span>
                <span className="text-sm text-blue-600">
                  {parseProgress.completed}/{parseProgress.total} ({Math.round((parseProgress.completed / parseProgress.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(parseProgress.completed / parseProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          <button
            onClick={handleReconcile}
            disabled={isProcessing || merchantFiles.length === 0 || filteredUserBills.length === 0 || !selectedDate || !selectedUserId || selectedSessionIds.size === 0}
            className="w-full inline-flex items-center justify-center px-6 py-4 border border-transparent text-base font-semibold rounded-xl text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
          >
            {isProcessing ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                Đang đối soát...
              </>
            ) : (
              <>
                <FileCheck className="w-5 h-5 mr-2" />
                Bắt đầu đối soát
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {reconciliationResults && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Kết quả đối soát</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm text-green-700">Khớp</p>
                  <p className="text-2xl font-bold text-green-900">{reconciliationResults.matched}</p>
                </div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-sm text-red-700">Lỗi</p>
                  <p className="text-2xl font-bold text-red-900">{reconciliationResults.errors}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mã GD</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Số tiền</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Điểm thu</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {reconciliationResults.results.map((result) => {
                  const bill = filteredUserBills.find(b => b.id === result.billId) || 
                               allBills.find(b => b.id === result.billId);
                  if (!bill) return null;

                  return (
                    <tr key={result.billId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                        {bill.transactionCode}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {formatAmount(bill.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {bill.pointOfSaleName || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {result.status === 'MATCHED' ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                            Khớp
                          </span>
                        ) : (
                          <div>
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                              Lỗi
                            </span>
                            {result.errorMessage && (
                              <p className="text-xs text-red-600 mt-1">{result.errorMessage}</p>
                            )}
                          </div>
                        )}
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
};

export default AgentReconciliation;

