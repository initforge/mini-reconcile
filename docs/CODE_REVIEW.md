# Code Review & Đề xuất Refactor

## 1. Vấn đề về Kiến trúc / Tổ chức Code

### 1.1. God Class / File quá dài

**Vấn đề:**

1. **`components/ReconciliationModule.tsx`** (2613 lines)
   - **Mô tả**: File quá dài, chứa quá nhiều logic và state
   - **Dấu hiệu**: 
     - Nhiều useState hooks (> 20 states)
     - Nhiều useEffect hooks
     - Nhiều handler functions (> 15 functions)
     - Kết hợp nhiều responsibilities: file upload, parsing, reconciliation, UI rendering
   - **Vị trí**: `components/ReconciliationModule.tsx`
   - **Đề xuất Refactor**:
     - Tách thành các components nhỏ:
       - `MerchantFileUpload.tsx` - Upload và parse Excel
       - `ReconciliationProcessor.tsx` - Logic đối soát
       - `ReconciliationResults.tsx` - Hiển thị kết quả
       - `ReconciliationHistory.tsx` - Lịch sử đối soát
     - Extract business logic vào custom hooks:
       - `useReconciliation()` - Reconciliation logic
       - `useMerchantFileUpload()` - File upload logic
       - `useReconciliationHistory()` - History management
     - Di chuyển matching algorithm vào service: `src/lib/reconciliationMatchingService.ts`

2. **`components/user/UploadBill.tsx`** (~700 lines)
   - **Mô tả**: Component quá dài, logic OCR phức tạp
   - **Vị trí**: `components/user/UploadBill.tsx`
   - **Đề xuất Refactor**:
     - Extract OCR logic vào custom hook: `useOCRProcessing()`
     - Tách UI thành sub-components:
       - `BillPreview.tsx` - Preview từng bill
       - `OCRStatusBadge.tsx` - Badge hiển thị trạng thái OCR
       - `BillUploadButton.tsx` - Button upload

3. **`components/Payouts.tsx`** (~1320 lines)
   - **Mô tả**: Component quá dài, nhiều tabs và logic
   - **Vị trí**: `components/Payouts.tsx`
   - **Đề xuất Refactor**:
     - Tách thành tab components:
       - `UnpaidTransactionsTab.tsx`
       - `PaymentBatchesTab.tsx`
     - Extract payment logic vào custom hook: `usePaymentManagement()`

---

### 1.2. Logic Business nằm trong Controller/Component

**Vấn đề:**

1. **Matching Algorithm trong Component**
   - **Mô tả**: Logic matching (transactionCode + pointOfSaleName + amount) nằm trong `ReconciliationModule.tsx`
   - **Vị trí**: `components/ReconciliationModule.tsx`, `handleProcess()`, lines ~1127-1250
   - **Code**: 
     ```typescript
     // Matching logic nằm trực tiếp trong component
     for (const bill of pendingBills) {
       const matchingMerchants = merchantTransactions.filter(...);
       // ... nested conditions ...
     }
     ```
   - **Đề xuất Refactor**:
     - Tạo service: `src/lib/reconciliationMatchingService.ts`
     - Extract function: `matchBillToMerchantTransaction(bill, merchantTransactions): MatchResult`
     - Testable, reusable logic

2. **Fee Calculation trong Component**
   - **Mô tả**: Logic tính phí chiết khấu nằm trong `Payouts.tsx`
   - **Vị trí**: `components/Payouts.tsx`, `handleCreateBatchFromReports()`
   - **Đề xuất Refactor**:
     - Tạo service: `src/lib/paymentCalculationService.ts`
     - Extract function: `calculateAgentFee(agent, pointOfSaleName, paymentMethod, amount): FeeResult`

---

### 1.3. Repository/Service lẫn lộn trách nhiệm

**Vấn đề:**

1. **`firebaseServices.ts` quá lớn**
   - **Mô tả**: File này chứa quá nhiều services (Merchants, Agents, Payments, Reconciliation, Dashboard, Settings, MerchantTransactions)
   - **Vị trí**: `src/lib/firebaseServices.ts` (1132 lines)
   - **Đề xuất Refactor**:
     - Tách thành các service files riêng:
       - `merchantsService.ts`
       - `agentsService.ts`
       - `paymentsService.ts`
       - `reconciliationService.ts`
       - `dashboardService.ts`
       - `settingsService.ts`
       - `merchantTransactionsService.ts`
     - Giữ lại `firebaseServices.ts` chỉ để export tất cả services (barrel export)

