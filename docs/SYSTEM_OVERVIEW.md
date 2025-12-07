# Tài liệu Tổng quan Hệ thống Đối soát Thanh toán

## 1. Mục đích hệ thống

### 1.1. Mục đích chính
Hệ thống **PayReconcile Pro** là một hệ thống đối soát thanh toán giữa:
- **User** (Người dùng cuối): Khách hàng upload hóa đơn thanh toán từ VNPay, PhonePOS, App ngân hàng
- **Agent** (Đại lý): Thu thập bills từ users và đối soát với dữ liệu merchant
- **Admin**: Quản lý toàn bộ quy trình đối soát, merchant transactions, và thanh toán cho agents

### 1.2. Các loại dữ liệu/đối tượng chính được đối soát

1. **UserBill**: Hóa đơn do user upload (từ OCR screenshot thanh toán)
   - Transaction code, amount, payment method, point of sale
   - Trạng thái: PENDING → MATCHED/ERROR sau khi đối soát

2. **MerchantTransaction**: Giao dịch từ file Excel của merchant (điểm bán)
   - Transaction code, amount (trước/sau khuyến mãi), point of sale
   - Được import từ file Excel do admin upload

3. **ReportRecord**: Kết quả đối soát giữa UserBill và MerchantTransaction
   - Status: MATCHED, UNMATCHED, ERROR
   - Chứa snapshot cả hai nguồn dữ liệu để đối chiếu

4. **Payment**: Thanh toán từ Admin → Agent (cho các giao dịch đã khớp)
   - Tính phí chiết khấu dựa trên point of sale và payment method

5. **AdminPaymentToAgent**: Thanh toán từ Admin cho Agent (batch)
   - Tính toán tổng tiền, phí, số tiền thực trả

---

## 2. Tech Stack & Kiến trúc Tổng quan

### 2.1. Tech Stack

**Frontend:**
- **Framework**: React 19.2.0 + TypeScript 5.8.2
- **Build Tool**: Vite 6.2.0
- **Routing**: React Router DOM 7.9.6
- **UI Icons**: Lucide React 0.553.0
- **Excel Processing**: xlsx 0.18.5
- **AI/OCR**: Google GenAI (@google/genai 1.29.1) - Gemini 2.5 Flash

**Backend/Database:**
- **Database**: Firebase Realtime Database (không phải Firestore)
- **Authentication**: Firebase Auth (hiện tại dùng localStorage mock auth)

**Deployment:**
- **Platform**: Vercel (có file `vercel.json`)

### 2.2. Kiến trúc Tổng quan

**Loại kiến trúc**: Single Page Application (SPA) với client-side routing

**Pattern**: 
- **Layered Architecture** (frontend-only)
  - **Presentation Layer**: React Components (`components/`)
  - **Service Layer**: Firebase Services (`src/lib/`)
  - **Data Layer**: Firebase Realtime Database
  - **Utils Layer**: Utilities (`src/utils/`)

**Đặc điểm:**
- Không có backend server riêng
- Tất cả business logic nằm trong frontend (React components + services)
- Firebase Realtime Database làm database chính
- OCR xử lý trên client-side qua Google Gemini API

### 2.3. Cấu trúc thư mục và vai trò

