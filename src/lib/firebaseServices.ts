// Firebase services for Merchants and Agents CRUD operations
import { ref, get, set, push, remove, update } from 'firebase/database'
import { database } from './firebase'
import { FirebaseUtils } from './firebaseHooks'
import type { 
  Merchant, 
  Agent, 
  ReconciliationSession,
  ReconciliationRecord,
  Payment,
  PaymentBatch,
  AppSettings,
  Stats,
  DateFilter,
  ExportData,
  TransactionStatus,
  MerchantTransaction,
  ReportRecord,
  AdminPaymentToAgent
} from '../../types'
import { TransactionStatus as TS } from '../../types'

// Merchants Service
export const MerchantsService = {
  // Get all merchants
  async getAll(): Promise<Merchant[]> {
    const snapshot = await get(ref(database, 'merchants'))
    return FirebaseUtils.objectToArray(snapshot.val())
  },

  // Get merchant by ID
  async getById(id: string): Promise<Merchant | null> {
    const snapshot = await get(ref(database, `merchants/${id}`))
    const data = snapshot.val()
    return data ? { ...data, id } : null
  },

  // Create new merchant
  async create(merchant: Omit<Merchant, 'id'>): Promise<string> {
    const newMerchant = {
      ...merchant,
      createdAt: FirebaseUtils.getServerTimestamp(),
      updatedAt: FirebaseUtils.getServerTimestamp()
    }
    const newRef = await push(ref(database, 'merchants'), newMerchant)
    return newRef.key!
  },

  // Update merchant
  async update(id: string, updates: Partial<Merchant>): Promise<void> {
    const updatedData = {
      ...updates,
      updatedAt: FirebaseUtils.getServerTimestamp()
    }
    await update(ref(database, `merchants/${id}`), updatedData)
  },

  // Delete merchant
  async delete(id: string): Promise<void> {
    await remove(ref(database, `merchants/${id}`))
  },

  // Check if code exists (for uniqueness validation)
  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const snapshot = await get(ref(database, 'merchants'))
    const merchants = snapshot.val()
    if (!merchants) return false

    return Object.entries(merchants).some(([id, merchant]: [string, any]) => 
      merchant.code === code && id !== excludeId
    )
  },

  // Cập nhật trạng thái hoạt động
  async updateStatus(id: string, isActive: boolean): Promise<void> {
    await update(ref(database, `merchants/${id}`), {
      isActive,
      updatedAt: FirebaseUtils.getServerTimestamp()
    })
  },

  // Lấy thống kê giao dịch của merchant
  async getTransactionStats(merchantId: string): Promise<{ count: number; totalAmount: number }> {
    const snapshot = await get(ref(database, 'reconciliation_records'))
    const records = FirebaseUtils.objectToArray(snapshot.val()) as ReconciliationRecord[]
    
    const merchantRecords = records.filter(record => 
      record.merchantData?.merchantCode === merchantId
    )
    
    return {
      count: merchantRecords.length,
      totalAmount: merchantRecords.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0)
    }
  }
}

// Agents Service
export const AgentsService = {
  // Get all agents
  async getAll(): Promise<Agent[]> {
    const snapshot = await get(ref(database, 'agents'))
    return FirebaseUtils.objectToArray(snapshot.val())
  },

  // Get agent by ID
  async getById(id: string): Promise<Agent | null> {
    const snapshot = await get(ref(database, `agents/${id}`))
    const data = snapshot.val()
    return data ? { ...data, id } : null
  },

  // Create new agent
  async create(agent: Omit<Agent, 'id'>): Promise<string> {
    const newAgent = {
      ...agent,
      createdAt: FirebaseUtils.getServerTimestamp(),
      updatedAt: FirebaseUtils.getServerTimestamp()
    }
    const newRef = await push(ref(database, 'agents'), newAgent)
    return newRef.key!
  },

  // Update agent
  async update(id: string, updates: Partial<Agent>): Promise<void> {
    const updatedData = {
      ...updates,
      updatedAt: FirebaseUtils.getServerTimestamp()
    }
    await update(ref(database, `agents/${id}`), updatedData)
  },

  // Delete agent
  async delete(id: string): Promise<void> {
    await remove(ref(database, `agents/${id}`))
  },

  // Check if code exists (for uniqueness validation)
  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const snapshot = await get(ref(database, 'agents'))
    const agents = snapshot.val()
    if (!agents) return false

    return Object.entries(agents).some(([id, agent]: [string, any]) => 
      agent.code === code && id !== excludeId
    )
  },

  // Cập nhật trạng thái hoạt động
  async updateStatus(id: string, isActive: boolean): Promise<void> {
    await update(ref(database, `agents/${id}`), {
      isActive,
      updatedAt: FirebaseUtils.getServerTimestamp()
    })
  },

  // Validation chiết khấu (0-100%)
  validateDiscountRates(discountRates: Record<string, number>): boolean {
    return Object.values(discountRates).every(rate => 
      rate >= 0 && rate <= 100
    )
  },

  // Lấy thống kê công nợ chưa thanh toán
  async getUnpaidStats(agentId: string): Promise<{ count: number; totalAmount: number }> {
    const snapshot = await get(ref(database, 'payments'))
    const payments = FirebaseUtils.objectToArray(snapshot.val()) as Payment[]
    
    const unpaidPayments = payments.filter(payment => 
      payment.agentId === agentId && payment.status === 'PENDING'
    )
    
    return {
      count: unpaidPayments.length,
      totalAmount: unpaidPayments.reduce((sum, p) => sum + p.netAmount, 0)
    }
  }
}

