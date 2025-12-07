# Luồng Nghiệp vụ Chi tiết: User Upload Bill và Đối soát

## 1. Tên Use Case

**Upload Bill và Đối soát Giao dịch Thanh toán**

Mô tả: User upload ảnh hóa đơn thanh toán (VNPay, PhonePOS, App Bank), hệ thống dùng OCR để trích xuất thông tin, lưu vào database. Admin sau đó đối soát với dữ liệu merchant từ Excel để tạo báo cáo.

---

## 2. Điểm vào (Entry Point)

### 2.1. User Upload Bill

**Route**: `/user/upbill?agents=AG_001`

**Method**: Client-side form submission (không phải HTTP API)

**Component**: `components/user/UploadBill.tsx`

**Function bắt đầu**: `handleFileSelect()` → Auto-trigger OCR → `handleUpload()`

### 2.2. Admin Đối soát

**Route**: `/reconciliation` (step 1)

**Method**: Client-side button click

**Component**: `components/ReconciliationModule.tsx`

**Function bắt đầu**: `handleProcess()`

---

## 3. Luồng Xử lý Chi tiết

### 3.1. Phase 1: User Upload Bill

#### Step 1: User chọn ảnh

**File**: `components/user/UploadBill.tsx`

**Function**: `handleFileSelect(e: React.ChangeEvent<HTMLInputElement>)`

**Chi tiết:**
1. User chọn file từ `<input type="file" multiple />`
2. Validate files:
   - File type: `file.type.startsWith('image/')`
   - File size: `file.size <= 5 * 1024 * 1024` (5MB)
3. Tạo Object URL cho preview: `URL.createObjectURL(file)`
4. Tạo `BillPreview` object:
   ```typescript
   {
     file: File,
     preview: objectUrl,
     objectUrl: objectUrl,
     ocrStatus: 'idle'
   }
   ```
5. Update state: `setBillPreviews([...prev, ...newPreviews])`

**Điều kiện rẽ nhánh:**
- Nếu file không hợp lệ → Show error message, không thêm vào preview
- Nếu hợp lệ → Thêm vào `billPreviews`

---

#### Step 2: Auto-trigger OCR

**File**: `components/user/UploadBill.tsx`

**Function**: `useEffect(() => {...}, [billPreviews.length, selectedAgent])`

**Chi tiết:**
1. Watch `billPreviews` để phát hiện items có `ocrStatus === 'idle'`
2. Filter items: `preview.ocrStatus === 'idle' && !processingIndicesRef.current.has(index)`
3. Process với concurrency limit = 5:
   ```typescript
   for (let i = 0; i < idleIndices.length; i += 5) {
     const batch = idleIndices.slice(i, i + 5);
     batch.forEach((index) => {
       setTimeout(() => processOCR(index), delay);
     });
   }
   ```
4. Mark indices đang processing: `processingIndicesRef.current.add(index)`

**Điều kiện:**
- Chỉ process nếu `selectedAgent` đã load
- Stagger requests (delay 100ms mỗi item) để tránh rate limit

---

#### Step 3: OCR Processing

**File**: `components/user/UploadBill.tsx`

**Function**: `processOCR(index: number)`

**Chi tiết:**
1. Update status: `ocrStatus: 'processing'`
2. Get preview data: `const preview = billPreviews[index]`
3. Convert Object URL → Base64:
   ```typescript
   const response = await fetch(preview.preview);
   const blob = await response.blob();
   const base64Data = await new Promise<string>((resolve) => {
     const reader = new FileReader();
     reader.onload = (e) => resolve(e.target?.result as string);
     reader.readAsDataURL(blob);
   });
   ```
4. Call OCR với timeout 30s:
   ```typescript
   const ocrPromise = extractTransactionFromImage(base64Data, selectedAgent.id);
   const timeoutPromise = new Promise((_, reject) => 
     setTimeout(() => reject(new Error('OCR timeout')), 30000)
   );
   const extracted = await Promise.race([ocrPromise, timeoutPromise]);
   ```
