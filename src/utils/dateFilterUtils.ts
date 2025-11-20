import { DateFilter } from '../../types';

/**
 * Get date range based on filter type
 */
export const getDateRange = (type: DateFilter['type']): { from: string; to: string } => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  switch (type) {
    case 'day': {
      const dayStart = new Date(today);
      const dayEnd = new Date(today);
      dayEnd.setHours(23, 59, 59, 999);
      return {
        from: dayStart.toISOString().split('T')[0],
        to: dayEnd.toISOString().split('T')[0]
      };
    }
    
    case 'week': {
      const weekStart = new Date(today);
      const currentDay = weekStart.getDay();
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
      weekStart.setDate(today.getDate() - daysToMonday);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      return {
        from: weekStart.toISOString().split('T')[0],
        to: weekEnd.toISOString().split('T')[0]
      };
    }
    
    case 'month': {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      
      return {
        from: monthStart.toISOString().split('T')[0],
        to: monthEnd.toISOString().split('T')[0]
      };
    }
    
    case 'custom': {
      // For custom, return the provided dates or today
      return {
        from: today.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0]
      };
    }
    
    default:
      return {
        from: today.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0]
      };
  }
};

/**
 * Format date range for display
 */
export const formatDateRange = (filter: DateFilter): string => {
  if (filter.type === 'custom' && filter.from && filter.to) {
    const fromDate = new Date(filter.from);
    const toDate = new Date(filter.to);
    return `${fromDate.toLocaleDateString('vi-VN')} - ${toDate.toLocaleDateString('vi-VN')}`;
  }
  
  const range = getDateRange(filter.type);
  const fromDate = new Date(range.from);
  const toDate = new Date(range.to);
  
  if (filter.type === 'day') {
    return fromDate.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  
  return `${fromDate.toLocaleDateString('vi-VN')} - ${toDate.toLocaleDateString('vi-VN')}`;
};

/**
 * Validate date filter
 */
export const validateDateFilter = (filter: DateFilter): { valid: boolean; error?: string } => {
  if (filter.type === 'custom') {
    if (!filter.from || !filter.to) {
      return { valid: false, error: 'Vui lòng chọn cả ngày bắt đầu và ngày kết thúc' };
    }
    
    const fromDate = new Date(filter.from);
    const toDate = new Date(filter.to);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return { valid: false, error: 'Ngày không hợp lệ' };
    }
    
    if (fromDate > toDate) {
      return { valid: false, error: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc' };
    }
    
    // Check if range is too large (more than 1 year)
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 365) {
      return { valid: false, error: 'Khoảng thời gian không được vượt quá 1 năm' };
    }
  }
  
  return { valid: true };
};

/**
 * Get date filter with proper date range
 */
export const getDateFilterWithRange = (type: DateFilter['type'], customFrom?: string, customTo?: string): DateFilter => {
  if (type === 'custom' && customFrom && customTo) {
    return {
      type: 'custom',
      from: customFrom,
      to: customTo
    };
  }
  
  const range = getDateRange(type);
  return {
    type,
    from: range.from,
    to: range.to
  };
};

/**
 * Check if a date is within the filter range
 */
export const isDateInRange = (date: string, filter: DateFilter): boolean => {
  if (!filter.from || !filter.to) {
    const range = getDateRange(filter.type);
    filter.from = range.from;
    filter.to = range.to;
  }
  
  const checkDate = new Date(date).toISOString().split('T')[0];
  return checkDate >= filter.from! && checkDate <= filter.to!;
};

