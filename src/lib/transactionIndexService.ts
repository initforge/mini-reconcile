// Transaction Index Service - Đảm bảo unique transactionCode
import { ref, runTransaction, get, update } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { TransactionIndexEntry } from '../../types';
import { sanitizeTransactionCode } from '../utils/transactionCodeUtils';

/**
 * Reserve transaction code - đảm bảo mỗi code chỉ có 1 reportRecordId
 * Dùng runTransaction để đảm bảo atomic
 * 
 * API này dùng kết hợp với attachBillToCode/attachMerchantToCode (API tách rời)
 * Xem reserveTransactionCodeForBill/reserveTransactionCodeForMerchant cho API atomic
 */
export async function reserveTransactionCode(
  transactionCode: string
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  // Dùng runTransaction để đảm bảo atomic
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = Date.now(); // Number timestamp
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới
      // Generate ID bằng timestamp + random để tạo unique ID
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        reportRecordId: newReportRecordId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại → trả về reportRecordId cũ (không tạo mới)
      return {
        ...current,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}

/**
 * Attach bill ID vào transaction index
 * 
 * API tách rời - dùng kết hợp với reserveTransactionCode
 * Xem reserveTransactionCodeForBill cho API atomic (khuyến nghị cho production)
 */
export async function attachBillToCode(
  transactionCode: string,
  billId: string
): Promise<void> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  await update(indexRef, {
    userBillId: billId,
    updatedAt: Date.now(),
  });
}

/**
 * Attach merchant transaction ID vào transaction index
 * 
 * API tách rời - dùng kết hợp với reserveTransactionCode
 * Xem reserveTransactionCodeForMerchant cho API atomic (khuyến nghị cho production)
 */
export async function attachMerchantToCode(
  transactionCode: string,
  merchantTransactionId: string
): Promise<void> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  await update(indexRef, {
    merchantTransactionId: merchantTransactionId,
    updatedAt: Date.now(),
  });
}

/**
 * Lấy reportRecordId từ transactionCode
 */
export async function getReportRecordIdByCode(
  transactionCode: string
): Promise<string | null> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  const snapshot = await get(indexRef);
  
  if (snapshot.exists()) {
    const entry = snapshot.val() as TransactionIndexEntry;
    return entry.reportRecordId;
  }
  
  return null;
}

/**
 * Reserve transaction code và attach bill ID trong một transaction atomic
 * Đảm bảo không có race condition khi 2 request cùng lúc upload bill cho cùng code
 * Nếu đã có userBillId → throw error (reject)
 * 
 * API atomic - khuyến nghị cho production nếu rất lo về race condition
 * Thay thế combo reserveTransactionCode + attachBillToCode
 */
export async function reserveTransactionCodeForBill(
  code: string,
  billId: string,
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(code);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = Date.now(); // Number timestamp
    
    // Nếu đã có userBillId → reject (không cho phép bill thứ hai)
    if (current?.userBillId) {
      throw new Error('Mã chuẩn chi này đã có bill, vui lòng không upload trùng');
    }
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới và gắn bill
      // Generate ID bằng timestamp + random
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        reportRecordId: newReportRecordId,
        userBillId: billId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại nhưng chưa có userBillId → gắn bill vào
      return {
        ...current,
        userBillId: billId,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}

/**
 * Reserve transaction code và attach merchant transaction ID trong một transaction atomic
 * Đảm bảo không có race condition khi 2 request cùng lúc upload merchant cho cùng code
 * Nếu đã có merchantTransactionId → trả về entry hiện tại (skip, không throw)
 * 
 * API atomic - khuyến nghị cho production nếu rất lo về race condition
 * Thay thế combo reserveTransactionCode + attachMerchantToCode
 */
export async function reserveTransactionCodeForMerchant(
  code: string,
  merchantTransactionId: string,
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(code);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = Date.now(); // Number timestamp
    
    // Nếu đã có merchantTransactionId → skip (trả về entry hiện tại, không update)
    if (current?.merchantTransactionId) {
      return current; // Không throw, chỉ skip
    }
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới và gắn merchant
      // Generate ID bằng timestamp + random
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        reportRecordId: newReportRecordId,
        merchantTransactionId: merchantTransactionId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại nhưng chưa có merchantTransactionId → gắn merchant vào
      return {
        ...current,
        merchantTransactionId: merchantTransactionId,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}