// Dashboard Service - thống kê real-time và export
export const DashboardService = {
  // Helper: Lấy sessions theo date filter (lấy COMPLETED và PROCESSING, bỏ FAILED)
  async getSessionsByDate(dateFilter?: DateFilter): Promise<ReconciliationSession[]> {
    const snapshot = await get(ref(database, 'reconciliation_sessions'))
    const sessions = FirebaseUtils.objectToArray(snapshot.val()) as ReconciliationSession[]
    
    if (!sessions || sessions.length === 0) {
      return []
    }
    
    // Lấy COMPLETED và PROCESSING, bỏ FAILED
    const validSessions = sessions.filter(s => s.status === 'COMPLETED' || s.status === 'PROCESSING')
    
    if (dateFilter && dateFilter.from && dateFilter.to) {
      return validSessions.filter(session => {
        const sessionDate = session.createdAt.split('T')[0]
        return sessionDate >= dateFilter.from! && sessionDate <= dateFilter.to!
      })
    }
    
    return validSessions
  },

  // OPTIMIZED: Lấy thống kê tổng quan từ sessions summary
  async getStats(dateFilter?: DateFilter): Promise<Stats> {
    // Lấy tất cả sessions (không filter theo date ở đây, sẽ filter sau)
    const snapshot = await get(ref(database, 'reconciliation_sessions'))
    const allSessions = FirebaseUtils.objectToArray(snapshot.val()) as ReconciliationSession[]
    const validSessions = allSessions.filter(s => s.status === 'COMPLETED' || s.status === 'PROCESSING')
    
    // Filter sessions theo dateFilter nếu có
    let filteredSessions = validSessions
    if (dateFilter?.from && dateFilter?.to) {
      filteredSessions = validSessions.filter(session => {
        const sessionDate = session.createdAt.split('T')[0]
        return sessionDate >= dateFilter.from! && sessionDate <= dateFilter.to!
      })
    }
    
    console.log(`📊 getStats: Found ${filteredSessions.length} sessions for dateFilter`, dateFilter)
    
    // Load records từ các sessions đã filter
    const allRecords: ReconciliationRecord[] = []
    for (const session of filteredSessions) {
      try {
        const records = await ReconciliationService.getRecordsBySession(session.id)
        allRecords.push(...records)
        console.log(`📊 Session ${session.id}: ${records.length} records`)
      } catch (e) {
        console.warn(`⚠️ Không thể load records cho session ${session.id}:`, e)
      }
    }
    
    console.log(`📊 Total records loaded: ${allRecords.length}`)
    
    // Aggregate từ records (không filter records theo date nữa vì đã filter sessions rồi)
    const stats = {
      totalVolume: allRecords.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0),
      totalTransactions: allRecords.length,
      matchedCount: allRecords.filter(r => r.status === TS.MATCHED).length,
      // CHỈ đếm ERROR_AMOUNT (lệch tiền) - không đếm MISSING_IN_* hoặc ERROR_DUPLICATE
      errorCount: allRecords.filter(r => r.status === TS.ERROR_AMOUNT).length
    }
    
    console.log(`📊 Final stats:`, stats)
    return stats
  },

  // Lấy phiên đối soát gần đây (lấy COMPLETED và PROCESSING, bỏ FAILED)
  async getRecentSessions(limit: number = 10): Promise<ReconciliationSession[]> {
    const snapshot = await get(ref(database, 'reconciliation_sessions'))
    const sessions = FirebaseUtils.objectToArray(snapshot.val()) as ReconciliationSession[]
    
    if (!sessions || sessions.length === 0) {
      return []
    }
    
    // Lấy COMPLETED và PROCESSING, bỏ FAILED
    const validSessions = sessions.filter(s => s.status === 'COMPLETED' || s.status === 'PROCESSING')
    return validSessions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  },

  // OPTIMIZED: Lấy giao dịch lỗi gần đây với Firebase query (lazy load)
  async getErrorTransactions(limit: number = 10): Promise<ReconciliationRecord[]> {
    try {
      // Try to use Firebase query for better performance
    const snapshot = await get(ref(database, 'reconciliation_records'))
    const records = FirebaseUtils.objectToArray(snapshot.val()) as ReconciliationRecord[]
      
      // Filter errors and sort
    return records
      .filter(r => r.status !== 'MATCHED')
      .sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime())
      .slice(0, limit)
    } catch (error) {
      console.warn('Error loading error transactions:', error)
      return []
    }
  },

  // Export dữ liệu Dashboard ra Excel
  async exportStats(dateFilter?: DateFilter): Promise<ExportData> {
    const stats = await this.getStats(dateFilter)
    const sessions = await this.getRecentSessions(20)
    const errorTransactions = await this.getErrorTransactions(50)
    const settingsSnapshot = await get(ref(database, 'settings'))
    const settings = settingsSnapshot.val() as AppSettings
    
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        dateRange: dateFilter ? `${dateFilter.from} - ${dateFilter.to}` : 'Tất cả',
        companyName: settings?.companyName || 'PayReconcile Pro',
        logoUrl: settings?.logoUrl
      },
      data: [
        { type: 'stats', ...stats },
        ...sessions.map(s => ({ type: 'session', ...s })),
        ...errorTransactions.map(e => ({ type: 'error', ...e }))
      ],
      summary: {
        totalSessions: sessions.length,
        avgTransactionsPerSession: sessions.length > 0 ? stats.totalTransactions / sessions.length : 0
      }
    }
  }
}

