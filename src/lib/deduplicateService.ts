import { ref, get, update, remove } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { ReportRecord, MerchantTransaction } from '../../types';

/**
 * Xóa duplicate records dựa trên transactionCode
 * Chỉ giữ lại 1 record cho mỗi transactionCode (ưu tiên record có merchantTransactionId)
 */
export const DeduplicateService = {
  /**
   * Xóa duplicate report_records dựa trên transactionCode
   * Chỉ giữ lại 1 record cho mỗi transactionCode
   */
  async deduplicateReportRecords(): Promise<{ removed: number; kept: number }> {
    try {
      // Load tất cả report_records
      const snapshot = await get(ref(database, 'report_records'));
      const allRecords = FirebaseUtils.objectToArray<ReportRecord>(snapshot.val() || {});

      // Group theo transactionCode
      const recordsByCode = new Map<string, ReportRecord[]>();
      allRecords.forEach(record => {
        if (!record.transactionCode) return;
        const code = String(record.transactionCode).trim();
        if (!code) return;
        
        if (!recordsByCode.has(code)) {
          recordsByCode.set(code, []);
        }
        recordsByCode.get(code)!.push(record);
      });

      // Tìm duplicates và quyết định record nào giữ lại
      const toRemove: string[] = [];
      const toKeep: string[] = [];
      const updates: any = {};

      recordsByCode.forEach((records, code) => {
        if (records.length <= 1) {
          // Không duplicate, giữ lại
          records.forEach(r => toKeep.push(r.id));
          return;
        }

        // Có duplicate - chọn record tốt nhất
        // Ưu tiên: 1) Có merchantTransactionId, 2) Có userBillId, 3) Record mới nhất
        let bestRecord = records[0];
        for (const record of records) {
          const currentHasMerchant = !!bestRecord.merchantTransactionId;
          const recordHasMerchant = !!record.merchantTransactionId;
          
          if (!currentHasMerchant && recordHasMerchant) {
            bestRecord = record;
          } else if (currentHasMerchant === recordHasMerchant) {
            // Cùng có/không có merchant, ưu tiên có userBillId
            const currentHasBill = !!bestRecord.userBillId;
            const recordHasBill = !!record.userBillId;
            
            if (!currentHasBill && recordHasBill) {
              bestRecord = record;
            } else if (currentHasBill === recordHasBill) {
              // Cùng có/không có bill, ưu tiên record mới hơn
              const currentDate = new Date(bestRecord.createdAt || 0).getTime();
              const recordDate = new Date(record.createdAt || 0).getTime();
              if (recordDate > currentDate) {
                bestRecord = record;
              }
            }
          }
        }

        // Xóa các records khác
        records.forEach(record => {
          if (record.id !== bestRecord.id) {
            toRemove.push(record.id);
            updates[`report_records/${record.id}`] = null;
          } else {
            toKeep.push(record.id);
          }
        });
      });

      // Apply updates
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        console.log(`✅ Đã xóa ${toRemove.length} duplicate report_records, giữ lại ${toKeep.length} records`);
      }

      return { removed: toRemove.length, kept: toKeep.length };
    } catch (error) {
      console.error('Error deduplicating report records:', error);
      throw error;
    }
  },

  /**
   * Xóa duplicate merchant_transactions dựa trên transactionCode
   * Chỉ giữ lại 1 transaction cho mỗi transactionCode (ưu tiên transaction mới nhất)
   */
  async deduplicateMerchantTransactions(): Promise<{ removed: number; kept: number }> {
    try {
      // Load tất cả merchant_transactions
      const snapshot = await get(ref(database, 'merchant_transactions'));
      const allTransactions = FirebaseUtils.objectToArray<MerchantTransaction>(snapshot.val() || {});

      // Group theo transactionCode
      const transactionsByCode = new Map<string, MerchantTransaction[]>();
      allTransactions.forEach(transaction => {
        if (!transaction.transactionCode) return;
        const code = String(transaction.transactionCode).trim();
        if (!code) return;
        
        if (!transactionsByCode.has(code)) {
          transactionsByCode.set(code, []);
        }
        transactionsByCode.get(code)!.push(transaction);
      });

      // Tìm duplicates và quyết định transaction nào giữ lại
      const toRemove: string[] = [];
      const toKeep: string[] = [];
      const updates: any = {};

      transactionsByCode.forEach((transactions, code) => {
        if (transactions.length <= 1) {
          // Không duplicate, giữ lại
          transactions.forEach(t => toKeep.push(t.id));
          return;
        }

        // Có duplicate - chọn transaction mới nhất
        let bestTransaction = transactions[0];
        for (const transaction of transactions) {
          const bestDate = new Date(bestTransaction.createdAt || 0).getTime();
          const transactionDate = new Date(transaction.createdAt || 0).getTime();
          if (transactionDate > bestDate) {
            bestTransaction = transaction;
          }
        }

        // Xóa các transactions khác
        transactions.forEach(transaction => {
          if (transaction.id !== bestTransaction.id) {
            toRemove.push(transaction.id);
            updates[`merchant_transactions/${transaction.id}`] = null;
            // Cũng xóa khỏi byCode mapping
            updates[`merchant_transactions/byCode/${code}`] = bestTransaction.id;
          } else {
            toKeep.push(transaction.id);
          }
        });
      });

      // Apply updates
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        console.log(`✅ Đã xóa ${toRemove.length} duplicate merchant_transactions, giữ lại ${toKeep.length} transactions`);
      }

      return { removed: toRemove.length, kept: toKeep.length };
    } catch (error) {
      console.error('Error deduplicating merchant transactions:', error);
      throw error;
    }
  }
};