5. Update state với OCR result:
   ```typescript
   {
     ocrStatus: 'done',
     ocrResult: {
       transactionCode: extracted.transactionCode,
       amount: extracted.amount,
       paymentMethod: extracted.paymentMethod,
       pointOfSaleName: extracted.pointOfSaleName,
       timestamp: extracted.timestamp,
       invoiceNumber: extracted.invoiceNumber
     }
   }
   ```

**Error Handling:**
- Nếu OCR fail → `ocrStatus: 'error'`, `ocrError: error.message`
- User có thể retry bằng `retryOCR(index)`

---

#### Step 4: OCR Service (Gemini API)

**File**: `services/geminiService.ts`

**Function**: `extractTransactionFromImage(imageBase64: string, agentId: string)`

**Chi tiết:**
1. Get API Key (priority: Firebase Settings → Env var)
2. Remove data URL prefix: `base64Data = imageBase64.split(',')[1]`
3. Call Gemini API với retry logic (3 lần, exponential backoff):
   ```typescript
   const ai = new GoogleGenAI({ apiKey: API_KEY });
   const response = await ai.models.generateContent({
     model: 'gemini-2.5-flash',
     contents: [
       {
         role: 'user',
         parts: [
           { text: prompt },  // Long prompt mô tả các loại bill
           {
             inlineData: {
               mimeType: 'image/jpeg',
               data: base64Data
             }
           }
         ]
       }
     ]
   });
   ```
4. Parse JSON từ response:
   ```typescript
   const jsonMatch = responseText.match(/\{[\s\S]*\}/);
   const extracted = JSON.parse(jsonMatch[0]);
   ```
5. Validate required fields:
   - `transactionCode` (required)
   - `amount` (required, > 0)
   - `paymentMethod` (required, must be one of: "QR 1 (VNPay)", "POS", "QR 2 (App Bank)", "Sofpos")
6. Parse amount: Remove dots/commas, convert to number
7. Parse timestamp: Validate ISO format, fallback to current time
8. Clean pointOfSaleName: Remove prefixes like "điểm bán", trim
9. Return `AgentSubmission` object

**Retry Logic:**
- Max retries: 3
- Base delay: 2s → 4s → 8s
- Retryable errors: 503, 429, UNAVAILABLE, overloaded, rate limit

---

#### Step 5: User Click Upload

**File**: `components/user/UploadBill.tsx`

**Function**: `handleUpload()`

**Chi tiết:**
1. Filter bills ready to upload:
   ```typescript
   const readyBills = billPreviews.filter(p => p.ocrStatus === 'done' && p.ocrResult);
   ```
2. Validate:
   - Nếu `readyBills.length === 0` → Show error
   - Nếu có bills đang processing → Show warning
3. Generate `uploadSessionId`: `Date.now().toString()`
4. Convert bills → UserBill objects:
   ```typescript
   const billsToUpload: Omit<UserBill, 'id'>[] = readyBills.map(preview => ({
     userId: userId,
     agentId: selectedAgent.id,
     agentCode: selectedAgent.code,
     transactionCode: preview.ocrResult.transactionCode,
     amount: preview.ocrResult.amount,
     paymentMethod: preview.ocrResult.paymentMethod,
     pointOfSaleName: preview.ocrResult.pointOfSaleName,
     imageUrl: preview.preview,  // Base64
     timestamp: preview.ocrResult.timestamp,
     invoiceNumber: preview.ocrResult.invoiceNumber,
     status: 'PENDING',
     isPaidByAgent: false,
     uploadSessionId: uploadSessionId,
     createdAt: new Date().toISOString()
   }));
   ```
5. Upload từng bill:
   ```typescript
   for (const bill of billsToUpload) {
     await UserService.createUserBill(bill);
     setUploadProgress({ total: billsToUpload.length, completed: completed + 1 });
   }
   ```