```
QRcode-upcode/
├── components/                  # React Components (Presentation Layer)
│   ├── admin/                  # Components dành cho Admin
│   │   └── PersonnelManagement.tsx
│   ├── agent/                  # Components dành cho Agent
│   │   ├── AgentLogin.tsx
│   │   ├── AgentReport.tsx
│   │   ├── AgentPayments.tsx
│   │   └── AgentReconciliation.tsx
│   ├── user/                   # Components dành cho User
│   │   ├── UserLogin.tsx
│   │   ├── UserRegister.tsx
│   │   ├── UploadBill.tsx      # Upload bill + OCR
│   │   └── UserReport.tsx
│   ├── reconciliation/         # Components đối soát
│   │   ├── PendingBillsPanel.tsx
│   │   └── UserBillsModal.tsx
│   ├── shared/                 # Shared components
│   │   ├── ReportFilters.tsx
│   │   ├── ReportTable.tsx
│   │   └── DeleteConfirmModal.tsx
│   ├── ReconciliationModule.tsx  # Module đối soát chính (Admin)
│   ├── AdminReport.tsx
│   ├── Agents.tsx              # Quản lý đại lý
│   ├── Merchants.tsx           # Quản lý điểm bán
│   ├── Payouts.tsx             # Quản lý thanh toán
│   └── Dashboard.tsx
│
├── src/
│   ├── lib/                    # Services Layer (Business Logic)
│   │   ├── firebase.ts         # Firebase initialization
│   │   ├── firebaseServices.ts # CRUD operations cho Merchants, Agents, Payments, Reconciliation
│   │   ├── authServices.ts     # Authentication (login, register)
│   │   ├── userServices.ts     # User management
│   │   ├── reportServices.ts   # Report records management
│   │   ├── agentReconciliationServices.ts  # Agent reconciliation logic
│   │   ├── deletionService.ts  # Soft delete / Cascade delete
│   │   ├── firebaseHooks.ts    # React hooks cho Firebase realtime data
│   │   └── dataRetentionService.ts
│   │
│   ├── utils/                  # Utilities Layer
│   │   ├── formatUtils.ts      # Format số tiền, ngày tháng
│   │   ├── excelParserUtils.ts # Parse Excel files (merchant transactions)
│   │   ├── excelExportUtils.ts # Export Excel files
│   │   └── dateFilterUtils.ts
│   │
│   └── styles/
│       └── designTokens.ts
│
├── services/
│   └── geminiService.ts        # OCR service (Gemini AI) - Extract transaction từ ảnh
│
├── types.ts                    # TypeScript type definitions
├── constants.ts                # Constants
├── App.tsx                     # Main routing component
└── index.tsx                   # Entry point
```

**Vai trò từng thư mục:**

- **`components/`**: React components - UI và presentation logic
- **`src/lib/`**: Services - Business logic, data access, API calls
- **`src/utils/`**: Utilities - Helper functions, parsers, formatters
- **`services/`**: External service integrations (OCR)
- **`types.ts`**: Type definitions cho toàn bộ hệ thống

---

## 3. Các Module Chính

### 3.1. Module: User Bill Upload & OCR

**Mục đích**: User upload ảnh hóa đơn thanh toán, hệ thống dùng OCR (Gemini AI) để trích xuất thông tin giao dịch.

**Files quan trọng:**
- `components/user/UploadBill.tsx` - UI component upload bill
- `services/geminiService.ts` - OCR service (extractTransactionFromImage)

**Services/Functions chính:**

1. **`extractTransactionFromImage(imageBase64: string, agentId: string)`**
   - **File**: `services/geminiService.ts`
   - **Trách nhiệm**: Gửi ảnh base64 lên Gemini API, parse JSON response, validate và trả về `AgentSubmission`
   - **Input**: Base64 image, agentId
   - **Output**: `{ transactionCode, amount, paymentMethod, pointOfSaleName, invoiceNumber, timestamp }`
   - **Retry logic**: 3 lần retry với exponential backoff (2s, 4s, 8s)

2. **`processOCR(index: number)`** (trong UploadBill.tsx)
   - **Trách nhiệm**: Xử lý OCR cho từng ảnh (concurrent limit: 5)
   - **Flow**: Convert File → Object URL → Base64 → Call OCR → Update state

3. **`UserService.createUserBill(bill: UserBill)`**
   - **File**: `src/lib/userServices.ts`
   - **Trách nhiệm**: Lưu user bill vào Firebase `user_bills` table

**Luồng xử lý:**
1. User chọn ảnh → Tạo preview (Object URL)
2. Auto-trigger OCR (concurrent limit 5)
3. Convert Object URL → Base64
4. Call Gemini API → Parse JSON
5. Validate paymentMethod, amount, transactionCode
6. User click "Upload" → Lưu vào `user_bills` (status: PENDING)

---

### 3.2. Module: Merchant Transaction Import