2. **Service vừa làm CRUD vừa có Business Logic**
   - **Vấn đề**: Services vừa làm data access (Firebase operations) vừa có business logic (matching, fee calculation)
   - **Ví dụ**: `PaymentsService.createPaymentFromReconciliation()` có logic tính phí
   - **Đề xuất Refactor**:
     - Tách thành 2 layers:
       - **Repository Layer**: Chỉ làm CRUD operations (Firebase access)
       - **Service Layer**: Chứa business logic, gọi repositories

---

### 1.4. Hard-code Config, String, Status

**Vấn đề:**

1. **Hard-code Status Strings**
   - **Vị trí**: Nhiều nơi trong code
   - **Ví dụ**: 
     ```typescript
     if (status === 'MATCHED') { ... }
     if (payment.status === 'PENDING') { ... }
     ```
   - **Đề xuất Refactor**:
     - Dùng constants từ `types.ts`:
       ```typescript
       import { TransactionStatus, PaymentStatus } from '../types';
       if (status === TransactionStatus.MATCHED) { ... }
       ```
     - Hoặc tạo constants file: `src/constants/statusConstants.ts`

2. **Hard-code Magic Numbers**
   - **Vị trí**: 
     - `components/user/UploadBill.tsx`: `ocrConcurrencyLimit = 5`, `file.size > 5 * 1024 * 1024`
     - `components/ReconciliationModule.tsx`: `Math.abs(...) > 0.01` (amount tolerance)
     - `services/geminiService.ts`: `timeout: 30000`, `maxRetries: 3`
   - **Đề xuất Refactor**:
     - Tạo config file: `src/config/appConfig.ts`
     ```typescript
     export const APP_CONFIG = {
       OCR: {
         CONCURRENCY_LIMIT: 5,
         TIMEOUT_MS: 30000,
         MAX_RETRIES: 3,
         RETRY_BASE_DELAY_MS: 2000
       },
       UPLOAD: {
         MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
         ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png']
       },
       RECONCILIATION: {
         AMOUNT_TOLERANCE: 0.01
       }
     };
     ```

3. **Hard-code Error Messages**
   - **Vị trí**: Nhiều nơi
   - **Ví dụ**: `'Không tìm thấy đại lý với mã: ${agentCode}'`
   - **Đề xuất Refactor**:
     - Tạo i18n system (nếu cần multi-language) hoặc constants file: `src/constants/messages.ts`

---

## 2. Vấn đề về Chất lượng Code

### 2.1. Function quá dài / Lồng nhau nhiều if/else

**Vấn đề:**

1. **`handleProcess()` trong ReconciliationModule.tsx**
   - **Độ dài**: ~250 lines
   - **Độ sâu lồng nhau**: 4-5 levels (if/else, for loops, nested conditions)
   - **Vị trí**: `components/ReconciliationModule.tsx`, lines ~1013-1255
   - **Vấn đề**: Khó đọc, khó test, khó maintain
   - **Đề xuất Refactor**:
     ```typescript
     // Tách thành các functions nhỏ
     const loadPendingBills = async () => { ... };
     const loadMerchantTransactions = async () => { ... };
     const matchBillsToTransactions = (bills, transactions) => { ... };
     const createReportRecords = async (matches) => { ... };
     const updateBillStatuses = async (matches) => { ... };
     
     const handleProcess = async () => {
       const bills = await loadPendingBills();
       const transactions = await loadMerchantTransactions();
       const matches = matchBillsToTransactions(bills, transactions);
       await createReportRecords(matches);
       await updateBillStatuses(matches);
     };
     ```

2. **`processOCR()` trong UploadBill.tsx**
   - **Độ dài**: ~80 lines
   - **Vấn đề**: Có nhiều nested try-catch, state updates
   - **Vị trí**: `components/user/UploadBill.tsx`, lines ~115-198
   - **Đề xuất Refactor**:
     - Extract OCR call vào service function
     - Extract state update logic vào separate functions

---

### 2.2. Trùng lặp Code (Duplicate Logic)

**Vấn đề:**

1. **Duplicate Matching Logic**
   - **Vị trí**: 
     - `components/ReconciliationModule.tsx::handleProcess()` (Admin reconciliation)
     - `components/agent/AgentReconciliation.tsx::reconcileWithFilteredBills()` (Agent reconciliation)
     - `src/lib/agentReconciliationServices.ts::reconcileAgentBills()` (Service)
   - **Vấn đề**: 3 nơi có logic matching tương tự nhau
   - **Đề xuất Refactor**:
     - Tạo shared service: `src/lib/reconciliationMatchingService.ts`
     - Function: `matchBillToMerchantTransaction(bill, merchantTransactions, options): MatchResult`

