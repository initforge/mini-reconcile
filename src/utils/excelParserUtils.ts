import * as XLSX from 'xlsx';
import { PaymentMethod, MerchantTransaction, AgentSubmission } from '../../types';

/**
 * Utility: remove Vietnamese diacritics and normalize
 */
export const normalize = (s: string) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Heuristic to guess a plausible transaction code from a row when no key matched
 */
export const guessTransactionCode = (row: any): string | undefined => {
  const keys = Object.keys(row);
  // Exclude obvious non-code columns by header semantics
  const excludedHeader = /(thoi\s*gian|ngay|date|time|kenh|trang\s*thai|phuong\s*thuc|loai|nguon|so\s*tien|amount|gia\s*tri|value|tong|vnd|chi\s*nhanh|diem\s*thu|stt|hoa\s*don|ngan\s*hang|ma\s*diem|ten\s*khach|yc\s*tra\s*gop|ky\s*han)/;
  const candidates = keys
    .filter(k => !excludedHeader.test(normalize(k)))
    .map(k => String(row[k] ?? '').trim())
    .filter(v => v && v.length >= 6)
    // Exclude values that look like dates/times
    .filter(v => {
      const nv = normalize(v);
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(nv)) return false; // dd/mm/yyyy
      if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(nv)) return false; // yyyy-mm-dd
      if (/\d{1,2}:\d{2}(:\d{2})?/.test(nv)) return false; // time
      return true;
    })
    // Prefer alphanumeric mixes
    .sort((a, b) => {
      const score = (s: string) => (/[a-z]/i.test(s) ? 2 : 0) + (/-|_/i.test(s) ? 1 : 0) + Math.min(s.length, 20) / 20;
      return score(b) - score(a);
    });
  return candidates[0];
};

/**
 * Utility: robust amount parsing from strings like "1.234.567,89" or "1,234,567.89" or "10,010,000"
 * Handles Vietnamese number formats where comma/dot are thousand separators
 */
export const parseAmount = (val: any): number => {
  if (typeof val === 'number') return val;
  const s = String(val ?? '').trim();
  if (!s) return 0;
  
  // Remove currency symbols and spaces
  let clean = s.replace(/[₫$€£¥\s]/g, '');
  
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  
  // Count separators to determine if they're thousand separators or decimal
  const commaCount = (clean.match(/,/g) || []).length;
  const dotCount = (clean.match(/\./g) || []).length;
  
  if (hasComma && hasDot) {
    // Both present - determine which is decimal separator
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    
    // If rightmost separator has exactly 2-3 digits after it, it's likely decimal
    const afterLastComma = clean.substring(lastComma + 1).replace(/[^0-9]/g, '');
    const afterLastDot = clean.substring(lastDot + 1).replace(/[^0-9]/g, '');
    
    if (lastComma > lastDot) {
      // Comma is rightmost
      if (afterLastComma.length <= 3 && afterLastComma.length >= 2) {
        // Likely decimal: "1.234.567,89"
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        // Likely thousand separator: "1,234,567.89" -> remove commas
        clean = clean.replace(/,/g, '');
      }
    } else {
      // Dot is rightmost
      if (afterLastDot.length <= 3 && afterLastDot.length >= 2) {
        // Likely decimal: "1,234,567.89"
        clean = clean.replace(/,/g, '');
      } else {
        // Likely thousand separator: "1.234.567,89" -> remove dots, comma to dot
        clean = clean.replace(/\./g, '').replace(',', '.');
      }
    }
  } else if (hasComma && !hasDot) {
    // Only comma - check if it's thousand separator (multiple commas) or decimal (single comma with 2-3 digits after)
    if (commaCount > 1) {
      // Multiple commas = thousand separators (Vietnamese format: "10,010,000")
      clean = clean.replace(/,/g, '');
    } else {
      // Single comma - check digits after
      const commaPos = clean.lastIndexOf(',');
      const afterComma = clean.substring(commaPos + 1).replace(/[^0-9]/g, '');
      if (afterComma.length <= 3 && afterComma.length >= 2) {
        // Likely decimal: "1234,56"
        clean = clean.replace(',', '.');
      } else {
        // Likely thousand separator: "10,010" -> remove comma
        clean = clean.replace(/,/g, '');
      }
    }
  } else if (hasDot && !hasComma) {
    // Only dot - check if it's thousand separator (multiple dots) or decimal (single dot with 2-3 digits after)
    if (dotCount > 1) {
      // Multiple dots = thousand separators (Vietnamese format: "10.010.000")
      clean = clean.replace(/\./g, '');
    } else {
      // Single dot - check digits after
      const dotPos = clean.lastIndexOf('.');
      const afterDot = clean.substring(dotPos + 1).replace(/[^0-9]/g, '');
      if (afterDot.length <= 3 && afterDot.length >= 2) {
        // Likely decimal: "1234.56"
        // Keep as is
      } else {
        // Likely thousand separator: "10.010" -> remove dot
        clean = clean.replace(/\./g, '');
      }
    }
  }
  
  // Final cleanup - remove any remaining non-numeric except decimal point and minus
  clean = clean.replace(/[^0-9.\-]/g, '');
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
};

