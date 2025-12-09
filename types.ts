
export enum PaymentMethod {
  QR_VNPAY = 'QR 1 (VNPay)',
  QR_BANK = 'QR 2 (App Bank)',
  SOFPOS = 'Sofpos',
  POS = 'POS'
}

// Payment status types - tách biệt cho 2 luồng thanh toán
export type AdminPaymentStatus = 'UNPAID' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'DRAFT';
export type AgentPaymentStatus = 'UNPAID' | 'PAID';

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

// User - Người dùng cuối (end user)
export interface User {
  id: string;
  phone: string; // unique, dùng để login (required)
  email?: string; // Email (optional)
  password: string; // plain text (no hashing)
  fullName: string;
  qrCodeBase64?: string; // QR thanh toán của user
  createdAt: string;
  lastActive: string;
  deleted?: boolean; // Soft delete flag
  deletedAt?: string; // ISO timestamp when deleted
}

// Admin User - Nhân viên admin (giữ nguyên cho backward compatibility)
export interface AdminUser {
  id: string;
  username: string;
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
  deleted?: boolean; // Soft delete flag
  deletedAt?: string; // ISO timestamp when deleted
  // Enhanced fields
  assignedMerchants?: string[]; // Danh sách merchant ID được phép sử dụng
  contactPhone: string; // SỐ ĐIỆN THOẠI - dùng để login (REQUIRED)
  password: string; // Hashed password - admin set (REQUIRED)
  paymentPhone?: string; // Số điện thoại thanh toán (từ ảnh VNPay) - DEPRECATED: không dùng nữa
  contactEmail?: string;
  address?: string;
  taxCode?: string;
  bankBranch?: string;
  qrCodeBase64?: string; // Mã QR thanh toán của đại lý (base64)
  notes?: string;
  // Point of sale assignment
  assignedPointOfSales?: string[]; // Danh sách điểm thu được gán (lưu pointOfSaleId - Firebase key của merchant)
  // Chiết khấu theo từng điểm bán (NEW WORKFLOW: Gán điểm bán trước, sau đó cấu hình chiết khấu)
  discountRatesByPointOfSale?: Record<string, Record<string, number>>; // { pointOfSaleName: { paymentMethod: rate } } - key là pointOfSaleName, không phải pointOfSaleId
  // Referral links
  referralLinkUser?: string; // Link cho user: "/user/upbill?agents=AG_001"
  referralLinkAdmin?: string; // Link cho admin: "/admin/reconciliation?agent=AG_001"
  totalUsers?: number; // Số user đã up bill cho đại lý này
  totalBills?: number; // Số bill đã nhận
}

// Represents a row from the Merchant's export file
export interface MerchantTransaction {
  id: string;
  merchantCode: string;
  transactionCode: string; // Mã chuẩn chi / Mã trừ tiền
  amount: number; // Số tiền sau KM (dùng để hiển thị)
  amountBeforeDiscount?: number; // Số tiền trước KM (dùng để match)
  transactionDate: string;      // ISO string - ngày giao dịch
  uploadSessionId: string;      // ID phiên upload file Excel
  pointOfSaleName?: string;      // Điểm thu từ Excel
  branchName?: string;           // Chi nhánh
  invoiceNumber?: string;         // Số hóa đơn
  phoneNumber?: string;          // Số điện thoại
  promotionCode?: string;         // Mã khuyến mại
  rawRowIndex?: number;         // Optional: index dòng trong file để debug
  rawData?: Record<string, any>; // All columns from Excel file
  createdAt: string;            // ISO - thời điểm tạo record
}

// Represents a bill submitted by the Agent (DEPRECATED - dùng UserBill thay thế)
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
  // Bank account from OCR - DEPRECATED: không dùng nữa
  bankAccount?: string; // Số tài khoản ngân hàng từ ảnh VNPay (ví dụ: "093451103")
}

// UserBill - Bill do user up lên
export interface UserBill {
  id: string;
  userId: string;
  agentId: string;
  agentCode: string; // Mã đại lý (AG_001)
  transactionCode: string; // Mã chuẩn chi / Mã giao dịch
  amount: number;
  paymentMethod: PaymentMethod; // Loại bill: POS / QR 1 (VNPay) / QR 2 (App Bank) / Sofpos
  pointOfSaleName?: string;
  imageUrl: string; // Base64 ảnh bill
  timestamp: string;
  invoiceNumber?: string;
  
  // Thông tin mapping từ đối soát (null ban đầu)
  merchantData?: MerchantTransaction;
  status: 'PENDING' | 'MATCHED' | 'ERROR';
  errorMessage?: string; // Error message đơn giản, văn phong Việt
  
  // Payment tracking
  isPaidByAgent: boolean; // Đại lý đã thanh toán chưa
  paidByAgentAt?: string;
  paidByAgentNote?: string;
  
  // Session tracking
  uploadSessionId?: string; // ID của session upload (khi user upload nhiều bills cùng lúc)
  
  createdAt: string;
}

// User Bill Session - Session upload bills của user
export interface UserBillSession {
  id: string;
  userId: string;
  agentId: string;
  agentName: string;
  agentCode: string;
  createdAt: string; // ISO timestamp
  billCount: number;
  errorCount: number;
  matchedCount: number;
  pendingCount: number;
}

// Agent Reconciliation Session - Session đối soát của đại lý/admin
export interface AgentReconciliationSession {
  id: string;
  agentId: string;
  performedBy: 'AGENT' | 'ADMIN'; // Ai thực hiện đối soát
  merchantFileName: string;
  billCount: number;
  matchedCount: number;
  errorCount: number;
  status: 'COMPLETED' | 'FAILED';
  createdAt: string;
}