2. **Duplicate Firebase ObjectToArray Conversion**
   - **Vị trí**: Nhiều components
   - **Ví dụ**: 
     ```typescript
     const agents = FirebaseUtils.objectToArray(agentsData || {});
     const merchants = FirebaseUtils.objectToArray(merchantsData || {});
     ```
   - **Đề xuất Refactor**:
     - Tạo custom hook: `useFirebaseArray<T>(path)`
     ```typescript
     const agents = useFirebaseArray<Agent>('/agents');
     ```

3. **Duplicate Error Handling Pattern**
   - **Vị trí**: Nhiều async functions
   - **Pattern**: 
     ```typescript
     try {
       // ... logic
     } catch (error) {
       console.error('Error:', error);
       // Show error message
     }
     ```
   - **Đề xuất Refactor**:
     - Tạo error boundary component
     - Tạo utility: `handleAsyncError(fn, errorHandler)`

4. **Duplicate Clean undefined values**
   - **Vị trí**: 
     - `src/lib/firebaseServices.ts::MerchantTransactionsService.createBatch()` (line ~1039)
     - `src/lib/reportServices.ts::ReportService.createReportRecords()` (line ~57)
   - **Code**:
     ```typescript
     const cleanRecord: any = {};
     Object.keys(record).forEach(key => {
       const value = (record as any)[key];
       if (value !== undefined) {
         cleanRecord[key] = value;
       }
     });
     ```
   - **Đề xuất Refactor**:
     - Tạo utility function: `src/utils/firebaseUtils.ts`
     ```typescript
     export const removeUndefined = <T>(obj: T): Partial<T> => {
       const cleaned: any = {};
       Object.keys(obj as any).forEach(key => {
         const value = (obj as any)[key];
         if (value !== undefined) {
           cleaned[key] = value;
         }
       });
       return cleaned;
     };
     ```

---

### 2.3. Thiếu Type, Thiếu Validate Input

**Vấn đề:**

1. **Missing Type Guards**
   - **Vị trí**: Nhiều nơi cast `any` hoặc không validate types
   - **Ví dụ**: 
     ```typescript
     const agents = FirebaseUtils.objectToArray(agentsData || {});
     // Không validate agents có đúng type Agent không
     ```
   - **Đề xuất Refactor**:
     - Tạo type guards:
     ```typescript
     const isAgent = (obj: any): obj is Agent => {
       return obj && typeof obj.id === 'string' && typeof obj.name === 'string';
     };
     ```

2. **Missing Input Validation**
   - **Vị trí**: 
     - `components/user/UserRegister.tsx`: Phone validation chỉ check format, không check business rules
     - `components/ReconciliationModule.tsx`: Excel file validation không đầy đủ
   - **Đề xuất Refactor**:
     - Tạo validation schemas (dùng zod hoặc yup)
     ```typescript
     import { z } from 'zod';
     
     const PhoneSchema = z.string()
       .regex(/^[0-9xX]{10,11}$/, 'Phone must be 10-11 digits or contain x')
       .min(10)
       .max(11);
     ```

3. **Missing Return Types**
   - **Vị trí**: Nhiều functions không có explicit return type
   - **Ví dụ**: `const handleProcess = async () => { ... }`
   - **Đề xuất Refactor**:
     ```typescript
     const handleProcess = async (): Promise<void> => { ... };
     ```

---

### 2.4. Thiếu Handle Lỗi, Catch xong bỏ qua

**Vấn đề:**

1. **Silent Failures**
   - **Vị trí**: `components/ReconciliationModule.tsx`, line ~144
   ```typescript
   } catch (e) {
     console.warn(`⚠️ Không thể load records cho session ${session.id}:`, e);
     return session; // Return without records - user không biết có lỗi
   }
   ```
   - **Vấn đề**: Catch error nhưng không notify user
   - **Đề xuất Refactor**:
     - Show error toast/notification
     - Hoặc retry logic

2. **Console.error không đủ**
   - **Vị trí**: Nhiều nơi chỉ log error, không có recovery
   - **Ví dụ**: 
     ```typescript
     } catch (error) {
       console.error('Error loading unpaid reports:', error);
       // Không có fallback, không notify user
     }
     ```
   - **Đề xuất Refactor**:
     - Implement error logging service (Sentry, LogRocket, etc.)
     - Show user-friendly error messages
     - Implement retry logic cho network errors

---

## 3. Vấn đề Tiềm ẩn về Performance / Reliability

### 3.1. Loop nặng, Query trong vòng lặp, N+1 Query

