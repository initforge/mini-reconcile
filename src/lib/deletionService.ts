// Deletion service for User and Agent with cascade delete and soft delete options
import { ref, get, remove, update } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';

export interface DeletionStats {
  bills: number;
  reportRecords: number;
  payments: number;
  sessions?: number; // For agent only
  adminPayments?: number; // For agent only
}

export interface DeletionResult {
  success: boolean;
  deletedStats?: DeletionStats;
  message: string;
}

export const DeletionService = {
  /**
   * Count related data for a user (before deletion)
   */
  async countUserRelatedData(userId: string): Promise<DeletionStats> {
    const billsSnapshot = await get(ref(database, 'user_bills'));
    const reportsSnapshot = await get(ref(database, 'report_records'));
    const paymentsSnapshot = await get(ref(database, 'agent_payments_to_users'));

    const allBills = FirebaseUtils.objectToArray(billsSnapshot.val() || {});
    const allReports = FirebaseUtils.objectToArray(reportsSnapshot.val() || {});
    const allPayments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {});

    return {
      bills: allBills.filter((b: any) => b.userId === userId).length,
      reportRecords: allReports.filter((r: any) => r.userId === userId).length,
      payments: allPayments.filter((p: any) => p.userId === userId).length
    };
  },

  /**
   * Count related data for an agent (before deletion)
   */
  async countAgentRelatedData(agentId: string): Promise<DeletionStats> {
    const billsSnapshot = await get(ref(database, 'user_bills'));
    const reportsSnapshot = await get(ref(database, 'report_records'));
    const sessionsSnapshot = await get(ref(database, 'agent_reconciliation_sessions'));
    const paymentsSnapshot = await get(ref(database, 'agent_payments_to_users'));
    const adminPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'));

    const allBills = FirebaseUtils.objectToArray(billsSnapshot.val() || {});
    const allReports = FirebaseUtils.objectToArray(reportsSnapshot.val() || {});
    const allSessions = FirebaseUtils.objectToArray(sessionsSnapshot.val() || {});
    const allPayments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {});
    const allAdminPayments = FirebaseUtils.objectToArray(adminPaymentsSnapshot.val() || {});

    return {
      bills: allBills.filter((b: any) => b.agentId === agentId).length,
      reportRecords: allReports.filter((r: any) => r.agentId === agentId).length,
      payments: allPayments.filter((p: any) => p.agentId === agentId).length,
      sessions: allSessions.filter((s: any) => s.agentId === agentId).length,
      adminPayments: allAdminPayments.filter((p: any) => p.agentId === agentId).length
    };
  },

  /**
   * Cascade delete user and all related data
   */
  async cascadeDeleteUser(userId: string): Promise<DeletionResult> {
    try {
      const updates: any = {};

      // 1. Delete user_bills
      const billsSnapshot = await get(ref(database, 'user_bills'));
      const allBills = FirebaseUtils.objectToArray(billsSnapshot.val() || {});
      const userBills = allBills.filter((b: any) => b.userId === userId);
      userBills.forEach((bill: any) => {
        updates[`user_bills/${bill.id}`] = null;
      });

      // 2. Delete report_records
      const reportsSnapshot = await get(ref(database, 'report_records'));
      const allReports = FirebaseUtils.objectToArray(reportsSnapshot.val() || {});
      const userReports = allReports.filter((r: any) => r.userId === userId);
      userReports.forEach((report: any) => {
        updates[`report_records/${report.id}`] = null;
      });

      // 3. Delete agent_payments_to_users
      const paymentsSnapshot = await get(ref(database, 'agent_payments_to_users'));
      const allPayments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {});
      const userPayments = allPayments.filter((p: any) => p.userId === userId);
      userPayments.forEach((payment: any) => {
        updates[`agent_payments_to_users/${payment.id}`] = null;
      });

      // 4. Delete user
      updates[`users/${userId}`] = null;

      // Execute all deletions in one batch
      await update(ref(database), updates);

      return {
        success: true,
        deletedStats: {
          bills: userBills.length,
          reportRecords: userReports.length,
          payments: userPayments.length
        },
        message: `Đã xóa thành công: ${userBills.length} hóa đơn, ${userReports.length} báo cáo, ${userPayments.length} thanh toán`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Lỗi khi xóa: ${error.message}`
      };
    }
  },

  /**
   * Cascade delete agent and all related data
   */
  async cascadeDeleteAgent(agentId: string): Promise<DeletionResult> {
    try {
      const updates: any = {};

      // 1. Delete user_bills (bills of users belonging to this agent)
      const billsSnapshot = await get(ref(database, 'user_bills'));
      const allBills = FirebaseUtils.objectToArray(billsSnapshot.val() || {});
      const agentBills = allBills.filter((b: any) => b.agentId === agentId);
      agentBills.forEach((bill: any) => {
        updates[`user_bills/${bill.id}`] = null;
      });

      // 2. Delete report_records
      const reportsSnapshot = await get(ref(database, 'report_records'));
      const allReports = FirebaseUtils.objectToArray(reportsSnapshot.val() || {});
      const agentReports = allReports.filter((r: any) => r.agentId === agentId);
      agentReports.forEach((report: any) => {
        updates[`report_records/${report.id}`] = null;
      });

      // 3. Delete agent_reconciliation_sessions
      const sessionsSnapshot = await get(ref(database, 'agent_reconciliation_sessions'));
      const allSessions = FirebaseUtils.objectToArray(sessionsSnapshot.val() || {});
      const agentSessions = allSessions.filter((s: any) => s.agentId === agentId);
      agentSessions.forEach((session: any) => {
        updates[`agent_reconciliation_sessions/${session.id}`] = null;
      });

      // 4. Delete agent_payments_to_users
      const paymentsSnapshot = await get(ref(database, 'agent_payments_to_users'));
      const allPayments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {});
      const agentPayments = allPayments.filter((p: any) => p.agentId === agentId);
      agentPayments.forEach((payment: any) => {
        updates[`agent_payments_to_users/${payment.id}`] = null;
      });

      // 5. Delete admin_payments_to_agents
      const adminPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'));
      const allAdminPayments = FirebaseUtils.objectToArray(adminPaymentsSnapshot.val() || {});
      const adminPayments = allAdminPayments.filter((p: any) => p.agentId === agentId);
      adminPayments.forEach((payment: any) => {
        updates[`admin_payments_to_agents/${payment.id}`] = null;
      });

      // 6. Delete agent
      updates[`agents/${agentId}`] = null;

      // Execute all deletions in one batch
      await update(ref(database), updates);

      return {
        success: true,
        deletedStats: {
          bills: agentBills.length,
          reportRecords: agentReports.length,
          payments: agentPayments.length,
          sessions: agentSessions.length,
          adminPayments: adminPayments.length
        },
        message: `Đã xóa thành công: ${agentBills.length} hóa đơn, ${agentReports.length} báo cáo, ${agentSessions.length} phiên đối soát, ${agentPayments.length} thanh toán đại lý, ${adminPayments.length} thanh toán admin`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Lỗi khi xóa: ${error.message}`
      };
    }
  },

  /**
   * Soft delete user (mark as deleted, keep data)
   */
  async softDeleteUser(userId: string): Promise<DeletionResult> {
    try {
      await update(ref(database, `users/${userId}`), {
        deleted: true,
        deletedAt: FirebaseUtils.getServerTimestamp()
      });

      return {
        success: true,
        message: 'Đã đánh dấu xóa khách hàng thành công (dữ liệu vẫn được giữ lại)'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Lỗi khi xóa: ${error.message}`
      };
    }
  },

  /**
   * Soft delete agent (mark as deleted, keep data)
   */
  async softDeleteAgent(agentId: string): Promise<DeletionResult> {
    try {
      await update(ref(database, `agents/${agentId}`), {
        deleted: true,
        deletedAt: FirebaseUtils.getServerTimestamp(),
        isActive: false // Also deactivate
      });

      return {
        success: true,
        message: 'Đã đánh dấu xóa đại lý thành công (dữ liệu vẫn được giữ lại)'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Lỗi khi xóa: ${error.message}`
      };
    }
  }
};