// Reconciliation Service - quản lý phiên đối soát
export const ReconciliationService = {
  // Tạo phiên đối soát mới
  async createSession(session: Omit<ReconciliationSession, 'id'>): Promise<string> {
    const newSession = {
      ...session,
      createdAt: FirebaseUtils.getServerTimestamp(),
      status: 'PROCESSING' as const
    }
    const newRef = await push(ref(database, 'reconciliation_sessions'), newSession)
    return newRef.key!
  },

  // Cập nhật trạng thái phiên
  async updateSession(id: string, updates: Partial<ReconciliationSession>): Promise<void> {
    const updatedData = {
      ...updates,
      updatedAt: FirebaseUtils.getServerTimestamp(),
      processedAt: updates.processedAt || FirebaseUtils.getServerTimestamp()
    }
    await update(ref(database, `reconciliation_sessions/${id}`), updatedData)
  },

  // Lưu records của phiên đối soát
  async saveRecords(sessionId: string, records: ReconciliationRecord[]): Promise<void> {
    const updates: any = {}
    const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj, (_k, v) => (v === undefined ? null : v)))
    for (const record of records) {
      const newRef = push(ref(database, 'reconciliation_records'))
      updates[`reconciliation_records/${newRef.key}`] = sanitize({
        ...record,
        sessionId,
        processedAt: FirebaseUtils.getServerTimestamp()
      })
    }
    await update(ref(database), updates)
  },


  // Lấy records theo session ID
  async getRecordsBySession(sessionId: string): Promise<ReconciliationRecord[]> {
    const snapshot = await get(ref(database, 'reconciliation_records'))
    const records = FirebaseUtils.objectToArray(snapshot.val()) as ReconciliationRecord[]
    return records.filter(record => (record as any).sessionId === sessionId)
  },

  // Cập nhật note cho reconciliation record
  async updateRecordNote(recordId: string, note: string): Promise<void> {
    const recordRef = ref(database, `reconciliation_records/${recordId}`)
    await update(recordRef, {
      note,
      noteUpdatedAt: FirebaseUtils.getServerTimestamp(),
      noteUpdatedBy: 'current_user' // TODO: Get from auth context
    })
  },

  // Cập nhật toàn bộ reconciliation record (manual edit)
  async updateRecord(recordId: string, updates: Partial<ReconciliationRecord>): Promise<void> {
    const recordRef = ref(database, `reconciliation_records/${recordId}`)
    await update(recordRef, {
      ...updates,
      updatedAt: FirebaseUtils.getServerTimestamp()
    })
  },

  // Lấy phiên theo ID
  async getSessionById(id: string): Promise<ReconciliationSession | null> {
    const snapshot = await get(ref(database, `reconciliation_sessions/${id}`))
    const data = snapshot.val()
    return data ? { ...data, id } : null
  },

  // Export kết quả đối soát
  async exportReconciliationResult(sessionId: string): Promise<ExportData> {
    const session = await this.getSessionById(sessionId)
    const records = await this.getRecordsBySession(sessionId)
    const settingsSnapshot = await get(ref(database, 'settings'))
    const settings = settingsSnapshot.val() as AppSettings
    
    if (!session) throw new Error('Session not found')
    
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        dateRange: session.createdAt,
        companyName: settings?.companyName || 'PayReconcile Pro',
        logoUrl: settings?.logoUrl
      },
      data: records,
      summary: {
        sessionInfo: session,
        byStatus: records.reduce((acc, record) => {
          acc[record.status] = (acc[record.status] || 0) + 1
          return acc
        }, {} as Record<TransactionStatus, number>),
        totalAmount: records.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0)
      }
    }
  },

  // Xóa phiên đối soát
  async deleteSession(sessionId: string): Promise<void> {
    // Xóa session
    await remove(ref(database, `reconciliation_sessions/${sessionId}`))
    
    // Xóa tất cả records liên quan đến session này
    const recordsSnapshot = await get(ref(database, 'reconciliation_records'))
    const records = FirebaseUtils.objectToArray(recordsSnapshot.val() || {}) as ReconciliationRecord[]
    const sessionRecords = records.filter(r => (r as any).sessionId === sessionId)
    
    const updates: any = {}
    sessionRecords.forEach(record => {
      updates[`reconciliation_records/${record.id}`] = null
    })
    
    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates)
    }
  }
}

// Settings Service - quản lý cấu hình hệ thống
export const SettingsService = {
  // Lấy cấu hình hệ thống
  async getSettings(): Promise<AppSettings> {
    const snapshot = await get(ref(database, 'settings'))
    const settings = snapshot.val()
    
    // Trả về cấu hình mặc định nếu chưa có
    if (!settings) {
      const defaultSettings: AppSettings = {
        companyName: 'PayReconcile Pro',
        timezone: 'Asia/Ho_Chi_Minh',
        currency: 'VNĐ',
        dateFormat: 'DD/MM/YYYY'
      }
      await this.updateSettings(defaultSettings)
      return defaultSettings
    }
    
    return settings
  },

  // Cập nhật cấu hình (merge với settings hiện có)
  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    try {
      // Try to get current settings first, but don't fail if it times out
      let currentSettings: AppSettings | null = null;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 3000);
        });
        currentSettings = await Promise.race([this.getSettings(), timeoutPromise]);
      } catch (e) {
        // If getSettings fails, we'll use update() instead of set() to merge
        console.warn('Could not load current settings, using update() instead:', e);
      }

      if (currentSettings) {
        // Merge with current settings
        const updatedSettings = {
          ...currentSettings,
          ...settings,
          updatedAt: FirebaseUtils.getServerTimestamp()
        };
        await set(ref(database, 'settings'), updatedSettings);
      } else {
        // If we couldn't load current settings, use update() to merge only the provided fields
        const updates: any = {
          ...settings,
          updatedAt: FirebaseUtils.getServerTimestamp()
        };
        // Ensure required fields exist
        if (!updates.companyName) updates.companyName = 'PayReconcile Pro';
        if (!updates.timezone) updates.timezone = 'Asia/Ho_Chi_Minh';
        if (!updates.currency) updates.currency = 'VNĐ';
        if (!updates.dateFormat) updates.dateFormat = 'DD/MM/YYYY';
        await update(ref(database, 'settings'), updates);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  },


  // Cập nhật logo công ty
  async updateLogo(logoUrl: string): Promise<void> {
    await update(ref(database, 'settings'), {
      logoUrl,
      updatedAt: FirebaseUtils.getServerTimestamp()
    })
  },

  // Reset về cấu hình mặc định
  async resetToDefault(): Promise<void> {
    const defaultSettings: AppSettings = {
      companyName: 'PayReconcile Pro',
      timezone: 'Asia/Ho_Chi_Minh',
      currency: 'VNĐ',
      dateFormat: 'DD/MM/YYYY',
      updatedAt: FirebaseUtils.getServerTimestamp()
    }
    await set(ref(database, 'settings'), defaultSettings)
  }
}