**Vấn đề:**

1. **N+1 Query trong Reconciliation**
   - **Vị trí**: `components/ReconciliationModule.tsx`, `handleProcess()`
   - **Vấn đề**: 
     ```typescript
     // Load all bills
     const allBills = await get(ref(database, 'user_bills'));
     // Load all merchant transactions
     const allMerchants = await get(ref(database, 'merchant_transactions'));
     // Process in loop (OK, vì đã load tất cả)
     ```
   - **Status**: ✅ Hiện tại OK (load tất cả trước), nhưng có thể optimize với filtering
   - **Đề xuất**:
     - Nếu database lớn, nên filter ở Firebase query level:
     ```typescript
     // Firebase Realtime Database không support query filters tốt
     // Có thể migrate sang Firestore để có better query support
     ```

2. **Load tất cả data để filter client-side**
   - **Vị trí**: `src/lib/reportServices.ts::getReportRecords()`
   - **Vấn đề**: 
     ```typescript
     const snapshot = await get(ref(database, 'report_records')); // Load ALL
     let records = FirebaseUtils.objectToArray(snapshot.val() || {});
     // Filter client-side
     if (filters.userId) {
       records = records.filter(r => r.userId === filters.userId);
     }
     ```
   - **Impact**: Performance issue nếu có nhiều records
   - **Đề xuất**:
     - Firebase Realtime Database không support complex queries
     - Có thể migrate sang Firestore để có better query support
     - Hoặc implement server-side filtering (cần backend)

3. **Loop qua sessions để load records**
   - **Vị trí**: `components/ReconciliationModule.tsx`, `loadSessionHistory()`, line ~120
   ```typescript
   const historyWithRealStats = await Promise.all(sessions.map(async (session) => {
     const records = await ReconciliationService.getRecordsBySession(session.id);
     // ...
   }));
   ```
   - **Vấn đề**: N queries cho N sessions
   - **Status**: ⚠️ Có thể optimize nhưng hiện tại OK nếu số lượng sessions nhỏ
   - **Đề xuất**:
     - Batch load records: `getRecordsBySessionIds(sessionIds)`
     - Hoặc cache records trong component state

---

### 3.2. Gọi API/DB mà không có Timeout/Retry

**Vấn đề:**

1. **Firebase Operations không có Timeout**
   - **Vị trí**: Tất cả Firebase calls
   - **Vấn đề**: Nếu Firebase chậm hoặc không response, app sẽ hang
   - **Đề xuất**:
     - Wrap Firebase calls với timeout:
     ```typescript
     const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
       return Promise.race([
         promise,
         new Promise<T>((_, reject) => 
           setTimeout(() => reject(new Error('Timeout')), timeoutMs)
         )
       ]);
     };
     ```

2. **OCR có Retry nhưng Firebase không có**
   - **Vị trí**: `services/geminiService.ts` có retry, nhưng Firebase calls không có
   - **Đề xuất**:
     - Implement retry logic cho Firebase operations (network errors)

---

### 3.3. Không Log đủ Thông tin để Debug

**Vấn đề:**

1. **Console.log không structured**
   - **Vị trí**: Nhiều nơi dùng `console.log`, `console.error` không consistent
   - **Vấn đề**: Khó debug, không có log levels, không track được user actions
   - **Đề xuất**:
     - Tạo logging service:
     ```typescript
     // src/services/loggingService.ts
     export const logger = {
       info: (message: string, data?: any) => { ... },
       error: (message: string, error?: Error, data?: any) => { ... },
       warn: (message: string, data?: any) => { ... },
       debug: (message: string, data?: any) => { ... }
     };
     ```
     - Integrate với error tracking service (Sentry, LogRocket)

2. **Missing Request IDs / Correlation IDs**
   - **Vấn đề**: Không track được request flow từ user action → API call → database
   - **Đề xuất**:
     - Generate correlation ID cho mỗi user action
     - Log correlation ID trong tất cả logs

---

## 4. TODO/FIXME/Comment Cảnh báo trong Code

### 4.1. TODO: Get from auth context

**Location**: `src/lib/firebaseServices.ts`, line 383

**Code**:
```typescript
noteUpdatedBy: 'current_user' // TODO: Get from auth context
```

**Vấn đề**: Không track được user thực hiện action (edit, update records)

**Ý nghĩa**: Cần implement auth context để track user ID

**Độ ưu tiên**: **CAO** - Security và audit trail

**Đề xuất**:
- Tạo `AuthContext` với React Context API
- Provide user info to all components
- Update services để accept `userId` parameter

---

