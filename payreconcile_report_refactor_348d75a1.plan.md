---
name: PayReconcile Report Refactor
overview: Refactor PayReconcile app to add Report functionality for all roles (User, Agent, Admin), remove Agent reconciliation, update Admin reconciliation with pending bills panel, and implement unified report system with proper data models and permissions.
todos:
  - id: 1-db-types
    content: Tạo types cho ReportRecord và MerchantTransaction trong types.ts
    status: pending
  - id: 2-report-services
    content: Tạo src/lib/reportServices.ts với các functions CRUD cho report_records
    status: pending
  - id: 3-firebase-services-update
    content: Update src/lib/firebaseServices.ts để support merchant_transactions và report_records
    status: pending
  - id: 4-user-sidebar
    content: Update components/user/UserSidebar.tsx thêm menu item Báo cáo
    status: pending
  - id: 5-user-report
    content: Tạo components/user/UserReport.tsx với filter và bảng dữ liệu
    status: pending
  - id: 6-user-routes
    content: Update App.tsx và UserLayout.tsx thêm route /user/report
    status: pending
  - id: 7-agent-sidebar
    content: Update components/agent/AgentSidebar.tsx đổi Đối Soát thành Báo cáo
    status: pending
  - id: 8-agent-report
    content: Refactor AgentReconciliation.tsx thành AgentReport.tsx, xóa logic đối soát, chỉ hiển thị báo cáo
    status: pending
  - id: 9-agent-routes
    content: Update App.tsx routes từ /agent/reconciliation sang /agent/report
    status: pending
  - id: 10-pending-panel
    content: Tạo components/reconciliation/PendingBillsPanel.tsx hiển thị danh sách user có bills pending
    status: pending
  - id: 11-user-bills-modal
    content: Tạo components/reconciliation/UserBillsModal.tsx modal hiển thị chi tiết bills của user
    status: pending
  - id: 12-reconciliation-update
    content: "Update ReconciliationModule.tsx: thêm PendingBillsPanel, update logic đối soát để tạo report_records"
    status: pending
  - id: 13-admin-report
    content: Tạo components/AdminReport.tsx với đầy đủ filter và khả năng edit
    status: pending
  - id: 14-admin-sidebar
    content: Update components/Sidebar.tsx thêm menu item Báo cáo hoặc tab trong ReconciliationModule
    status: pending
  - id: 15-admin-routes
    content: Update App.tsx thêm route cho admin report
    status: pending
  - id: 16-shared-components
    content: Tạo components/shared/ReportTable.tsx và ReportFilters.tsx để dùng chung
    status: pending
  - id: 17-refactor-reports
    content: Refactor UserReport, AgentReport, AdminReport để dùng shared components
    status: pending
---

# PayReconcile Report System Refactor

## Tổng quan Flow dữ liệu

1. **User upload bill** → Lưu vào `user_bills` với `status: PENDING`, `agentId`, `agentCode`
2. **Admin xem pending bills** → Mini panel hiển thị danh sách user và số lượng bills đang chờ
3. **Admin upload file merchants Excel** → Parse và lưu vào `merchant_transactions` với `uploadSessionId`
4. **Admin trigger đối soát** → So khớp `user_bills` với `merchant_transactions` theo `transactionCode` (+ amount check)
5. **Tạo report records** → Lưu kết quả đối soát vào `report_records` (bảng mới), update `user_bills.status = "DONE"`
6. **Hiển thị báo cáo** → Admin/Agent/User xem `report_records` với filter theo quyền

## Database Schema Changes

### 1. Update `MerchantTransaction` type trong `types.ts`

Theo spec: `transactionDate` (ISO), `uploadSessionId`, `rawRowIndex`, `createdAt`. Bỏ `method`, `timestamp`, `sourceFile`.

### 2. Tạo type mới `ReportRecord` trong `types.ts`