6. Cleanup: Remove uploaded bills từ `billPreviews`, revoke Object URLs
7. Show success message

---

#### Step 6: Save to Database

**File**: `src/lib/userServices.ts`

**Function**: `UserService.createUserBill(bill: Omit<UserBill, 'id'>)`

**Chi tiết:**
1. Prepare bill data:
   ```typescript
   const newBill: Omit<UserBill, 'id'> = {
     ...bill,
     createdAt: FirebaseUtils.getServerTimestamp()
   };
   ```
2. Push to Firebase:
   ```typescript
   const newRef = await push(ref(database, 'user_bills'), newBill);
   return newRef.key!;
   ```

**Database Path**: `user_bills/{auto-generated-id}`

**Data Structure:**
```json
{
  "userId": "user_123",
  "agentId": "agent_456",
  "agentCode": "AG_001",
  "transactionCode": "20436098128882688",
  "amount": 268000,
  "paymentMethod": "QR 1 (VNPay)",
  "pointOfSaleName": "ANCATTUONG66PKV01",
  "imageUrl": "data:image/jpeg;base64,...",
  "timestamp": "2025-11-18T10:28:00.000Z",
  "invoiceNumber": "MUA1",
  "status": "PENDING",
  "isPaidByAgent": false,
  "uploadSessionId": "1734518400000",
  "createdAt": "2025-11-18T10:30:00.000Z"
}
```

---

### 3.2. Phase 2: Admin Đối soát

#### Step 7: Admin Upload Merchant Transactions

**File**: `components/ReconciliationModule.tsx`

**Function**: `handleMerchantFileUpload()`

**Chi tiết:**
1. Admin chọn file Excel
2. Parse Excel:
   ```typescript
   const transactions = await parseExcel(file);
   ```
3. Validate merchant code (check trong `merchants` table)
4. Save to database:
   ```typescript
   const uploadSessionId = Date.now().toString();
   await MerchantTransactionsService.createBatch(
     transactions.map(t => ({ ...t, uploadSessionId }))
   );
   ```

**Database Path**: `merchant_transactions/{auto-generated-id}`

---

#### Step 8: Admin Click "Xử lý đối soát"

**File**: `components/ReconciliationModule.tsx`

**Function**: `handleProcess()`

**Chi tiết:**

**Step 8.1: Load Pending Bills**
```typescript
const snapshot = await get(ref(database, 'user_bills'));
const allBills = FirebaseUtils.objectToArray<UserBill>(snapshot.val() || {});
const pendingBills = allBills.filter(bill => bill.status === 'PENDING');
```

**Database Query**: `GET /user_bills` → Filter `status === 'PENDING'`

**Step 8.2: Load Merchant Transactions**
```typescript
const merchantSnapshot = await get(ref(database, 'merchant_transactions'));
const merchantTransactions = FirebaseUtils.objectToArray<MerchantTransaction>(
  merchantSnapshot.val() || {}
);
```

**Database Query**: `GET /merchant_transactions`

**Step 8.3: Matching Algorithm**

Vòng lặp qua từng `pendingBill`:

