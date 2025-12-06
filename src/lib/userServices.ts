// User services for CRUD operations on users and user_bills
import { ref, get, push, update, remove, query, orderByChild, equalTo, startAt, endAt } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { User, UserBill, Agent, UserBillSession } from '../../types';

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
    return bills.filter(bill => bill.userId === userId);
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
    return newRef.key!;
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
    
    // Convert to UserBillSession array
    const sessions: UserBillSession[] = [];
    
    sessionMap.forEach((bills, sessionKey) => {
      if (bills.length === 0) return;
      
      const firstBill = bills[0];
      const agent = agents.find(a => a.id === firstBill.agentId);
      
      const errorCount = bills.filter(b => b.status === 'ERROR').length;
      const matchedCount = bills.filter(b => b.status === 'MATCHED').length;
      const pendingCount = bills.filter(b => b.status === 'PENDING').length;
      
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
   * Returns list of users with pending bills count
   */
  async getPendingBillsSummary(): Promise<Array<{
    userId: string;
    userName: string;
    userPhone: string;
    pendingCount: number;
    matchedCount: number;
  }>> {
    const billsSnapshot = await get(ref(database, 'user_bills'));
    const usersSnapshot = await get(ref(database, 'users'));
    
    const allBills = FirebaseUtils.objectToArray<UserBill>(billsSnapshot.val() || {});
    const allUsers = FirebaseUtils.objectToArray<User>(usersSnapshot.val() || {});
    
    // Group by userId
    const userStats = new Map<string, { pending: number; matched: number }>();
    
    allBills.forEach(bill => {
      if (!userStats.has(bill.userId)) {
        userStats.set(bill.userId, { pending: 0, matched: 0 });
      }
      const stats = userStats.get(bill.userId)!;
      if (bill.status === 'PENDING') {
        stats.pending++;
      } else if (bill.status === 'MATCHED') {
        stats.matched++;
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
          pendingCount: stats.pending,
          matchedCount: stats.matched
        };
      })
      .sort((a, b) => b.pendingCount - a.pendingCount); // Sort by pending count desc
  },

  /**
   * Get pending bills for a specific user
   */
  async getUserPendingBills(userId: string, dateFrom?: string, dateTo?: string): Promise<UserBill[]> {
    const bills = await this.getUserBills(userId);
    let pendingBills = bills.filter(bill => bill.status === 'PENDING');
    
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