**Mục đích**: Admin upload file Excel từ merchant, parse và lưu vào `merchant_transactions`.

**Files quan trọng:**
- `components/ReconciliationModule.tsx` - UI upload Excel (step 0)
- `src/utils/excelParserUtils.ts` - Parse Excel logic

**Services/Functions chính:**

1. **`parseExcel(file: File): Promise<MerchantTransaction[]>`**
   - **File**: `src/utils/excelParserUtils.ts`
   - **Trách nhiệm**: Parse Excel file, tìm header row, map columns, extract transactions
   - **Logic tìm header**: Tìm row có chứa "ma giao dich", "transaction code", "so tien", etc.
   - **Mapping columns**: Auto-detect columns dựa trên keywords

2. **`MerchantTransactionsService.createBatch(transactions[])`**
   - **File**: `src/lib/firebaseServices.ts`
   - **Trách nhiệm**: Lưu nhiều merchant transactions cùng lúc vào Firebase
   - **Clean undefined**: Remove undefined values trước khi push (Firebase không cho phép undefined)

3. **`handleMerchantFileUpload()`** (trong ReconciliationModule.tsx)
   - **Trách nhiệm**: Handle multi-file upload, merge transactions, validate merchant code
   - **Flow**: Parse từng file → Merge → Validate → Lưu vào `merchant_transactions`

**Luồng xử lý:**
1. Admin chọn file Excel → Parse với xlsx library
2. Tìm header row (auto-detect)
3. Map columns → Extract transactions
4. Validate merchant code (check trong `merchants` table)
5. Lưu vào `merchant_transactions` với `uploadSessionId`

---

### 3.3. Module: Reconciliation (Đối soát)

**Mục đích**: Đối soát `user_bills` (PENDING) với `merchant_transactions` để tạo `report_records`.

**Files quan trọng:**
- `components/ReconciliationModule.tsx` - UI reconciliation (step 1-2)
- `src/lib/reportServices.ts` - Report records management
- `src/lib/agentReconciliationServices.ts` - Agent reconciliation logic

**Services/Functions chính:**

1. **`handleProcess()`** (trong ReconciliationModule.tsx)
   - **Trách nhiệm**: Load pending bills → Match với merchant transactions → Tạo report records
   - **Matching logic**:
     - Match theo `transactionCode`
     - Filter theo `pointOfSaleName` (nếu có)
     - Compare `amountBeforeDiscount` với `amount` từ bill
   - **Status**:
     - `MATCHED`: Tất cả 3 điều kiện khớp
     - `ERROR`: Amount mismatch, point of sale mismatch, duplicate, hoặc missing

2. **`ReportService.createReportRecords(records[])`**
   - **File**: `src/lib/reportServices.ts`
   - **Trách nhiệm**: Tạo nhiều report records cùng lúc
   - **Clean undefined**: Remove undefined values trước khi push

3. **`AgentReconciliationService.reconcileAgentBills(agentId, merchantTransactions)`**
   - **File**: `src/lib/agentReconciliationServices.ts`
   - **Trách nhiệm**: Đối soát bills của một agent cụ thể (dùng cho Agent interface)

**Matching Algorithm:**
```
For each user_bill (PENDING):
  1. Tìm merchant_transactions có cùng transactionCode
  2. Nếu bill có pointOfSaleName → filter merchant transactions theo pointOfSaleName
  3. Nếu có > 1 match → ERROR (duplicate)
  4. Nếu có 0 match → ERROR (missing in merchant)
  5. Nếu có 1 match:
     - So sánh amountBeforeDiscount (merchant) với amount (bill)
     - Nếu khác nhau > 0.01 → ERROR (amount mismatch)
     - Nếu khớp → MATCHED
```

---

### 3.4. Module: Payment Management

**Mục đích**: Admin tạo payments cho agents dựa trên các giao dịch đã khớp (MATCHED).

**Files quan trọng:**
- `components/Payouts.tsx` - UI quản lý payments
- `src/lib/firebaseServices.ts` - PaymentsService

**Services/Functions chính:**