```typescript
for (const bill of pendingBills) {
  // 1. Tìm merchant transactions có cùng transactionCode
  const matchingMerchants = merchantTransactions.filter(
    mt => mt.transactionCode === bill.transactionCode
  );
  
  // 2. Filter theo pointOfSaleName (nếu bill có)
  let filteredMerchants = matchingMerchants;
  if (bill.pointOfSaleName) {
    filteredMerchants = matchingMerchants.filter(mt =>
      mt.pointOfSaleName &&
      (mt.pointOfSaleName === bill.pointOfSaleName ||
       normalize(mt.pointOfSaleName) === normalize(bill.pointOfSaleName))
    );
  }
  
  // 3. Xác định status
  let status: ReportStatus;
  let errorMessage: string | undefined;
  let merchantTransactionId: string | undefined;
  
  if (filteredMerchants.length === 0) {
    status = 'ERROR';
    errorMessage = 'No matching merchant transaction';
  } else if (filteredMerchants.length > 1) {
    status = 'ERROR';
    errorMessage = 'Duplicate merchant transaction code';
  } else {
    // Exactly one match
    const merchant = filteredMerchants[0];
    const merchantAmountToCheck = merchant.amountBeforeDiscount || merchant.amount;
    const billAmountToCheck = bill.amount;
    
    if (Math.abs(merchantAmountToCheck - billAmountToCheck) > 0.01) {
      status = 'ERROR';
      errorMessage = 'Amount mismatch';
    } else {
      status = 'MATCHED';
      merchantTransactionId = merchant.id;
    }
  }
  
  // 4. Tạo report record
  const reportRecord: Omit<ReportRecord, 'id' | 'createdAt'> = {
    userBillId: bill.id,
    userId: bill.userId,
    agentId: bill.agentId,
    agentCode: bill.agentCode,
    transactionCode: bill.transactionCode,
    amount: bill.amount,
    paymentMethod: bill.paymentMethod,
    pointOfSaleName: bill.pointOfSaleName,
    transactionDate: bill.timestamp,
    userBillCreatedAt: bill.createdAt,
    invoiceNumber: bill.invoiceNumber,
    
    merchantTransactionId: merchantTransactionId,
    merchantCode: merchantTransactionId ? merchant.merchantCode : undefined,
    merchantAmount: merchantTransactionId ? merchant.amount : undefined,
    merchantAmountBeforeDiscount: merchantTransactionId ? merchant.amountBeforeDiscount : undefined,
    merchantPointOfSaleName: merchantTransactionId ? merchant.pointOfSaleName : undefined,
    
    status: status,
    errorMessage: status === 'ERROR' ? errorMessage : undefined,
    reconciledAt: new Date().toISOString(),
    reconciledBy: 'ADMIN'
  };
  
  reportRecords.push(reportRecord);
}
```

**Điều kiện rẽ nhánh:**
- **MATCHED**: Có 1 merchant transaction khớp cả 3 điều kiện (transactionCode, pointOfSaleName, amount)
- **ERROR**: 
  - Không tìm thấy merchant transaction
  - Có > 1 merchant transaction duplicate
  - Amount mismatch (> 0.01 VND)

**Step 8.4: Save Report Records**

```typescript
await ReportService.createReportRecords(reportRecords);
```

**File**: `src/lib/reportServices.ts`

**Function**: `ReportService.createReportRecords(records[])`

**Chi tiết:**
1. Remove undefined values (Firebase không cho phép):
   ```typescript
   const cleanRecord: any = {};
   Object.keys(record).forEach(key => {
     const value = (record as any)[key];
     if (value !== undefined) {
       cleanRecord[key] = value;
     }
   });
   ```
2. Push từng record:
   ```typescript
   const newRecord: Omit<ReportRecord, 'id'> = {
     ...cleanRecord,
     createdAt: FirebaseUtils.getServerTimestamp()
   };
   const newRef = await push(ref(database, 'report_records'), newRecord);
   ```

**Database Path**: `report_records/{auto-generated-id}`

**Step 8.5: Update User Bills Status**

```typescript
const updates: any = {};
reportRecords.forEach(record => {
  updates[`user_bills/${record.userBillId}/status`] = 
    record.status === 'MATCHED' ? 'MATCHED' : 'ERROR';
  if (record.status === 'ERROR' && record.errorMessage) {
    updates[`user_bills/${record.userBillId}/errorMessage`] = record.errorMessage;
  }
});
await update(ref(database), updates);
```

**Database Query**: `UPDATE /user_bills/{id}/status`

---

## 4. Dữ liệu Đầu vào & Đầu ra

### 4.1. Input

**User Upload:**
- **File**: Image file (JPEG, PNG) ≤ 5MB
- **Query Params**: `agents=AG_001` (agent code)

