# Danh sách Use Case / Business Flow chính

## Bảng Tổng hợp

| ID | Tên Use Case | Loại Entrypoint | Entry Point Cụ thể | File & Function Chính | Mô tả |
|----|--------------|-----------------|---------------------|----------------------|-------|
| 1 | User Upload Bill và OCR | Client UI | `/user/upbill?agents=AG_001` → Form upload ảnh | `components/user/UploadBill.tsx` → `handleFileSelect()` → `handleUpload()` | User chọn ảnh hóa đơn, hệ thống dùng OCR (Gemini) để trích xuất thông tin giao dịch và lưu vào `user_bills` |
| 2 | Admin Import Merchant Transactions | Client UI | `/reconciliation` (step 0) → Upload Excel | `components/ReconciliationModule.tsx` → `handleMerchantFileUpload()` | Admin upload file Excel từ merchant, parse và lưu vào `merchant_transactions` |
| 3 | Admin Đối soát (Reconciliation) | Client UI | `/reconciliation` (step 1) → Button "Xử lý đối soát" | `components/ReconciliationModule.tsx` → `handleProcess()` | Đối soát `user_bills` (PENDING) với `merchant_transactions` để tạo `report_records` (MATCHED/ERROR) |
| 4 | Agent Đối soát | Client UI | `/agent` → Agent Reconciliation tab → Button "Đối soát" | `components/agent/AgentReconciliation.tsx` → `reconcileWithFilteredBills()` | Agent đối soát bills của mình với merchant transactions |
| 5 | Admin Tạo Payment cho Agent | Client UI | `/payouts` → Select transactions → "Tạo thanh toán" | `components/Payouts.tsx` → `handleCreatePayment()` | Admin chọn các transactions đã khớp, tính phí chiết khấu, tạo payment record |
| 6 | Admin Tạo Payment Batch | Client UI | `/payouts` → Select payments → "Tạo đợt chi trả" | `components/Payouts.tsx` → `handleCreateBatch()` | Nhóm nhiều payments thành batch để export Excel và chi trả |
| 7 | Agent Thanh toán cho User | Client UI | `/agent/payment` → Select bills → "Đánh dấu đã thanh toán" | `components/agent/AgentPayments.tsx` → `handleMarkAsPaid()` | Agent đánh dấu bills đã thanh toán cho users, tạo `agent_payments_to_users` record |
| 8 | Xem Báo cáo Admin | Client UI | `/admin/report` | `components/AdminReport.tsx` → `useEffect()` load data | Admin xem báo cáo đối soát với filters (date, status, point of sale, agent) |
| 9 | Xem Báo cáo Agent | Client UI | `/agent/report` | `components/agent/AgentReport.tsx` → `useEffect()` load data | Agent xem báo cáo bills của mình với filters (date, status, point of sale, user) |
| 10 | Xem Báo cáo User | Client UI | `/user/report` | `components/user/UserReport.tsx` → `useEffect()` load data | User xem báo cáo bills của mình với filters (date, status, point of sale) |
| 11 | Admin Edit Report Record | Client UI | `/admin/report` → Click "Sửa" trên record | `components/shared/ReportTable.tsx` → `handleSaveEdit()` | Admin sửa thủ công các field: amount, transactionCode, pointOfSaleName, note |
| 12 | User Đăng ký | Client UI | `/user/register` → Form submit | `components/user/UserRegister.tsx` → `handleSubmit()` → `registerUser()` | User đăng ký tài khoản mới với phone, password, fullName, email |
| 13 | User Login | Client UI | `/user/login` → Form submit | `components/user/UserLogin.tsx` → `handleLogin()` → `loginUser()` | User đăng nhập với phone và password |
| 14 | Agent Login | Client UI | `/agent/login` → Form submit | `components/agent/AgentLogin.tsx` → `handleLogin()` → `loginAgent()` | Agent đăng nhập với contactPhone và password |
| 15 | Admin Login | Client UI | `/admin` → Form submit | `components/Login.tsx` → `handleLogin()` | Admin đăng nhập (mock auth với localStorage) |
| 16 | Admin Quản lý Agents | Client UI | `/agents` → CRUD operations | `components/Agents.tsx` → `handleCreate()`, `handleUpdate()`, `handleDelete()` | Admin tạo/sửa/xóa agents, cấu hình discount rates |
| 17 | Admin Quản lý Merchants | Client UI | `/merchants` → CRUD operations | `components/Merchants.tsx` → `handleCreate()`, `handleUpdate()`, `handleDelete()` | Admin tạo/sửa/xóa merchants (điểm bán), cấu hình admin accounts |
| 18 | Admin Quản lý Users (Personnel) | Client UI | `/personnel` → CRUD operations | `components/admin/PersonnelManagement.tsx` → CRUD handlers | Admin tạo/sửa/xóa admin users (personnel), phân quyền |
| 19 | Xóa User (Soft Delete / Cascade) | Client UI | `/personnel` → Click "Xóa" | `components/admin/PersonnelManagement.tsx` → `handleDeleteUser()` → `DeleteConfirmModal` | Admin xóa user với option: soft delete hoặc cascade delete (xóa cả related data) |
| 20 | Xóa Agent (Soft Delete / Cascade) | Client UI | `/agents` → Click "Xóa" | `components/Agents.tsx` → `handleDeleteAgent()` → `DeleteConfirmModal` | Admin xóa agent với option: soft delete hoặc cascade delete |
| 21 | Export Payment Batch Excel | Client UI | `/payouts` → Click "Xuất Excel" | `components/Payouts.tsx` → `handleExportBatch()` → `PaymentsService.exportBatch()` | Export payment batch ra Excel để admin chi trả |
| 22 | Export Reconciliation Results | Client UI | `/reconciliation` (step 2) → Button "Xuất kết quả" | `components/ReconciliationModule.tsx` → `handleExportResults()` → `ReconciliationService.exportReconciliationResult()` | Export kết quả đối soát ra Excel |
| 23 | User Xem Lịch sử Bills | Client UI | `/user/history` | `components/user/BillHistory.tsx` → `useEffect()` load data | User xem lịch sử bills đã upload, trạng thái đối soát |
| 24 | User Xem Trạng thái Thanh toán | Client UI | `/user/payment` | `components/user/PaymentStatus.tsx` → `useEffect()` load data | User xem trạng thái thanh toán từ agent (đã thanh toán/chưa thanh toán) |
| 25 | Agent Xem Chi tiết Đối soát | Client UI | `/agent/reconciliation/:sessionId` | `components/agent/AgentReconciliationDetail.tsx` → Load session details | Agent xem chi tiết kết quả đối soát của một session |