1. **`PaymentsService.getUnpaidTransactions()`**
   - **Trách nhiệm**: Lấy các `report_records` có status = MATCHED, chưa có `paymentId`
   - **Filter**: `status === 'MATCHED' && !paymentId && !isPaid`

2. **`PaymentsService.createPaymentFromReconciliation(record, agent)`**
   - **Trách nhiệm**: Tạo payment cho một record
   - **Tính phí**: Dựa trên `discountRatesByPointOfSale[pointOfSaleName][paymentMethod]`
   - **Fee calculation**: `feeAmount = amount * (feePercentage / 100)`, `netAmount = amount - feeAmount`

3. **`PaymentsService.createBatch(batch)`**
   - **Trách nhiệm**: Tạo batch payment (nhóm nhiều payments)

4. **`PaymentsService.exportBatch(batchId)`**
   - **Trách nhiệm**: Export batch ra Excel để admin chi trả

**Luồng xử lý:**
1. Admin vào "Quản lý Thanh toán"
2. System load các transactions chưa thanh toán (MATCHED, chưa có paymentId)
3. Admin chọn transactions → Group theo agent
4. System tính phí chiết khấu dựa trên point of sale + payment method
5. Tạo Payment record → Tạo PaymentBatch (nếu cần)
6. Export Excel → Admin chi trả → Mark as PAID

---

### 3.5. Module: Reports

**Mục đích**: Hiển thị báo cáo đối soát cho Admin, Agent, User.

**Files quan trọng:**
- `components/AdminReport.tsx` - Báo cáo Admin
- `components/agent/AgentReport.tsx` - Báo cáo Agent
- `components/user/UserReport.tsx` - Báo cáo User
- `components/shared/ReportFilters.tsx` - Shared filter component
- `src/lib/reportServices.ts` - Report service

**Services/Functions chính:**

1. **`ReportService.getReportRecords(filters, options)`**
   - **File**: `src/lib/reportServices.ts`
   - **Trách nhiệm**: Query `report_records` với filters (userId, agentId, status, dateFrom, dateTo, pointOfSaleName)
   - **Pagination**: Cursor-based pagination (limit 50 records/page)
   - **Sort**: By `createdAt` descending

2. **`ReportService.updateReportRecord(recordId, updates)`**
   - **Trách nhiệm**: Admin edit report record (amount, transactionCode, pointOfSaleName, note)
   - **Track changes**: Lưu `editedFields`, `isManuallyEdited`, `editHistory`

**Filters:**
- Date range (dateFrom, dateTo)
- Status (MATCHED, UNMATCHED, ERROR)
- Point of Sale (pointOfSaleName)
- User (cho Agent report)
- Agent (cho Admin report)

---

### 3.6. Module: Authentication & Authorization

**Mục đích**: Xác thực và phân quyền cho 3 loại user (Admin, Agent, User).

**Files quan trọng:**
- `src/lib/authServices.ts` - Login/register logic
- `App.tsx` - Protected routes

**Services/Functions chính:**

1. **`loginUser(phone, password)`**
   - **Trách nhiệm**: Login user với phone + password (plain text)
   - **Matching**: Exact match phone (case-sensitive, hỗ trợ "x" trong phone)
   - **Filter**: Exclude soft-deleted users (`deleted !== true`)

2. **`loginAgent(phone, password)`**
   - **Trách nhiệm**: Login agent với contactPhone + password
   - **Filter**: Exclude inactive/deleted agents

3. **`registerUser(phone, password, fullName, email?)`**
   - **Trách nhiệm**: Đăng ký user mới
   - **Validation**: Check phone/email đã tồn tại (exact match)
   - **Password**: Lưu plain text (không hash)

**Protected Routes:**
- `/admin` → Login page (public)
- `/reconciliation`, `/agents`, `/merchants`, etc. → Protected (require `mockAuth`)
- `/user/*` → Protected (require `userAuth`)
- `/agent/*` → Protected (require `agentAuth`)

---

## 4. Dòng Dữ Liệu (Data Flow) Cấp Cao

