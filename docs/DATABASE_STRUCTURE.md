# Cấu trúc Database và Cách Hệ Thống Tương Tác

## 1. Tổng quan

**Database**: Firebase Realtime Database (không phải Firestore)  
**Kiến trúc**: Client-side only, không có backend server  
**Pattern**: Layered Architecture
- **Presentation Layer**: React Components (`components/`)
- **Service Layer**: Firebase Services (`src/lib/`)
- **Data Layer**: Firebase Realtime Database
- **Utils Layer**: Utilities (`src/utils/`)

## 2. Cấu trúc Database

### 2.1. Các bảng chính

```
firebase-database/
├── users/                      # Tài khoản người dùng
├── agents/                     # Tài khoản đại lý
├── merchants/                  # Điểm bán (Merchant)
├── user_bills/                 # Bills do user upload
├── merchant_transactions/      # Transactions từ file Excel
│   └── byCode/                 # Index: transactionCode -> transactionId
├── report_records/             # Kết quả đối soát (BẢNG CHÍNH)
├── payment_batches/            # Đợt chi trả (DEPRECATED - chỉ dùng cho legacy)
└── settings/                   # Cấu hình hệ thống
```

### 2.2. Chi tiết các bảng

#### 2.2.1. `users/` - Tài khoản người dùng
```typescript
{
  [userId]: {
    id: string;
    phone: string;              // Unique, dùng để login
    email?: string;
    password: string;           // Plain text (no hashing)
    fullName: string;
    qrCodeBase64?: string;
    createdAt: string;
    lastActive: string;
    deleted?: boolean;
    deletedAt?: string;
  }
}
```

**Cách truy cập:**
- Service: `UserService` trong `src/lib/userServices.ts`
- Hook: `useRealtimeData<Record<string, User>>('/users')`
- Component: Load từ localStorage `userAuth` → lấy `userId` → filter từ `/users`

#### 2.2.2. `agents/` - Tài khoản đại lý
```typescript
{
  [agentId]: {
    id: string;
    name: string;
    code: string;               // AG_001, AG_002, ...
    contactPhone: string;       // Dùng để login
    password: string;           // Hashed password
    bankAccount: string;
    discountRates: Record<string, number>;  // DEPRECATED
    discountRatesByPointOfSale?: Record<string, Record<string, number>>;  // { pointOfSaleName: { paymentMethod: rate } }
    assignedPointOfSales?: string[];
    isActive?: boolean;
    createdAt: string;
    updatedAt?: string;
    deleted?: boolean;
    deletedAt?: string;
  }
}
```

**Cách truy cập:**
- Service: `AgentsService` trong `src/lib/firebaseServices.ts`
- Hook: `useRealtimeData<Record<string, Agent>>('/agents')`
- Component: Load từ localStorage `agentAuth` → lấy `agentId` → filter từ `/agents`

#### 2.2.3. `merchants/` - Điểm bán
```typescript
{
  [merchantId]: {
    id: string;
    name: string;
    code: string;
    bankAccount: string;
    bankName: string;
    pointOfSaleName?: string;   // Tên điểm thu
    branchName?: string;         // Tên chi nhánh
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }
}
```

**Cách truy cập:**
- Service: `MerchantsService` trong `src/lib/firebaseServices.ts`
- Hook: `useRealtimeData<Record<string, Merchant>>('/merchants')`

#### 2.2.4. `user_bills/` - Bills do user upload
```typescript
{
  [billId]: {
    id: string;
    userId: string;
    agentId: string;
    agentCode: string;
    transactionCode: string;    // Mã chuẩn chi / Mã giao dịch
    amount: number;
    paymentMethod: PaymentMethod;
    pointOfSaleName?: string;
    imageUrl: string;           // Base64 ảnh bill
    timestamp: string;
    invoiceNumber?: string;
    
    // Payment tracking - Agent → User
    agentPaymentStatus?: 'UNPAID' | 'PAID';
    agentPaidAt?: string;
    agentPaidNote?: string;
    
    // Status tracking
    status: 'PENDING' | 'MATCHED' | 'ERROR';
    errorMessage?: string;
    
    uploadSessionId?: string;
    createdAt: string;
  }
}
```

**Cách truy cập:**
- Service: `UserService` trong `src/lib/userServices.ts`
- Hook: `useRealtimeData<Record<string, UserBill>>('/user_bills')`
- Component: Filter theo `userId` hoặc `agentId`

