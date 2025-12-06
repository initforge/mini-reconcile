// Data retention service - automatically delete data older than 3 months
import { ref, get, remove } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { UserBill, AgentReconciliationSession, AgentPaymentToUser, AdminPaymentToAgent } from '../../types';

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000; // 3 months in milliseconds

export const DataRetentionService = {
  /**
   * Clean up old data (older than 3 months)
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
      // Clean up user_bills
      const billsSnapshot = await get(ref(database, 'user_bills'));
      const bills = FirebaseUtils.objectToArray(billsSnapshot.val() || {});
      
      for (const bill of bills) {
        const billDate = new Date(bill.createdAt);
        if (billDate < cutoffDate) {
          await remove(ref(database, `user_bills/${bill.id}`));
          deletedBills++;
        }
      }

      // Clean up agent_reconciliation_sessions
      const sessionsSnapshot = await get(ref(database, 'agent_reconciliation_sessions'));
      const sessions = FirebaseUtils.objectToArray(sessionsSnapshot.val() || {});
      
      for (const session of sessions) {
        const sessionDate = new Date(session.createdAt);
        if (sessionDate < cutoffDate) {
          await remove(ref(database, `agent_reconciliation_sessions/${session.id}`));
          deletedSessions++;
        }
      }

      // Clean up agent_payments_to_users
      const paymentsSnapshot = await get(ref(database, 'agent_payments_to_users'));
      const payments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {});
      
      for (const payment of payments) {
        const paymentDate = new Date(payment.paidAt);
        if (paymentDate < cutoffDate) {
          await remove(ref(database, `agent_payments_to_users/${payment.id}`));
          deletedPayments++;
        }
      }

      // Clean up admin_payments_to_agents
      const adminPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'));
      const adminPayments = FirebaseUtils.objectToArray(adminPaymentsSnapshot.val() || {});
      
      for (const payment of adminPayments) {
        const paymentDate = new Date(payment.paidAt);
        if (paymentDate < cutoffDate) {
          await remove(ref(database, `admin_payments_to_agents/${payment.id}`));
          deletedAdminPayments++;
        }
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