### 4.1. Luồng Upload Bill của User

```
1. User chọn ảnh hóa đơn
   → File object được tạo
   → Object URL được tạo cho preview

2. Auto-trigger OCR (concurrent limit: 5)
   → Convert File → Base64
   → Call Gemini API (extractTransactionFromImage)
   → Parse JSON response
   → Validate: transactionCode, amount, paymentMethod

3. User click "Upload"
   → UserService.createUserBill()
   → Lưu vào Firebase: user_bills/{id}
   → Status: PENDING

4. Admin chạy đối soát (sau khi có merchant transactions)
   → Match user_bills với merchant_transactions
   → Tạo report_records
   → Update user_bills.status: MATCHED/ERROR
```

### 4.2. Luồng Import Merchant Transactions

```
1. Admin upload file Excel
   → Parse với xlsx library (parseExcel)
   → Tìm header row (auto-detect)
   → Map columns → Extract transactions

2. Validate merchant code
   → Check trong merchants table
   → Warning nếu không tìm thấy

3. Create batch
   → MerchantTransactionsService.createBatch()
   → Lưu vào Firebase: merchant_transactions/{id}
   → Gán uploadSessionId để track

4. Admin chạy đối soát
   → Load merchant_transactions theo uploadSessionId
   → Match với user_bills
```

### 4.3. Luồng Đối soát (Reconciliation)

```
1. Admin upload merchant transactions (step 0)
   → merchant_transactions được tạo

2. Admin click "Xử lý đối soát" (step 1)
   → Load tất cả user_bills có status = PENDING
   → Load merchant_transactions (theo uploadSessionId hoặc tất cả)

3. Matching Algorithm (cho mỗi user_bill):
   a. Tìm merchant_transactions có cùng transactionCode
   b. Filter theo pointOfSaleName (nếu bill có)
   c. So sánh amountBeforeDiscount (merchant) với amount (bill)
   d. Xác định status: MATCHED hoặc ERROR

4. Tạo report_records
   → ReportService.createReportRecords()
   → Lưu vào Firebase: report_records/{id}
   → Snapshot cả user_bills và merchant_transactions vào report_record

5. Update user_bills.status
   → MATCHED hoặc ERROR

6. Hiển thị kết quả (step 2)
   → Load report_records
   → Filter theo status
   → Export Excel nếu cần
```

### 4.4. Luồng Thanh toán (Payment)

```
1. Admin vào "Quản lý Thanh toán"
   → PaymentsService.getUnpaidTransactions()
   → Load report_records: status=MATCHED, !paymentId

2. Admin chọn transactions → Group theo agent
   → Tính phí chiết khấu:
     - Lấy discountRatesByPointOfSale[pointOfSaleName][paymentMethod]
     - feeAmount = amount * (feePercentage / 100)
     - netAmount = amount - feeAmount

3. Tạo Payment
   → PaymentsService.createPayment()
   → Lưu vào Firebase: payments/{id}
   → Update report_records: paymentId = payment.id

4. Tạo PaymentBatch (nếu cần)
   → PaymentsService.createBatch()
   → Lưu vào Firebase: payment_batches/{id}

5. Export Excel
   → PaymentsService.exportBatch()
   → Download file Excel

6. Admin chi trả → Mark as PAID
   → PaymentsService.updatePaymentStatus(id, 'PAID')
   → Update report_records: isPaid = true
```

---

## 5. Cấu hình & Integration

### 5.1. Firebase Realtime Database

**Cấu trúc Database:**
```
firebase-database/
├── users/                      # User accounts
├── agents/                     # Agent accounts
├── merchants/                  # Merchant (điểm bán)
├── user_bills/                 # Bills do user upload
├── merchant_transactions/      # Transactions từ Excel
├── report_records/             # Kết quả đối soát
├── payments/                   # Payments (Admin → Agent)
├── payment_batches/            # Payment batches
├── agent_payments_to_users/    # Payments (Agent → User)
├── admin_payments_to_agents/   # Payments (Admin → Agent)
├── reconciliation_sessions/    # Lịch sử đối soát (legacy)
├── agent_reconciliation_sessions/  # Agent reconciliation sessions
└── settings/                   # App settings (geminiApiKey, etc.)
```