**Quan trọng:**
- `transactionCode` là unique identifier để match với `merchant_transactions`
- `agentPaymentStatus` được update trực tiếp trong `user_bills` (không dùng bảng riêng)

#### 2.2.5. `merchant_transactions/` - Transactions từ file Excel
```typescript
{
  [transactionId]: {
    id: string;
    merchantCode: string;
    transactionCode: string;     // Mã chuẩn chi (UNIQUE - dùng để match)
    amount: number;             // Số tiền sau KM
    amountBeforeDiscount?: number;  // Số tiền trước KM
    transactionDate: string;    // ISO string
    uploadSessionId: string;
    pointOfSaleName?: string;
    branchName?: string;
    invoiceNumber?: string;
    phoneNumber?: string;
    promotionCode?: string;
    rawData?: Record<string, any>;  // Tất cả cột từ Excel
    createdAt: string;
  },
  byCode: {                     // Index: transactionCode -> transactionId
    [transactionCode]: transactionId
  }
}
```

**Cách truy cập:**
- Service: `MerchantTransactionsService` trong `src/lib/firebaseServices.ts`
- Hook: `useRealtimeData<Record<string, MerchantTransaction>>('/merchant_transactions')`
- Index: `useRealtimeData('/merchant_transactions/byCode')` để lookup nhanh

**Quan trọng:**
- `transactionCode` là UNIQUE - không được duplicate
- Khi upload Excel, tự động check duplicate và skip
- `byCode` index để lookup nhanh theo `transactionCode`

#### 2.2.6. `report_records/` - Kết quả đối soát (BẢNG CHÍNH)
```typescript
{
  [recordId]: {
    id: string;
    
    // Link đến user_bills và merchant_transactions
    userBillId?: string;        // Link đến user_bills
    merchantTransactionId?: string;  // Link đến merchant_transactions
    
    // Thông tin từ UserBill
    userId?: string;
    agentId?: string;
    agentCode?: string;
    transactionCode: string;     // Mã chuẩn chi (UNIQUE - dùng để deduplicate)
    amount?: number;             // Từ bill
    paymentMethod?: PaymentMethod;
    pointOfSaleName?: string;
    transactionDate?: string;
    invoiceNumber?: string;
    userBillCreatedAt?: string;
    
    // Thông tin từ MerchantTransaction
    merchantCode?: string;
    merchantAmount?: number;     // Từ file Excel
    merchantAmountBeforeDiscount?: number;
    merchantPointOfSaleName?: string;
    merchantBranchName?: string;
    merchantInvoiceNumber?: string;
    merchantPhoneNumber?: string;
    merchantPromotionCode?: string;
    merchantTransactionDate?: string;
    merchantsFileData?: Record<string, any>;  // Tất cả cột từ Excel
    
    // Trạng thái đối soát
    status: 'MATCHED' | 'ERROR' | 'UNMATCHED';
    reconciliationStatus: 'PENDING' | 'MATCHED' | 'ERROR' | 'UNMATCHED';
    errorMessage?: string;
    
    // Payment tracking - Admin → Agent
    adminPaymentStatus?: 'UNPAID' | 'PAID';
    adminPaidAt?: string;       // ISO timestamp
    adminBatchId?: string;       // Optional - để group theo ngày
    
    // Metadata
    reconciledAt?: string;
    reconciledBy?: 'ADMIN' | 'AGENT';
    createdAt: string;
  }
}
```

**Cách truy cập:**
- Service: `ReportService` trong `src/lib/reportServices.ts`
  - `getReportRecords(filters, options)` - Load từ `report_records` trực tiếp
  - `getAllReportRecordsWithMerchants(filters, options)` - Merge với `merchant_transactions` và `user_bills`
- Hook: `useRealtimeData<Record<string, ReportRecord>>('/report_records')` (ít dùng)

**Quan trọng:**
- `transactionCode` là UNIQUE - chỉ có 1 record cho mỗi `transactionCode`
- `getAllReportRecordsWithMerchants` tạo "virtual records" cho merchant transactions chưa có bill
- Payment status được lưu trực tiếp trong `report_records` (không dùng bảng riêng)

#### 2.2.7. `payment_batches/` - Đợt chi trả (DEPRECATED)
```typescript
{
  [batchId]: {
    id: string;
    name: string;
    totalAmount: number;
    totalFees: number;
    netAmount: number;
    paymentIds: string[];
    paymentCount: number;
    agentCount: number;
    paymentStatus: 'UNPAID' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'DRAFT';
    status: 'DRAFT' | 'EXPORTED' | 'COMPLETED';  // Legacy
    createdAt: string;
    createdBy: string;
    paidAt?: string;
    approvalCode?: string;
    notes?: string;
  }
}
```