```typescript
export type ReportStatus = 'MATCHED' | 'UNMATCHED' | 'ERROR';

export interface ReportRecord {
  id: string;
  // Snapshot từ user_bills
  userBillId: string;
  userId: string;
  agentId: string;
  agentCode: string;
  transactionCode: string;
  amount: number;
  paymentMethod: PaymentMethod;
  pointOfSaleName?: string;
  transactionDate: string;      // ISO
  userBillCreatedAt: string;    // ISO
  
  // Snapshot từ merchant_transactions (nếu match)
  merchantTransactionId?: string;
  merchantCode?: string;
  merchantAmount?: number;
  
  // Reconciliation result
  status: ReportStatus;
  errorMessage?: string;
  
  // Metadata
  reconciledAt: string;         // ISO
  reconciledBy: 'ADMIN';        // chỉ Admin
  reconciliationSessionId?: string;
  
  // Admin editable fields
  note?: string;
  isManuallyEdited?: boolean;
  editedFields?: string[];
  
  createdAt: string;            // ISO
}
```

## Component Structure

### 1. User Module - Thêm tab "Báo cáo"

**Files to modify:**

- `components/user/UserSidebar.tsx` - Thêm menu item "Báo cáo"
- `components/user/UserLayout.tsx` - Thêm route cho `/user/report`
- `App.tsx` - Thêm route mới
- `components/user/UserReport.tsx` - **NEW FILE** - Component hiển thị báo cáo cho user

**Features:**

- Filter theo thời gian (từ ngày - đến ngày)
- Filter theo trạng thái (MATCHED, UNMATCHED, ERROR)
- Hiển thị bảng dữ liệu với pagination
- Chỉ hiển thị records có `userId = current user`

### 2. Agent Module - Đổi "Đối Soát" thành "Báo cáo"

**Files to modify:**

- `components/agent/AgentSidebar.tsx` - Đổi label "Đối Soát" → "Báo cáo", path `/agent/reconciliation` → `/agent/report`
- `components/agent/AgentReconciliation.tsx` - **RENAME/REFACTOR** thành `AgentReport.tsx`
- `App.tsx` - Update route từ `/agent/reconciliation` → `/agent/report`
- `components/agent/AgentReconciliationHistory.tsx` - Có thể giữ lại hoặc merge vào AgentReport

**Changes:**

- Xóa toàn bộ logic upload file merchants
- Xóa logic "Bắt đầu đối soát"
- Chỉ hiển thị báo cáo với filter `agentCode = current agent code`
- Giữ nguyên UI style, chỉ thay đổi nội dung

### 3. Admin Module - Cập nhật Reconciliation & Thêm Báo cáo

**Files to modify:**

- `components/Sidebar.tsx` - Thêm menu item "Báo cáo" (hoặc thêm vào tab trong ReconciliationModule)
- `components/ReconciliationModule.tsx` - Thêm mini panel pending bills
- `components/AdminReport.tsx` - **NEW FILE** - Component báo cáo cho admin
- `App.tsx` - Thêm route `/reports` hoặc `/reconciliation/reports`

**ReconciliationModule changes:**

- Thêm collapsible panel hiển thị danh sách user có bills pending
- Panel có pagination
- Click vào user → mở modal hiển thị chi tiết bills của user đó
- Giữ nguyên phần upload file merchants và nút "Bắt đầu đối soát"

**AdminReport features:**

- Filter theo: thời gian, trạng thái, đại lý, người dùng
- Hiển thị 2 phần:

  1. **User Bills**: Bảng bills của users (có thể edit một số field)
  2. **Merchant Transactions**: Bảng giao dịch từ Excel merchants

- Admin có quyền edit: `amount`, `transactionCode`, `pointOfSaleName`, `note`
- Export Excel

### 4. Shared Report Component

**Files to create:**

- `components/shared/ReportTable.tsx` - Component bảng báo cáo dùng chung
- `components/shared/ReportFilters.tsx` - Component filter dùng chung
- `src/lib/reportServices.ts` - **NEW FILE** - Service layer cho report operations

**ReportTable features:**

