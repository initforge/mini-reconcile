
export enum PaymentMethod {
  QR_VNPAY = 'QR 1 (VNPay)',
  QR_BANK = 'QR 2 (App Bank)',
  SOFPOS = 'Sofpos',
  POS = 'POS'
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  ERROR_AMOUNT = 'ERROR_AMOUNT',
  ERROR_DUPLICATE = 'ERROR_DUPLICATE',
  MISSING_IN_MERCHANT = 'MISSING_IN_MERCHANT',
  MISSING_IN_AGENT = 'MISSING_IN_AGENT'
}

export enum UserRole {
  ADMIN = 'Administrator',
  ACCOUNTANT = 'Kế toán',
  SUPPORT = 'Vận hành',
  VIEWER = 'Người xem'
}

export enum UserStatus {
  ACTIVE = 'Hoạt động',
  LOCKED = 'Đang khóa'
}

export interface User {
  id: string;
  username: string; // New field
  fullName: string;
  email: string;
  role: UserRole;
  department: string;
  status: UserStatus;
  lastActive: string;
  avatarUrl?: string;
}

export interface Merchant {
  id: string;
  name: string;
  code: string;
  bankAccount: string;
  bankName: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Enhanced fields
  address?: string;
  contactPhone?: string;
  contactEmail?: string;
  mccCode?: string; // Merchant Category Code
  adminAccounts?: string[]; // Danh sách số TK admin quản lý
  feeStructure?: AgentFeeStructure; // Phí chiết khấu cho từng đại lý
  businessType?: string;
  taxCode?: string;
  notes?: string;
  // Point of sale fields
  branchName?: string; // Tên chi nhánh
  pointOfSaleName?: string; // Tên điểm thu (ví dụ: "ANCATTUONG66PKV01")
  pointOfSaleCode?: string; // Mã điểm thu (ví dụ: "NVAUDIO1")
}

// Phí chiết khấu cụ thể cho từng đại lý
export interface AgentFeeStructure {
  [agentId: string]: {
    [paymentMethod: string]: number; // Phần trăm phí
  };
}

export interface Agent {
  id: string;
  name: string;
  code: string;
  bankAccount: string;
  discountRates: Record<string, number>; // Percentage - DEPRECATED: Dùng discountRatesByPointOfSale thay thế
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Enhanced fields
  assignedMerchants?: string[]; // Danh sách merchant ID được phép sử dụng
  contactPhone?: string; // Số điện thoại liên hệ
  paymentPhone?: string; // Số điện thoại thanh toán (từ ảnh VNPay) - dùng để auto-link agent
  contactEmail?: string;
  address?: string;
  taxCode?: string;
  bankBranch?: string;
  qrCodeBase64?: string; // Mã QR thanh toán của đại lý (base64)
  notes?: string;
  // Point of sale assignment
  assignedPointOfSales?: string[]; // Danh sách điểm thu được gán (lưu pointOfSaleName hoặc pointOfSaleCode)
  // Chiết khấu theo từng điểm bán (NEW WORKFLOW: Gán điểm bán trước, sau đó cấu hình chiết khấu)
  discountRatesByPointOfSale?: Record<string, Record<string, number>>; // { pointOfSaleName: { paymentMethod: rate } }
}

// Represents a row from the Merchant's export file
export interface MerchantTransaction {
  id: string;
  merchantCode: string;
  transactionCode: string; // Mã chuẩn chi
  amount: number;
  timestamp: string;
  method: PaymentMethod;
  // Point of sale fields from Excel
  pointOfSaleName?: string; // Điểm thu từ Excel
  pointOfSaleCode?: string; // Mã điểm thu từ Excel
  branchName?: string; // Chi nhánh từ Excel
  sourceFile?: string; // Tên file Excel nguồn (cho tracking)
}

// Represents a bill submitted by the Agent
export interface AgentSubmission {
  id: string;
  agentId: string;
  transactionCode: string; // Mã chuẩn chi
  amount: number; // Amount collected from user
  timestamp: string;
  billImage?: string;
  imageUrl?: string; // Base64 hoặc Firebase Storage URL của ảnh screenshot
  invoiceNumber?: string; // Số hóa đơn (từ OCR)
  ocrConfidence?: number; // Độ tin cậy của OCR (0-1)
  // Point of sale from OCR
  pointOfSaleName?: string; // Điểm thu từ OCR
  // Bank account from OCR - dùng để auto-link agent
  bankAccount?: string; // Số tài khoản ngân hàng từ ảnh VNPay (ví dụ: "093451103")
}

export interface ReconciliationRecord {
  id: string;
  transactionCode: string;
  merchantData?: MerchantTransaction;
  agentData?: AgentSubmission;
  status: TransactionStatus;
  difference: number;
  processedAt: string;
  // Enhanced fields for complete transaction records
  errorDetail?: string;
  errorType?: 'WRONG_POINT_OF_SALE' | 'WRONG_AMOUNT' | 'WRONG_AGENT' | 'WRONG_TRANSACTION_CODE' | 'DUPLICATE' | 'MISSING_MERCHANT' | 'MISSING_AGENT'; // Loại lỗi chi tiết
  merchantCode?: string;
  merchantId?: string; // Merchant ID (not just code)
  agentId?: string;
  paymentMethod?: PaymentMethod;
  transactionDate?: string;
  merchantAmount?: number;
  agentAmount?: number;
  sourceFile?: string;
  // Point of sale
  pointOfSaleName?: string; // Điểm thu của giao dịch
  // Payment tracking
  isPaid?: boolean; // Đã thanh toán chưa, để tránh double payment
  paymentId?: string; // ID của payment nếu đã tạo
  // Note field for user comments/notes
  note?: string;
  noteUpdatedAt?: string;
  noteUpdatedBy?: string;
  // Manual edit tracking
  isManuallyEdited?: boolean; // Đã được sửa thủ công chưa
  editedFields?: string[]; // Các field đã được sửa: ['transactionCode', 'amount', 'pointOfSaleName', 'agentId']
  editHistory?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    editedAt: string;
    editedBy: string;
  }>;
  sessionId?: string; // ID của session đối soát
}

