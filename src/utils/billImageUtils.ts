// Utility functions for bill image management
import { update, ref, get, query, orderByChild, endAt } from 'firebase/database';
import { database } from '../lib/firebase';
import { FirebaseUtils } from '../lib/firebaseHooks';
import type { UserBill } from '../../types';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Check if bill image is expired (older than 7 days)
 */
export const isBillImageExpired = (bill: UserBill): boolean => {
  if (!bill.imageUrl || !bill.createdAt) {
    return false; // No image or no creation date
  }

  const createdAt = new Date(bill.createdAt);
  const now = new Date();
  const daysDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  
  return daysDiff > 7; // More than 7 days
};

/**
 * Get bill image URL or expired message
 */
export const getBillImageUrl = (bill: UserBill): string | null => {
  if (!bill.imageUrl) {
    return null;
  }

  if (isBillImageExpired(bill)) {
    return null; // Image expired, return null to show message
  }

  return bill.imageUrl;
};

/**
 * Auto-delete expired bill images (called periodically or on load)
 * OPTIMIZED: Accepts pre-loaded bills to avoid redundant reads
 */
export const cleanupExpiredBillImages = async (bills: UserBill[]): Promise<void> => {
  const updates: Record<string, any> = {};
  let cleanedCount = 0;

  bills.forEach(bill => {
    if (bill.imageUrl && isBillImageExpired(bill)) {
      updates[`user_bills/${bill.id}/imageUrl`] = null;
      cleanedCount++;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
    console.log(`🧹 Cleaned up ${cleanedCount} expired bill images`);
  }
};

/**
 * Standalone cleanup function for expired bill images
 * OPTIMIZED: Uses orderByChild + endAt to only query bills older than 7 days
 * Note: Requires .indexOn: "createdAt" in Firebase rules
 */
export const cleanupExpiredBillImagesStandalone = async (): Promise<number> => {
  try {
    const cutoffDate = new Date(Date.now() - ONE_WEEK_MS);
    const cutoffTimestamp = cutoffDate.toISOString();

    // OPTIMIZED: Query only bills older than 7 days using createdAt index
    let billsSnapshot;
    try {
      billsSnapshot = await get(query(ref(database, 'user_bills'), orderByChild('createdAt'), endAt(cutoffTimestamp)));
    } catch (error: any) {
      // Fallback: If index not available, use full read (backward compatibility)
      console.warn('Index not available for user_bills/createdAt, using fallback');
      billsSnapshot = await get(ref(database, 'user_bills'));
    }

    const bills = FirebaseUtils.objectToArray<UserBill>(billsSnapshot.val() || {});
    const updates: Record<string, any> = {};
    let cleanedCount = 0;

    // Filter bills with images that are expired
    bills.forEach(bill => {
      if (bill.imageUrl && isBillImageExpired(bill)) {
        updates[`user_bills/${bill.id}/imageUrl`] = null;
        cleanedCount++;
      }
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
      console.log(`🧹 Cleaned up ${cleanedCount} expired bill images (standalone)`);
    }

    return cleanedCount;
  } catch (error) {
    console.error('❌ Error cleaning up expired bill images:', error);
    throw error;
  }
};