### 4.2. TODO: Implement Excel export

**Location**: `components/AdminReport.tsx`, line 159

**Code**:
```typescript
// TODO: Implement Excel export
```

**Vấn đề**: Admin report chưa có export Excel

**Ý nghĩa**: Feature chưa implement

**Độ ưu tiên**: **TRUNG BÌNH** - Nice to have

**Đề xuất**:
- Reuse `excelExportUtils.ts` đã có
- Tương tự như `ReconciliationModule::handleExportResults()`

---

### 4.3. TODO: Implement agent selection update

**Location**: `components/ReconciliationModule.tsx`, line 2285

**Code**:
```typescript
// TODO: Implement agent selection update
```

**Vấn đề**: Không rõ chức năng này là gì

**Ý nghĩa**: (CẦN XÁC NHẬN) Có thể là feature chưa implement

**Độ ưu tiên**: **THẤP** - Cần xác nhận với team

---

### 4.4. Warning: UNK_xxx transactionCode

**Location**: `components/ReconciliationModule.tsx`, line 587-589

**Code**:
```typescript
// Warn về UNK_xxx nhưng vẫn giữ lại để có thể xử lý sau
if (item.transactionCode.startsWith('UNK_')) {
  console.warn(`⚠️ Warning: transactionCode là UNK_xxx: "${item.transactionCode}" - Vẫn giữ lại để xử lý`);
}
```

**Vấn đề**: UNK_xxx là transactionCode được generate khi không tìm thấy (fallback)

**Ý nghĩa**: Có thể là data quality issue

**Độ ưu tiên**: **TRUNG BÌNH** - Cần investigate tại sao có UNK_xxx

**Đề xuất**:
- Track số lượng UNK_xxx trong reports
- Có thể cần improve OCR hoặc Excel parser

---

## 5. Ưu tiên Thực hiện

| Mức độ | Hạng mục | Ảnh hưởng | Khối lượng | Ghi chú |
|--------|----------|-----------|------------|---------|
| **CAO** | Implement Auth Context | Security, Audit Trail | Vừa | Track user actions, fix TODO ở firebaseServices.ts |
| **CAO** | Password Hashing | Security | Nhỏ | Hiện tại lưu plain text, security risk |
| **CAO** | Tách ReconciliationModule.tsx | Maintainability | Lớn | File quá dài (2613 lines), khó maintain |
| **CAO** | Extract Matching Algorithm | Code Reuse, Testability | Vừa | Duplicate logic ở 3 nơi, cần centralize |
| **TRUNG BÌNH** | Remove Undefined Utility | Code Reuse | Nhỏ | Duplicate logic remove undefined |
| **TRUNG BÌNH** | Firebase Services Split | Maintainability | Vừa | firebaseServices.ts quá lớn (1132 lines) |
| **TRUNG BÌNH** | Config Constants | Maintainability | Nhỏ | Hard-code magic numbers, strings |
| **TRUNG BÌNH** | Error Handling Improvement | User Experience | Vừa | Silent failures, missing error notifications |
| **TRUNG BÌNH** | Input Validation (Zod/Yup) | Data Quality | Vừa | Missing validation schemas |
| **TRUNG BÌNH** | Logging Service | Debugging | Nhỏ | Structured logging, error tracking |
| **THẤP** | Performance Optimization | Performance | Lớn | Firebase queries, có thể cần migrate Firestore |
| **THẤP** | Excel Export (Admin Report) | Feature | Nhỏ | TODO chưa implement |

---

## 6. Ghi chú Bổ sung

### 6.1. Cần Xác nhận với Team

1. **Firebase Security Rules**: Không có trong code, cần xác nhận rules trên Firebase Console
2. **Password Storage**: Có intentional lưu plain text không? (Security risk)
3. **UNK_xxx TransactionCodes**: Có expected behavior không? Có cần fix không?
4. **Performance Requirements**: Có giới hạn số lượng records không? Có cần optimize không?
5. **Multi-language Support**: Có cần i18n không? (hiện tại chỉ tiếng Việt)

### 6.2. Recommendations cho Tương lai

1. **Migrate to Firestore**: Firebase Realtime Database không support complex queries tốt, có thể migrate sang Firestore
2. **Backend API**: Hiện tại tất cả logic ở client-side, có thể cần backend để:
   - Better security (Firebase rules không đủ)
   - Background jobs (reconciliation, notifications)
   - Complex queries và aggregations
3. **Testing**: Thiếu unit tests và integration tests, nên implement
4. **Documentation**: Thiếu API documentation, nên tạo Swagger/OpenAPI docs nếu có backend