- Hiển thị dữ liệu từ `report_records`
- Support pagination
- Support sorting
- Different columns based on role (Admin sees more, User sees less)

**ReportFilters features:**

- Date range picker
- Status dropdown
- Agent/User dropdown (chỉ admin)
- Reusable cho cả 3 roles

## Service Layer Changes

### 1. Tạo `src/lib/reportServices.ts`

**Functions:**

```typescript
export const ReportService = {
  // Tạo report record sau khi đối soát
  async createReportRecord(data: Omit<ReportRecord, 'id'>): Promise<string>
  
  // Lấy report records với filter
  async getReportRecords(filters: {
    userId?: string;
    agentId?: string;
    agentCode?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ReportRecord[]>
  
  // Update report record (chỉ admin)
  async updateReportRecord(recordId: string, updates: Partial<ReportRecord>): Promise<void>
  
  // Lấy stats cho dashboard
  async getReportStats(filters: {...}): Promise<{...}>
}
```

### 2. Update `src/lib/firebaseServices.ts`

- Thêm functions để lưu/đọc `merchant_transactions`
- Thêm functions để lưu/đọc `report_records`

### 3. Update `components/ReconciliationModule.tsx`

- Sau khi đối soát thành công, tạo `report_records` thay vì chỉ update `user_bills.status`
- Logic matching: So khớp `user_bills.transactionCode` với `merchant_transactions.transactionCode`
- Nếu khớp 1-1: tạo record với `status: MATCHED`
- Nếu duplicate hoặc không khớp: tạo record với `status: ERROR` hoặc `UNMATCHED`

## UI/UX Updates

### 1. User Report Tab

- Layout tương tự BillHistory nhưng hiển thị dữ liệu từ `report_records`
- Style giữ nguyên theo design hiện tại

### 2. Agent Report Tab  

- Layout tương tự VNPay Merchant View (ảnh 4)
- Filter section ở trên
- Bảng dữ liệu ở dưới với pagination
- Chỉ hiển thị records có `agentCode = current agent`

### 3. Admin Report Tab

- Tương tự Agent nhưng có thêm filter theo User
- Có nút Edit cho các field được phép chỉnh sửa
- Có nút Export Excel

### 4. Admin Reconciliation - Pending Bills Panel

**Component:** `components/reconciliation/PendingBillsPanel.tsx` (NEW)

**Features:**

- Collapsible panel (expand/collapse)
- Hiển thị danh sách user có bills pending
- Mỗi row: User name, số lượng bills pending, số lượng bills matched
- Pagination
- Click vào user → mở modal `components/reconciliation/UserBillsModal.tsx` (NEW)
- Modal hiển thị chi tiết bills của user, có thể filter theo date/session

## Implementation Order

1. **Phase 1: Database & Services**

   - Tạo types cho `ReportRecord` trong `types.ts`
   - Tạo `src/lib/reportServices.ts`
   - Update `src/lib/firebaseServices.ts` với merchant_transactions và report_records operations

2. **Phase 2: User Report Tab**

   - Update `UserSidebar.tsx`
   - Tạo `UserReport.tsx`
   - Update routes trong `App.tsx` và `UserLayout.tsx`

3. **Phase 3: Agent Report Tab**

   - Refactor `AgentReconciliation.tsx` → `AgentReport.tsx`
   - Update `AgentSidebar.tsx`
   - Update routes

4. **Phase 4: Admin Updates**

   - Tạo `PendingBillsPanel.tsx` và `UserBillsModal.tsx`
   - Update `ReconciliationModule.tsx` với panel và logic tạo report_records
   - Tạo `AdminReport.tsx`
   - Update `Sidebar.tsx` và routes

5. **Phase 5: Shared Components**

   - Tạo `ReportTable.tsx` và `ReportFilters.tsx`
   - Refactor các report components để dùng shared components

6. **Phase 6: Testing & Polish**

   - Test flow đầy đủ từ user upload → admin đối soát → xem báo cáo
   - Verify permissions cho từng role
   - UI/UX consistency check