**Admin Reconciliation:**
- **Merchant Transactions**: Array of `MerchantTransaction` từ Excel
- **Pending Bills**: Tất cả `user_bills` có `status === 'PENDING'`

### 4.2. Output

**OCR Result:**
```typescript
{
  transactionCode: string;      // "20436098128882688"
  amount: number;               // 268000
  paymentMethod: PaymentMethod; // "QR 1 (VNPay)" | "POS" | "QR 2 (App Bank)" | "Sofpos"
  pointOfSaleName?: string;     // "ANCATTUONG66PKV01"
  invoiceNumber?: string;       // "MUA1"
  timestamp: string;            // ISO string
}
```

**UserBill (sau upload):**
```typescript
{
  id: string;
  userId: string;
  agentId: string;
  agentCode: string;
  transactionCode: string;
  amount: number;
  paymentMethod: PaymentMethod;
  pointOfSaleName?: string;
  imageUrl: string;             // Base64
  timestamp: string;
  invoiceNumber?: string;
  status: 'PENDING';
  isPaidByAgent: false;
  uploadSessionId: string;
  createdAt: string;
}
```

**ReportRecord (sau đối soát):**
```typescript
{
  id: string;
  userBillId: string;
  userId: string;
  agentId: string;
  agentCode: string;
  transactionCode: string;
  amount: number;
  paymentMethod: PaymentMethod;
  pointOfSaleName?: string;
  transactionDate: string;
  userBillCreatedAt: string;
  invoiceNumber?: string;
  
  merchantTransactionId?: string;
  merchantCode?: string;
  merchantAmount?: number;
  merchantAmountBeforeDiscount?: number;
  merchantPointOfSaleName?: string;
  
  status: 'MATCHED' | 'UNMATCHED' | 'ERROR';
  errorMessage?: string;
  reconciledAt: string;
  reconciledBy: 'ADMIN';
  createdAt: string;
}
```

---

## 5. Xử lý Lỗi & Edge Case

### 5.1. OCR Errors

**Error Types:**
1. **API Key not configured**
   - Error: `"API Key chưa được cấu hình"`
   - Handle: Show error message, disable OCR button
   - Retry: User phải config API key

2. **OCR Timeout (30s)**
   - Error: `"OCR timeout sau 30 giây"`
   - Handle: Set `ocrStatus: 'error'`, show retry button
   - Retry: User click retry → `retryOCR(index)`

3. **Invalid JSON Response**
   - Error: `"Không thể parse JSON từ response"`
   - Handle: Log full response, set error status
   - Retry: Auto-retry 3 lần (trong `retryWithBackoff`)

4. **Missing Required Fields**
   - Error: `"Thiếu thông tin bắt buộc: transactionCode/amount/paymentMethod"`
   - Handle: Set `ocrStatus: 'error'`, show error message
   - Retry: User click retry

5. **Invalid Payment Method**
   - Error: `"Loại bill không hợp lệ: {paymentMethod}"`
   - Handle: Reject, require manual correction
   - Retry: Không tự động retry (cần manual fix)

**Retry Logic:**
- Max retries: 3
- Exponential backoff: 2s → 4s → 8s
- Retryable errors: 503, 429, UNAVAILABLE, overloaded, rate limit

### 5.2. Upload Errors

**Error Types:**
1. **No bills ready to upload**
   - Condition: `readyBills.length === 0`
   - Handle: Show error: "Không có bill nào hợp lệ để upload"
   - Resolution: User cần đợi OCR hoàn tất hoặc retry failed bills

2. **Bills still processing**
   - Condition: `processingBills.length > 0`
   - Handle: Show warning: "Vui lòng đợi OCR hoàn tất cho tất cả ảnh"
   - Resolution: Đợi OCR hoàn tất

3. **Firebase write error**
   - Error: Permission denied, network error, etc.
   - Handle: Show error message, rollback (không update `billPreviews`)
   - Retry: User phải upload lại