// Payments Service - quản lý thanh toán và công nợ
export const PaymentsService = {
  // OPTIMIZED: Lấy danh sách giao dịch chưa thanh toán (query filtered)
  async getUnpaidTransactions(): Promise<ReconciliationRecord[]> {
    try {
      // Load MATCHED records only
      const recordsSnapshot = await get(ref(database, 'reconciliation_records'))
      const records = FirebaseUtils.objectToArray(recordsSnapshot.val()) as ReconciliationRecord[]
      
      // Filter MATCHED records và chưa có paymentId (chưa được thêm vào payment)
      const unpaidRecords = records.filter(r => 
        r.status === 'MATCHED' && 
        !r.paymentId && // Chưa có paymentId = chưa được thêm vào payment
        !r.isPaid // Chưa được đánh dấu là đã thanh toán
      )
      
      return unpaidRecords
    } catch (error) {
      console.warn('Error loading unpaid transactions:', error)
      return []
    }
  },

  // Check if transaction is already paid
  async checkTransactionPaid(transactionCode: string): Promise<boolean> {
    try {
      // Load all reconciliation records
      const recordsSnapshot = await get(ref(database, 'reconciliation_records'))
      const records = FirebaseUtils.objectToArray(recordsSnapshot.val() || {}) as ReconciliationRecord[]
      
      // Find record with this transactionCode
      const record = records.find(r => r.transactionCode === transactionCode)
      if (!record) return false
      
      // Load payments
      const paymentsSnapshot = await get(ref(database, 'payments'))
      const payments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {}) as Payment[]
      
      // Check if record ID is in any paid payment
      return payments.some(payment => 
        payment.status === 'PAID' && 
        payment.transactionIds?.includes(record.id)
      )
    } catch (error) {
      console.warn('Error checking transaction paid status:', error)
      return false
    }
  },

  // Create payment from reconciliation record
  async createPaymentFromReconciliation(record: ReconciliationRecord, agent: Agent): Promise<string | null> {
    try {
      // Check if already paid
      const isPaid = await this.checkTransactionPaid(record.transactionCode)
      if (isPaid) {
        console.log(`Transaction ${record.transactionCode} already paid, skipping`)
        return null
      }
      
      const amount = record.merchantAmount || 0
      const paymentMethod = record.paymentMethod || record.merchantData?.method || 'QR 1 (VNPay)'
      const pointOfSaleName = record.pointOfSaleName
      
      // Ưu tiên dùng discountRatesByPointOfSale (NEW WORKFLOW)
      let feePercentage = 0;
      if (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
        feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
      } else if (agent.discountRates) {
        // Fallback về discountRates global (cũ)
        feePercentage = agent.discountRates[paymentMethod] || 0;
      }
      
      const feeAmount = (amount * feePercentage) / 100
      const netAmount = amount - feeAmount
      
      const payment: Omit<Payment, 'id'> = {
        agentId: agent.id,
        agentName: agent.name,
        agentCode: agent.code,
        bankAccount: agent.bankAccount,
        totalAmount: amount,
        feeAmount,
        netAmount,
        transactionIds: [record.id],
        transactionCount: 1,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        createdBy: 'system'
      }
      
      return await this.createPayment(payment)
    } catch (error) {
      console.error('Error creating payment from reconciliation:', error)
      return null
    }
  },

  // Tạo thanh toán mới
  async createPayment(payment: Omit<Payment, 'id'>): Promise<string> {
    const newPayment = {
      ...payment,
      createdAt: FirebaseUtils.getServerTimestamp()
    }
    const newRef = await push(ref(database, 'payments'), newPayment)
    return newRef.key!
  },

  // Cập nhật trạng thái thanh toán
  async updatePaymentStatus(id: string, status: Payment['status']): Promise<void> {
    const updates: any = { status }
    if (status === 'PAID') {
      updates.paidAt = FirebaseUtils.getServerTimestamp()
    }
    await update(ref(database, `payments/${id}`), updates)
  },

  // Lấy thanh toán theo agent
  async getPaymentsByAgent(agentId: string): Promise<Payment[]> {
    const snapshot = await get(ref(database, 'payments'))
    const payments = FirebaseUtils.objectToArray(snapshot.val()) as Payment[]
    return payments.filter(payment => payment.agentId === agentId)
  },

  // Tạo đợt chi trả
  async createBatch(batch: Omit<PaymentBatch, 'id'>): Promise<string> {
    const newBatch = {
      ...batch,
      createdAt: batch.createdAt || FirebaseUtils.getServerTimestamp(),
      status: batch.status || 'DRAFT' as const,
      // Preserve paymentStatus, paidAt, approvalCode if provided
      paymentStatus: batch.paymentStatus,
      paidAt: batch.paidAt,
      approvalCode: batch.approvalCode
    }
    const newRef = await push(ref(database, 'payment_batches'), newBatch)
    return newRef.key!
  },

  // Lấy danh sách đợt chi trả (lazy loading)
  async getBatches(page: number = 1, pageSize: number = 5): Promise<{ batches: PaymentBatch[]; hasMore: boolean; total: number }> {
    try {
      const snapshot = await get(ref(database, 'payment_batches'))
      const batches = FirebaseUtils.objectToArray(snapshot.val()) as PaymentBatch[]
      const sorted = batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      
      const total = sorted.length
      const startIndex = (page - 1) * pageSize
      const endIndex = startIndex + pageSize
      const paginatedBatches = sorted.slice(startIndex, endIndex)
      const hasMore = endIndex < total
      
      return {
        batches: paginatedBatches,
        hasMore,
        total
      }
    } catch (error) {
      console.error('Error loading payment batches:', error)
      return { batches: [], hasMore: false, total: 0 }
    }
  },

  // Thêm thanh toán vào batch
  async addPaymentsToBatch(batchId: string, paymentIds: string[]): Promise<void> {
    const updates: any = {}
    paymentIds.forEach(paymentId => {
      updates[`payments/${paymentId}/batchId`] = batchId
    })
    await update(ref(database), updates)
    
    // Cập nhật thông tin batch
    await update(ref(database, `payment_batches/${batchId}`), {
      paymentIds,
      paymentCount: paymentIds.length
    })
  },

  // Export batch ra Excel
  async exportBatch(batchId: string): Promise<ExportData> {
    const batchSnapshot = await get(ref(database, `payment_batches/${batchId}`))
    const batch = { ...batchSnapshot.val(), id: batchId } as PaymentBatch
    
    const paymentsSnapshot = await get(ref(database, 'payments'))
    const allPayments = FirebaseUtils.objectToArray(paymentsSnapshot.val()) as Payment[]
    const batchPayments = allPayments.filter(p => p.batchId === batchId)
    
    const settingsSnapshot = await get(ref(database, 'settings'))
    const settings = settingsSnapshot.val() as AppSettings
    
    return {
      metadata: {
        exportDate: new Date().toISOString(),
        dateRange: batch.createdAt,
        companyName: settings?.companyName || 'PayReconcile Pro',
        logoUrl: settings?.logoUrl
      },
      data: batchPayments.map(payment => ({
        agentCode: payment.agentCode,
        agentName: payment.agentName,
        bankAccount: payment.bankAccount,
        totalAmount: payment.totalAmount,
        feeAmount: payment.feeAmount,
        netAmount: payment.netAmount,
        transactionCount: payment.transactionCount
      })),
      summary: {
        batchInfo: batch,
        totalGross: batchPayments.reduce((sum, p) => sum + p.totalAmount, 0),
        totalFees: batchPayments.reduce((sum, p) => sum + p.feeAmount, 0),
        totalNet: batchPayments.reduce((sum, p) => sum + p.netAmount, 0),
        agentCount: batchPayments.length
      }
    }
  },

  // Thống kê thanh toán
  async getPaymentStats(): Promise<{ totalPending: number; totalPaid: number }> {
    const snapshot = await get(ref(database, 'payments'))
    const payments = FirebaseUtils.objectToArray(snapshot.val()) as Payment[]
    
    return {
      totalPending: payments.filter(p => p.status === 'PENDING').length,
      totalPaid: payments.filter(p => p.status === 'PAID').length
    }
  },

  // Revert payment batch - chuyển batch về DRAFT và xóa các AdminPaymentToAgent để tránh duplicate
  async revertPaymentBatch(batchId: string): Promise<void> {
    // Load batch
    const batchSnapshot = await get(ref(database, `payment_batches/${batchId}`))
    const batch = batchSnapshot.val() as PaymentBatch
    
    if (!batch) {
      throw new Error('Batch not found')
    }

    const updates: any = {}
    
    // Update batch status to DRAFT
    updates[`payment_batches/${batchId}/paymentStatus`] = 'DRAFT'
    updates[`payment_batches/${batchId}/paidAt`] = null
    
    // Load all AdminPaymentToAgent records in this batch
    const paymentIds = batch.paymentIds || batch.adminPaymentIds || []
    if (paymentIds.length > 0) {
      const allPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'))
      const allPayments = FirebaseUtils.objectToArray(allPaymentsSnapshot.val() || {}) as AdminPaymentToAgent[]
      
      const batchPayments = allPayments.filter(p => paymentIds.includes(p.id))
      
      // Collect all report record IDs from all payments
      const allReportRecordIds = new Set<string>()
      batchPayments.forEach(payment => {
        // XÓA AdminPaymentToAgent thay vì chỉ update status (giống logic bên đại lý)
        // Điều này tránh duplicate khi revert
        updates[`admin_payments_to_agents/${payment.id}`] = null
        
        // Collect report record IDs
        if (payment.reportRecordIds && payment.reportRecordIds.length > 0) {
          payment.reportRecordIds.forEach(recordId => allReportRecordIds.add(recordId))
        }
        // Also collect from billIds
        if (payment.billIds && payment.billIds.length > 0) {
          // Find report records by userBillId
          // We'll handle this below
        }
      })
      
      // Also find ReportRecords by adminPaymentId (in case reportRecordIds not set)
      const allReportsSnapshot = await get(ref(database, 'report_records'))
      const allReports = FirebaseUtils.objectToArray(allReportsSnapshot.val() || {}) as ReportRecord[]
      
      allReports.forEach(report => {
        if (paymentIds.includes(report.adminPaymentId || '')) {
          allReportRecordIds.add(report.id)
        }
        // Also check by billIds
        batchPayments.forEach(payment => {
          if (payment.billIds && payment.billIds.includes(report.userBillId || '')) {
            allReportRecordIds.add(report.id)
          }
        })
      })
      
      // Clear admin payment fields from all ReportRecords
      allReportRecordIds.forEach(recordId => {
        updates[`report_records/${recordId}/adminPaymentId`] = null
        updates[`report_records/${recordId}/adminBatchId`] = null
        updates[`report_records/${recordId}/adminPaidAt`] = null
        updates[`report_records/${recordId}/adminPaymentStatus`] = 'UNPAID'
      })
    }
    
    await update(ref(database), updates)
  },

  // Xóa đợt chi trả
  async deleteBatch(batchId: string): Promise<void> {
    // Lấy batch để lấy paymentIds
    const batchSnapshot = await get(ref(database, `payment_batches/${batchId}`))
    const batch = batchSnapshot.val() as PaymentBatch
    
    if (!batch) {
      throw new Error('Batch not found')
    }

    const updates: any = {}
    
    // Xóa batch
    updates[`payment_batches/${batchId}`] = null
    
    // Load all AdminPaymentToAgent records in this batch
    const paymentIds = batch.paymentIds || batch.adminPaymentIds || []
    if (paymentIds.length > 0) {
      const allPaymentsSnapshot = await get(ref(database, 'admin_payments_to_agents'))
      const allPayments = FirebaseUtils.objectToArray(allPaymentsSnapshot.val() || {}) as AdminPaymentToAgent[]
      
      const batchPayments = allPayments.filter(p => paymentIds.includes(p.id))
      
      // Collect all report record IDs from all payments
      const allReportRecordIds = new Set<string>()
      batchPayments.forEach(payment => {
        // Optionally remove AdminPaymentToAgent (or just clear batchId)
        // For now, we'll just clear the batchId link
        updates[`admin_payments_to_agents/${payment.id}/batchId`] = null
        
        // Collect report record IDs
        if (payment.reportRecordIds && payment.reportRecordIds.length > 0) {
          payment.reportRecordIds.forEach(recordId => allReportRecordIds.add(recordId))
    }
      })
      
      // Also find ReportRecords by adminPaymentId (in case reportRecordIds not set)
      const allReportsSnapshot = await get(ref(database, 'report_records'))
      const allReports = FirebaseUtils.objectToArray(allReportsSnapshot.val() || {}) as ReportRecord[]
      
      allReports.forEach(report => {
        if (paymentIds.includes(report.adminPaymentId || '')) {
          allReportRecordIds.add(report.id)
        }
      })
      
      // Clear admin payment fields from all ReportRecords
      allReportRecordIds.forEach(recordId => {
        updates[`report_records/${recordId}/adminPaymentId`] = null
        updates[`report_records/${recordId}/adminBatchId`] = null
        updates[`report_records/${recordId}/adminPaidAt`] = null
        updates[`report_records/${recordId}/adminPaymentStatus`] = 'UNPAID'
      })
      
      // Legacy: Also handle old Payment system if exists
      const oldPaymentsSnapshot = await get(ref(database, 'payments'))
      const oldPayments = FirebaseUtils.objectToArray(oldPaymentsSnapshot.val() || {}) as Payment[]
      const oldBatchPayments = oldPayments.filter(p => p.batchId === batchId)
      
      oldBatchPayments.forEach(payment => {
        updates[`payments/${payment.id}`] = null
      })
      
      // Legacy: Clear reconciliation_records
      const recordsSnapshot = await get(ref(database, 'reconciliation_records'))
      const allRecords = FirebaseUtils.objectToArray(recordsSnapshot.val() || {}) as ReconciliationRecord[]
      
      const recordsToUpdate = allRecords.filter(r => 
        r.paymentId && oldBatchPayments.some(p => p.id === r.paymentId)
      )
      
      recordsToUpdate.forEach(record => {
        updates[`reconciliation_records/${record.id}/paymentId`] = null
        updates[`reconciliation_records/${record.id}/isPaid`] = false
      })
    }
    
    await update(ref(database), updates)
  }
}

