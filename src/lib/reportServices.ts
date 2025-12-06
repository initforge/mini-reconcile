// Report services for managing report_records
import { ref, get, push, update, remove } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { ReportRecord, ReportStatus } from '../../types';

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
        if (!r.transactionDate) return true; // Include if no transactionDate
        try {
          const recordDate = r.transactionDate.split('T')[0]; // Extract YYYY-MM-DD
          if (filters.dateFrom && recordDate < filters.dateFrom) return false;
          if (filters.dateTo && recordDate > filters.dateTo) return false;
          return true;
        } catch (error) {
          console.warn(`Error parsing transactionDate for record ${r.id}:`, error);
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
  }
};