### 5.3. Reconciliation Errors

**Error Types:**
1. **No matching merchant transaction**
   - Status: `ERROR`
   - ErrorMessage: `"No matching merchant transaction"`
   - Cause: Merchant transaction chưa được upload hoặc transactionCode không khớp
   - Resolution: Admin cần upload merchant transactions hoặc kiểm tra transactionCode

2. **Duplicate merchant transaction**
   - Status: `ERROR`
   - ErrorMessage: `"Duplicate merchant transaction code"`
   - Cause: Có > 1 merchant transaction cùng transactionCode và pointOfSaleName
   - Resolution: Admin cần kiểm tra và xóa duplicate

3. **Amount mismatch**
   - Status: `ERROR`
   - ErrorMessage: `"Amount mismatch"`
   - Cause: `amountBeforeDiscount` (merchant) ≠ `amount` (bill) với tolerance > 0.01 VND
   - Resolution: Admin có thể edit report record để sửa

4. **Point of sale mismatch**
   - Status: `ERROR`
   - ErrorMessage: `"Point of sale mismatch"`
   - Cause: Merchant transaction có pointOfSaleName khác với bill
   - Resolution: Admin có thể edit report record để sửa pointOfSaleName

**Error Handling trong Code:**
- Tất cả errors được catch và log vào console
- Errors được hiển thị trong UI (error badges, error messages)
- Admin có thể edit report records để fix errors manually

### 5.4. Edge Cases

**1. Multiple bills với cùng transactionCode**
- **Situation**: User upload 2 bills có cùng transactionCode
- **Current Behavior**: Cả 2 bills đều được lưu với status PENDING
- **Reconciliation**: Cả 2 bills sẽ match với cùng 1 merchant transaction (nếu có) → Có thể gây duplicate
- **Issue**: Không có validation để prevent duplicate bills từ cùng user
- **Recommendation**: (PHẦN NÀY SUY LUẬN) Có thể check duplicate khi upload: same userId + same transactionCode + same timestamp (trong 1 ngày)

**2. OCR không tìm thấy pointOfSaleName**
- **Situation**: OCR không extract được pointOfSaleName từ ảnh
- **Current Behavior**: `pointOfSaleName = undefined`, bill vẫn được lưu
- **Reconciliation**: Matching sẽ không filter theo pointOfSaleName (chỉ match transactionCode)
- **Issue**: Có thể match sai nếu có nhiều merchant transactions cùng transactionCode nhưng khác pointOfSaleName
- **Recommendation**: (PHẦN NÀY SUY LUẬN) Admin có thể manually assign pointOfSaleName trước khi đối soát

**3. Merchant transaction không có amountBeforeDiscount**
- **Situation**: Excel không có cột "Số tiền trước KM"
- **Current Behavior**: Fallback về `amount` (số tiền sau KM)
- **Issue**: Có thể mismatch nếu bill có promotion
- **Recommendation**: (PHẦN NÀY SUY LUẬN) Yêu cầu merchant cung cấp cả 2 cột (trước/sau KM)

**4. Concurrent OCR requests**
- **Situation**: User upload 10 ảnh cùng lúc
- **Current Behavior**: Process 5 ảnh cùng lúc (concurrency limit), các ảnh còn lại đợi
- **Risk**: Có thể hit rate limit của Gemini API
- **Recommendation**: (PHẦN NÀY SUY LUẬN) Có thể tăng limit hoặc implement queue với rate limiting

---

## 6. Ghi chú cho Người đọc

### 6.1. Code Phức tạp / Khó hiểu

**1. OCR Concurrent Processing**
- **Location**: `components/user/UploadBill.tsx`, `useEffect` hook
- **Complexity**: Dùng `useRef` để track processing indices, stagger requests với `setTimeout`
- **Reason**: Cần tránh duplicate processing và rate limiting
- **Note**: Logic này khá phức tạp, nên refactor thành custom hook `useOCRProcessing`