// Reports Service - Báo cáo công nợ và giao dịch
export const ReportsService = {
  // Báo cáo công nợ theo đại lý
  async getDebtReportByAgent(dateFilter?: DateFilter) {
    const reconciliationSnapshot = await get(ref(database, 'reconciliation_records'))
    const paymentsSnapshot = await get(ref(database, 'payments'))
    const agentsSnapshot = await get(ref(database, 'agents'))
    
    let records = FirebaseUtils.objectToArray(reconciliationSnapshot.val()) as ReconciliationRecord[]
    const payments = FirebaseUtils.objectToArray(paymentsSnapshot.val()) as Payment[]
    const agents = FirebaseUtils.objectToArray(agentsSnapshot.val())
    
    // Apply date filter if provided
    if (dateFilter && dateFilter.from && dateFilter.to) {
      records = records.filter(record => {
        const transactionDate = record.transactionDate || record.processedAt;
        if (!transactionDate) return false;
        const dateStr = transactionDate.split('T')[0];
        return dateStr >= dateFilter.from! && dateStr <= dateFilter.to!;
      });
    }
    
    // Group by agent
    const agentMap = new Map<string, any>()
    
    records.forEach(record => {
      if (record.status !== 'MATCHED') return
      
      const agentId = record.agentData?.agentId || 'unknown'
      if (!agentMap.has(agentId)) {
        const agent = agents.find((a: any) => a.id === agentId || a.code === agentId)
        agentMap.set(agentId, {
          agentId,
          agentName: agent?.name || agentId,
          agentCode: agent?.code || agentId,
          totalTransactions: 0,
          totalAmount: 0,
          totalFee: 0,
          netAmount: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          lastTransactionDate: null,
          pointOfSales: new Set<string>()
        })
      }
      
      const agentData = agentMap.get(agentId)
      const amount = record.merchantData?.amount || 0
      
      // Calculate fee based on agent's discount rates by point of sale (NEW WORKFLOW)
      const paymentMethod = record.paymentMethod || record.merchantData?.method || 'QR 1 (VNPay)';
      const pointOfSaleName = record.pointOfSaleName;
      const agent = agents.find((a: any) => (a.id === agentId || a.code === agentId));
      
      let feePercentage = 0;
      if (agent?.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
        feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
      } else if (agent?.discountRates) {
        feePercentage = agent.discountRates[paymentMethod] || 0;
      }
      const fee = amount * (feePercentage / 100);
      
      agentData.totalTransactions++
      agentData.totalAmount += amount
      agentData.totalFee += fee
      agentData.netAmount += (amount - fee)
      
      // Track point of sale if available
      if (record.pointOfSaleName && !agentData.pointOfSales) {
        agentData.pointOfSales = new Set<string>()
      }
      if (record.pointOfSaleName) {
        agentData.pointOfSales.add(record.pointOfSaleName)
      }
      
      // Use transactionDate for better accuracy, fallback to processedAt
      const txDate = record.transactionDate || record.processedAt;
      if (!agentData.lastTransactionDate || txDate > agentData.lastTransactionDate) {
        agentData.lastTransactionDate = txDate;
      }
    })
    
    // Calculate paid amounts
    payments.forEach(payment => {
      if (agentMap.has(payment.agentId)) {
        const agentData = agentMap.get(payment.agentId)
        if (payment.status === 'PAID') {
          agentData.paidAmount += payment.netAmount
        }
      }
    })
    
    // Calculate unpaid
    Array.from(agentMap.values()).forEach(agent => {
      agent.unpaidAmount = agent.netAmount - agent.paidAmount
    })
    
    return Array.from(agentMap.values()).map((data, index) => ({
      id: `debt_${index}`,
      ...data,
      pointOfSales: data.pointOfSales ? Array.from(data.pointOfSales) : []
    }))
  },

  // Báo cáo công nợ theo STK Admin
  async getDebtReportByAdminAccount(dateFilter?: DateFilter) {
    const merchantsSnapshot = await get(ref(database, 'merchants'))
    const reconciliationSnapshot = await get(ref(database, 'reconciliation_records'))
    
    const merchants = FirebaseUtils.objectToArray(merchantsSnapshot.val()) as any[]
    let records = FirebaseUtils.objectToArray(reconciliationSnapshot.val()) as ReconciliationRecord[]
    
    // Apply date filter if provided
    if (dateFilter && dateFilter.from && dateFilter.to) {
      records = records.filter(record => {
        const transactionDate = record.transactionDate || record.processedAt;
        if (!transactionDate) return false;
        const dateStr = transactionDate.split('T')[0];
        return dateStr >= dateFilter.from! && dateStr <= dateFilter.to!;
      });
    }
    
    // Group by admin account
    const adminAccountMap = new Map<string, any>()
    
    merchants.forEach(merchant => {
      if (!merchant.adminAccounts || merchant.adminAccounts.length === 0) return
      
      merchant.adminAccounts.forEach((adminAccount: string) => {
        if (!adminAccountMap.has(adminAccount)) {
          adminAccountMap.set(adminAccount, {
            adminAccount,
            merchants: [],
            totalAmount: 0,
            totalTransactions: 0
          })
        }
        
        // Get transactions for this merchant
        const merchantRecords = records.filter(r => 
          r.merchantData?.merchantCode === merchant.code && r.status === 'MATCHED'
        )
        
        if (merchantRecords.length > 0) {
          const merchantAmount = merchantRecords.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0)
          
          const adminData = adminAccountMap.get(adminAccount)
          // Get point of sale info from records
          const pointOfSales = new Set<string>()
          merchantRecords.forEach(r => {
            if (r.pointOfSaleName) pointOfSales.add(r.pointOfSaleName)
          })
          
          adminData.merchants.push({
            merchantId: merchant.id,
            merchantName: merchant.name,
            merchantCode: merchant.code,
            totalAmount: merchantAmount,
            transactionCount: merchantRecords.length,
            pointOfSaleName: merchant.pointOfSaleName,
            pointOfSales: Array.from(pointOfSales)
          })
          adminData.totalAmount += merchantAmount
          adminData.totalTransactions += merchantRecords.length
        }
      })
    })
    
    return Array.from(adminAccountMap.values())
  },

  // Giao dịch chưa khớp (MISSING_IN_AGENT)
  async getUnmatchedTransactions(): Promise<ReconciliationRecord[]> {
    const snapshot = await get(ref(database, 'reconciliation_records'))
    const records = FirebaseUtils.objectToArray(snapshot.val()) as ReconciliationRecord[]
    
    return records.filter(record => record.status === 'MISSING_IN_AGENT')
  }
}

