// Data retention service - automatically delete data older than 3 months
// OPTIMIZED: Uses indexed queries instead of full-node reads to reduce bandwidth
import { ref, get, query, orderByChild, endAt, update } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { UserBill, AgentReconciliationSession, AgentPaymentToUser, AdminPaymentToAgent } from '../../types';

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000; // 3 months in milliseconds

export const DataRetentionService = {
  /**
   * Clean up old data (older than 3 months)
   * OPTIMIZED: Uses orderByChild + endAt queries to only download expired records
   */
  async cleanupOldData(): Promise<{
    deletedBills: number;
    deletedSessions: number;
    deletedPayments: number;
    deletedAdminPayments: number;
  }> {
    const cutoffDate = new Date(Date.now() - THREE_MONTHS_MS);
    const cutoffTimestamp = cutoffDate.toISOString();

    let deletedBills = 0;
    let deletedSessions = 0;
    let deletedPayments = 0;
    let deletedAdminPayments = 0;

    try {
      // OPTIMIZED: Query only expired user_bills using createdAt index
      // Note: Requires .indexOn: "createdAt" in Firebase rules
      let billsSnapshot;
      try {
        billsSnapshot = await get(query(ref(database, 'user_bills'), orderByChild('createdAt'), endAt(cutoffTimestamp)));
      } catch (error: any) {
        // Fallback: If index not available, use full read (backward compatibility)
        console.warn('Index not available for user_bills/createdAt, using fallback');
        billsSnapshot = await get(ref(database, 'user_bills'));
      }
      const bills = FirebaseUtils.objectToArray(billsSnapshot.val() || {});
      const billUpdates: Record<string, any> = {};
      for (const bill of bills) {
        const billDate = new Date(bill.createdAt);
        if (billDate < cutoffDate) {
          billUpdates[`user_bills/${bill.id}`] = null;
          deletedBills++;
        }
      }
      if (Object.keys(billUpdates).length > 0) {
        await update(ref(database), billUpdates);
      }

      // OPTIMIZED: Query only expired sessions using createdAt index
      let sessionsSnapshot;
      try {
        sessionsSnapshot = await get(query(ref(database, 'agent_reconciliation_sessions'), orderByChild('createdAt'), endAt(cutoffTimestamp)));
      } catch (error: any) {
        console.warn('Index not available for agent_reconciliation_sessions/createdAt, using fallback');
        sessionsSnapshot = await get(ref(database, 'agent_reconciliation_sessions'));
      }
      const sessions = FirebaseUtils.objectToArray(sessionsSnapshot.val() || {});
      const sessionUpdates: Record<string, any> = {};
      for (const session of sessions) {
        const sessionDate = new Date(session.createdAt);
        if (sessionDate < cutoffDate) {
          sessionUpdates[`agent_reconciliation_sessions/${session.id}`] = null;
          deletedSessions++;
        }
      }
      if (Object.keys(sessionUpdates).length > 0) {
        await update(ref(database), sessionUpdates);
      }

      // OPTIMIZED: Query only expired payments using paidAt index
      let paymentsSnapshot;
      try {
        paymentsSnapshot = await get(query(ref(database, 'agent_payments_to_users'), orderByChild('paidAt'), endAt(cutoffTimestamp)));
      } catch (error: any) {
        console.warn('Index not available for agent_payments_to_users/paidAt, using fallback');
        paymentsSnapshot = await get(ref(database, 'agent_payments_to_users'));
      }
      const payments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {});
      const paymentUpdates: Record<string, any> = {};
      for (const payment of payments) {
        if (payment.paidAt) {
          const paymentDate = new Date(payment.paidAt);
          if (paymentDate < cutoffDate) {
            paymentUpdates[`agent_payments_to_users/${payment.id}`] = null;
            deletedPayments++;
          }
        }
      }
      if (Object.keys(paymentUpdates).length > 0) {
        await update(ref(database), paymentUpdates);
      }

      // OPTIMIZED: Query only expired admin payments using paidAt index
      let adminPaymentsSnapshot;
      try {
        adminPaymentsSnapshot = await get(query(ref(database, 'admin_payments_to_agents'), orderByChild('paidAt'), endAt(cutoffTimestamp)));
      } catch (error: any) {
        console.warn('Index not available for admin_payments_to_agents/paidAt, using fallback');
        adminPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'));
      }
      const adminPayments = FirebaseUtils.objectToArray(adminPaymentsSnapshot.val() || {});
      const adminPaymentUpdates: Record<string, any> = {};
      for (const payment of adminPayments) {
        if (payment.paidAt) {
          const paymentDate = new Date(payment.paidAt);
          if (paymentDate < cutoffDate) {
            adminPaymentUpdates[`admin_payments_to_agents/${payment.id}`] = null;
            deletedAdminPayments++;
          }
        }
      }
      if (Object.keys(adminPaymentUpdates).length > 0) {
        await update(ref(database), adminPaymentUpdates);
      }

      console.log(`✅ Data cleanup completed: ${deletedBills} bills, ${deletedSessions} sessions, ${deletedPayments} payments, ${deletedAdminPayments} admin payments`);
    } catch (error) {
      console.error('Error during data cleanup:', error);
      throw error;
    }

    return {
      deletedBills,
      deletedSessions,
      deletedPayments,
      deletedAdminPayments
    };
  },

  /**
   * Schedule automatic cleanup (call this periodically, e.g., daily)
   */
  async scheduleCleanup(): Promise<void> {
    try {
      await this.cleanupOldData();
    } catch (error) {
      console.error('Scheduled cleanup failed:', error);
    }
  }
};

// Auto-run cleanup on module load (for development/testing)
// In production, this should be called via a scheduled job/cron
if (typeof window !== 'undefined') {
  // Only run in browser, and maybe add a flag to control this
  // For now, we'll let the admin trigger it manually or via a scheduled task
}