export interface Stats {
  totalVolume: number;
  totalTransactions: number;
  errorCount: number;
  matchedCount: number;
}

// Reconciliation Session - lưu thông tin mỗi phiên đối soát
export interface ReconciliationSession {
  id: string;
  createdAt: string;
  createdBy: string; // User ID
  merchantFileName: string;
  agentFileName: string;
  totalRecords: number;
  matchedCount: number;
  errorCount: number;
  totalAmount: number;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processedAt?: string;
  notes?: string;
  // Enhanced metadata for optimized queries
  agentId?: string; // Agent chính trong session này
  merchantIds?: string[]; // Danh sách merchants
  summary?: {
    byAgent: Record<string, { count: number; amount: number }>;
    byMerchant: Record<string, { count: number; amount: number }>;
  };
  // Aggregated data for supplementary bills và export
  aggregatedData?: {
    byTransactionCode: Record<string, {
      transactionCode: string;
      pointOfSaleName?: string;
      agentId?: string;
      merchantAmount: number;
      agentAmount: number;
      status: TransactionStatus;
      lastProcessedAt: string;
      sessionIds: string[]; // Danh sách session đã xử lý bill này
    }>;
    byPointOfSale: Record<string, {
      pointOfSaleName: string;
      totalTransactions: number;
      totalAmount: number;
      matchedCount: number;
      errorCount: number;
    }>;
    byAgent: Record<string, {
      agentId: string;
      totalTransactions: number;
      totalAmount: number;
      matchedCount: number;
      errorCount: number;
    }>;
  };
  // Supplementary bills tracking
  isSupplementary?: boolean; // Có phải là session bổ sung không
  parentSessionId?: string; // ID của session gốc nếu là session bổ sung
}

// Payment - thanh toán cho agent
export interface Payment {
  id: string;
  agentId: string;
  agentName: string;
  agentCode: string;
  bankAccount: string;
  totalAmount: number; // Tổng số tiền giao dịch
  feeAmount: number; // Tiền phí chiết khấu
  netAmount: number; // Số tiền thực tế trả = totalAmount - feeAmount
  transactionIds: string[]; // Danh sách ID các giao dịch
  transactionCount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  createdAt: string;
  createdBy: string; // User ID
  paidAt?: string;
  batchId?: string;
  notes?: string;
}

// Payment Batch - đợt chi trả
export interface PaymentBatch {
  id: string;
  name: string;
  totalAmount: number;
  totalFees: number;
  netAmount: number;
  paymentIds: string[];
  paymentCount: number;
  agentCount: number;
  status: 'DRAFT' | 'EXPORTED' | 'COMPLETED';
  createdAt: string;
  createdBy: string; // User ID  
  exportedAt?: string;
  completedAt?: string;
  notes?: string;
}

// App Settings - cấu hình hệ thống
export interface AppSettings {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoUrl?: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  geminiApiKey?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Dashboard filter options
export interface DateFilter {
  type: 'day' | 'week' | 'month' | 'custom';
  from?: string;
  to?: string;
}

// Export data structures
export interface ExportData {
  metadata: {
    exportDate: string;
    dateRange: string;
    companyName: string;
    logoUrl?: string;
  };
  data: any[];
  summary?: Record<string, any>;
}

// Debt Report - Báo cáo công nợ
export interface DebtReport {
  id: string;
  agentId: string;
  agentName: string;
  agentCode: string;
  totalTransactions: number;
  totalAmount: number; // Tổng tiền giao dịch
  totalFee: number; // Tổng phí
  netAmount: number; // Số tiền thực trả
  paidAmount: number; // Đã thanh toán
  unpaidAmount: number; // Còn nợ
  lastTransactionDate?: string;
  lastPaymentDate?: string;
  pointOfSales?: string[]; // Danh sách điểm thu
}

// Debt by Admin Account - Công nợ theo STK Admin
export interface DebtByAdminAccount {
  adminAccount: string;
  merchants: {
    merchantId: string;
    merchantName: string;
    merchantCode: string;
    totalAmount: number;
    transactionCount: number;
    pointOfSaleName?: string;
    pointOfSales?: string[];
  }[];
  totalAmount: number;
  totalTransactions: number;
}

// Transaction Report - Báo cáo giao dịch
export interface TransactionReport {
  dateFrom: string;
  dateTo: string;
  byAgent: {
    agentId: string;
    agentName: string;
    totalAmount: number;
    transactionCount: number;
    matchedCount: number;
    errorCount: number;
  }[];
  byMerchant: {
    merchantId: string;
    merchantName: string;
    totalAmount: number;
    transactionCount: number;
  }[];
  byPaymentMethod: {
    method: PaymentMethod;
    totalAmount: number;
    transactionCount: number;
    averageAmount: number;
  }[];
  totalRevenue: number;
  totalProfit: number;
  totalFees: number;
}