/**
 * Score a header set for relevance to transaction data
 */
export const scoreHeaders = (headers: string[]) => {
  const keys = headers.map(normalize);
  const hasTxn = keys.some(k => /ma\s*(gd|giao\s*dich|chuan\s*chi|truy\s*tien|bill|reference|txn|trace|stan|rrn|transaction)/.test(k));
  const hasAmt = keys.some(k => /(so\s*tien|amount|gia\s*tri|vnd|money|value|total|tong|thanh\s*tien|truoc\s*km|sau\s*km)/.test(k));
  const hasTime = keys.some(k => /(ngay|date|time|thoi\s*gia|datetime|created)/.test(k));
  let score = 0;
  if (hasTxn) score += 5;
  if (hasAmt) score += 5;
  if (hasTime) score += 2;
  // Small penalty for config-like sheets
  if (keys.some(k => /(trang\s*thai|kenh\s*thanh\s*toan|loai\s*the|config|cau\s*hinh)/.test(k))) score -= 2;
  return score;
};

/**
 * Generic File Parser (auto-pick the most relevant sheet)
 */
export const parseExcel = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        // Evaluate all sheets to find the best candidate
        let bestSheet: string | null = null;
        let bestScore = -Infinity;
        let bestJson: any[] = [];

        for (const name of workbook.SheetNames) {
          // Skip obvious non-data sheets
          if (/^(config|cau\s*hinh|readme|thong\s*tin)/i.test(normalize(name))) continue;
          const sheet = workbook.Sheets[name];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
          if (!rows || rows.length === 0) continue;
          const headers = Object.keys(rows[0] || {});
          const s = scoreHeaders(headers);
          if (s > bestScore) {
            bestScore = s;
            bestSheet = name;
            bestJson = rows;
          }
        }

        // Fallback to the first sheet if nothing scored (still better than empty)
        if (!bestSheet) {
          const fallback = workbook.SheetNames[0];
          const sheet = workbook.Sheets[fallback];
          bestJson = XLSX.utils.sheet_to_json(sheet, { defval: null });
          console.warn('⚠️ Không phát hiện sheet dữ liệu rõ ràng. Dùng sheet đầu:', fallback);
        } else {
          console.log('✅ Đã chọn sheet dữ liệu:', bestSheet, 'score =', bestScore);
        }

        resolve(bestJson);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Enhanced helper to find object key case-insensitively with better fuzzy matching
 */
export const findKey = (obj: any, possibleKeys: string[]) => {
  const keys = Object.keys(obj);
  console.log('🔍 Available columns:', keys);
  console.log('🎯 Looking for:', possibleKeys);
  
  // Exact match first
  for (const pk of possibleKeys) {
    const exactMatch = keys.find(k => normalize(k) === normalize(pk));
    if (exactMatch) {
      console.log('✅ Exact match found:', exactMatch, '=', obj[exactMatch]);
      return obj[exactMatch];
    }
  }
  
  // Partial match
  for (const pk of possibleKeys) {
    const npk = normalize(pk);
    const partialMatch = keys.find(k => {
      const nk = normalize(k);
      return nk.includes(npk) || npk.includes(nk);
    });
    if (partialMatch) {
      console.log('✅ Partial match found:', partialMatch, '=', obj[partialMatch]);
      return obj[partialMatch];
    }
  }
  
  console.log('❌ No match found for:', possibleKeys);
  return undefined;
};

