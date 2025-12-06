// Agent reconciliation services
import { ref, get, push, update, remove } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { UserBill, MerchantTransaction, AgentReconciliationSession, PaymentMethod, ReconciliationRecord } from '../../types';

export const AgentReconciliationService = {
  /**
   * Get agent bills (pending status)
   */
  async getAgentBills(agentId: string): Promise<UserBill[]> {
    const snapshot = await get(ref(database, 'user_bills'));
    const bills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});
    return bills.filter(bill => bill.agentId === agentId && bill.status === 'PENDING');
  },

  /**
   * Get agent bills for today
   */
  async getAgentBillsToday(agentId: string): Promise<UserBill[]> {
    const bills = await this.getAgentBills(agentId);
    const today = new Date().toISOString().split('T')[0];
    
    return bills.filter(bill => {
      const billDate = new Date(bill.createdAt).toISOString().split('T')[0];
      return billDate === today;
    });
  },

  /**
   * Reconcile agent bills with merchant transactions
   * Matches ONLY 3 fields: transactionCode + amount + pointOfSaleName
   */
  async reconcileAgentBills(
    agentId: string,
    merchantTransactions: MerchantTransaction[],
    performedBy: 'AGENT' | 'ADMIN' = 'AGENT'
  ): Promise<{
    matched: number;
    errors: number;
    results: Array<{ billId: string; status: 'MATCHED' | 'ERROR'; errorMessage?: string }>;
  }> {
    // Get pending bills for this agent
    const bills = await this.getAgentBills(agentId);
    
    const results: Array<{ billId: string; status: 'MATCHED' | 'ERROR'; errorMessage?: string }> = [];
    let matchedCount = 0;
    let errorCount = 0;

    // Create a map of merchant transactions by transactionCode for faster lookup
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
        // No matching transaction code
        await this.updateBillStatus(bill.id, 'ERROR', 'Không tìm thấy giao dịch trong file merchants', null);
        results.push({
          billId: bill.id,
          status: 'ERROR',
          errorMessage: 'Không tìm thấy giao dịch trong file merchants'
        });
        errorCount++;
        continue;
      }

      // Find merchant that matches all 3 fields
      const matchedMerchant = matchingMerchants.find(mt => {
        // Match 1: transactionCode (already matched)
        // Match 2: amount
        const amountMatch = Math.abs(mt.amount - bill.amount) < 1; // Allow 1 VND difference for rounding
        // Match 3: pointOfSaleName
        const posMatch = mt.pointOfSaleName === bill.pointOfSaleName || 
                        (!mt.pointOfSaleName && !bill.pointOfSaleName);
        
        return amountMatch && posMatch;
      });

      if (matchedMerchant) {
        // All 3 fields match - MATCHED
        await this.updateBillStatus(bill.id, 'MATCHED', undefined, matchedMerchant);
        results.push({
          billId: bill.id,
          status: 'MATCHED'
        });
        matchedCount++;
      } else {
        // Check which field doesn't match
        const firstMerchant = matchingMerchants[0];
        let errorMessage = '';
        
        const amountMatch = Math.abs(firstMerchant.amount - bill.amount) < 1;
        const posMatch = firstMerchant.pointOfSaleName === bill.pointOfSaleName ||
                        (!firstMerchant.pointOfSaleName && !bill.pointOfSaleName);
        
        if (!amountMatch) {
          errorMessage = `Số tiền không khớp (Bill: ${bill.amount.toLocaleString('vi-VN')}đ - Merchants: ${firstMerchant.amount.toLocaleString('vi-VN')}đ)`;
        } else if (!posMatch) {
          errorMessage = `Điểm thu không khớp (Bill: ${bill.pointOfSaleName || 'N/A'} - Merchants: ${firstMerchant.pointOfSaleName || 'N/A'})`;
        } else {
          errorMessage = 'Không khớp thông tin';
        }
        
        await this.updateBillStatus(bill.id, 'ERROR', errorMessage, firstMerchant);
        results.push({
          billId: bill.id,
          status: 'ERROR',
          errorMessage
        });
        errorCount++;
      }
    }

    // Create reconciliation session
    const sessionId = await this.createReconciliationSession({
      agentId,
      performedBy,
      merchantFileName: `merchants_${Date.now()}.xlsx`,
      billCount: bills.length,
      matchedCount,
      errorCount,
      status: 'COMPLETED'
    });

    return {
      matched: matchedCount,
      errors: errorCount,
      results
    };
  },

  /**
   * Sanitize object for Firebase - remove undefined values recursively
   */
  sanitizeForFirebase<T extends object>(obj: T): T {
    const clone: any = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (value !== undefined) {
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          const sanitized = this.sanitizeForFirebase(value as any);
          // Only add if sanitized object has at least one property
          if (Object.keys(sanitized).length > 0) {
            clone[key] = sanitized;
          }
        } else {
          clone[key] = value;
        }
      }
    });
    return clone;
  },

  /**
   * Update bill status after reconciliation
   */
  async updateBillStatus(
    billId: string,
    status: 'MATCHED' | 'ERROR',
    errorMessage?: string,
    merchantData?: MerchantTransaction | null
  ): Promise<void> {
    const updates: any = {
      status,
      updatedAt: FirebaseUtils.getServerTimestamp()
    };

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    if (merchantData) {
      // Sanitize merchantData to remove undefined values before updating
      updates.merchantData = this.sanitizeForFirebase(merchantData);
    }

    // Sanitize the entire updates object as well
    const sanitizedUpdates = this.sanitizeForFirebase(updates);
    
    await update(ref(database, `user_bills/${billId}`), sanitizedUpdates);
  },

  /**
   * Create reconciliation session
   */
  async createReconciliationSession(
    sessionData: Omit<AgentReconciliationSession, 'id' | 'createdAt'>
  ): Promise<string> {
    const newSession = {
      ...sessionData,
      createdAt: FirebaseUtils.getServerTimestamp()
    };
    const newRef = await push(ref(database, 'agent_reconciliation_sessions'), newSession);
    return newRef.key!;
  },

  /**
   * Get reconciliation sessions for agent
   */
  async getReconciliationSessions(agentId: string): Promise<AgentReconciliationSession[]> {
    const snapshot = await get(ref(database, 'agent_reconciliation_sessions'));
    const sessions = FirebaseUtils.objectToArray<AgentReconciliationSession>(snapshot.val() || {});
    return sessions
      .filter(s => s.agentId === agentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Get reconciliation records by session ID (with security check)
   */
  async getReconciliationRecordsBySession(
    sessionId: string, 
    agentId: string
  ): Promise<ReconciliationRecord[]> {
    // Security: First verify session belongs to agent
    const sessionSnapshot = await get(ref(database, `agent_reconciliation_sessions/${sessionId}`));
    const session = sessionSnapshot.val();
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (session.agentId !== agentId) {
      throw new Error('Unauthorized: Session does not belong to this agent');
    }
    
    // Get all records and filter by sessionId
    const recordsSnapshot = await get(ref(database, 'reconciliation_records'));
    const records = FirebaseUtils.objectToArray<ReconciliationRecord>(recordsSnapshot.val() || {});
    
    return records.filter(r => r.sessionId === sessionId);
  },

  /**
   * Get reconciliation sessions by agent and date (with timezone-safe handling)
   */
  async getReconciliationSessionsByAgentAndDate(
    agentId: string, 
    date: string // YYYY-MM-DD format
  ): Promise<AgentReconciliationSession[]> {
    const snapshot = await get(ref(database, 'agent_reconciliation_sessions'));
    const sessions = FirebaseUtils.objectToArray<AgentReconciliationSession>(snapshot.val() || {});
    
    // Timezone-safe date comparison
    const targetDate = new Date(date + 'T00:00:00');
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    return sessions
      .filter(s => {
        if (s.agentId !== agentId) return false;
        const sessionDate = new Date(s.createdAt);
        return sessionDate >= startOfDay && sessionDate <= endOfDay;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Delete reconciliation session (with security check and cleanup)
   */
  async deleteReconciliationSession(sessionId: string, agentId: string): Promise<void> {
    // Security: Verify session belongs to agent
    const sessionSnapshot = await get(ref(database, `agent_reconciliation_sessions/${sessionId}`));
    const session = sessionSnapshot.val();
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (session.agentId !== agentId) {
      throw new Error('Unauthorized: Session does not belong to this agent');
    }
    
    // Get reconciliation records for this session to find which bills were affected
    const recordsSnapshot = await get(ref(database, 'reconciliation_records'));
    const records = FirebaseUtils.objectToArray<ReconciliationRecord>(recordsSnapshot.val() || {});
    const sessionRecords = records.filter(r => r.sessionId === sessionId);
    
    // Get transaction codes from records to identify affected bills
    const affectedTransactionCodes = new Set<string>();
    sessionRecords.forEach(record => {
      if (record.transactionCode) {
        affectedTransactionCodes.add(record.transactionCode);
      }
    });
    
    // Delete session
    await remove(ref(database, `agent_reconciliation_sessions/${sessionId}`));
    
    // Delete all reconciliation records associated with this session
    if (sessionRecords.length > 0) {
      const updates: any = {};
      sessionRecords.forEach(record => {
        updates[`reconciliation_records/${record.id}`] = null;
      });
      await update(ref(database), updates);
    }
    
    // Reset bills that were affected by this session
    // Only reset bills that match the transaction codes from this session's records
    if (affectedTransactionCodes.size > 0) {
      const billsSnapshot = await get(ref(database, 'user_bills'));
      const allBills = FirebaseUtils.objectToArray<UserBill>(billsSnapshot.val() || {});
      
      const billUpdates: any = {};
      allBills.forEach(bill => {
        // Only reset bills that:
        // 1. Belong to this agent
        // 2. Have a transaction code that was in this session
        // 3. Were matched or errored (have merchantData)
        if (
          bill.agentId === agentId &&
          affectedTransactionCodes.has(bill.transactionCode) &&
          (bill.status === 'MATCHED' || bill.status === 'ERROR') &&
          bill.merchantData
        ) {
          billUpdates[`user_bills/${bill.id}/status`] = 'PENDING';
          billUpdates[`user_bills/${bill.id}/merchantData`] = null;
          billUpdates[`user_bills/${bill.id}/errorMessage`] = null;
          billUpdates[`user_bills/${bill.id}/updatedAt`] = FirebaseUtils.getServerTimestamp();
        }
      });
      
      if (Object.keys(billUpdates).length > 0) {
        await update(ref(database), billUpdates);
      }
    }
  }
};