**Trạng thái:** DEPRECATED - Không còn dùng, chỉ giữ để backward compatibility

## 3. Cách Hệ Thống Tương Tác Với Database

### 3.1. Pattern chung

**Luồng dữ liệu:**
```
Component → Service → Firebase Realtime Database
     ↑                                    ↓
     └────────── Realtime Hook ───────────┘
```

### 3.2. Các Service chính

#### 3.2.1. `ReportService` (`src/lib/reportServices.ts`)
**Chức năng:** Quản lý `report_records` - bảng chính cho báo cáo và thanh toán

**Các hàm chính:**
- `getReportRecords(filters, options)` - Load từ `report_records` trực tiếp
- `getAllReportRecordsWithMerchants(filters, options)` - Merge với `merchant_transactions` và `user_bills`
- `createReportRecord(data)` - Tạo 1 record
- `createReportRecords(records)` - Tạo nhiều records (batch)
- `updateReportRecord(id, updates)` - Update 1 record

**Logic quan trọng:**
- `getAllReportRecordsWithMerchants`:
  1. Load tất cả `merchant_transactions`
  2. Load tất cả `report_records`
  3. Load tất cả `user_bills`
  4. Merge và tạo virtual records nếu cần
  5. **Deduplicate theo `transactionCode`** - chỉ giữ 1 record cho mỗi code
  6. Filter và sort

**Cách dùng:**
```typescript
// Trong component
const result = await ReportService.getAllReportRecordsWithMerchants(
  { userId, status: 'MATCHED' },
  { limit: 10000 }
);
const records = result.records;
```

#### 3.2.2. `UserService` (`src/lib/userServices.ts`)
**Chức năng:** Quản lý `user_bills` và `users`

**Các hàm chính:**
- `createUserBill(billData)` - Tạo bill mới
- `checkTransactionCodeExists(transactionCode)` - Check duplicate
- `findBillByTransactionCode(transactionCode)` - Tìm bill theo mã chuẩn chi

**Logic quan trọng:**
- Khi tạo bill, tự động check duplicate `transactionCode`
- Sau khi tạo bill, tự động trigger `autoReconcileBill` (nếu có merchant data)

#### 3.2.3. `MerchantTransactionsService` (`src/lib/firebaseServices.ts`)
**Chức năng:** Quản lý `merchant_transactions`

**Các hàm chính:**
- `createBatch(transactions)` - Tạo nhiều transactions, tự động check duplicate
- `getByUploadSession(sessionId)` - Load theo session

**Logic quan trọng:**
- Tự động check duplicate `transactionCode` với database trước khi insert
- Tự động update `byCode` index
- Skip transactions đã tồn tại

#### 3.2.4. `PaymentsService` (`src/lib/firebaseServices.ts`)
**Chức năng:** Quản lý thanh toán (DEPRECATED - chỉ dùng cho legacy)

**Trạng thái:** Đã được đơn giản hóa - chỉ update status trong `report_records`

### 3.3. Realtime Hooks

#### 3.3.1. `useRealtimeData<T>(path)`
**Chức năng:** Subscribe realtime updates từ Firebase

**Cách dùng:**
```typescript
const { data, loading, error } = useRealtimeData<Record<string, User>>('/users');
const users = FirebaseUtils.objectToArray(data || {});
```

**Khi nào dùng:**
- Load dữ liệu cần realtime updates (users, agents, merchants)
- Không dùng cho `report_records` (dùng `ReportService` thay thế)

### 3.4. Cách Components Truy Cập Dữ Liệu

#### 3.4.1. Admin Report (`components/AdminReport.tsx`)
```typescript
// Load từ ReportService
const result = await ReportService.getAllReportRecordsWithMerchants(filters, { limit: 10000 });

// Realtime listener để auto-reload
const { data: reportRecordsData } = useRealtimeData<Record<string, ReportRecord>>('/report_records');
```

#### 3.4.2. Agent Payments (`components/agent/AgentPayments.tsx`)
```typescript
// Load user_bills trực tiếp
const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');

// Load report_records để lấy merchantAmount
const result = await ReportService.getAllReportRecordsWithMerchants(
  { agentId },
  { limit: 10000 }
);
```