---

## Chi tiết một số Use Case quan trọng

### Use Case 1: User Upload Bill và OCR

**Entry Point**: Route `/user/upbill?agents=AG_001`

**Flow:**
1. User chọn ảnh → `handleFileSelect()` → Validate file → Tạo preview
2. Auto-trigger OCR → `processOCR(index)` → Convert to Base64 → Call Gemini API
3. User click "Upload" → `handleUpload()` → Convert to UserBill → Save to Firebase
4. Database: `user_bills/{id}` với status = `PENDING`

**Key Functions:**
- `components/user/UploadBill.tsx::handleFileSelect()`
- `components/user/UploadBill.tsx::processOCR()`
- `services/geminiService.ts::extractTransactionFromImage()`
- `src/lib/userServices.ts::UserService.createUserBill()`

---

### Use Case 3: Admin Đối soát

**Entry Point**: Button "Xử lý đối soát" trong `/reconciliation` (step 1)

**Flow:**
1. Load pending bills: `user_bills` với `status === 'PENDING'`
2. Load merchant transactions: `merchant_transactions`
3. Matching algorithm: Match theo transactionCode + pointOfSaleName + amount
4. Create report records: `report_records/{id}` với status MATCHED/ERROR
5. Update user bills: `user_bills/{id}/status` = MATCHED/ERROR

**Key Functions:**
- `components/ReconciliationModule.tsx::handleProcess()`
- `src/lib/reportServices.ts::ReportService.createReportRecords()`

**Matching Logic:**
- 1 merchant match + amount khớp → MATCHED
- 0 match → ERROR (missing in merchant)
- > 1 match → ERROR (duplicate)
- Amount mismatch → ERROR (amount mismatch)

---

### Use Case 5: Admin Tạo Payment cho Agent

**Entry Point**: Button "Tạo thanh toán" trong `/payouts`

**Flow:**
1. Load unpaid transactions: `report_records` với `status === 'MATCHED' && !paymentId`
2. Admin chọn transactions → Group theo agent
3. Tính phí chiết khấu: Dựa trên `discountRatesByPointOfSale[pointOfSaleName][paymentMethod]`
4. Tạo payment: `payments/{id}` với `status = 'PENDING'`
5. Update report records: `report_records/{id}/paymentId` = payment.id

**Key Functions:**
- `components/Payouts.tsx::handleCreatePayment()`
- `src/lib/firebaseServices.ts::PaymentsService.createPaymentFromReconciliation()`

**Fee Calculation:**
- `feeAmount = amount * (feePercentage / 100)`
- `netAmount = amount - feeAmount`

---

## Phân loại theo Entry Point

### Client UI (Browser)
Tất cả use cases đều là client-side UI actions (không có REST API endpoints)

### Job / Scheduler
**KHÔNG CÓ** - Tất cả processing đều chạy real-time trên client

### Message Consumer
**KHÔNG CÓ** - Không có message queue

### CLI
**KHÔNG CÓ** - Không có CLI commands

---

## Ghi chú

- Tất cả use cases đều được trigger từ UI (button clicks, form submissions)
- Không có background jobs hay scheduled tasks
- Database operations đều synchronous (await Firebase calls)
- OCR processing là async nhưng vẫn chạy trên client-side

