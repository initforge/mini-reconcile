import { AppSettings } from '../types';
import { SettingsService } from '../lib/firebaseServices';

// Cache settings để tránh gọi Firebase nhiều lần
let cachedSettings: AppSettings | null = null;
let settingsCacheTime: number = 0;
const SETTINGS_CACHE_DURATION = 5 * 60 * 1000; // 5 phút

/**
 * Lấy settings với cache
 */
const getCachedSettings = async (): Promise<AppSettings> => {
  const now = Date.now();
  if (cachedSettings && (now - settingsCacheTime) < SETTINGS_CACHE_DURATION) {
    return cachedSettings;
  }
  
  cachedSettings = await SettingsService.getSettings();
  settingsCacheTime = now;
  return cachedSettings;
};

/**
 * Clear settings cache (khi settings được update)
 */
export const clearSettingsCache = () => {
  cachedSettings = null;
  settingsCacheTime = 0;
};

/**
 * Format số tiền theo currency setting
 */
export const formatCurrency = async (amount: number): Promise<string> => {
  const settings = await getCachedSettings();
  const currency = settings.currency || 'VNĐ';
  
  // Map currency to locale
  const localeMap: Record<string, string> = {
    'VNĐ': 'vi-VN',
    'USD': 'en-US',
    'EUR': 'de-DE',
  };
  
  const locale = localeMap[currency] || 'vi-VN';
  
  // Format number với locale
  const formatted = amount.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  
  // Thêm currency symbol
  if (currency === 'VNĐ') {
    return `${formatted} đ`;
  } else if (currency === 'USD') {
    return `$${formatted}`;
  } else if (currency === 'EUR') {
    return `€${formatted}`;
  }
  
  return `${formatted} ${currency}`;
};

/**
 * Format số tiền (sync version - dùng cached settings)
 */
export const formatCurrencySync = (amount: number, currency?: string): string => {
  const curr = currency || 'VNĐ';
  
  const localeMap: Record<string, string> = {
    'VNĐ': 'vi-VN',
    'USD': 'en-US',
    'EUR': 'de-DE',
  };
  
  const locale = localeMap[curr] || 'vi-VN';
  const formatted = amount.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  
  if (curr === 'VNĐ') {
    return `${formatted} đ`;
  } else if (curr === 'USD') {
    return `$${formatted}`;
  } else if (curr === 'EUR') {
    return `€${formatted}`;
  }
  
  return `${formatted} ${curr}`;
};

/**
 * Format ngày theo dateFormat và timezone settings
 */
export const formatDate = async (date: Date | string | number): Promise<string> => {
  const settings = await getCachedSettings();
  const dateFormat = settings.dateFormat || 'DD/MM/YYYY';
  const timezone = settings.timezone || 'Asia/Ho_Chi_Minh';
  
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  // Map dateFormat to Intl.DateTimeFormat options
  let options: Intl.DateTimeFormatOptions = {};
  
  if (dateFormat === 'DD/MM/YYYY') {
    options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  } else if (dateFormat === 'MM/DD/YYYY') {
    options = { month: '2-digit', day: '2-digit', year: 'numeric' };
  } else if (dateFormat === 'YYYY-MM-DD') {
    options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  }
  
  // Format với timezone
  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timezone,
    }).format(d);
  } catch (error) {
    // Fallback nếu timezone không hợp lệ
    return new Intl.DateTimeFormat('en-US', options).format(d);
  }
};

/**
 * Format ngày (sync version)
 */
export const formatDateSync = (
  date: Date | string | number,
  dateFormat?: string,
  timezone?: string
): string => {
  const df = dateFormat || 'DD/MM/YYYY';
  const tz = timezone || 'Asia/Ho_Chi_Minh';
  
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  let options: Intl.DateTimeFormatOptions = {};
  
  if (df === 'DD/MM/YYYY') {
    options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  } else if (df === 'MM/DD/YYYY') {
    options = { month: '2-digit', day: '2-digit', year: 'numeric' };
  } else if (df === 'YYYY-MM-DD') {
    options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  }
  
  try {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: tz,
    }).format(d);
  } catch (error) {
    return new Intl.DateTimeFormat('en-US', options).format(d);
  }
};

/**
 * Format datetime (ngày + giờ)
 */
export const formatDateTime = async (date: Date | string | number): Promise<string> => {
  const settings = await getCachedSettings();
  const dateFormat = settings.dateFormat || 'DD/MM/YYYY';
  const timezone = settings.timezone || 'Asia/Ho_Chi_Minh';
  
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  let dateOptions: Intl.DateTimeFormatOptions = {};
  
  if (dateFormat === 'DD/MM/YYYY') {
    dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  } else if (dateFormat === 'MM/DD/YYYY') {
    dateOptions = { month: '2-digit', day: '2-digit', year: 'numeric' };
  } else if (dateFormat === 'YYYY-MM-DD') {
    dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  }
  
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  };
  
  try {
    const dateStr = new Intl.DateTimeFormat('en-US', {
      ...dateOptions,
      timeZone: timezone,
    }).format(d);
    
    const timeStr = new Intl.DateTimeFormat('en-US', {
      ...timeOptions,
      timeZone: timezone,
    }).format(d);
    
    return `${dateStr} ${timeStr}`;
  } catch (error) {
    return d.toLocaleString();
  }
};