**2. Matching Algorithm**
- **Location**: `components/ReconciliationModule.tsx`, `handleProcess()`
- **Complexity**: Nested conditions, nhiều edge cases
- **Reason**: Cần handle nhiều trường hợp (no match, duplicate, amount mismatch, point of sale mismatch)
- **Note**: Có thể extract thành service `ReconciliationMatchingService.matchBill()`

**3. Excel Parser (Auto-detect Header)**
- **Location**: `src/utils/excelParserUtils.ts`, `parseExcel()`
- **Complexity**: Tìm header row bằng keywords, map columns động
- **Reason**: Excel files có thể có format khác nhau
- **Note**: Logic này dễ break nếu format Excel thay đổi, nên có validation

### 6.2. Assumptions từ Code

**1. Password không hash**
- **Location**: `src/lib/authServices.ts`
- **Assumption**: Passwords được lưu plain text trong database
- **Risk**: Security risk nếu database bị leak
- **Note**: (ĐOÁN) Có thể đây là temporary solution, nên implement password hashing

**2. Firebase Security Rules**
- **Location**: Không có trong code
- **Assumption**: Security rules được config trên Firebase Console
- **Risk**: Nếu rules không đúng, có thể bị unauthorized access
- **Note**: (CẦN XÁC NHẬN) Cần check Firebase Console để xác nhận rules

**3. OCR Rate Limit**
- **Location**: `services/geminiService.ts`
- **Assumption**: Concurrency limit = 5 là đủ để tránh rate limit
- **Risk**: Vẫn có thể hit rate limit nếu nhiều users upload cùng lúc
- **Note**: (ĐOÁN) Không rõ rate limit cụ thể của Gemini API, cần test

**4. Amount Tolerance**
- **Location**: `components/ReconciliationModule.tsx`, line ~1159
- **Assumption**: Tolerance = 0.01 VND là đủ để handle floating point errors
- **Note**: (ĐOÁN) Có thể cần adjust nếu có vấn đề với rounding

### 6.3. Known Issues (từ TODO/FIXME)

**1. Auth Context**
- **Location**: `src/lib/firebaseServices.ts`, line 383
- **TODO**: `noteUpdatedBy: 'current_user' // TODO: Get from auth context`
- **Issue**: Không có auth context để track user thực hiện action
- **Impact**: Không biết ai edit/update records

**2. Excel Export (Admin Report)**
- **Location**: `components/AdminReport.tsx`, line 159
- **TODO**: `// TODO: Implement Excel export`
- **Issue**: Admin report chưa có export Excel
- **Impact**: Không thể export báo cáo

**3. Agent Selection Update**
- **Location**: `components/ReconciliationModule.tsx`, line 2285
- **TODO**: `// TODO: Implement agent selection update`
- **Issue**: Không rõ chức năng này là gì
- **Note**: (CẦN XÁC NHẬN) Có thể là feature chưa implement

---

## 7. Tóm tắt Luồng

```
User Upload:
1. Chọn ảnh → Validate → Tạo preview
2. Auto-trigger OCR (limit 5 concurrent)
3. OCR: File → Base64 → Gemini API → Parse JSON → Validate
4. User click Upload → Convert to UserBill → Save to Firebase (status: PENDING)

Admin Reconciliation:
1. Upload merchant transactions (Excel) → Parse → Save to Firebase
2. Click "Xử lý đối soát"
3. Load pending bills + merchant transactions
4. Matching: transactionCode + pointOfSaleName + amount
5. Create report_records (status: MATCHED/ERROR)
6. Update user_bills.status
```

**Database Writes:**
- `user_bills/{id}` - Created (status: PENDING)
- `merchant_transactions/{id}` - Created
- `report_records/{id}` - Created (status: MATCHED/ERROR)
- `user_bills/{id}/status` - Updated (MATCHED/ERROR)

