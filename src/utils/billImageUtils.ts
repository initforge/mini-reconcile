// Utility functions for bill image management
import { update, ref } from 'firebase/database';
import { database } from '../lib/firebase';
import type { UserBill } from '../../types';

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
