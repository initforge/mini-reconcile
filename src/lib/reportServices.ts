// Report services for managing report_records
import { ref, get, push, update, remove } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { ReportRecord, ReportStatus, AdminPaymentStatus, AgentPaymentStatus, UserBill, MerchantTransaction } from '../../types';
import { MerchantTransactionsService } from './firebaseServices';
import { UserService } from './userServices';

export interface ReportRecordFilters {
  userId?: string;
  agentId?: string;
  agentCode?: string;
  status?: ReportStatus;
  dateFrom?: string;   // ISO
  dateTo?: string;     // ISO
  pointOfSaleName?: string; // Filter by point of sale
}

export interface PaginationOptions {
  limit?: number;
  cursor?: string;     // lastDocId / startAfter token
}

export interface PaginatedReportResult {
  records: ReportRecord[];
  nextCursor?: string;
  total?: number;
}

export const ReportService = {
  /**
   * Tạo report record sau khi đối soát
   */
  async createReportRecord(
    data: Omit<ReportRecord, 'id' | 'createdAt'>
  ): Promise<string> {
    const newRecord: Omit<ReportRecord, 'id'> = {
      ...data,
      createdAt: FirebaseUtils.getServerTimestamp()
    };
    const newRef = await push(ref(database, 'report_records'), newRecord);
    return newRef.key!;
  },

  /**
   * Tạo nhiều report records cùng lúc (batch)
   */
  async createReportRecords(
    records: Array<Omit<ReportRecord, 'id' | 'createdAt'>>
  ): Promise<string[]> {
    const createdIds: string[] = [];
    const timestamp = FirebaseUtils.getServerTimestamp();
    
    // Firebase Realtime Database không hỗ trợ batch write như Firestore
    // Nên phải dùng Promise.all để tạo nhiều records
    // Remove undefined values before pushing to Firebase
    const promises = records.map(async (record) => {
      // Remove undefined values - Firebase doesn't allow undefined
      const cleanRecord: any = {};
      Object.keys(record).forEach(key => {
        const value = (record as any)[key];
        if (value !== undefined) {
          cleanRecord[key] = value;
        }
      });
      
      const newRecord: Omit<ReportRecord, 'id'> = {
        ...cleanRecord,
        createdAt: timestamp
      };
      const newRef = await push(ref(database, 'report_records'), newRecord);
      return newRef.key!;
    });
    
    const ids = await Promise.all(promises);
    return ids;
  },

  /**
   * Lấy danh sách report_records với filter + pagination
   */
  async getReportRecords(
    filters: ReportRecordFilters,
    options?: PaginationOptions
  ): Promise<PaginatedReportResult> {
    const snapshot = await get(ref(database, 'report_records'));
    let records = FirebaseUtils.objectToArray<ReportRecord>(snapshot.val() || {});

    // Apply filters
    if (filters.userId) {
      records = records.filter(r => r.userId === filters.userId);
    }
    if (filters.agentId) {
      records = records.filter(r => r.agentId === filters.agentId);
    }
    if (filters.agentCode) {
      records = records.filter(r => r.agentCode === filters.agentCode);
    }
    if (filters.status) {
      records = records.filter(r => r.status === filters.status);
    }
    if (filters.pointOfSaleName) {
      records = records.filter(r => 
        r.pointOfSaleName === filters.pointOfSaleName || 
        r.merchantPointOfSaleName === filters.pointOfSaleName
      );
    }
    if (filters.dateFrom || filters.dateTo) {
      records = records.filter(r => {
        // Use transactionDate, createdAt, reconciledAt, or userBillCreatedAt as fallback
        const dateToCheck = r.transactionDate || r.userBillCreatedAt || r.reconciledAt || r.createdAt;
        if (!dateToCheck) return true; // Include if no date
        
        try {
          // Handle both ISO string and Date object
          const dateStr = typeof dateToCheck === 'string' ? dateToCheck : dateToCheck.toISOString();
          const recordDate = dateStr.split('T')[0]; // Extract YYYY-MM-DD
          // Include records where date is >= dateFrom and <= dateTo (inclusive)
          if (filters.dateFrom && recordDate < filters.dateFrom) return false;
          if (filters.dateTo && recordDate > filters.dateTo) return false;
          return true;
        } catch (error) {
          console.warn(`Error parsing date for record ${r.id}:`, error);
          return true; // Include if parsing fails
        }
      });
    }

    // Sort by createdAt descending (newest first)
    records.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const limit = options?.limit || 50;
    let paginatedRecords = records;
    
    if (options?.cursor) {
      // Find the index of cursor record
      const cursorIndex = records.findIndex(r => r.id === options.cursor);
      if (cursorIndex >= 0) {
        paginatedRecords = records.slice(cursorIndex + 1, cursorIndex + 1 + limit);
      } else {
        paginatedRecords = records.slice(0, limit);
      }
    } else {
      paginatedRecords = records.slice(0, limit);
    }

    const nextCursor = paginatedRecords.length === limit && 
      records.length > paginatedRecords.length
      ? paginatedRecords[paginatedRecords.length - 1].id
      : undefined;

    return {
      records: paginatedRecords,
      nextCursor,
      total: records.length
    };
  },

  /**
   * Lấy TẤT CẢ merchant_transactions và merge với report_records
   * Logic mới: Hiển thị TẤT CẢ merchant transactions, không phụ thuộc vào phiên
   * - Nếu có matching bill: dùng report_record hoặc tạo virtual
   * - Nếu không có bill: tạo virtual ReportRecord với merchant data, phần bill để trống
   */
  async getAllReportRecordsWithMerchants(
    filters: ReportRecordFilters,
    options?: PaginationOptions
  ): Promise<PaginatedReportResult> {
    // Load TẤT CẢ merchant_transactions
    const merchantSnapshot = await get(ref(database, 'merchant_transactions'));
    const allMerchantTransactions = FirebaseUtils.objectToArray<MerchantTransaction>(merchantSnapshot.val() || {});

    // Load TẤT CẢ report_records
    const reportSnapshot = await get(ref(database, 'report_records'));
    const allReportRecords = FirebaseUtils.objectToArray<ReportRecord>(reportSnapshot.val() || {});

    // Load TẤT CẢ user_bills để match
    const billsSnapshot = await get(ref(database, 'user_bills'));
    const allBills = FirebaseUtils.objectToArray<UserBill>(billsSnapshot.val() || {});

    // Tạo map: merchantTransactionId -> ReportRecord
    const reportByMerchantId = new Map<string, ReportRecord>();
    allReportRecords.forEach(report => {
      if (report.merchantTransactionId) {
        reportByMerchantId.set(report.merchantTransactionId, report);
      }
    });

    // Tạo map: transactionCode -> UserBill[] (có thể có nhiều bills cùng transactionCode)
    const billsByTransactionCode = new Map<string, UserBill[]>();
    allBills.forEach(bill => {
      if (bill.transactionCode) {
        if (!billsByTransactionCode.has(bill.transactionCode)) {
          billsByTransactionCode.set(bill.transactionCode, []);
        }
        billsByTransactionCode.get(bill.transactionCode)!.push(bill);
      }
    });

    // ĐƠN GIẢN HÓA: Chỉ dùng 1 map transactionCode -> ReportRecord
    // Ưu tiên: 1) Record có merchantTransactionId (có data từ Excel), 2) Record có userBillId
    const recordsByTransactionCode = new Map<string, ReportRecord>();

    // Bước 1: Xử lý tất cả merchant transactions - mapping trực tiếp theo transactionCode
    for (const merchant of allMerchantTransactions) {
      // Bỏ qua merchant transaction không có transactionCode hoặc transactionCode rỗng
      if (!merchant.transactionCode || merchant.transactionCode.trim() === '') {
        continue;
      }

      // Bỏ qua merchant transaction không có amount hoặc amount = 0
      if (!merchant.amount || isNaN(merchant.amount) || merchant.amount <= 0) {
        continue;
      }

      const code = String(merchant.transactionCode).trim();
      
      // Tìm ReportRecord hiện có cho transactionCode này
      const existingReport = allReportRecords.find(r => 
        r.transactionCode && String(r.transactionCode).trim() === code && r.merchantTransactionId === merchant.id
      );

      // Tìm matching bill nếu có
      const matchingBills = billsByTransactionCode.get(code) || [];
      let matchedBill: UserBill | undefined;
      let status: ReportStatus = 'UNMATCHED';
      let errorMessage: string = '';
      let reconciliationStatus: 'PENDING' | 'MATCHED' | 'ERROR' | 'UNMATCHED' = 'UNMATCHED';

      if (matchingBills.length > 0) {
        // Tìm bill match tốt nhất (theo amount và pointOfSaleName)
        matchedBill = matchingBills.find(bill => {
          const amountMatch = Math.abs((merchant.amountBeforeDiscount || merchant.amount) - bill.amount) < 1;
          const posMatch = (!merchant.pointOfSaleName && !bill.pointOfSaleName) ||
                          (merchant.pointOfSaleName && bill.pointOfSaleName &&
                           merchant.pointOfSaleName === bill.pointOfSaleName);
          return amountMatch && posMatch;
        });

        if (matchedBill) {
          const amountMatch = Math.abs((merchant.amountBeforeDiscount || merchant.amount) - matchedBill.amount) < 1;
          const posMatch = (!merchant.pointOfSaleName && !matchedBill.pointOfSaleName) ||
                          (merchant.pointOfSaleName && matchedBill.pointOfSaleName &&
                           merchant.pointOfSaleName === matchedBill.pointOfSaleName);

          if (amountMatch && posMatch) {
            status = 'MATCHED';
            reconciliationStatus = 'MATCHED';
            errorMessage = '';
          } else {
            status = 'ERROR';
            reconciliationStatus = 'ERROR';
            const errors: string[] = [];
            if (!amountMatch) {
              errors.push(`Sai số tiền: ${(merchant.amountBeforeDiscount || merchant.amount).toLocaleString('vi-VN')}đ vs ${matchedBill.amount.toLocaleString('vi-VN')}đ`);
            }
            if (!posMatch) {
              const merchantPos = merchant.pointOfSaleName || '(không có)';
              const billPos = matchedBill.pointOfSaleName || '(không có)';
              errors.push(`Sai điểm bán: ${merchantPos} vs ${billPos}`);
            }
            errorMessage = `Chưa khớp - ${errors.join('; ')}`;
          }
        } else {
          status = 'ERROR';
          reconciliationStatus = 'ERROR';
          errorMessage = 'Có bill nhưng không khớp (sai số tiền hoặc điểm bán)';
        }
      } else {
        status = 'UNMATCHED';
        reconciliationStatus = 'UNMATCHED';
        errorMessage = 'Chưa có bill hoặc không tìm thấy mã chuẩn chi trong bills';
      }

      // Nếu đã có ReportRecord cho merchant này, dùng nó và merge merchant data
      if (existingReport) {
        // Merge merchant data vào existing report
        const mergedRecord: ReportRecord = {
          ...existingReport,
          merchantTransactionId: merchant.id,
          merchantCode: merchant.merchantCode,
          merchantAmount: merchant.amount,
          merchantAmountBeforeDiscount: merchant.amountBeforeDiscount,
          merchantPointOfSaleName: merchant.pointOfSaleName,
          merchantBranchName: merchant.branchName,
          merchantInvoiceNumber: merchant.invoiceNumber,
          merchantPhoneNumber: merchant.phoneNumber,
          merchantPromotionCode: merchant.promotionCode,
          merchantTransactionDate: merchant.transactionDate,
          merchantsFileData: merchant.rawData,
          status: existingReport.status || status,
          reconciliationStatus: existingReport.reconciliationStatus || reconciliationStatus,
          errorMessage: existingReport.errorMessage || errorMessage || undefined
        };
        recordsByTransactionCode.set(code, mergedRecord);
      } else {
        // Tạo virtual ReportRecord từ merchant transaction
        const virtualRecord: ReportRecord = {
          id: `virtual_${merchant.id}`,
          userBillId: matchedBill?.id,
          userId: matchedBill?.userId,
          agentId: matchedBill?.agentId,
          agentCode: matchedBill?.agentCode,
          transactionCode: code,
          amount: matchedBill?.amount || merchant.amount,
          paymentMethod: matchedBill?.paymentMethod || 'QR_VNPAY',
          pointOfSaleName: matchedBill?.pointOfSaleName,
          transactionDate: merchant.transactionDate || matchedBill?.timestamp || new Date().toISOString(),
          userBillCreatedAt: matchedBill?.createdAt,
          invoiceNumber: matchedBill?.invoiceNumber,
          merchantTransactionId: merchant.id,
          merchantCode: merchant.merchantCode,
          merchantAmount: merchant.amount,
          merchantAmountBeforeDiscount: merchant.amountBeforeDiscount,
          merchantPointOfSaleName: merchant.pointOfSaleName,
          merchantBranchName: merchant.branchName,
          merchantInvoiceNumber: merchant.invoiceNumber,
          merchantPhoneNumber: merchant.phoneNumber,
          merchantPromotionCode: merchant.promotionCode,
          merchantTransactionDate: merchant.transactionDate,
          status,
          reconciliationStatus,
          errorMessage: errorMessage || undefined,
          merchantsFileData: merchant.rawData,
          reconciledAt: FirebaseUtils.getServerTimestamp(),
          reconciledBy: 'ADMIN',
          createdAt: merchant.createdAt || FirebaseUtils.getServerTimestamp()
        };
        
        // CHỈ thêm nếu chưa có record cho transactionCode này
        if (!recordsByTransactionCode.has(code)) {
          recordsByTransactionCode.set(code, virtualRecord);
        }
      }
    }

    // Bước 2: Thêm các ReportRecords không có merchantTransactionId (từ bills cũ)
    // CHỈ thêm nếu chưa có record cho transactionCode đó
    allReportRecords.forEach(report => {
      if (!report.merchantTransactionId && report.transactionCode) {
        const code = String(report.transactionCode).trim();
        if (code && !recordsByTransactionCode.has(code)) {
          // Chỉ thêm nếu có transactionCode hợp lệ và amount hợp lệ
          const hasValidAmount = report.amount && !isNaN(report.amount) && report.amount > 0;
          if (hasValidAmount) {
            recordsByTransactionCode.set(code, report);
          }
        }
      }
    });

    const finalRecords = Array.from(recordsByTransactionCode.values());

    // Apply filters
    let filteredRecords = finalRecords;
    if (filters.userId) {
      filteredRecords = filteredRecords.filter(r => r.userId === filters.userId);
    }
    if (filters.agentId) {
      filteredRecords = filteredRecords.filter(r => r.agentId === filters.agentId);
    }
    if (filters.agentCode) {
      filteredRecords = filteredRecords.filter(r => r.agentCode === filters.agentCode);
    }
    if (filters.status) {
      filteredRecords = filteredRecords.filter(r => r.status === filters.status);
    }
    if (filters.pointOfSaleName) {
      filteredRecords = filteredRecords.filter(r => 
        r.pointOfSaleName === filters.pointOfSaleName || 
        r.merchantPointOfSaleName === filters.pointOfSaleName
      );
    }
    if (filters.dateFrom || filters.dateTo) {
      filteredRecords = filteredRecords.filter(r => {
        const dateToCheck = r.transactionDate || r.userBillCreatedAt || r.reconciledAt || r.createdAt || r.merchantTransactionDate;
        if (!dateToCheck) return true;
        
        try {
          const dateStr = typeof dateToCheck === 'string' ? dateToCheck : dateToCheck.toISOString();
          const recordDate = dateStr.split('T')[0];
          if (filters.dateFrom && recordDate < filters.dateFrom) return false;
          if (filters.dateTo && recordDate > filters.dateTo) return false;
          return true;
        } catch (error) {
          console.warn(`Error parsing date for record ${r.id}:`, error);
          return true;
        }
      });
    }

    // Sort by createdAt descending (newest first)
    filteredRecords.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.merchantTransactionDate || 0).getTime();
      const dateB = new Date(b.createdAt || b.merchantTransactionDate || 0).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const limit = options?.limit || 10000;
    let paginatedRecords = filteredRecords;
    
    if (options?.cursor) {
      const cursorIndex = filteredRecords.findIndex(r => r.id === options.cursor);
      if (cursorIndex >= 0) {
        paginatedRecords = filteredRecords.slice(cursorIndex + 1, cursorIndex + 1 + limit);
      } else {
        paginatedRecords = filteredRecords.slice(0, limit);
      }
    } else {
      paginatedRecords = filteredRecords.slice(0, limit);
    }

    return {
      records: paginatedRecords,
      nextCursor: undefined,
      total: filteredRecords.length
    };
  },

  /**
   * Lấy một report record theo ID
   */
  async getReportRecordById(recordId: string): Promise<ReportRecord | null> {
    const snapshot = await get(ref(database, `report_records/${recordId}`));
    const data = snapshot.val();
    if (!data) return null;
    return { ...data, id: recordId };
  },

  /**
   * Update report record (chỉ cho Admin)
   */
  async updateReportRecord(
    recordId: string,
    updates: Partial<ReportRecord>
  ): Promise<void> {
    // Track edited fields
    const editedFields: string[] = [];
    const existingRecord = await this.getReportRecordById(recordId);
    
    if (existingRecord) {
      Object.keys(updates).forEach(key => {
        if (key !== 'id' && key !== 'createdAt' && updates[key as keyof ReportRecord] !== existingRecord[key as keyof ReportRecord]) {
          editedFields.push(key);
        }
      });
    }

    const updateData: any = {
      ...updates,
      isManuallyEdited: true,
      editedFields: editedFields.length > 0 ? editedFields : existingRecord?.editedFields || []
    };

    await update(ref(database, `report_records/${recordId}`), updateData);
  },

  /**
   * Update payment status cho Admin → Agent (từ ReportRecord)
   * Khi update trong báo cáo, đồng bộ với AdminPaymentToAgent và PaymentBatch
   */
  async updateAdminPaymentStatus(
    reportRecordId: string,
    newStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'CANCELLED'
  ): Promise<void> {
    const record = await this.getReportRecordById(reportRecordId);
    if (!record || !record.adminPaymentId) {
      throw new Error('ReportRecord không có adminPaymentId');
    }

    const updates: any = {};
    const timestamp = FirebaseUtils.getServerTimestamp();

    // Update ReportRecord
    updates[`report_records/${reportRecordId}/adminPaymentStatus`] = newStatus;
    if (newStatus === 'PAID') {
      updates[`report_records/${reportRecordId}/adminPaidAt`] = timestamp;
    } else {
      // Revert: xóa paidAt
      updates[`report_records/${reportRecordId}/adminPaidAt`] = null;
    }

    // Update AdminPaymentToAgent
    updates[`admin_payments_to_agents/${record.adminPaymentId}/paymentStatus`] = newStatus;
    if (newStatus === 'PAID') {
      updates[`admin_payments_to_agents/${record.adminPaymentId}/paidAt`] = timestamp;
    } else {
      updates[`admin_payments_to_agents/${record.adminPaymentId}/paidAt`] = null;
    }

    // Update PaymentBatch nếu có
    const adminPaymentSnapshot = await get(ref(database, `admin_payments_to_agents/${record.adminPaymentId}`));
    const adminPayment = adminPaymentSnapshot.val();
    if (adminPayment?.batchId) {
      // Check tất cả payments trong batch
      const batchSnapshot = await get(ref(database, `payment_batches/${adminPayment.batchId}`));
      const batch = batchSnapshot.val();
      if (batch?.paymentIds) {
        const allPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'));
        const allPayments = FirebaseUtils.objectToArray(allPaymentsSnapshot.val() || {});
        const batchPayments = allPayments.filter((p: any) => batch.paymentIds.includes(p.id));
        
        // Tính paymentStatus của batch dựa trên tất cả payments
        // Lấy payment status mới nhất từ database (sau khi update)
        const updatedPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'));
        const allUpdatedPayments = FirebaseUtils.objectToArray(updatedPaymentsSnapshot.val() || {});
        const updatedBatchPayments = allUpdatedPayments.filter((p: any) => batch.paymentIds.includes(p.id));
        
        const allPaid = updatedBatchPayments.length > 0 && updatedBatchPayments.every((p: any) => p.paymentStatus === 'PAID');
        const allUnpaid = updatedBatchPayments.length > 0 && updatedBatchPayments.every((p: any) => p.paymentStatus === 'UNPAID');
        const hasPartial = updatedBatchPayments.some((p: any) => p.paymentStatus === 'PARTIAL');
        const hasCancelled = updatedBatchPayments.some((p: any) => p.paymentStatus === 'CANCELLED');
        
        let batchStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'CANCELLED' = 'UNPAID';
        if (hasCancelled) {
          batchStatus = 'CANCELLED';
        } else if (allPaid) {
          batchStatus = 'PAID';
        } else if (hasPartial) {
          batchStatus = 'PARTIAL';
        } else {
          batchStatus = 'UNPAID'; // Default to UNPAID if any payment is unpaid
        }
        
        updates[`payment_batches/${adminPayment.batchId}/paymentStatus`] = batchStatus;
        if (batchStatus === 'PAID') {
          updates[`payment_batches/${adminPayment.batchId}/paidAt`] = timestamp;
        } else {
          updates[`payment_batches/${adminPayment.batchId}/paidAt`] = null;
        }
      }
    }

    // Update tất cả ReportRecord có cùng adminPaymentId
    const allRecordsSnapshot = await get(ref(database, 'report_records'));
    const allRecords = FirebaseUtils.objectToArray(allRecordsSnapshot.val() || {});
    const relatedRecords = allRecords.filter((r: ReportRecord) => r.adminPaymentId === record.adminPaymentId);
    
    relatedRecords.forEach((r: ReportRecord) => {
      updates[`report_records/${r.id}/adminPaymentStatus`] = newStatus;
      if (newStatus === 'PAID') {
        updates[`report_records/${r.id}/adminPaidAt`] = timestamp;
      } else {
        updates[`report_records/${r.id}/adminPaidAt`] = null;
      }
    });

    await update(ref(database), updates);
  },

  /**
   * Update payment status cho Agent → User (từ ReportRecord)
   * Khi update trong báo cáo, đồng bộ với AgentPaymentToUser và user_bills
   */
  async updateAgentPaymentStatus(
    reportRecordId: string,
    newStatus: 'UNPAID' | 'PAID'
  ): Promise<void> {
    const record = await this.getReportRecordById(reportRecordId);
    if (!record || !record.agentPaymentId) {
      throw new Error('ReportRecord không có agentPaymentId');
    }

    const updates: any = {};
    const timestamp = FirebaseUtils.getServerTimestamp();

    // Update ReportRecord
    updates[`report_records/${reportRecordId}/agentPaymentStatus`] = newStatus;
    if (newStatus === 'PAID') {
      updates[`report_records/${reportRecordId}/agentPaidAt`] = timestamp;
    } else {
      updates[`report_records/${reportRecordId}/agentPaidAt`] = null;
    }

    // Update AgentPaymentToUser
    updates[`agent_payments_to_users/${record.agentPaymentId}/status`] = newStatus;
    if (newStatus === 'PAID') {
      updates[`agent_payments_to_users/${record.agentPaymentId}/paidAt`] = timestamp;
    } else {
      updates[`agent_payments_to_users/${record.agentPaymentId}/paidAt`] = null;
    }

    // Update user_bills
    const agentPaymentSnapshot = await get(ref(database, `agent_payments_to_users/${record.agentPaymentId}`));
    const agentPayment = agentPaymentSnapshot.val();
    if (agentPayment?.billIds) {
      agentPayment.billIds.forEach((billId: string) => {
        updates[`user_bills/${billId}/isPaidByAgent`] = newStatus === 'PAID';
        if (newStatus === 'PAID') {
          updates[`user_bills/${billId}/paidByAgentAt`] = timestamp;
        } else {
          updates[`user_bills/${billId}/paidByAgentAt`] = null;
        }
      });
    }

    // Update tất cả ReportRecord có cùng agentPaymentId
    const allRecordsSnapshot = await get(ref(database, 'report_records'));
    const allRecords = FirebaseUtils.objectToArray(allRecordsSnapshot.val() || {});
    const relatedRecords = allRecords.filter((r: ReportRecord) => r.agentPaymentId === record.agentPaymentId);
    
    relatedRecords.forEach((r: ReportRecord) => {
      updates[`report_records/${r.id}/agentPaymentStatus`] = newStatus;
      if (newStatus === 'PAID') {
        updates[`report_records/${r.id}/agentPaidAt`] = timestamp;
      } else {
        updates[`report_records/${r.id}/agentPaidAt`] = null;
      }
    });

    await update(ref(database), updates);
  },

  /**
   * Lấy stats cho dashboard
   */
  async getReportStats(
    filters: ReportRecordFilters
  ): Promise<{ total: number; matched: number; unmatched: number; error: number }> {
    const result = await this.getReportRecords(filters, { limit: 10000 }); // Get all for stats
    
    const stats = {
      total: result.records.length,
      matched: 0,
      unmatched: 0,
      error: 0
    };

    result.records.forEach(record => {
      if (record.status === 'MATCHED') {
        stats.matched++;
      } else if (record.status === 'UNMATCHED') {
        stats.unmatched++;
      } else if (record.status === 'ERROR') {
        stats.error++;
      }
    });

    return stats;
  },

  /**
   * Xóa report record (nếu cần)
   */
  async deleteReportRecord(recordId: string): Promise<void> {
    const recordRef = ref(database, `report_records/${recordId}`);
    await remove(recordRef);
  },

  /**
   * Auto-reconcile bill when it's created
   * Creates ReportRecord immediately with MATCHED/ERROR/UNMATCHED status
   */
  async autoReconcileBill(userBill: UserBill): Promise<void> {
    try {
      // Check if ReportRecord already exists for this bill
      const existingRecordsSnapshot = await get(ref(database, 'report_records'));
      const existingRecords = FirebaseUtils.objectToArray<ReportRecord>(existingRecordsSnapshot.val() || {});
      const existingRecord = existingRecords.find(r => r.userBillId === userBill.id);
      
      if (existingRecord) {
        console.log(`ReportRecord already exists for bill ${userBill.id}, skipping auto-reconciliation`);
        return;
      }

      // Look up merchant transaction by transaction code
      const merchantTransaction = await MerchantTransactionsService.getByTransactionCode(userBill.transactionCode);
      
      const timestamp = FirebaseUtils.getServerTimestamp();
      let reconciliationStatus: 'PENDING' | 'MATCHED' | 'ERROR' | 'UNMATCHED';
      let errorMessage: string = '';
      let merchantsFileData: Record<string, any> | undefined;
      let merchantAmount: number | undefined;
      let merchantTransactionId: string | undefined;
      let status: ReportStatus = 'UNMATCHED';

      if (!merchantTransaction) {
        // No merchant transaction found
        reconciliationStatus = 'UNMATCHED';
        status = 'UNMATCHED';
        errorMessage = 'Chưa có file merchants hoặc không tìm thấy mã chuẩn chi trong merchants';
        merchantsFileData = undefined;
        merchantAmount = undefined;
      } else {
        // Merchant transaction found - compare fields
        merchantTransactionId = merchantTransaction.id;
        merchantsFileData = merchantTransaction.rawData;
        merchantAmount = merchantTransaction.amount;
        
        // Compare amount (allow 1 VND difference for rounding)
        const amountMatch = Math.abs(merchantTransaction.amount - userBill.amount) < 1;
        
        // Compare point of sale (if both exist)
        const posMatch = 
          (!merchantTransaction.pointOfSaleName && !userBill.pointOfSaleName) ||
          (merchantTransaction.pointOfSaleName && userBill.pointOfSaleName && 
           merchantTransaction.pointOfSaleName === userBill.pointOfSaleName);
        
        if (amountMatch && posMatch) {
          // All fields match
          reconciliationStatus = 'MATCHED';
          status = 'MATCHED';
          errorMessage = '';
        } else {
          // Mismatch - build clear error message
          reconciliationStatus = 'ERROR';
          status = 'ERROR';
          const errors: string[] = [];
          
          if (!amountMatch) {
            errors.push(`Sai số tiền: ${merchantTransaction.amount.toLocaleString('vi-VN')}đ vs ${userBill.amount.toLocaleString('vi-VN')}đ`);
          }
          
          if (!posMatch) {
            const merchantPos = merchantTransaction.pointOfSaleName || '(không có)';
            const billPos = userBill.pointOfSaleName || '(không có)';
            errors.push(`Sai điểm bán: ${merchantPos} vs ${billPos}`);
          }
          
          errorMessage = `Chưa khớp - ${errors.join('; ')}`;
        }
      }

      // Create ReportRecord
      const reportRecord: Omit<ReportRecord, 'id' | 'createdAt'> = {
        userBillId: userBill.id,
        userId: userBill.userId,
        agentId: userBill.agentId,
        agentCode: userBill.agentCode,
        transactionCode: userBill.transactionCode,
        amount: userBill.amount,
        paymentMethod: userBill.paymentMethod,
        pointOfSaleName: userBill.pointOfSaleName,
        transactionDate: userBill.timestamp,
        userBillCreatedAt: userBill.createdAt,
        invoiceNumber: userBill.invoiceNumber,
        
        // Merchant data
        merchantTransactionId,
        merchantCode: merchantTransaction?.merchantCode,
        merchantAmount,
        merchantAmountBeforeDiscount: merchantTransaction?.amountBeforeDiscount,
        merchantPointOfSaleName: merchantTransaction?.pointOfSaleName,
        merchantBranchName: merchantTransaction?.branchName,
        merchantInvoiceNumber: merchantTransaction?.invoiceNumber,
        merchantPhoneNumber: merchantTransaction?.phoneNumber,
        merchantPromotionCode: merchantTransaction?.promotionCode,
        merchantTransactionDate: merchantTransaction?.transactionDate,
        
        // Reconciliation result
        status,
        reconciliationStatus,
        errorMessage: errorMessage || undefined,
        merchantsFileData,
        
        // Metadata
        reconciledAt: timestamp,
        reconciledBy: 'ADMIN'
      };

      await this.createReportRecord(reportRecord);
      console.log(`✅ Auto-reconciled bill ${userBill.id}: ${reconciliationStatus}`);
    } catch (error) {
      console.error(`Error auto-reconciling bill ${userBill.id}:`, error);
      // Don't throw - just log the error so bill creation doesn't fail
    }
  }
};