**Security Rules**: (PHẦN NÀY SUY LUẬN, CẦN XÁC NHẬN)
- Hiện tại code không có tham chiếu đến Firebase Security Rules
- Có thể đang dùng default rules (public read/write) hoặc được config trên Firebase Console

### 5.2. Google Gemini API Integration

**Service**: `services/geminiService.ts`

**Configuration:**
- API Key được lưu trong:
  1. Firebase Settings (`settings/geminiApiKey`) - Priority 1
  2. Environment variable (`VITE_GEMINI_API_KEY` hoặc `GEMINI_API_KEY`) - Priority 2
- Cache: 5 phút để tránh query Firebase liên tục

**Endpoints:**
- Model: `gemini-2.5-flash`
- Vision API: `generateContent()` với inline image data

**Rate Limiting:**
- Retry logic: 3 lần với exponential backoff (2s, 4s, 8s)
- Retryable errors: 503, 429, UNAVAILABLE, overloaded, rate limit

### 5.3. Excel Processing

**Library**: `xlsx` (0.18.5)

**Files:**
- `src/utils/excelParserUtils.ts` - Parse Excel → MerchantTransaction[]
- `src/utils/excelExportUtils.ts` - Export data → Excel file

**Features:**
- Auto-detect header row
- Auto-map columns (tìm keywords: "ma giao dich", "so tien", etc.)
- Handle Vietnamese number format (loại bỏ dấu chấm/phẩy)
- Support multi-sheet Excel files

### 5.4. Environment Variables

**File**: `.env` (không có trong repo, cần tạo)

**Variables:**
- `VITE_GEMINI_API_KEY` hoặc `GEMINI_API_KEY` - Gemini API key

**Vite Config**: `vite.config.ts`
- Define `process.env.GEMINI_API_KEY` để access trong code

### 5.5. Routing & Navigation

**Router**: React Router DOM 7.9.6

**Public Routes:**
- `/` - HomePage (chọn Agent/User)
- `/admin` - Admin login
- `/user/login` - User login
- `/user/register` - User register
- `/agent/login` - Agent login

**Protected Routes:**
- `/reconciliation` - Admin reconciliation
- `/admin/report` - Admin report
- `/agents`, `/merchants`, `/payouts`, etc. - Admin management
- `/user/*` - User interface (upbill, history, report)
- `/agent/*` - Agent interface (report, payment, reconciliation)

**Auth Storage:**
- Admin: `localStorage.getItem('mockAuth')`
- User: `localStorage.getItem('userAuth')`
- Agent: `localStorage.getItem('agentAuth')`

---

## 6. Ghi chú và Assumptions

### 6.1. Assumptions từ Code

1. **Password Storage**: Passwords được lưu plain text (không hash) - có thể là security risk
2. **Firebase Security Rules**: Không có trong code, cần xác nhận từ Firebase Console
3. **API Rate Limits**: Gemini API có rate limit, nhưng không rõ giới hạn cụ thể
4. **Concurrent OCR**: Giới hạn 5 requests đồng thời để tránh rate limit
5. **File Size Limit**: Bill images giới hạn 5MB (hardcoded trong UploadBill.tsx)

### 6.2. Known Limitations

1. **No Real-time Updates**: Report records không tự động update khi merchant transactions thay đổi (cần chạy lại đối soát)
2. **No Background Jobs**: Tất cả processing đều chạy trên client-side, không có background jobs
3. **No Transaction Logging**: Không có audit log cho các thao tác quan trọng (edit, delete, payment)
4. **No Email/SMS Notifications**: Không có notification khi payment được tạo/approved

---

## 7. Tài liệu Tham khảo

- Firebase Realtime Database Docs: https://firebase.google.com/docs/database
- Google Gemini API Docs: https://ai.google.dev/docs
- React Router Docs: https://reactrouter.com
- xlsx Library: https://docs.sheetjs.com

