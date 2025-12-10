// User services for CRUD operations on users and user_bills
import { ref, get, push, update, remove, query, orderByChild, equalTo, startAt, endAt } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { User, UserBill, Agent, UserBillSession, ReportRecord } from '../../types';
import { ReportService } from './reportServices';
import { cleanupExpiredBillImages } from '../utils/billImageUtils';

export const UserService = {
  /**
   * Create new user
   */
  async createUser(userData: Omit<User, 'id'>): Promise<string> {
    const newRef = await push(ref(database, 'users'), userData);
    return newRef.key!;
  },

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const snapshot = await get(ref(database, `users/${userId}`));
    const data = snapshot.val();
    return data ? { ...data, id: userId } : null;
  },

  /**
   * Get user by phone
   */
  async getUserByPhone(phone: string): Promise<User | null> {
    const snapshot = await get(ref(database, 'users'));
    const users = FirebaseUtils.objectToArray<User>(snapshot.val() || {});
    // Exact match (case-sensitive để khớp "x" và "X")
    return users.find(u => u.phone && u.phone.trim() === phone.trim()) || null;
  },

  /**
   * Update user
   */
  async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    await update(ref(database, `users/${userId}`), {
      ...updates,
      lastActive: FirebaseUtils.getServerTimestamp()
    });
  },

  /**
   * Get all user bills
   */
  async getUserBills(userId: string): Promise<UserBill[]> {
    const snapshot = await get(ref(database, 'user_bills'));
    const bills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});
    const userBills = bills.filter(bill => bill.userId === userId);
    
    // Auto-cleanup expired bill images
    await cleanupExpiredBillImages(userBills);
    
    // Reload after cleanup
    const snapshotAfterCleanup = await get(ref(database, 'user_bills'));
    const billsAfterCleanup = FirebaseUtils.objectToArray<UserBill>(snapshotAfterCleanup.val() || {});
    return billsAfterCleanup.filter(bill => bill.userId === userId);
  },

  /**
   * Get user bills by agent
   */
  async getUserBillsByAgent(userId: string, agentId: string): Promise<UserBill[]> {
    const bills = await this.getUserBills(userId);
    return bills.filter(bill => bill.agentId === agentId);
  },

  /**
   * Get user bill by ID
   */
  async getUserBillById(billId: string): Promise<UserBill | null> {
    const snapshot = await get(ref(database, `user_bills/${billId}`));
    const data = snapshot.val();
    return data ? { ...data, id: billId } : null;
  },

  /**
   * Create new user bill
   */
  async createUserBill(billData: Omit<UserBill, 'id'>): Promise<string> {
    const newRef = await push(ref(database, 'user_bills'), billData);
    const billId = newRef.key!;
    
    // Auto-reconcile the bill immediately
    try {
      const newBill: UserBill = {
        ...billData,
        id: billId
      };
      await ReportService.autoReconcileBill(newBill);
    } catch (error) {
      // Log error but don't fail bill creation
      console.error('Error auto-reconciling bill:', error);
    }
    
    return billId;
  },

  /**
   * Update user bill
   */
  async updateUserBill(billId: string, updates: Partial<UserBill>): Promise<void> {
    await update(ref(database, `user_bills/${billId}`), updates);
  },

  /**
   * Delete user bill
   */
  async deleteUserBill(billId: string): Promise<void> {
    await remove(ref(database, `user_bills/${billId}`));
  },

  /**
   * Check if transaction code exists globally (across all user_bills)
   */
  async checkTransactionCodeExists(transactionCode: string, excludeBillId?: string): Promise<boolean> {
    const snapshot = await get(ref(database, 'user_bills'));
    const bills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});
    
    return bills.some(bill => 
      bill.transactionCode === transactionCode && 
      bill.id !== excludeBillId
    );
  },

  /**
   * Find bill by transaction code (returns the bill if exists)
   */
  async findBillByTransactionCode(transactionCode: string): Promise<UserBill | null> {
    const snapshot = await get(ref(database, 'user_bills'));
    const bills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});
    
    const foundBill = bills.find(bill => bill.transactionCode === transactionCode);
    return foundBill || null;
  },

  /**
   * Get all users (for admin) - exclude deleted users
   */
  async getAllUsers(): Promise<User[]> {
    const snapshot = await get(ref(database, 'users'));
    const allUsers = FirebaseUtils.objectToArray<User>(snapshot.val() || {});
    return allUsers.filter(user => !user.deleted); // Exclude soft-deleted users
  },

  /**
   * Search users by name or phone
   */
  async searchUsers(searchTerm: string): Promise<User[]> {
    const allUsers = await this.getAllUsers();
    const lowerSearch = searchTerm.toLowerCase();
    
    return allUsers.filter(user => 
      user.fullName?.toLowerCase().includes(lowerSearch) ||
      user.phone?.toLowerCase().includes(lowerSearch) ||
      (user.email && user.email.toLowerCase().includes(lowerSearch))
    );
  },

  /**
   * Get user bill sessions by agent and date (with timezone-safe handling)
   */
  async getUserBillSessionsByAgentAndDate(
    userId: string,
    agentId: string | null,
    date: string // YYYY-MM-DD format
  ): Promise<UserBillSession[]> {
    const snapshot = await get(ref(database, 'user_bills'));
    const allBills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});
    
    // Filter bills by userId, agentId (if not null), and date
    const targetDate = new Date(date + 'T00:00:00');
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const filteredBills = allBills.filter(bill => {
      if (bill.userId !== userId) return false;
      if (agentId && bill.agentId !== agentId) return false;
      
      const billDate = new Date(bill.createdAt);
      return billDate >= startOfDay && billDate <= endOfDay;
    });
    
    // Group by uploadSessionId (bills without sessionId are grouped by createdAt hour)
    const sessionMap = new Map<string, UserBill[]>();
    
    filteredBills.forEach(bill => {
      let sessionKey: string;
      
      if (bill.uploadSessionId) {
        sessionKey = bill.uploadSessionId;
      } else {
        // For legacy bills without sessionId, group by hour
        const billDate = new Date(bill.createdAt);
        const hourKey = `${billDate.toISOString().split('T')[0]}_${billDate.getHours()}`;
        sessionKey = `legacy_${hourKey}`;
      }
      
      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, []);
      }
      sessionMap.get(sessionKey)!.push(bill);
    });
    
    // Get agents for name lookup
    const agentsSnapshot = await get(ref(database, 'agents'));
    const agents = FirebaseUtils.objectToArray<Agent>(agentsSnapshot.val() || {});
    
    // Load report records để check reconciliationStatus (source of truth)
    const reportsSnapshot = await get(ref(database, 'report_records'));
    const allReports = FirebaseUtils.objectToArray<ReportRecord>(reportsSnapshot.val() || {});
    const reportsByBillId = new Map<string, ReportRecord>();
    allReports.forEach((report: ReportRecord) => {
      if (report.userBillId) {
        reportsByBillId.set(report.userBillId, report);
      }
    });
    
    // Convert to UserBillSession array
    const sessions: UserBillSession[] = [];
    
    sessionMap.forEach((bills, sessionKey) => {
      if (bills.length === 0) return;
      
      const firstBill = bills[0];
      const agent = agents.find(a => a.id === firstBill.agentId);
      
      // Tính counts dựa trên việc đã match mã chuẩn chi với file merchants và status
      // Logic nhất quán với getStatusBadge trong BillHistory.tsx
      let errorCount = 0;
      let matchedCount = 0;
      let pendingCount = 0;
      
      bills.forEach(bill => {
        const report = reportsByBillId.get(bill.id);
        
        if (!report) {
          // Chưa có ReportRecord → pending
          pendingCount++;
          return;
        }
        
        // Kiểm tra đã match mã chuẩn chi với file merchants:
        // 1. Có merchantTransactionId (đã match với merchant transaction)
        // 2. HOẶC có merchantsFileData (thông tin từ file Excel) VÀ transactionCode match
        const hasMerchantTransactionId = !!report.merchantTransactionId;
        const hasMerchantsFileData = !!(
          report.merchantsFileData && 
          Object.keys(report.merchantsFileData).length > 0
        );
        const transactionCodeMatch = report.transactionCode === bill.transactionCode;
        
        // Đã match mã chuẩn chi nếu:
        // - Có merchantTransactionId, HOẶC
        // - Có merchantsFileData VÀ transactionCode match
        const hasMatchedMerchantTransaction = hasMerchantTransactionId || 
          (hasMerchantsFileData && transactionCodeMatch);
        
        if (hasMatchedMerchantTransaction) {
          // Đã match mã chuẩn chi → check status để phân loại
          const status = report.reconciliationStatus || report.status || '';
          switch (status) {
            case 'MATCHED':
            case 'DONE':
              matchedCount++;
              break;
            case 'ERROR':
              errorCount++;
              break;
            case 'UNMATCHED':
            case 'PENDING':
            default:
              // Có match mã chuẩn chi nhưng status không rõ → coi như đã match
              matchedCount++;
              break;
          }
        } else {
          // Chưa match mã chuẩn chi → pending
          pendingCount++;
        }
      });
      
      sessions.push({
        id: sessionKey,
        userId: firstBill.userId,
        agentId: firstBill.agentId,
        agentName: agent?.name || 'N/A',
        agentCode: agent?.code || firstBill.agentCode,
        createdAt: firstBill.createdAt, // Use first bill's timestamp
        billCount: bills.length,
        errorCount,
        matchedCount,
        pendingCount
      });
    });
    
    // Sort by createdAt descending
    return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Get bills by session ID
   */
  async getBillsBySession(
    userId: string,
    sessionId: string
  ): Promise<UserBill[]> {
    const snapshot = await get(ref(database, 'user_bills'));
    const allBills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});
    
    // Filter by userId and sessionId
    let filteredBills = allBills.filter(bill => 
      bill.userId === userId && bill.uploadSessionId === sessionId
    );
    
    // If no bills found with exact sessionId, check for legacy grouping
    if (filteredBills.length === 0 && sessionId.startsWith('legacy_')) {
      const [_, dateHour] = sessionId.split('legacy_');
      const [dateStr, hourStr] = dateHour.split('_');
      const hour = parseInt(hourStr, 10);
      
      const targetDate = new Date(dateStr + 'T00:00:00');
      const startOfHour = new Date(targetDate);
      startOfHour.setHours(hour, 0, 0, 0);
      const endOfHour = new Date(targetDate);
      endOfHour.setHours(hour, 59, 59, 999);
      
      filteredBills = allBills.filter(bill => {
        if (bill.userId !== userId) return false;
        if (bill.uploadSessionId) return false; // Skip bills with sessionId
        const billDate = new Date(bill.createdAt);
        return billDate >= startOfHour && billDate <= endOfHour;
      });
    }
    
    // Sort by createdAt descending
    return filteredBills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Get bills for agent, user, and date range (timezone-safe)
   */
  async getBillsForAgentUserAndDateRange(params: {
    agentId: string;
    userId: string | null; // null = all users for this agent
    fromDate: string; // 'YYYY-MM-DD'
    toDate: string;   // 'YYYY-MM-DD'
  }): Promise<UserBill[]> {
    const { agentId, userId, fromDate, toDate } = params;
    
    const snapshot = await get(ref(database, 'user_bills'));
    const bills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});

    // Timezone-safe date range calculation
    const start = new Date(fromDate + 'T00:00:00');
    start.setHours(0, 0, 0, 0);
    const end = new Date(toDate + 'T23:59:59');
    end.setHours(23, 59, 59, 999);

    return bills.filter(b => {
      // Filter by agentId
      if (b.agentId !== agentId) return false;
      
      // Filter by userId (if specified)
      if (userId && b.userId !== userId) return false;
      
      // Filter by date range
      const createdAt = new Date(b.createdAt);
      return createdAt >= start && createdAt <= end;
    });
  },

  /**
   * Get pending bills summary (for admin panel)
   * Returns list of users with pending bills count (including UNMATCHED from ReportRecords)
   */
  async getPendingBillsSummary(): Promise<Array<{
    userId: string;
    userName: string;
    userPhone: string;
    pendingCount: number;
  }>> {
    const billsSnapshot = await get(ref(database, 'user_bills'));
    const usersSnapshot = await get(ref(database, 'users'));
    const reportsSnapshot = await get(ref(database, 'report_records'));
    
    const allBills = FirebaseUtils.objectToArray<UserBill>(billsSnapshot.val() || {});
    const allUsers = FirebaseUtils.objectToArray<User>(usersSnapshot.val() || {});
    const allReports = FirebaseUtils.objectToArray(reportsSnapshot.val() || {}) as any[];
    
    // Tạo map: userBillId -> ReportRecord
    const reportsByBillId = new Map<string, any>();
    allReports.forEach((report: any) => {
      if (report.userBillId) {
        reportsByBillId.set(report.userBillId, report);
      }
    });
    
    // Load merchant_transactions để check trực tiếp
    const merchantSnapshot = await get(ref(database, 'merchant_transactions'));
    const allMerchantTransactions = FirebaseUtils.objectToArray(merchantSnapshot.val() || {});
    
    // Tạo map: transactionCode -> MerchantTransaction (để check nhanh)
    // Normalize transactionCode (trim, lowercase) để đảm bảo match chính xác
    const normalizeTransactionCode = (code: string | undefined | null): string | null => {
      if (!code) return null;
      return String(code).trim().toLowerCase();
    };
    
    const merchantByTransactionCode = new Map<string, any>();
    allMerchantTransactions.forEach((merchant: any) => {
      const normalizedCode = normalizeTransactionCode(merchant.transactionCode);
      if (normalizedCode) {
        merchantByTransactionCode.set(normalizedCode, merchant);
      }
    });
    
    // Group by userId
    const userStats = new Map<string, { pending: number }>();
    
    // Đếm từ bills và report_records
    // CHỈ đếm bills CHƯA CÓ merchant transaction (chưa có mã chuẩn chi match với file Excel)
    allBills.forEach(bill => {
      if (!userStats.has(bill.userId)) {
        userStats.set(bill.userId, { pending: 0 });
      }
      const stats = userStats.get(bill.userId)!;
      
      const report = reportsByBillId.get(bill.id);
      
      // Kiểm tra xem có merchant transaction không (check cả ReportRecord và merchant_transactions)
      let hasMerchantTransaction = false;
      
      if (report) {
        // Bill đã có ReportRecord
        // Kiểm tra xem có merchant data không (merchantTransactionId là dấu hiệu rõ ràng nhất)
        hasMerchantTransaction = !!(
          report.merchantTransactionId || 
          (report.merchantAmount && report.merchantAmount > 0) ||
          (report.merchantsFileData && Object.keys(report.merchantsFileData).length > 0)
        );
      }
      
      // Nếu chưa có merchant data trong ReportRecord, check merchant_transactions trực tiếp
      if (!hasMerchantTransaction && bill.transactionCode) {
        const normalizedBillCode = normalizeTransactionCode(bill.transactionCode);
        if (normalizedBillCode) {
          hasMerchantTransaction = merchantByTransactionCode.has(normalizedBillCode);
        }
      }
      
      if (hasMerchantTransaction) {
        // Đã có merchant transaction → KHÔNG đếm là pending
        // Dù reconciliationStatus là MATCHED, ERROR, hay UNMATCHED, nếu đã có merchant transaction thì không phải pending
        // Bills có ERROR hoặc không khớp sẽ hiển thị trong báo cáo, không cần trả về đây
        return; // Skip bill này
      } else {
        // Chưa có merchant transaction → đếm là pending (chờ upload file Excel)
        // Đếm TẤT CẢ bills chưa có merchants, không phụ thuộc vào status hoặc reconciliationStatus
        // Vì mục đích là hiển thị bills đang chờ merchants file để đối soát
        stats.pending++;
      }
    });
    
    // Map to user info
    return Array.from(userStats.entries())
      .filter(([_, stats]) => stats.pending > 0) // Only users with pending bills
      .map(([userId, stats]) => {
        const user = allUsers.find(u => u.id === userId);
        return {
          userId,
          userName: user?.fullName || 'N/A',
          userPhone: user?.phone || 'N/A',
          pendingCount: stats.pending
        };
      })
      .sort((a, b) => b.pendingCount - a.pendingCount); // Sort by pending count desc
  },

  /**
   * Get pending bills for a specific user
   * Chỉ trả về bills CHƯA CÓ merchant transaction (UNMATCHED)
   * KHÔNG bao gồm bills đã có merchant nhưng không khớp (ERROR)
   */
  async getUserPendingBills(userId: string, dateFrom?: string, dateTo?: string): Promise<UserBill[]> {
    const bills = await this.getUserBills(userId);
    const reportsSnapshot = await get(ref(database, 'report_records'));
    const allReports = FirebaseUtils.objectToArray(reportsSnapshot.val() || {}) as any[];
    
    // Load merchant_transactions để check trực tiếp
    const merchantSnapshot = await get(ref(database, 'merchant_transactions'));
    const allMerchantTransactions = FirebaseUtils.objectToArray(merchantSnapshot.val() || {});
    
    // Tạo map: transactionCode -> MerchantTransaction (để check nhanh)
    // Normalize transactionCode (trim, lowercase) để đảm bảo match chính xác
    const normalizeTransactionCode = (code: string | undefined | null): string | null => {
      if (!code) return null;
      return String(code).trim().toLowerCase();
    };
    
    const merchantByTransactionCode = new Map<string, any>();
    allMerchantTransactions.forEach((merchant: any) => {
      const normalizedCode = normalizeTransactionCode(merchant.transactionCode);
      if (normalizedCode) {
        merchantByTransactionCode.set(normalizedCode, merchant);
      }
    });
    
    // Tạo map: userBillId -> ReportRecord
    const reportsByBillId = new Map<string, any>();
    allReports.forEach((report: any) => {
      if (report.userBillId) {
        reportsByBillId.set(report.userBillId, report);
      }
    });
    
    // Filter: chỉ lấy bills CHƯA CÓ merchant transaction (chưa có mã chuẩn chi match với file Excel)
    // Bills có ERROR hoặc không khớp (nhưng đã có merchant data) KHÔNG được trả về đây
    // Logic giống getPendingBillsSummary: trả về TẤT CẢ bills chưa có merchants, không phụ thuộc vào status
    let pendingBills = bills.filter(bill => {
      const report = reportsByBillId.get(bill.id);
      
      // Kiểm tra xem có merchant transaction không (check cả ReportRecord và merchant_transactions)
      let hasMerchantTransaction = false;
      
      if (report) {
        // Bill đã có ReportRecord
        // Kiểm tra xem có merchant data không (merchantTransactionId là dấu hiệu rõ ràng nhất)
        hasMerchantTransaction = !!(
          report.merchantTransactionId || 
          (report.merchantAmount && report.merchantAmount > 0) ||
          (report.merchantsFileData && Object.keys(report.merchantsFileData).length > 0)
        );
      }
      
      // Nếu chưa có merchant data trong ReportRecord, check merchant_transactions trực tiếp
      if (!hasMerchantTransaction && bill.transactionCode) {
        const normalizedBillCode = normalizeTransactionCode(bill.transactionCode);
        if (normalizedBillCode) {
          hasMerchantTransaction = merchantByTransactionCode.has(normalizedBillCode);
        }
      }
      
      if (hasMerchantTransaction) {
        // Đã có merchant transaction → KHÔNG trả về (dù reconciliationStatus là gì)
        // Bills có ERROR hoặc không khớp sẽ hiển thị trong báo cáo, không cần trả về đây
        return false;
      } else {
        // Chưa có merchant transaction → trả về TẤT CẢ bills (không phụ thuộc vào status)
        // Vì mục đích là hiển thị bills đang chờ merchants file để đối soát
        return true;
      }
    });
    
    // Apply date filter if provided
    if (dateFrom || dateTo) {
      pendingBills = pendingBills.filter(bill => {
        const billDate = bill.timestamp.split('T')[0];
        if (dateFrom && billDate < dateFrom) return false;
        if (dateTo && billDate > dateTo) return false;
        return true;
      });
    }
    
    return pendingBills.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
};