// Agent Payment to User - Lịch sử thanh toán đại lý cho user
export interface AgentPaymentToUser {
  id: string;
  agentId: string;
  userId?: string; // Optional - có thể thanh toán cho nhiều user
  billIds: string[]; // Danh sách user_bills IDs
  totalAmount: number;
  feeAmount?: number; // Phí (nếu có)
  netAmount?: number; // Số tiền thực trả (nếu có)
  status: AgentPaymentStatus; // UNPAID | PAID
  note: string;
  createdAt: string; // ISO timestamp
  paidAt?: string; // ISO timestamp - khi status = PAID
  approvalCode?: string; // Mã chuẩn chi nội bộ của đại lý
}

// Admin Payment to Agent - Admin thanh toán cho đại lý
export interface AdminPaymentToAgent {
  id: string;
  agentId: string;
  agentCode: string;
  billIds: string[]; // Danh sách user_bills IDs đã khớp
  totalAmount: number; // Tổng tiền giao dịch
  feeAmount: number; // Phí chiết khấu
  netAmount: number; // Số tiền thực trả cho đại lý
  paymentStatus: AdminPaymentStatus; // UNPAID | PAID | PARTIAL | CANCELLED | DRAFT
  note: string;
  paidAt?: string; // ISO timestamp - khi paymentStatus = PAID
  createdBy: string; // Admin user ID
  createdAt: string; // ISO timestamp
  batchId?: string; // ID của PaymentBatch nếu có
  approvalCode?: string; // Mã chuẩn chi
  reportRecordIds?: string[]; // Optional list of report records in this payment
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
  paymentIds: string[]; // Danh sách AdminPaymentToAgent IDs
  paymentCount: number;
  agentCount: number;
  paymentStatus: AdminPaymentStatus; // UNPAID | PAID | PARTIAL | CANCELLED | DRAFT (default: DRAFT/UNPAID)
  status: 'DRAFT' | 'EXPORTED' | 'COMPLETED'; // Legacy field - giữ để backward compatibility
  createdAt: string;
  createdBy: string; // User ID  
  paidAt?: string; // ISO timestamp - khi paymentStatus = PAID
  exportedAt?: string;
  completedAt?: string;
  approvalCode?: string; // Mã chuẩn chi
  notes?: string;
  adminPaymentIds?: string[]; // Optional list of AdminPaymentToAgent IDs in this batch
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

// Report Status - Trạng thái đối soát trong báo cáo
export type ReportStatus = 'MATCHED' | 'UNMATCHED' | 'ERROR';

// Report Record - Kết quả đối soát giữa user_bills và merchant_transactions
export interface ReportRecord {
  id: string;
  // Snapshot từ user_bills (Thông tin từ Bill)
  userBillId: string;
  userId: string;
  agentId: string;
  agentCode: string;
  transactionCode: string; // Mã giao dịch từ bill
  amount: number; // Số tiền từ bill
  paymentMethod: PaymentMethod;
  pointOfSaleName?: string; // Điểm thu từ bill
  transactionDate: string;      // ISO - thời gian giao dịch từ bill
  userBillCreatedAt: string;    // ISO - thời điểm tạo bill
  invoiceNumber?: string;        // Số hóa đơn từ bill (nếu có)
  
  // Snapshot từ merchant_transactions (Thông tin từ Merchants - file Excel)
  merchantTransactionId?: string;
  merchantCode?: string;
  merchantAmount?: number; // Số tiền sau KM từ merchant
  merchantAmountBeforeDiscount?: number; // Số tiền trước KM từ merchant (dùng để match)
  merchantPointOfSaleName?: string; // Điểm thu từ merchant
  merchantBranchName?: string; // Chi nhánh từ merchant
  merchantInvoiceNumber?: string; // Số hóa đơn từ merchant
  merchantPhoneNumber?: string; // Số điện thoại từ merchant
  merchantPromotionCode?: string; // Mã khuyến mại từ merchant
  merchantTransactionDate?: string; // ISO - thời gian giao dịch từ merchant
  
  // Reconciliation result
  status: ReportStatus; // Keep for backward compatibility
  reconciliationStatus?: 'PENDING' | 'MATCHED' | 'ERROR' | 'UNMATCHED'; // New field for auto-reconciliation
  errorMessage?: string;
  merchantsFileData?: Record<string, any>; // All columns from merchants Excel file
  
  // Metadata
  reconciledAt: string;         // ISO – thời điểm chạy đối soát
  reconciledBy: 'ADMIN';        // chỉ Admin
  reconciliationSessionId?: string;
  
  // Admin editable fields (edit chỉ cập nhật vào report_records)
  note?: string;
  isManuallyEdited?: boolean;
  editedFields?: string[];
  
  // Payment tracking - Luồng Admin → Agent
  adminPaymentId?: string; // Link với AdminPaymentToAgent
  adminBatchId?: string; // Link với PaymentBatch
  adminPaidAt?: string; // ISO timestamp
  adminPaymentStatus?: AdminPaymentStatus; // UNPAID | PAID | PARTIAL | CANCELLED | DRAFT
  
  // Payment tracking - Luồng Agent → User
  agentPaymentId?: string; // Link với AgentPaymentToUser
  agentPaidAt?: string; // ISO timestamp (hoặc dùng user_bills.paidByAgentAt)
  agentPaymentStatus?: AgentPaymentStatus; // UNPAID | PAID
  
  // Fee calculation (cached for performance)
  feeAmount?: number; // Phí chiết khấu
  netAmount?: number; // Số tiền sau phí
  
  createdAt: string;            // ISO – thời điểm tạo record
}