#### 3.4.3. User Report (`components/user/UserReport.tsx`)
```typescript
// Load từ ReportService với filter userId
const result = await ReportService.getAllReportRecordsWithMerchants(
  { userId },
  { limit: 10000 }
);
```

#### 3.4.4. Payouts (`components/Payouts.tsx`)
```typescript
// Load report_records với filter adminPaymentStatus
const result = await ReportService.getReportRecords(
  { status: 'MATCHED' },
  { limit: 10000 }
);

// Filter client-side
const unpaid = result.records.filter(r => 
  !r.adminPaymentStatus || r.adminPaymentStatus !== 'PAID'
);
```

## 4. Quy Tắc Quan Trọng

### 4.1. Deduplicate theo `transactionCode`
- **Luôn đảm bảo chỉ có 1 record cho mỗi `transactionCode`**
- Áp dụng cho:
  - `report_records` - trong `getAllReportRecordsWithMerchants`
  - `merchant_transactions` - khi upload Excel
  - `user_bills` - khi user upload bills

### 4.2. Payment Status
- **Admin → Agent**: Lưu trong `report_records.adminPaymentStatus`
- **Agent → User**: Lưu trong `user_bills.agentPaymentStatus`
- **Không dùng bảng riêng** (`admin_payments_to_agents`, `agent_payments_to_users`)

### 4.3. Virtual Records
- `getAllReportRecordsWithMerchants` tạo virtual records với ID `virtual_xxx`
- Virtual records **không thể update** trong database
- Chỉ dùng để hiển thị, không dùng để thanh toán

### 4.4. Data Flow

**Upload Bill:**
```
User upload bill → UserService.createUserBill()
  → Check duplicate transactionCode
  → Save to user_bills/
  → Auto-reconcile với merchant_transactions (nếu có)
  → Create/update report_records/
```

**Upload Merchant Excel:**
```
Admin upload Excel → Parse và validate
  → Check duplicate transactionCode (trong file + với database)
  → Save to merchant_transactions/
  → Update byCode index
  → Auto-reconcile với user_bills
  → Create/update report_records/
```

**Thanh toán Admin → Agent:**
```
Admin chọn reports → Update report_records
  → Set adminPaymentStatus = 'PAID'
  → Set adminPaidAt = now
  → Group theo adminPaidAt để hiển thị "Đợt chi trả"
```

**Thanh toán Agent → User:**
```
Agent chọn bills → Update user_bills
  → Set agentPaymentStatus = 'PAID'
  → Set agentPaidAt = now
  → Set agentPaidNote = note
```

## 5. Best Practices

### 5.1. Khi nào dùng Service vs Hook?
- **Dùng Service** (`ReportService`, `UserService`):
  - Cần filter, sort, pagination
  - Cần merge data từ nhiều bảng
  - Cần business logic (deduplicate, auto-reconcile)
  
- **Dùng Hook** (`useRealtimeData`):
  - Cần realtime updates
  - Dữ liệu đơn giản, không cần xử lý phức tạp
  - Ví dụ: users, agents, merchants

### 5.2. Khi nào dùng `getReportRecords` vs `getAllReportRecordsWithMerchants`?
- **Dùng `getReportRecords`**:
  - Chỉ cần data từ `report_records` (không cần merchant data)
  - Ví dụ: Payouts (chỉ cần check `adminPaymentStatus`)
  
- **Dùng `getAllReportRecordsWithMerchants`**:
  - Cần hiển thị cả merchant data
  - Cần virtual records cho merchant transactions chưa có bill
  - Ví dụ: AdminReport, AgentReport, UserReport

### 5.3. Deduplicate
- **Luôn deduplicate theo `transactionCode`** trước khi hiển thị
- Ưu tiên: Record có `merchantTransactionId` > có `userBillId` > record mới nhất
- Chạy `DeduplicateService` trong Settings để xóa duplicate trong database

## 6. Tóm tắt

**Bảng chính:**
- `report_records/` - Bảng chính cho báo cáo và thanh toán
- `user_bills/` - Bills từ user, có payment status
- `merchant_transactions/` - Transactions từ Excel

**Service chính:**
- `ReportService` - Quản lý report_records
- `UserService` - Quản lý user_bills
- `MerchantTransactionsService` - Quản lý merchant_transactions

**Quy tắc:**
- `transactionCode` là UNIQUE
- Payment status lưu trực tiếp trong bảng (không dùng bảng riêng)
- Luôn deduplicate trước khi hiển thị
- Virtual records chỉ để hiển thị, không thể update