// Initialize with mock data (run once to seed database)
export const initializeDatabase = async () => {
  try {
    // Check if data already exists
    const merchantsSnapshot = await get(ref(database, 'merchants'))
    const agentsSnapshot = await get(ref(database, 'agents'))
    const usersSnapshot = await get(ref(database, 'users'))

    if (!merchantsSnapshot.exists()) {
      console.log('Seeding merchants data...')
      // Import mock merchants and seed them
      // This will be called from a component to initialize
    }

    if (!agentsSnapshot.exists()) {
      console.log('Seeding agents data...')
      // Import mock agents and seed them
      // This will be called from a component to initialize
    }

    if (!usersSnapshot.exists()) {
      console.log('Seeding users data...')
      // Import mock users and seed them
      // This will be called from a component to initialize
    }
    } catch (error) {
      console.error('Error initializing database:', error)
    }
  }

// Merchant Transactions Service - CRUD cho merchant_transactions
export const MerchantTransactionsService = {
  /**
   * Tạo merchant transaction
   */
  async create(transaction: Omit<MerchantTransaction, 'id' | 'createdAt'>): Promise<string> {
    const newTransaction: Omit<MerchantTransaction, 'id'> = {
      ...transaction,
      createdAt: FirebaseUtils.getServerTimestamp()
    };
    const newRef = await push(ref(database, 'merchant_transactions'), newTransaction);
    return newRef.key!;
  },

  /**
   * Lấy merchant transaction theo transaction code (sử dụng byCode mapping)
   * Normalize transactionCode để đảm bảo match chính xác
   */
  async getByTransactionCode(transactionCode: string): Promise<MerchantTransaction | null> {
    try {
      // Normalize transactionCode (trim whitespace)
      const normalizeCode = (code: string | undefined | null): string | null => {
        if (!code) return null;
        return String(code).trim();
      };
      
      const normalizedCode = normalizeCode(transactionCode);
      if (!normalizedCode) return null;
      
      // Check byCode mapping first (try both original and normalized)
      let byCodeSnapshot = await get(ref(database, `merchant_transactions/byCode/${transactionCode}`));
      let existingId = byCodeSnapshot.val();
      
      // If not found with original, try normalized version
      if (!existingId && normalizedCode !== transactionCode) {
        byCodeSnapshot = await get(ref(database, `merchant_transactions/byCode/${normalizedCode}`));
        existingId = byCodeSnapshot.val();
      }
      
      if (existingId) {
        // Found in mapping, get the full transaction
        return await this.getById(existingId);
      }
      
      // Fallback: search all transactions (for backward compatibility)
      // Normalize comparison để đảm bảo match chính xác
      const snapshot = await get(ref(database, 'merchant_transactions'));
      const allTransactions = FirebaseUtils.objectToArray<MerchantTransaction>(snapshot.val() || {});
      const found = allTransactions.find(t => {
        const tCode = normalizeCode(t.transactionCode);
        return tCode === normalizedCode || t.transactionCode === transactionCode;
      });
      
      // If found, update byCode mapping for future lookups (use normalized version)
      if (found) {
        await update(ref(database, `merchant_transactions/byCode/${normalizedCode}`), found.id);
      }
      
      return found || null;
    } catch (error) {
      console.error('Error getting merchant transaction by code:', error);
      return null;
    }
  },

  /**
   * Tạo nhiều merchant transactions cùng lúc (batch) với duplicate checking
   */
  async createBatch(transactions: Array<Omit<MerchantTransaction, 'id' | 'createdAt'>>): Promise<{ created: string[]; skipped: Array<{ transactionCode: string; reason: string }> }> {
    const timestamp = FirebaseUtils.getServerTimestamp();
    const created: string[] = [];
    const skipped: Array<{ transactionCode: string; reason: string }> = [];
    const updates: any = {};
    
    // Load TẤT CẢ merchant_transactions từ database để check duplicate
    const snapshot = await get(ref(database, 'merchant_transactions'));
    const allExistingTransactions = FirebaseUtils.objectToArray<MerchantTransaction>(snapshot.val() || {});
    const existingCodesSet = new Set<string>();
    allExistingTransactions.forEach(t => {
      if (t.transactionCode) {
        existingCodesSet.add(String(t.transactionCode).trim());
      }
    });
    
    // Load existing byCode mapping (for backward compatibility)
    const byCodeSnapshot = await get(ref(database, 'merchant_transactions/byCode'));
    const existingCodes = byCodeSnapshot.val() || {};
    
    for (const transaction of transactions) {
      const transactionCode = String(transaction.transactionCode).trim();
      
      // Check if transaction code already exists trong database
      if (existingCodesSet.has(transactionCode)) {
        console.warn(`⚠️ Mã chuẩn chi "${transactionCode}" đã tồn tại trong database, bỏ qua`);
        skipped.push({
          transactionCode,
          reason: 'Mã chuẩn chi đã tồn tại trong hệ thống'
        });
        continue;
      }
      
      // Double check với byCode mapping (backward compatibility)
      if (existingCodes[transactionCode]) {
        console.warn(`⚠️ Mã chuẩn chi "${transactionCode}" đã tồn tại trong byCode mapping, bỏ qua`);
        skipped.push({
          transactionCode,
          reason: 'Mã chuẩn chi đã tồn tại trong hệ thống'
        });
        continue;
      }
      
      // Remove undefined values - Firebase doesn't allow undefined
      // Also sanitize rawData keys to remove Firebase-invalid characters: '.', '#', '$', '/', '[', ']'
      const sanitizeKey = (key: string): string => {
        return key.replace(/[.#$/\[\]]/g, '_');
      };
      
      const cleanTransaction: any = {};
      Object.keys(transaction).forEach(key => {
        const value = (transaction as any)[key];
        if (value !== undefined) {
          if (key === 'rawData' && value && typeof value === 'object') {
            // Sanitize rawData keys
            const sanitizedRawData: Record<string, any> = {};
            Object.keys(value).forEach(rawKey => {
              const sanitizedRawKey = sanitizeKey(rawKey);
              sanitizedRawData[sanitizedRawKey] = value[rawKey];
            });
            cleanTransaction[key] = sanitizedRawData;
          } else {
          cleanTransaction[key] = value;
          }
        }
      });
      
      const newTransaction: Omit<MerchantTransaction, 'id'> = {
        ...cleanTransaction,
        createdAt: timestamp
      };
      
      // Create transaction
      const newRef = await push(ref(database, 'merchant_transactions'), newTransaction);
      const newId = newRef.key!;
      created.push(newId);
      
      // Update byCode mapping
      updates[`merchant_transactions/byCode/${transactionCode}`] = newId;
      
      // Track in local map for this batch (để tránh duplicate trong cùng batch)
      existingCodes[transactionCode] = newId;
      existingCodesSet.add(transactionCode);
    }
    
    // Apply all updates (byCode mappings) in one batch
    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
    }
    
    if (skipped.length > 0) {
      console.warn(`⚠️ Đã bỏ qua ${skipped.length} giao dịch do mã chuẩn chi trùng lặp`);
    }
    
    return { created, skipped };
  },

  /**
   * Lấy merchant transaction theo ID
   */
  async getById(id: string): Promise<MerchantTransaction | null> {
    const snapshot = await get(ref(database, `merchant_transactions/${id}`));
    const data = snapshot.val();
    if (!data) return null;
    return { ...data, id };
  },

  /**
   * Lấy merchant transactions theo uploadSessionId
   */
  async getByUploadSession(uploadSessionId: string): Promise<MerchantTransaction[]> {
    const snapshot = await get(ref(database, 'merchant_transactions'));
    const allTransactions = FirebaseUtils.objectToArray<MerchantTransaction>(snapshot.val() || {});
    return allTransactions.filter(t => t.uploadSessionId === uploadSessionId);
  },

  /**
   * Lấy merchant transactions với filter
   */
  async getByFilters(filters: {
    uploadSessionId?: string;
    merchantCode?: string;
    dateFrom?: string;
    dateTo?: string;
    transactionCode?: string;
  }): Promise<MerchantTransaction[]> {
    const snapshot = await get(ref(database, 'merchant_transactions'));
    let transactions = FirebaseUtils.objectToArray<MerchantTransaction>(snapshot.val() || {});

    if (filters.uploadSessionId) {
      transactions = transactions.filter(t => t.uploadSessionId === filters.uploadSessionId);
    }
    if (filters.merchantCode) {
      transactions = transactions.filter(t => t.merchantCode === filters.merchantCode);
    }
    if (filters.transactionCode) {
      transactions = transactions.filter(t => t.transactionCode === filters.transactionCode);
    }
    if (filters.dateFrom || filters.dateTo) {
      transactions = transactions.filter(t => {
        const txDate = t.transactionDate.split('T')[0];
        if (filters.dateFrom && txDate < filters.dateFrom) return false;
        if (filters.dateTo && txDate > filters.dateTo) return false;
        return true;
      });
    }

    return transactions;
  },

  /**
   * Update merchant transaction
   */
  async update(id: string, updates: Partial<MerchantTransaction>): Promise<void> {
    await update(ref(database, `merchant_transactions/${id}`), updates);
  },

  /**
   * Xóa merchant transaction
   */
  async delete(id: string): Promise<void> {
    await remove(ref(database, `merchant_transactions/${id}`));
  },

  /**
   * Xóa tất cả transactions của một upload session
   */
  async deleteByUploadSession(uploadSessionId: string): Promise<void> {
    const transactions = await this.getByUploadSession(uploadSessionId);
    const deletePromises = transactions.map(t => remove(ref(database, `merchant_transactions/${t.id}`)));
    await Promise.all(deletePromises);
  }
}