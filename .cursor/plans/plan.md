# Kế hoạch Refactor V2: Report Records làm Single Source of Truth

## TÓM TẮT V2

### 1. Kiến trúc cốt lõi

**`report_records` là Single Source of Truth** cho toàn bộ hệ thống:
- Tất cả màn hình Báo cáo (Admin, Agent, User) chỉ query từ `report_records`
- Tất cả màn hình Thanh toán (Admin→Agent, Agent→User, User xem trạng thái) chỉ query từ `report_records`
- Màn hình Lịch sử Bills của User chỉ query từ `report_records`
- Màn hình Đối soát & Xử lý của Admin chỉ query từ `report_records`

**`user_bills` và `merchant_transactions`** chỉ đóng vai trò:
- Lưu trữ raw data (ảnh bill, raw Excel)
- Audit / xem chi tiết khi cần
- Không dùng để query cho báo cáo/thanh toán

### 2. Cơ chế đảm bảo Unique TransactionCode

**`transaction_index/`** là node mới trong database, dùng `runTransaction` của Firebase Realtime Database JS SDK để đảm bảo:
- Mỗi `transactionCode` chỉ có đúng 1 entry trong index
- Entry này trỏ đến đúng 1 `reportRecordId` trong `report_records`
- Không thể tạo 2 `reportRecordId` khác nhau cho cùng 1 `transactionCode` (nhờ tính atomic của `runTransaction`)

**Chặn duplicate ở 3 bảng**:
- **`user_bills`**: Trước khi tạo bill, check `transaction_index/{code}/userBillId`. Nếu đã có (dù là gì) → reject, không cho phép thêm bill thứ hai cho cùng `transactionCode`.
- **`merchant_transactions`**: Trước khi tạo transaction, check `transaction_index/{code}/merchantTransactionId`. Nếu đã có → skip transaction mới (mặc định), không tạo thêm transaction mới cho cùng code.
- **`report_records`**: Chỉ được tạo thông qua `transaction_index` → đảm bảo mỗi code có đúng 1 record.

**Lưu ý về Race Condition**: Flow hiện tại (check-then-attach) vẫn có thể có race condition nếu 2 request song song upload cùng code. Để đảm bảo tuyệt đối, nên dùng các hàm atomic `reserveTransactionCodeForBill()` và `reserveTransactionCodeForMerchant()` (xem chi tiết ở mục 5.3.1). Nếu giữ nguyên flow check-then-attach, giả định tình huống 2 người upload cùng mã cùng lúc là rất hiếm.

### 3. Trạng thái Đối soát (reconciliationStatus)

**4 giá trị thống nhất toàn hệ thống**:
- `WAITING_FOR_MERCHANT`: Đã có bill (`userBillId` khác null) nhưng chưa có merchant transaction
- `WAITING_FOR_BILL`: Đã có merchant transaction (`merchantTransactionId` khác null) nhưng chưa có bill
- `MATCHED`: Đã có cả bill & merchant, và thông tin khớp (mã chuẩn chi, số tiền, điểm bán, ...)
- `ERROR`: Đã có cả bill & merchant, nhưng không khớp (sai số tiền, sai điểm bán, lỗi mapping, ...)

**Mapping hiển thị UI (tiếng Việt)**:
- `WAITING_FOR_MERCHANT` → "Chờ file merchants"
- `WAITING_FOR_BILL` → "Chờ người dùng up bill"
- `MATCHED` → "Đã đối soát"
- `ERROR` → "Lỗi đối soát" (kèm `errorMessage` chi tiết)

### 4. Luồng tạo/cập nhật tự động

- **User upload bill** → Lưu `user_bills` → Gọi `upsertFromUserBill()` → Tự động tạo/update `report_records` qua `transaction_index`
- **Admin upload Excel** → Lưu `merchant_transactions` → Gọi `upsertFromMerchantTransaction()` → Tự động tạo/update `report_records` qua `transaction_index`
- **Thanh toán** → Update trực tiếp `adminPaymentStatus` / `agentPaymentStatus` trong `report_records`

---

## I. TÓM TẮT HIỆN TRẠNG

### 1.1. Cách truy vấn dữ liệu hiện tại

**Các màn hình hiện đang lấy dữ liệu từ nhiều nguồn:**

- **Admin - Báo cáo**: Dùng `ReportService.getAllReportRecordsWithMerchants()` - merge thủ công từ `report_records`, `merchant_transactions`, `user_bills`
- **Admin - Thanh toán**: Query `report_records` trực tiếp nhưng vẫn phải merge với `user_bills` để lấy thông tin chi tiết
- **Admin - Đối soát**: Load `merchant_transactions` và `user_bills` riêng, sau đó merge để tạo virtual records
- **Agent - Báo cáo**: Tương tự Admin, dùng `getAllReportRecordsWithMerchants()` với filter `agentId`
- **Agent - Thanh toán**: Load `user_bills` trực tiếp, sau đó map với `report_records` để lấy `merchantAmount`
- **User - Lịch sử**: Load `user_bills` và `report_records` riêng, merge thủ công bằng `userBillId`
- **User - Báo cáo**: Dùng `getAllReportRecordsWithMerchants()` với filter `userId`
- **User - Thanh toán**: Load `user_bills` và check `agentPaymentStatus` từ `user_bills` (không từ `report_records`)

### 1.2. Nhược điểm của cách hiện tại

1. **Dữ liệu phân tán**: Mỗi màn hình phải query nhiều bảng và merge thủ công, dễ sai sót
2. **Duplicate logic**: Logic merge/join được lặp lại ở nhiều nơi, khó maintain
3. **Duplicate transactionCode**: Có thể tồn tại nhiều records với cùng `transactionCode` ở cả 3 bảng (`report_records`, `user_bills`, `merchant_transactions`)
4. **Inconsistency**: Khi update payment status, phải update ở nhiều nơi (`report_records`, `user_bills`), dễ bị lệch
5. **Performance**: Mỗi lần query phải load toàn bộ 3 bảng rồi filter/merge client-side, chậm với data lớn
6. **Virtual records**: Tạo records ảo trong memory (`virtual_xxx`) không thể update, gây confusion

---

## II. ĐỀ XUẤT KIẾN TRÚC MỚI "BÁO CÁO LÀM GỐC"

### 2.1. Vai trò của 4 node trong database

#### 2.1.1. `report_records/` - Bảng Master (Single Source of Truth)

**Vai trò**: Là nguồn dữ liệu duy nhất cho tất cả màn hình báo cáo, thanh toán, lịch sử

**Cấu trúc**:
- Mỗi record đại diện cho 1 giao dịch (1 `transactionCode`)
- Chứa snapshot đầy đủ thông tin từ cả bill và merchant transaction
- Chứa trạng thái đối soát và thanh toán
- Link đến `user_bills` và `merchant_transactions` qua `userBillId` và `merchantTransactionId`

**Quy tắc**:
- Mỗi `transactionCode` chỉ có đúng 1 record trong `report_records`
- Record được tạo/update thông qua `transaction_index` để đảm bảo unique
- Tất cả query cho báo cáo/thanh toán/lịch sử đều từ bảng này

#### 2.1.2. `user_bills/` - Raw Bill Data + Ảnh

**Vai trò**: Lưu trữ dữ liệu raw từ user upload

**Cấu trúc**:
- Giữ nguyên các field hiện tại (ảnh bill, metadata upload)
- Có thể có `agentPaymentStatus` để sync với `report_records` (optional, chỉ để backward compatibility)

**Quy tắc**:
- Chỉ dùng để lưu raw data và hiển thị ảnh bill khi cần
- Không dùng để query cho báo cáo/thanh toán
- Khi upload bill, tự động tạo/update record tương ứng trong `report_records`

#### 2.1.3. `merchant_transactions/` - Raw Excel Data

**Vai trò**: Lưu trữ dữ liệu raw từ file Excel merchants

**Cấu trúc**:
- Giữ nguyên các field hiện tại (rawData từ Excel)
- Có index `byCode/` để lookup nhanh theo `transactionCode`

**Quy tắc**:
- Chỉ dùng để lưu raw data và audit
- Không dùng để query cho báo cáo/thanh toán
- Khi upload Excel, tự động tạo/update record tương ứng trong `report_records`

#### 2.1.4. `transaction_index/` - Index UNIQUE cho transactionCode (MỚI)

**Vai trò**: Đảm bảo mỗi `transactionCode` chỉ có đúng 1 `reportRecordId`

**Cấu trúc**:
```
transaction_index/
  {transactionCode}/  // Key là transactionCode (sanitized)
    reportRecordId: string      // ID của record trong report_records
    userBillId?: string         // ID của bill (nếu có)
    merchantTransactionId?: string  // ID của merchant transaction (nếu có)
    createdAt: number          // Timestamp (number) - từ ServerValue.TIMESTAMP
    updatedAt: number          // Timestamp (number) - từ ServerValue.TIMESTAMP
```

**Quy tắc**:
- Dùng `runTransaction` của Firebase Realtime Database JS SDK để đảm bảo atomic khi tạo/update
- Mỗi `transactionCode` chỉ có 1 entry trong index
- Khi tạo `report_record` mới, phải reserve qua index trước
- **Không được tạo `report_records` trực tiếp** mà không thông qua index

### 2.2. Quan hệ giữa các node

**1 transactionCode ⇔ 1 report_record**

- Mỗi `transactionCode` có đúng 1 entry trong `transaction_index`
- Entry này trỏ đến đúng 1 `reportRecordId` trong `report_records`
- `report_record` chứa:
  - `userBillId`: Link đến bill (nếu có)
  - `merchantTransactionId`: Link đến merchant transaction (nếu có)
  - Snapshot đầy đủ các field quan trọng từ cả 2 nguồn

**Luồng dữ liệu**:
```
User upload bill → user_bills/{billId}
                → transaction_index/{code} (reserve via runTransaction)
                → report_records/{reportRecordId} (create/update)

Admin upload Excel → merchant_transactions/{txId}
                  → transaction_index/{code} (check/reserve via runTransaction)
                  → report_records/{reportRecordId} (create/update)
```

### 2.3. Các trạng thái chính trong `report_records`

#### 2.3.1. `reconciliationStatus` (ĐỊNH NGHĨA MỚI V2)

**4 giá trị thống nhất**:
- `WAITING_FOR_MERCHANT`: Đã có bill (`userBillId` khác null) nhưng chưa có merchant transaction (`merchantTransactionId` = null)
- `WAITING_FOR_BILL`: Đã có merchant transaction (`merchantTransactionId` khác null) nhưng chưa có bill (`userBillId` = null)
- `MATCHED`: Đã có cả bill & merchant, và các điều kiện khớp (mã chuẩn chi, số tiền, điểm bán, ...)
- `ERROR`: Đã có cả bill & merchant, nhưng không khớp (sai số tiền, sai điểm bán, lỗi mapping, ...)

**Mapping hiển thị UI (tiếng Việt)**:
- `WAITING_FOR_MERCHANT` → "Chờ file merchants"
- `WAITING_FOR_BILL` → "Chờ người dùng up bill"
- `MATCHED` → "Đã đối soát"
- `ERROR` → "Lỗi đối soát" (kèm `errorMessage` chi tiết)

**Lưu ý**: 
- `errorMessage` phải được lưu trong `report_records.errorMessage` (không tự sinh ở UI)
- UI chỉ hiển thị `reconciliationStatus` + `errorMessage` từ database

#### 2.3.2. `adminPaymentStatus`

- `UNPAID`: Admin chưa thanh toán cho Agent
- `PAID`: Admin đã thanh toán cho Agent
- `PARTIAL`: Thanh toán một phần (nếu cần)
- `CANCELLED`: Đã hủy thanh toán
- `DRAFT`: Đang soạn thảo (nếu cần)

#### 2.3.3. `agentPaymentStatus`

- `UNPAID`: Agent chưa thanh toán cho User
- `PAID`: Agent đã thanh toán cho User

**Lưu ý**: `agentPaymentStatus` được lưu trong `report_records` (không còn trong `user_bills` nữa để đảm bảo consistency). Có thể mirror sang `user_bills` để backward compatibility.

---

## III. CHI TIẾT CÁCH MỖI TAB DÙNG `report_records`

### 3.1. Admin - Đối soát & Xử lý

#### 3.1.1. Card "Bills đang chờ đối soát"

**Filter trên `report_records`**:
```typescript
{
  reconciliationStatus: 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL',
  // Chỉ lấy những record chưa có đủ dữ liệu để đối soát
}
```

**Logic**:
- Query `report_records` với filter `reconciliationStatus IN ['WAITING_FOR_MERCHANT', 'WAITING_FOR_BILL']`
- Hiển thị số lượng và tổng tiền
- Click vào card → hiển thị danh sách chi tiết

#### 3.1.2. Danh sách "Bills đang chờ"

**Filter**:
```typescript
{
  reconciliationStatus: 'WAITING_FOR_MERCHANT',
  // Có userBillId nhưng chưa có merchantTransactionId
}
```

**Hiển thị**:
- Thông tin từ bill (từ snapshot trong `report_records`)
- Trạng thái: "Chờ file merchants" (từ mapping `WAITING_FOR_MERCHANT`)
- Có thể hiển thị ảnh bill từ `user_bills/{userBillId}/imageUrl` (nếu cần)

#### 3.1.3. Danh sách "Giao dịch chưa có bill"

**Filter**:
```typescript
{
  reconciliationStatus: 'WAITING_FOR_BILL',
  // Có merchantTransactionId nhưng chưa có userBillId
}
```

**Hiển thị**:
- Thông tin từ merchant transaction (từ snapshot trong `report_records`)
- Trạng thái: "Chờ người dùng up bill" (từ mapping `WAITING_FOR_BILL`)
- Hiển thị các cột từ Excel (từ `merchantsFileData`)

#### 3.1.4. Danh sách "Lỗi đối soát"

**Filter**:
```typescript
{
  reconciliationStatus: 'ERROR',
  // Có cả userBillId và merchantTransactionId nhưng không khớp
}
```

**Hiển thị**:
- Thông tin từ cả bill và merchant
- `errorMessage` để hiển thị lỗi cụ thể (ví dụ: "Sai số tiền: 100000đ vs 150000đ; Sai điểm bán: POS_A vs POS_B")
- Trạng thái: "Lỗi đối soát" (từ mapping `ERROR`)
- Có thể sửa thủ công (update `report_records`)

### 3.2. Admin - Báo cáo

**Query**:
```typescript
ReportService.getReportsForAdmin({
  dateFrom?: string,
  dateTo?: string,
  agentId?: string,
  agentCode?: string,
  pointOfSaleName?: string,
  reconciliationStatus?: 'MATCHED' | 'ERROR' | 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL',
  adminPaymentStatus?: AdminPaymentStatus
})
```

**Implementation**:
- Chỉ query từ `report_records`
- Filter client-side hoặc server-side (tùy Firebase Realtime Database support)
- Hiển thị đầy đủ thông tin từ snapshot (không cần join)
- Hiển thị `reconciliationStatus` dưới dạng tiếng Việt theo mapping

### 3.3. Admin - Thanh toán & Công nợ

**Query**:
```typescript
ReportService.getReportsForAdmin({
  reconciliationStatus: 'MATCHED',
  adminPaymentStatus: 'UNPAID' | undefined,  // Chưa thanh toán
  // Có thể filter thêm theo agentId, dateFrom, dateTo
})
```

**Logic**:
- Chỉ lấy các record đã `MATCHED` và chưa `adminPaymentStatus = 'PAID'`
- Group theo `agentId` để hiển thị tổng tiền cho từng đại lý
- Khi thanh toán: Update `adminPaymentStatus = 'PAID'` và `adminPaidAt` trong `report_records`

### 3.4. Agent - Báo cáo

**Query**:
```typescript
ReportService.getReportsForAgent(agentId, {
  dateFrom?: string,
  dateTo?: string,
  pointOfSaleName?: string,
  reconciliationStatus?: 'MATCHED' | 'ERROR' | 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL',
  adminPaymentStatus?: AdminPaymentStatus  // Xem admin đã trả chưa
})
```

**Implementation**:
- Filter `agentId` trong `report_records`
- Hiển thị tương tự Admin nhưng chỉ data của đại lý này
- Hiển thị `reconciliationStatus` dưới dạng tiếng Việt theo mapping

### 3.5. Agent - Thanh Toán

**Query**:
```typescript
ReportService.getReportsForAgent(agentId, {
  agentPaymentStatus: 'UNPAID',  // Chưa trả cho user
  reconciliationStatus: 'MATCHED' | 'ERROR',  // Đã đối soát xong
})
```

**Logic**:
- Lấy các record của đại lý này chưa trả cho user
- Group theo `userId` để hiển thị tổng tiền cho từng user
- Hiển thị cả `amount` (từ bill) và `merchantAmount` (từ Excel) nếu có
- Khi thanh toán: Update `agentPaymentStatus = 'PAID'` và `agentPaidAt` trong `report_records`
- (Optional) Mirror sang `user_bills/{userBillId}/agentPaymentStatus` để backward compatibility

### 3.6. User - Lịch sử

**Query**:
```typescript
ReportService.getReportsForUser(userId, {
  dateFrom?: string,
  dateTo?: string,
  pointOfSaleName?: string,
  reconciliationStatus?: 'MATCHED' | 'ERROR' | 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL',
})
```

**Logic**:
- Filter `userId` trong `report_records`
- Hiển thị tất cả giao dịch của user (có bill hoặc chưa có bill)
- Hiển thị trạng thái đối soát và thanh toán
- Hiển thị `reconciliationStatus` dưới dạng tiếng Việt theo mapping
- Có thể click vào để xem ảnh bill từ `user_bills/{userBillId}/imageUrl`

### 3.7. User - Báo cáo

**Query**:
- Có thể tái sử dụng cùng API như Lịch sử
- Nhưng hiển thị dạng tổng hợp (grouping, summary) thay vì list chi tiết

### 3.8. User - Thanh Toán

**Query**:
```typescript
ReportService.getReportsForUser(userId, {
  agentPaymentStatus?: 'PAID' | 'UNPAID',  // Filter theo trạng thái
})
```

**Logic**:
- Hiển thị trạng thái `agentPaymentStatus` từ `report_records`
- Không cần query `user_bills` nữa
- Hiển thị 2 tab: "Đã thanh toán" và "Chờ thanh toán"

---

## IV. LUỒNG TẠO/CẬP NHẬT `report_records`

### 4.1. Khi User upload bill

**Luồng** (Option A - attach chỉ ở upsert):
1. **Check duplicate**: Trước khi lưu, gọi `TransactionIndexService.reserveTransactionCode(bill.transactionCode)`
   - Nếu `transaction_index/{code}` đã có `userBillId` **(dù là gì)** → **reject, trả lỗi**: "Mã chuẩn chi này đã có bill, vui lòng không upload trùng"
   - Không cho phép thêm 1 bill thứ hai cho cùng `transactionCode`
2. Lưu vào `user_bills/{billId}` (giữ nguyên logic hiện tại)
3. Gọi `ReportService.upsertFromUserBill(bill)` - **hàm này sẽ tự động attach bill vào index**
4. Trong `upsertFromUserBill`:
   - Reserve transaction code để lấy `reportRecordId` (hoặc tạo mới nếu code chưa có)
   - Update `report_records/{reportRecordId}` với dữ liệu từ bill
   - **Cuối cùng**: Gọi `TransactionIndexService.attachBillToCode(bill.transactionCode, bill.id)` để gắn bill vào index
   - Nếu đã có `merchantTransactionId` trong index → tự động đối soát và set `reconciliationStatus`

**Code skeleton**:
```typescript
// Trong UserService.createUserBill()
async createUserBill(billData: Omit<UserBill, 'id' | 'createdAt'>): Promise<string> {
  // 1. Check duplicate qua transaction_index
  const indexData = await TransactionIndexService.reserveTransactionCode(billData.transactionCode);
  
  // Nếu đã có userBillId (dù là gì) → reject
  if (indexData.userBillId) {
    throw new Error('Mã chuẩn chi này đã có bill, vui lòng không upload trùng');
  }
  
  // 2. Lưu bill vào user_bills
  const billRef = await push(ref(database, 'user_bills'), {
    ...billData,
    createdAt: FirebaseUtils.getServerTimestamp(),
  });
  const billId = billRef.key!;
  
  // 3. Upsert report (hàm này sẽ tự động attach bill vào index)
  await ReportService.upsertFromUserBill({ ...billData, id: billId });
  
  return billId;
}

// Trong ReportService.upsertFromUserBill()
async upsertFromUserBill(bill: UserBill): Promise<string> {
  // 1. Reserve transaction code (đã được gọi ở createUserBill, nhưng gọi lại để đảm bảo)
  const indexData = await TransactionIndexService.reserveTransactionCode(bill.transactionCode);
  const reportRecordId = indexData.reportRecordId;
  
  // 2. Load existing record hoặc tạo mới
  const existingRef = ref(database, `report_records/${reportRecordId}`);
  const existingSnapshot = await get(existingRef);
  const existing = existingSnapshot.exists() ? existingSnapshot.val() : null;
  
  // 3. Merge data từ bill
  const updates: Partial<ReportRecord> = {
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
  };
  
  // 4. Quyết định reconciliationStatus
  if (indexData.merchantTransactionId) {
    // Đã có merchant transaction → đối soát
    const merchantRef = ref(database, `merchant_transactions/${indexData.merchantTransactionId}`);
    const merchantSnapshot = await get(merchantRef);
    const merchant = merchantSnapshot.val() as MerchantTransaction;
    
    const reconciliation = compareBillAndMerchant(bill, merchant);
    updates.reconciliationStatus = reconciliation.status; // 'MATCHED' hoặc 'ERROR'
    updates.errorMessage = reconciliation.errorMessage;
    
    // Merge merchant data vào report
    updates.merchantTransactionId = merchant.id;
    updates.merchantCode = merchant.merchantCode;
    updates.merchantAmount = merchant.amount;
    updates.merchantAmountBeforeDiscount = merchant.amountBeforeDiscount;
    updates.merchantPointOfSaleName = merchant.pointOfSaleName;
    updates.merchantBranchName = merchant.branchName;
    updates.merchantInvoiceNumber = merchant.invoiceNumber;
    updates.merchantPhoneNumber = merchant.phoneNumber;
    updates.merchantPromotionCode = merchant.promotionCode;
    updates.merchantTransactionDate = merchant.transactionDate;
    updates.merchantsFileData = merchant.rawData;
  } else {
    // Chưa có merchant → chờ file merchants
    updates.reconciliationStatus = 'WAITING_FOR_MERCHANT';
    updates.errorMessage = undefined;
  }
  
  // 5. Update report_records (tạo mới nếu chưa có)
  if (!existing) {
    updates.id = reportRecordId;
    updates.createdAt = FirebaseUtils.getServerTimestamp();
    updates.reconciledAt = FirebaseUtils.getServerTimestamp();
    updates.reconciledBy = 'ADMIN'; // Tạm thời đánh dấu 'ADMIN' cho auto flow từ system, có thể refactor sau thành 'SYSTEM'
  } else {
    updates.reconciledAt = FirebaseUtils.getServerTimestamp();
  }
  
  await set(existingRef, { ...existing, ...updates });
  
  // 6. Update index
  await TransactionIndexService.attachBillToCode(bill.transactionCode, bill.id);
  
  return reportRecordId;
}
```

### 4.2. Khi Admin upload file merchants

**Luồng** (Option A - attach chỉ ở upsert):
1. Parse Excel và validate
2. **Check duplicate**: Với mỗi transaction, gọi `TransactionIndexService.reserveTransactionCode(tx.transactionCode)`
   - Nếu `transaction_index/{code}` đã có `merchantTransactionId` → **skip transaction mới** (mặc định), không tạo thêm transaction mới cho cùng code
   - Nếu chưa có → cho phép tiếp tục
3. Lưu vào `merchant_transactions/{txId}` (chỉ lưu những transaction không bị skip)
4. Update `merchant_transactions/byCode/{transactionCode} = txId`
5. Gọi `ReportService.upsertFromMerchantTransaction(tx)` cho mỗi transaction đã lưu - **hàm này sẽ tự động attach merchant vào index**
6. Trong `upsertFromMerchantTransaction`:
   - Reserve transaction code để lấy `reportRecordId` (hoặc tạo mới nếu code chưa có)
   - Update `report_records/{reportRecordId}` với dữ liệu từ merchant transaction
   - **Cuối cùng**: Gọi `TransactionIndexService.attachMerchantToCode(tx.transactionCode, tx.id)` để gắn merchant vào index
   - Nếu đã có `userBillId` trong index → tự động đối soát và set `reconciliationStatus`

**Code skeleton**:
```typescript
// Trong MerchantTransactionsService.createBatch()
async createBatch(transactions: MerchantTransaction[]): Promise<{ created: string[], skipped: Array<{ code: string, reason: string }> }> {
  const created: string[] = [];
  const skipped: Array<{ code: string, reason: string }> = [];
  
  for (const tx of transactions) {
    try {
      // 1. Check duplicate qua transaction_index
      const indexData = await TransactionIndexService.reserveTransactionCode(tx.transactionCode);
      
      // Nếu đã có merchantTransactionId → skip (mặc định)
      if (indexData.merchantTransactionId) {
        skipped.push({
          code: tx.transactionCode,
          reason: 'Mã chuẩn chi đã có merchant transaction trong hệ thống'
        });
        continue;
      }
      
      // 2. Lưu transaction vào merchant_transactions
      const txRef = await push(ref(database, 'merchant_transactions'), {
        ...tx,
        createdAt: FirebaseUtils.getServerTimestamp(),
      });
      const txId = txRef.key!;
      
      // 3. Update byCode index
      await set(ref(database, `merchant_transactions/byCode/${tx.transactionCode}`), txId);
      
      // 4. Upsert report (hàm này sẽ tự động attach merchant vào index)
      await ReportService.upsertFromMerchantTransaction({ ...tx, id: txId });
      
      created.push(txId);
    } catch (error) {
      skipped.push({
        code: tx.transactionCode,
        reason: `Lỗi: ${error.message}`
      });
    }
  }
  
  return { created, skipped };
}

// Trong ReportService.upsertFromMerchantTransaction()
async upsertFromMerchantTransaction(tx: MerchantTransaction): Promise<string> {
  // 1. Reserve transaction code (đã được gọi ở createBatch, nhưng gọi lại để đảm bảo)
  const indexData = await TransactionIndexService.reserveTransactionCode(tx.transactionCode);
  const reportRecordId = indexData.reportRecordId;
  
  // 2. Load existing record hoặc tạo mới
  const existingRef = ref(database, `report_records/${reportRecordId}`);
  const existingSnapshot = await get(existingRef);
  const existing = existingSnapshot.exists() ? existingSnapshot.val() : null;
  
  // 3. Merge data từ merchant transaction
  const updates: Partial<ReportRecord> = {
    merchantTransactionId: tx.id,
    merchantCode: tx.merchantCode,
    merchantAmount: tx.amount,
    merchantAmountBeforeDiscount: tx.amountBeforeDiscount,
    merchantPointOfSaleName: tx.pointOfSaleName,
    merchantBranchName: tx.branchName,
    merchantInvoiceNumber: tx.invoiceNumber,
    merchantPhoneNumber: tx.phoneNumber,
    merchantPromotionCode: tx.promotionCode,
    merchantTransactionDate: tx.transactionDate,
    merchantsFileData: tx.rawData,
  };
  
  // 4. Quyết định reconciliationStatus
  if (indexData.userBillId) {
    // Đã có user bill → đối soát
    const billRef = ref(database, `user_bills/${indexData.userBillId}`);
    const billSnapshot = await get(billRef);
    const bill = billSnapshot.val() as UserBill;
    
    const reconciliation = compareBillAndMerchant(bill, tx);
    updates.reconciliationStatus = reconciliation.status; // 'MATCHED' hoặc 'ERROR'
    updates.errorMessage = reconciliation.errorMessage;
    
    // Merge bill data vào report nếu chưa có
    if (!existing || !existing.userBillId) {
      updates.userBillId = bill.id;
      updates.userId = bill.userId;
      updates.agentId = bill.agentId;
      updates.agentCode = bill.agentCode;
      updates.amount = bill.amount;
      updates.paymentMethod = bill.paymentMethod;
      updates.pointOfSaleName = bill.pointOfSaleName;
      updates.transactionDate = bill.timestamp;
      updates.userBillCreatedAt = bill.createdAt;
      updates.invoiceNumber = bill.invoiceNumber;
    }
  } else {
    // Chưa có bill → chờ user upload
    updates.reconciliationStatus = 'WAITING_FOR_BILL';
    updates.errorMessage = undefined;
  }
  
  // 5. Update report_records (tạo mới nếu chưa có)
  if (!existing) {
    updates.id = reportRecordId;
    updates.transactionCode = tx.transactionCode;
    updates.createdAt = FirebaseUtils.getServerTimestamp();
    updates.reconciledAt = FirebaseUtils.getServerTimestamp();
    updates.reconciledBy = 'ADMIN'; // Tạm thời đánh dấu 'ADMIN' cho auto flow từ system, có thể refactor sau thành 'SYSTEM'
  } else {
    updates.reconciledAt = FirebaseUtils.getServerTimestamp();
  }
  
  await set(existingRef, { ...existing, ...updates });
  
  // 6. Update index
  await TransactionIndexService.attachMerchantToCode(tx.transactionCode, tx.id);
  
  return reportRecordId;
}
```

### 4.3. Khi Admin thanh toán cho Agent

**Luồng**:
1. Admin chọn các `reportRecordId` cần thanh toán
2. Gọi `ReportService.updateAdminPaymentStatus(reportRecordIds, 'PAID', adminPaidAt)`
3. Update trực tiếp trong `report_records`:
   - `adminPaymentStatus = 'PAID'`
   - `adminPaidAt = adminPaidAt || FirebaseUtils.getServerTimestamp()` (luôn set, nếu không truyền paidAt thì dùng timestamp hiện tại của server)
   - `adminBatchId = batchId` (nếu cần group)

**Code skeleton**:
```typescript
async updateAdminPaymentStatus(
  reportRecordIds: string[],
  status: AdminPaymentStatus,
  paidAt?: string
): Promise<void> {
  const updates: any = {};
  const paidTime = paidAt || FirebaseUtils.getServerTimestamp();
  
  reportRecordIds.forEach(id => {
    updates[`report_records/${id}/adminPaymentStatus`] = status;
    updates[`report_records/${id}/adminPaidAt`] = paidTime; // Luôn set, dùng paidAt hoặc timestamp hiện tại
    // Có thể thêm adminBatchId nếu cần
  });
  
  await update(ref(database), updates);
}
```

### 4.4. Khi Agent thanh toán cho User

**Luồng**:
1. Agent chọn các `reportRecordId` cần thanh toán
2. Gọi `ReportService.updateAgentPaymentStatus(reportRecordIds, 'PAID', agentPaidAt, note)`
3. Update trong `report_records`:
   - `agentPaymentStatus = 'PAID'`
   - `agentPaidAt = agentPaidAt || FirebaseUtils.getServerTimestamp()` (luôn set, nếu không truyền paidAt thì dùng timestamp hiện tại của server)
   - `agentPaidNote = note`
4. (Optional) Mirror sang `user_bills/{userBillId}/agentPaymentStatus` để backward compatibility

**Code skeleton**:
```typescript
async updateAgentPaymentStatus(
  reportRecordIds: string[],
  status: AgentPaymentStatus,
  paidAt?: string,
  note?: string
): Promise<void> {
  const updates: any = {};
  const billUpdates: any = {};  // Để mirror sang user_bills
  const paidTime = paidAt || FirebaseUtils.getServerTimestamp();
  
  // Load report records để lấy userBillId
  const recordRefs = reportRecordIds.map(id => ref(database, `report_records/${id}`));
  const snapshots = await Promise.all(recordRefs.map(ref => get(ref)));
  const records = snapshots.map(snap => snap.val() as ReportRecord).filter(r => r);
  
  reportRecordIds.forEach(id => {
    updates[`report_records/${id}/agentPaymentStatus`] = status;
    updates[`report_records/${id}/agentPaidAt`] = paidTime; // Luôn set, dùng paidAt hoặc timestamp hiện tại
    if (note) {
      updates[`report_records/${id}/agentPaidNote`] = note;
    }
    
    // Mirror sang user_bills (optional, để backward compatibility)
    const record = records.find(r => r.id === id);
    if (record?.userBillId) {
      billUpdates[`user_bills/${record.userBillId}/agentPaymentStatus`] = status;
      billUpdates[`user_bills/${record.userBillId}/agentPaidAt`] = paidTime; // Luôn set
      if (note) {
        billUpdates[`user_bills/${record.userBillId}/agentPaidNote`] = note;
      }
    }
  });
  
  await update(ref(database), { ...updates, ...billUpdates });
}
```

---

## V. CÁCH NGĂN DUPLICATE `transactionCode`

### 5.1. Tại sao cần node `transaction_index`

**Vấn đề hiện tại**:
- Có thể tồn tại nhiều records với cùng `transactionCode` ở cả 3 bảng
- Khi query phải deduplicate thủ công, dễ sai sót
- Không có cơ chế đảm bảo unique ở database level

**Giải pháp**:
- Tạo node `transaction_index/` làm index unique
- Mỗi `transactionCode` chỉ có 1 entry trong index
- Entry này trỏ đến đúng 1 `reportRecordId`
- Dùng `runTransaction` của Firebase Realtime Database JS SDK để đảm bảo atomic khi tạo/update

### 5.2. Cấu trúc `transaction_index`

```
transaction_index/
  {transactionCode}/  // Key là transactionCode (sanitized)
    reportRecordId: string      // ID của record trong report_records
    userBillId?: string         // ID của bill (nếu có)
    merchantTransactionId?: string  // ID của merchant transaction (nếu có)
    createdAt: number          // Timestamp (number) - từ ServerValue.TIMESTAMP
    updatedAt: number          // Timestamp (number) - từ ServerValue.TIMESTAMP
```

**Lưu ý**: `transactionCode` cần được sanitize (loại bỏ ký tự đặc biệt) trước khi dùng làm key

### 5.3. Cách dùng `runTransaction` để đảm bảo unique

**Firebase Realtime Database JS SDK có `runTransaction`**:
- Import từ `firebase/database`: `import { runTransaction, ServerValue } from 'firebase/database'`
- Đảm bảo tính atomic: Nếu 2 request cùng lúc gọi `runTransaction` trên cùng path, chỉ 1 request thành công, request kia sẽ retry với giá trị mới nhất

**Hàm `reserveTransactionCode`**:
```typescript
import { ref, runTransaction, ServerValue } from 'firebase/database';
import { database } from './firebase';

async function reserveTransactionCode(transactionCode: string): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  // Dùng runTransaction để đảm bảo atomic
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = ServerValue.TIMESTAMP as any; // ServerValue.TIMESTAMP sẽ được Firebase convert thành timestamp
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới
      const newReportRecordId = generateId(); // Hoặc dùng push().key
      return {
        reportRecordId: newReportRecordId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại → trả về reportRecordId cũ (không tạo mới)
      return {
        ...current,
        updatedAt: now,
      };
    }
  });
  
  // result.snapshot.val() chứa giá trị sau khi transaction hoàn thành
  return result.snapshot.val() as TransactionIndexEntry;
}
```

**Lưu ý quan trọng**:
- Chính nhờ `runTransaction` mà không thể có 2 `reportRecordId` khác nhau cho cùng 1 `transactionCode`
- Nếu 2 request cùng lúc gọi `reserveTransactionCode` với cùng code:
  - Request đầu tiên: `current === null` → tạo `reportRecordId` mới
  - Request thứ hai: `current !== null` (đã có từ request đầu) → trả về `reportRecordId` cũ
  - Firebase tự động retry nếu có conflict

### 5.3.1. Cân nhắc về Race Condition khi check-then-attach

**Flow default của plan (Option A)**:
- Flow hiện tại dùng combo `reserveTransactionCode` + `attachBillToCode` / `attachMerchantToCode` (tách rời)
- Flow này đủ tốt trong điều kiện bình thường và dễ hiểu/maintain
- Tuy nhiên, vẫn **tiềm ẩn race condition** khi 2 request upload cùng mã cùng lúc:
  - Request 1: `reserveTransactionCode` → thấy `userBillId = null` → pass check → lưu bill → gọi `upsertFromUserBill` → attach
  - Request 2: `reserveTransactionCode` → thấy `userBillId = null` (vì Request 1 chưa attach xong) → pass check → lưu bill → gọi `upsertFromUserBill` → attach
  - Kết quả: Cả hai đều tạo bill/merchant transaction mới cho cùng code (duplicate)

**Giải pháp atomic (Khuyến nghị cho production)**:
- Để đảm bảo tuyệt đối không có race condition, nên dùng 2 API atomic:
  - `reserveTransactionCodeForBill(code, billId)`
  - `reserveTransactionCodeForMerchant(code, merchantTransactionId)`
- Hai hàm atomic này thực hiện cả:
  - Tạo `reportRecordId` (nếu chưa có)
  - Gắn `userBillId`/`merchantTransactionId` 
  - Tất cả trong cùng 1 `runTransaction`, không cần gọi `attach*` riêng
- Khi dùng atomic API, flow sẽ là:
  - `createUserBill`: Check duplicate + lưu bill → gọi `reserveTransactionCodeForBill` (atomic) → gọi `upsertFromUserBill` (không cần attach nữa)
  - `createBatch`: Check duplicate + lưu merchant → gọi `reserveTransactionCodeForMerchant` (atomic) → gọi `upsertFromMerchantTransaction` (không cần attach nữa)

**Ví dụ hàm atomic**:
```typescript
/**
 * Reserve transaction code và attach bill ID trong một transaction atomic
 * Đảm bảo không có race condition khi 2 request cùng lúc upload bill cho cùng code
 */
export async function reserveTransactionCodeForBill(
  code: string,
  billId: string,
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(code);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = ServerValue.TIMESTAMP as any;
    
    // Nếu đã có userBillId → reject (không cho phép bill thứ hai)
    if (current?.userBillId) {
      throw new Error('Mã chuẩn chi này đã có bill, vui lòng không upload trùng');
    }
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới và gắn bill
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        reportRecordId: newReportRecordId,
        userBillId: billId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại nhưng chưa có userBillId → gắn bill vào
      return {
        ...current,
        userBillId: billId,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}

/**
 * Reserve transaction code và attach merchant transaction ID trong một transaction atomic
 * Đảm bảo không có race condition khi 2 request cùng lúc upload merchant cho cùng code
 */
export async function reserveTransactionCodeForMerchant(
  code: string,
  merchantTransactionId: string,
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(code);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = ServerValue.TIMESTAMP as any;
    
    // Nếu đã có merchantTransactionId → skip (trả về entry hiện tại, không update)
    if (current?.merchantTransactionId) {
      return current; // Không throw, chỉ skip
    }
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới và gắn merchant
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        reportRecordId: newReportRecordId,
        merchantTransactionId: merchantTransactionId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại nhưng chưa có merchantTransactionId → gắn merchant vào
      return {
        ...current,
        merchantTransactionId: merchantTransactionId,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}
```

**Lưu ý**:
- **Flow default (Option A)**: Dùng `reserveTransactionCode` + `attach*` tách rời - đơn giản, dễ maintain, nhưng có risk race condition nếu nhiều request song song
- **Flow atomic (Khuyến nghị)**: Dùng `reserveTransactionCodeForBill` / `reserveTransactionCodeForMerchant` - đảm bảo tuyệt đối không race condition, phù hợp cho production nếu hệ thống có nguy cơ nhiều request song song cho cùng `transactionCode`
- Nếu giữ flow default, cần ghi rõ: **risk race condition vẫn tồn tại** và giả định là tình huống 2 người upload cùng mã cùng lúc là rất hiếm

### 5.4. Rules để ngăn duplicate ở 3 bảng

#### 5.4.1. `user_bills`

**Rule**: Nếu `transaction_index/{code}` đã có `userBillId` **(dù là gì)** → **reject**, coi như đã có bill cho mã chuẩn chi này. Không cho phép thêm 1 bill thứ hai cho cùng `transactionCode`.

**Implementation**:
- Trước khi lưu `user_bills`, gọi `reserveTransactionCode` để lấy index
- Check `index.userBillId`:
  - Nếu đã có (dù là gì) → **reject, trả lỗi**: "Mã chuẩn chi này đã có bill, vui lòng không upload trùng"
  - Nếu chưa có → cho phép và update index
- Code đã thể hiện trong `UserService.createUserBill()` ở phần IV.4.1

#### 5.4.2. `merchant_transactions`

**Rule**: Nếu `transaction_index/{code}` đã có `merchantTransactionId` → **skip transaction mới** (mặc định), không tạo thêm transaction mới cho cùng code.

**Implementation**:
- Trước khi lưu `merchant_transactions`, gọi `reserveTransactionCode` để lấy index
- Check `index.merchantTransactionId`:
  - Nếu đã có → **skip transaction này** (default policy)
  - Nếu chưa có → cho phép và update index
  - **Tuyệt đối không được tạo thêm một merchant_transactions mới với ID khác mà vẫn dùng cùng code**
- Code đã thể hiện trong `MerchantTransactionsService.createBatch()` ở phần IV.4.2

#### 5.4.3. `report_records`

**Rule**: Chỉ được tạo thông qua `transaction_index` → đảm bảo mỗi code có đúng 1 record

**Implementation**:
- **Không được tạo `report_records` trực tiếp** mà không thông qua index
- Phải gọi `reserveTransactionCode` trước để lấy `reportRecordId`
- Dùng `reportRecordId` từ index để tạo/update record
- Không được có chỗ nào trong code gọi `push('report_records')` hay `generateId()` trực tiếp cho report mà không thông qua index

---

## VI. CODE SKELETON CHI TIẾT

### 6.1. Interface TypeScript

```typescript
// types.ts

// Transaction Index Entry
export interface TransactionIndexEntry {
  reportRecordId: string;              // ID của record trong report_records
  userBillId?: string;                 // ID của bill (nếu có)
  merchantTransactionId?: string;      // ID của merchant transaction (nếu có)
  createdAt: number;                  // Timestamp (number) - từ ServerValue.TIMESTAMP
  updatedAt: number;                  // Timestamp (number) - từ ServerValue.TIMESTAMP
}

// Report Record (cập nhật)
export interface ReportRecord {
  id: string;
  
  // Link đến user_bills và merchant_transactions
  userBillId?: string;                 // Link đến user_bills
  merchantTransactionId?: string;      // Link đến merchant_transactions
  
  // Thông tin từ UserBill (snapshot)
  userId?: string;
  agentId?: string;
  agentCode?: string;
  transactionCode: string;             // Mã chuẩn chi (UNIQUE)
  amount?: number;                     // Từ bill
  paymentMethod?: PaymentMethod;
  pointOfSaleName?: string;            // Điểm thu từ bill
  transactionDate?: string;            // ISO - thời gian giao dịch từ bill
  userBillCreatedAt?: string;          // ISO - thời điểm tạo bill
  invoiceNumber?: string;              // Số hóa đơn từ bill
  
  // Thông tin từ MerchantTransaction (snapshot)
  merchantCode?: string;
  merchantAmount?: number;             // Từ file Excel
  merchantAmountBeforeDiscount?: number;
  merchantPointOfSaleName?: string;
  merchantBranchName?: string;
  merchantInvoiceNumber?: string;
  merchantPhoneNumber?: string;
  merchantPromotionCode?: string;
  merchantTransactionDate?: string;
  merchantsFileData?: Record<string, any>;  // Tất cả cột từ Excel
  
  // Trạng thái đối soát (ĐỊNH NGHĨA MỚI V2)
  reconciliationStatus: 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL' | 'MATCHED' | 'ERROR';
  errorMessage?: string;               // Chi tiết lỗi đối soát (nếu reconciliationStatus = 'ERROR')
  
  // Payment tracking - Admin → Agent
  adminPaymentStatus?: AdminPaymentStatus;
  adminPaidAt?: string;                // ISO timestamp
  adminBatchId?: string;                // Optional - để group theo ngày
  
  // Payment tracking - Agent → User (MỚI: lưu trong report_records)
  agentPaymentStatus?: AgentPaymentStatus;
  agentPaidAt?: string;                // ISO timestamp
  agentPaidNote?: string;              // Ghi chú khi thanh toán
  
  // Metadata
  reconciledAt?: string;               // ISO – thời điểm chạy đối soát
  reconciledBy?: 'ADMIN' | 'AGENT';
  reconciliationSessionId?: string;
  
  // Admin editable fields
  note?: string;
  isManuallyEdited?: boolean;
  editedFields?: string[];
  
  // Fee calculation (cached for performance)
  feeAmount?: number;
  netAmount?: number;
  
  createdAt: string;                   // ISO – thời điểm tạo record
}
```

### 6.2. TransactionIndexService

**Lưu ý về 2 loại API**:
- **API tách rời** (`reserveTransactionCode` + `attachBillToCode` / `attachMerchantToCode`): Dùng cho flow đơn giản (Option A), dễ hiểu/maintain, nhưng có risk race condition nếu nhiều request song song
- **API atomic** (`reserveTransactionCodeForBill` / `reserveTransactionCodeForMerchant`): Khuyến nghị cho production nếu rất lo về race condition, gom check + attach trong một `runTransaction` duy nhất

```typescript
// src/lib/transactionIndexService.ts

import { ref, runTransaction, get, update, ServerValue } from 'firebase/database';
import { database } from './firebase';
import type { TransactionIndexEntry } from '../../types';

/**
 * Sanitize transactionCode để dùng làm Firebase key
 * Loại bỏ ký tự đặc biệt, thay bằng underscore
 */
function sanitizeTransactionCode(code: string): string {
  return code.replace(/[.#$\[\]]/g, '_');
}

/**
 * Reserve transaction code - đảm bảo mỗi code chỉ có 1 reportRecordId
 * Dùng runTransaction để đảm bảo atomic
 * 
 * API này dùng kết hợp với attachBillToCode/attachMerchantToCode (API tách rời)
 * Xem reserveTransactionCodeForBill/reserveTransactionCodeForMerchant cho API atomic
 */
export async function reserveTransactionCode(
  transactionCode: string
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  // Dùng runTransaction để đảm bảo atomic
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = ServerValue.TIMESTAMP as any;
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới
      // Generate ID (có thể dùng push().key hoặc uuid)
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      return {
        reportRecordId: newReportRecordId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại → trả về reportRecordId cũ (không tạo mới)
      return {
        ...current,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}

/**
 * Attach bill ID vào transaction index
 * 
 * API tách rời - dùng kết hợp với reserveTransactionCode
 * Xem reserveTransactionCodeForBill cho API atomic (khuyến nghị cho production)
 */
export async function attachBillToCode(
  transactionCode: string,
  billId: string
): Promise<void> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  await update(indexRef, {
    userBillId: billId,
    updatedAt: ServerValue.TIMESTAMP,
  });
}

/**
 * Attach merchant transaction ID vào transaction index
 * 
 * API tách rời - dùng kết hợp với reserveTransactionCode
 * Xem reserveTransactionCodeForMerchant cho API atomic (khuyến nghị cho production)
 */
export async function attachMerchantToCode(
  transactionCode: string,
  merchantTransactionId: string
): Promise<void> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  await update(indexRef, {
    merchantTransactionId: merchantTransactionId,
    updatedAt: ServerValue.TIMESTAMP,
  });
}

/**
 * Lấy reportRecordId từ transactionCode
 */
export async function getReportRecordIdByCode(
  transactionCode: string
): Promise<string | null> {
  const sanitizedCode = sanitizeTransactionCode(transactionCode);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  const snapshot = await get(indexRef);
  
  if (snapshot.exists()) {
    const entry = snapshot.val() as TransactionIndexEntry;
    return entry.reportRecordId;
  }
  
  return null;
}

/**
 * Reserve transaction code và attach bill ID trong một transaction atomic
 * Đảm bảo không có race condition khi 2 request cùng lúc upload bill cho cùng code
 * Nếu đã có userBillId → throw error (reject)
 * 
 * API atomic - khuyến nghị cho production nếu rất lo về race condition
 * Thay thế combo reserveTransactionCode + attachBillToCode
 */
export async function reserveTransactionCodeForBill(
  code: string,
  billId: string,
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(code);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = ServerValue.TIMESTAMP as any;
    
    // Nếu đã có userBillId → reject (không cho phép bill thứ hai)
    if (current?.userBillId) {
      throw new Error('Mã chuẩn chi này đã có bill, vui lòng không upload trùng');
    }
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới và gắn bill
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        reportRecordId: newReportRecordId,
        userBillId: billId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại nhưng chưa có userBillId → gắn bill vào
      return {
        ...current,
        userBillId: billId,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}

/**
 * Reserve transaction code và attach merchant transaction ID trong một transaction atomic
 * Đảm bảo không có race condition khi 2 request cùng lúc upload merchant cho cùng code
 * Nếu đã có merchantTransactionId → trả về entry hiện tại (skip, không throw)
 * 
 * API atomic - khuyến nghị cho production nếu rất lo về race condition
 * Thay thế combo reserveTransactionCode + attachMerchantToCode
 */
export async function reserveTransactionCodeForMerchant(
  code: string,
  merchantTransactionId: string,
): Promise<TransactionIndexEntry> {
  const sanitizedCode = sanitizeTransactionCode(code);
  const indexRef = ref(database, `transaction_index/${sanitizedCode}`);
  
  const result = await runTransaction(indexRef, (current: TransactionIndexEntry | null) => {
    const now = ServerValue.TIMESTAMP as any;
    
    // Nếu đã có merchantTransactionId → skip (trả về entry hiện tại, không update)
    if (current?.merchantTransactionId) {
      return current; // Không throw, chỉ skip
    }
    
    if (current === null) {
      // Lần đầu thấy code → tạo reportRecordId mới và gắn merchant
      const newReportRecordId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        reportRecordId: newReportRecordId,
        merchantTransactionId: merchantTransactionId,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      // Code đã tồn tại nhưng chưa có merchantTransactionId → gắn merchant vào
      return {
        ...current,
        merchantTransactionId: merchantTransactionId,
        updatedAt: now,
      };
    }
  });
  
  return result.snapshot.val() as TransactionIndexEntry;
}
```

### 6.3. Helper function: compareBillAndMerchant

```typescript
// src/lib/reportServices.ts (hoặc file riêng)

interface ReconciliationResult {
  status: 'MATCHED' | 'ERROR';
  errorMessage?: string;
}

function compareBillAndMerchant(
  bill: UserBill,
  merchant: MerchantTransaction
): ReconciliationResult {
  const errors: string[] = [];
  
  // So sánh số tiền
  if (bill.amount !== merchant.amount) {
    errors.push(`Sai số tiền: ${merchant.amount}đ vs ${bill.amount}đ`);
  }
  
  // So sánh điểm bán (nếu có)
  if (bill.pointOfSaleName && merchant.pointOfSaleName) {
    if (bill.pointOfSaleName !== merchant.pointOfSaleName) {
      errors.push(`Sai điểm bán: ${merchant.pointOfSaleName} vs ${bill.pointOfSaleName}`);
    }
  }
  
  // So sánh mã chuẩn chi (phải khớp, nhưng check lại để chắc chắn)
  if (bill.transactionCode !== merchant.transactionCode) {
    errors.push(`Sai mã chuẩn chi: ${merchant.transactionCode} vs ${bill.transactionCode}`);
  }
  
  if (errors.length > 0) {
    return {
      status: 'ERROR',
      errorMessage: `Chưa khớp - ${errors.join('; ')}`,
    };
  }
  
  return {
    status: 'MATCHED',
    errorMessage: undefined,
  };
}
```

### 6.4. ReportService - Query functions

```typescript
// src/lib/reportServices.ts

/**
 * Lấy reports cho Admin
 */
async getReportsForAdmin(
  filters: {
    dateFrom?: string;
    dateTo?: string;
    agentId?: string;
    agentCode?: string;
    pointOfSaleName?: string;
    reconciliationStatus?: 'MATCHED' | 'ERROR' | 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL';
    adminPaymentStatus?: AdminPaymentStatus;
  },
  options?: PaginationOptions
): Promise<PaginatedReportResult> {
  const snapshot = await get(ref(database, 'report_records'));
  let records = FirebaseUtils.objectToArray<ReportRecord>(snapshot.val() || {});
  
  // Apply filters
  if (filters.agentId) {
    records = records.filter(r => r.agentId === filters.agentId);
  }
  if (filters.agentCode) {
    records = records.filter(r => r.agentCode === filters.agentCode);
  }
  if (filters.pointOfSaleName) {
    records = records.filter(r => 
      r.pointOfSaleName === filters.pointOfSaleName || 
      r.merchantPointOfSaleName === filters.pointOfSaleName
    );
  }
  if (filters.reconciliationStatus) {
    records = records.filter(r => r.reconciliationStatus === filters.reconciliationStatus);
  }
  if (filters.adminPaymentStatus) {
    records = records.filter(r => r.adminPaymentStatus === filters.adminPaymentStatus);
  }
  // Date filter (client-side)
  if (filters.dateFrom || filters.dateTo) {
    records = records.filter(r => {
      const date = r.transactionDate || r.userBillCreatedAt || r.createdAt;
      if (!date) return true;
      const dateStr = String(date).split('T')[0];
      if (filters.dateFrom && dateStr < filters.dateFrom) return false;
      if (filters.dateTo && dateStr > filters.dateTo) return false;
      return true;
    });
  }
  
  // Sort và paginate
  records.sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA; // Mới nhất trước
  });
  
  const limit = options?.limit || 10000;
  const paginated = records.slice(0, limit);
  
  return {
    records: paginated,
    total: records.length,
  };
}

/**
 * Lấy reports cho Agent
 */
async getReportsForAgent(
  agentId: string,
  filters: {
    dateFrom?: string;
    dateTo?: string;
    pointOfSaleName?: string;
    reconciliationStatus?: 'MATCHED' | 'ERROR' | 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL';
    adminPaymentStatus?: AdminPaymentStatus;
    agentPaymentStatus?: AgentPaymentStatus;
  },
  options?: PaginationOptions
): Promise<PaginatedReportResult> {
  // Tái sử dụng getReportsForAdmin với filter agentId
  return this.getReportsForAdmin(
    {
      ...filters,
      agentId,
    },
    options
  );
}

/**
 * Lấy reports cho User
 */
async getReportsForUser(
  userId: string,
  filters: {
    dateFrom?: string;
    dateTo?: string;
    pointOfSaleName?: string;
    reconciliationStatus?: 'MATCHED' | 'ERROR' | 'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL';
    agentPaymentStatus?: AgentPaymentStatus;
  },
  options?: PaginationOptions
): Promise<PaginatedReportResult> {
  const snapshot = await get(ref(database, 'report_records'));
  let records = FirebaseUtils.objectToArray<ReportRecord>(snapshot.val() || {});
  
  // Filter userId
  records = records.filter(r => r.userId === userId);
  
  // Apply các filter khác (tương tự getReportsForAdmin)
  if (filters.pointOfSaleName) {
    records = records.filter(r => 
      r.pointOfSaleName === filters.pointOfSaleName || 
      r.merchantPointOfSaleName === filters.pointOfSaleName
    );
  }
  if (filters.reconciliationStatus) {
    records = records.filter(r => r.reconciliationStatus === filters.reconciliationStatus);
  }
  if (filters.agentPaymentStatus) {
    records = records.filter(r => r.agentPaymentStatus === filters.agentPaymentStatus);
  }
  // Date filter (client-side)
  if (filters.dateFrom || filters.dateTo) {
    records = records.filter(r => {
      const date = r.transactionDate || r.userBillCreatedAt || r.createdAt;
      if (!date) return true;
      const dateStr = String(date).split('T')[0];
      if (filters.dateFrom && dateStr < filters.dateFrom) return false;
      if (filters.dateTo && dateStr > filters.dateTo) return false;
      return true;
    });
  }
  
  // Sort và paginate
  records.sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });
  
  const limit = options?.limit || 10000;
  const paginated = records.slice(0, limit);
  
  return {
    records: paginated,
    total: records.length,
  };
}
```

### 6.5. Component Example - Admin ReconciliationModule

```typescript
// components/ReconciliationModule.tsx (skeleton)

const ReconciliationModule: React.FC = () => {
  const [pendingBills, setPendingBills] = useState<ReportRecord[]>([]);
  const [waitingForMerchant, setWaitingForMerchant] = useState<ReportRecord[]>([]);
  const [waitingForBill, setWaitingForBill] = useState<ReportRecord[]>([]);
  const [errorRecords, setErrorRecords] = useState<ReportRecord[]>([]);
  
  useEffect(() => {
    loadPendingBills();
  }, []);
  
  const loadPendingBills = async () => {
    // Card "Bills đang chờ đối soát" - lấy cả WAITING_FOR_MERCHANT và WAITING_FOR_BILL
    const result = await ReportService.getReportsForAdmin({
      reconciliationStatus: undefined, // Không filter, sẽ filter client-side
    });
    
    const allPending = result.records.filter(r => 
      r.reconciliationStatus === 'WAITING_FOR_MERCHANT' || 
      r.reconciliationStatus === 'WAITING_FOR_BILL'
    );
    
    // Danh sách "Bills đang chờ" - có userBillId nhưng chưa có merchant
    const waitingMerchant = allPending.filter(r => 
      r.reconciliationStatus === 'WAITING_FOR_MERCHANT' && r.userBillId
    );
    
    // Danh sách "Giao dịch chưa có bill" - có merchant nhưng chưa có bill
    const waitingBill = allPending.filter(r => 
      r.reconciliationStatus === 'WAITING_FOR_BILL' && r.merchantTransactionId
    );
    
    // Danh sách "Lỗi đối soát"
    const errors = result.records.filter(r => r.reconciliationStatus === 'ERROR');
    
    setWaitingForMerchant(waitingMerchant);
    setWaitingForBill(waitingBill);
    setErrorRecords(errors);
    setPendingBills(allPending);
  };
  
  // Mapping reconciliationStatus sang tiếng Việt
  const getStatusLabel = (status: string): string => {
    const mapping: Record<string, string> = {
      'WAITING_FOR_MERCHANT': 'Chờ file merchants',
      'WAITING_FOR_BILL': 'Chờ người dùng up bill',
      'MATCHED': 'Đã đối soát',
      'ERROR': 'Lỗi đối soát',
    };
    return mapping[status] || status;
  };
  
  return (
    <div>
      {/* Card "Bills đang chờ đối soát" */}
      <div>
        <h3>Bills đang chờ đối soát: {pendingBills.length}</h3>
      </div>
      
      {/* Danh sách "Bills đang chờ" */}
      <div>
        <h4>Bills đang chờ ({waitingForMerchant.length})</h4>
        {waitingForMerchant.map(record => (
          <div key={record.id}>
            <p>Mã GD: {record.transactionCode}</p>
            <p>Số tiền: {record.amount}</p>
            <p>Trạng thái: {getStatusLabel(record.reconciliationStatus)}</p>
            {/* Có thể hiển thị ảnh bill từ user_bills/{record.userBillId}/imageUrl */}
          </div>
        ))}
      </div>
      
      {/* Danh sách "Giao dịch chưa có bill" */}
      <div>
        <h4>Giao dịch chưa có bill ({waitingForBill.length})</h4>
        {waitingForBill.map(record => (
          <div key={record.id}>
            <p>Mã GD: {record.transactionCode}</p>
            <p>Số tiền: {record.merchantAmount}</p>
            <p>Trạng thái: {getStatusLabel(record.reconciliationStatus)}</p>
            {/* Hiển thị các cột từ merchantsFileData */}
          </div>
        ))}
      </div>
      
      {/* Danh sách "Lỗi đối soát" */}
      <div>
        <h4>Lỗi đối soát ({errorRecords.length})</h4>
        {errorRecords.map(record => (
          <div key={record.id}>
            <p>Mã GD: {record.transactionCode}</p>
            <p>Số tiền bill: {record.amount} | Số tiền merchant: {record.merchantAmount}</p>
            <p>Trạng thái: {getStatusLabel(record.reconciliationStatus)}</p>
            <p>Lỗi: {record.errorMessage}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## VII. DANH SÁCH FILE/MODULE CẦN SỬA VÀ THỨ TỰ THỰC HIỆN

### 7.1. Danh sách file cần sửa

#### 7.1.1. Services (Backend Logic)

1. **`src/lib/transactionIndexService.ts`** (MỚI)
   - `reserveTransactionCode(transactionCode: string)` - Dùng `runTransaction` (API tách rời)
   - `attachBillToCode(transactionCode: string, billId: string)` (API tách rời)
   - `attachMerchantToCode(transactionCode: string, merchantTransactionId: string)` (API tách rời)
   - `getReportRecordIdByCode(transactionCode: string)`
   - **(Optional – khuyến nghị)**: `reserveTransactionCodeForBill(code: string, billId: string)` - API atomic, gom check + attach trong một transaction, tránh race condition nếu hệ thống có nguy cơ nhiều request song song cho cùng transactionCode
   - **(Optional – khuyến nghị)**: `reserveTransactionCodeForMerchant(code: string, merchantTransactionId: string)` - API atomic, gom check + attach trong một transaction, tránh race condition nếu hệ thống có nguy cơ nhiều request song song cho cùng transactionCode

2. **`src/lib/reportServices.ts`** (SỬA LỚN)
   - Thêm `upsertFromUserBill(bill: UserBill)` - Check duplicate, set `reconciliationStatus`
   - Thêm `upsertFromMerchantTransaction(tx: MerchantTransaction)` - Check duplicate, set `reconciliationStatus`
   - Thêm `getReportsForAdmin(filters)` - Chỉ query từ `report_records`
   - Thêm `getReportsForAgent(agentId, filters)` - Chỉ query từ `report_records`
   - Thêm `getReportsForUser(userId, filters)` - Chỉ query từ `report_records`
   - Thêm `updateAdminPaymentStatus(reportRecordIds, status, paidAt)`
   - Thêm `updateAgentPaymentStatus(reportRecordIds, status, paidAt, note)`
   - Sửa `getAllReportRecordsWithMerchants()` → chỉ query từ `report_records` (không merge nữa)
   - Xóa logic merge thủ công, virtual records

3. **`src/lib/userServices.ts`** (SỬA)
   - Trong `createUserBill()`: Check duplicate qua `transaction_index` trước khi lưu
   - Sau khi lưu bill, gọi `ReportService.upsertFromUserBill()`
   - Xóa logic tạo `report_records` thủ công (nếu có)

4. **`src/lib/firebaseServices.ts`** (SỬA)
   - Trong `MerchantTransactionsService.createBatch()`: Check duplicate qua `transaction_index` trước khi lưu
   - Sau khi lưu transactions, gọi `ReportService.upsertFromMerchantTransaction()` cho mỗi transaction
   - Xóa logic tạo `report_records` thủ công (nếu có)

#### 7.1.2. Types

5. **`types.ts`** (SỬA)
   - Cập nhật `ReportRecord` interface:
     - `reconciliationStatus`: Thay `'PENDING' | 'MATCHED' | 'ERROR' | 'UNMATCHED'` → `'WAITING_FOR_MERCHANT' | 'WAITING_FOR_BILL' | 'MATCHED' | 'ERROR'`
     - Thêm `agentPaymentStatus?: AgentPaymentStatus`
     - Thêm `agentPaidAt?: string`
     - Thêm `agentPaidNote?: string`
     - Đảm bảo đầy đủ các field cần thiết
   - Thêm `TransactionIndexEntry` interface

#### 7.1.3. Components - Admin

6. **`components/AdminReport.tsx`** (SỬA)
   - Thay `getAllReportRecordsWithMerchants()` → `getReportsForAdmin()`
   - Xóa logic merge thủ công
   - Hiển thị `reconciliationStatus` dưới dạng tiếng Việt

7. **`components/Payouts.tsx`** (SỬA)
   - Thay query → `getReportsForAdmin({ reconciliationStatus: 'MATCHED', adminPaymentStatus: 'UNPAID' })`
   - Update payment: Dùng `updateAdminPaymentStatus()`

8. **`components/ReconciliationModule.tsx`** (SỬA)
   - Card "Bills đang chờ đối soát": Query `getReportsForAdmin()` rồi filter `reconciliationStatus IN ['WAITING_FOR_MERCHANT', 'WAITING_FOR_BILL']`
   - Danh sách "Bills đang chờ": Filter `reconciliationStatus = 'WAITING_FOR_MERCHANT'` và có `userBillId`
   - Danh sách "Giao dịch chưa có bill": Filter `reconciliationStatus = 'WAITING_FOR_BILL'` và có `merchantTransactionId`
   - Danh sách "Lỗi đối soát": Filter `reconciliationStatus = 'ERROR'`
   - Hiển thị `reconciliationStatus` và `errorMessage` dưới dạng tiếng Việt

#### 7.1.4. Components - Agent

9. **`components/agent/AgentReport.tsx`** (SỬA)
   - Thay `getAllReportRecordsWithMerchants()` → `getReportsForAgent(agentId, filters)`
   - Hiển thị `reconciliationStatus` dưới dạng tiếng Việt

10. **`components/agent/AgentPayments.tsx`** (SỬA)
    - Thay query `user_bills` → `getReportsForAgent(agentId, { agentPaymentStatus: 'UNPAID' })`
    - Update payment: Dùng `updateAgentPaymentStatus()`
    - Xóa logic map với `user_bills` (chỉ dùng để lấy ảnh bill khi cần)

#### 7.1.5. Components - User

11. **`components/user/BillHistory.tsx`** (SỬA)
    - Thay query `user_bills` + merge → `getReportsForUser(userId, filters)`
    - Xóa logic merge thủ công
    - Chỉ dùng `user_bills` để lấy ảnh bill khi cần
    - Hiển thị `reconciliationStatus` dưới dạng tiếng Việt

12. **`components/user/UserReport.tsx`** (SỬA)
    - Thay `getAllReportRecordsWithMerchants()` → `getReportsForUser(userId, filters)`
    - Hiển thị `reconciliationStatus` dưới dạng tiếng Việt

13. **`components/user/PaymentStatus.tsx`** (SỬA)
    - Thay query `user_bills` → `getReportsForUser(userId, { agentPaymentStatus: 'PAID' | 'UNPAID' })`
    - Xóa logic check `user_bills.agentPaymentStatus`

#### 7.1.6. Utilities

14. **`src/utils/transactionCodeUtils.ts`** (MỚI)
    - `sanitizeTransactionCode(code: string): string` - Loại bỏ ký tự đặc biệt để dùng làm Firebase key

### 7.2. Thứ tự thực hiện

**Bước 1: Tạo infrastructure mới (không ảnh hưởng code cũ)**
1. Tạo `src/utils/transactionCodeUtils.ts`
2. Tạo `src/lib/transactionIndexService.ts`:
   - Implement các API tách rời: `reserveTransactionCode`, `attachBillToCode`, `attachMerchantToCode`, `getReportRecordIdByCode`
   - **(Optional – khuyến nghị)**: Nếu cần đảm bảo tuyệt đối không có race condition, implement luôn `reserveTransactionCodeForBill` và `reserveTransactionCodeForMerchant` và cân nhắc dùng chúng thay thế combo `reserveTransactionCode + attach...` trong các flow upload
3. Cập nhật `types.ts`: Thêm `TransactionIndexEntry`, cập nhật `ReportRecord` (đổi `reconciliationStatus`)

**Bước 2: Cập nhật ReportService (core logic)**
4. Thêm các hàm mới vào `ReportService`:
   - `upsertFromUserBill()` - Check duplicate, set `reconciliationStatus` (WAITING_FOR_MERCHANT/MATCHED/ERROR)
   - `upsertFromMerchantTransaction()` - Check duplicate, set `reconciliationStatus` (WAITING_FOR_BILL/MATCHED/ERROR)
   - `getReportsForAdmin()`
   - `getReportsForAgent()`
   - `getReportsForUser()`
   - `updateAdminPaymentStatus()`
   - `updateAgentPaymentStatus()`
5. Sửa `getAllReportRecordsWithMerchants()` để chỉ query từ `report_records` (giữ backward compatibility)

**Bước 3: Tích hợp vào luồng upload (tạo/update report_records tự động + chặn duplicate)**
6. Sửa `UserService.createUserBill()`: 
   - Check duplicate qua `transaction_index` trước khi lưu
   - Gọi `ReportService.upsertFromUserBill()` sau khi lưu bill
7. Sửa `MerchantTransactionsService.createBatch()`: 
   - Check duplicate qua `transaction_index` trước khi lưu
   - Gọi `ReportService.upsertFromMerchantTransaction()` sau khi lưu mỗi transaction

**Bước 4: Refactor các màn hình Admin**
8. Sửa `components/AdminReport.tsx` - Dùng `getReportsForAdmin()`, hiển thị status tiếng Việt
9. Sửa `components/Payouts.tsx` - Dùng `getReportsForAdmin()` với filter payment
10. Sửa `components/ReconciliationModule.tsx` - Query `report_records` với filter `reconciliationStatus`, hiển thị status tiếng Việt

**Bước 5: Refactor các màn hình Agent**
11. Sửa `components/agent/AgentReport.tsx` - Dùng `getReportsForAgent()`, hiển thị status tiếng Việt
12. Sửa `components/agent/AgentPayments.tsx` - Query `report_records` thay vì `user_bills`

**Bước 6: Refactor các màn hình User**
13. Sửa `components/user/BillHistory.tsx` - Dùng `getReportsForUser()`, hiển thị status tiếng Việt
14. Sửa `components/user/UserReport.tsx` - Dùng `getReportsForUser()`, hiển thị status tiếng Việt
15. Sửa `components/user/PaymentStatus.tsx` - Query `report_records` cho trạng thái thanh toán

**Bước 7: Testing & Cleanup**
16. Test toàn bộ luồng: Upload bill → Upload Excel → Đối soát → Thanh toán
17. Test chặn duplicate: Upload bill trùng → Upload Excel trùng
18. Xóa code cũ không dùng (nếu có)
19. Update documentation

---

## VIII. LƯU Ý QUAN TRỌNG

### 8.1. Backward Compatibility

- Giữ nguyên các hàm cũ (`getAllReportRecordsWithMerchants`) nhưng refactor để chỉ query từ `report_records`
- Có thể giữ mirror `agentPaymentStatus` sang `user_bills` để đảm bảo code cũ vẫn hoạt động

### 8.2. Migration Data

- Cần script migration để:
  - Tạo `transaction_index` từ data hiện tại (mỗi `transactionCode` → 1 entry)
  - Deduplicate `report_records` (chỉ giữ 1 record cho mỗi `transactionCode`)
  - Đảm bảo tất cả `report_records` đều có entry trong `transaction_index`
  - Update `reconciliationStatus` từ `PENDING/UNMATCHED` → `WAITING_FOR_MERCHANT/WAITING_FOR_BILL`

### 8.3. Performance

- `transaction_index` giúp lookup nhanh `reportRecordId` từ `transactionCode`
- Không cần load toàn bộ 3 bảng rồi merge client-side nữa
- Query trực tiếp từ `report_records` với filter → nhanh hơn

### 8.4. Error Handling

- Khi `reserveTransactionCode` fail (race condition) → Firebase tự động retry nhờ `runTransaction`
- Khi `upsertFromUserBill` fail → rollback `user_bills` (nếu cần)
- Log đầy đủ để debug

---

## IX. CHECKLIST ĐẢM BẢO

Sau khi refactor xong, cần đảm bảo:

- [ ] **Tất cả tab Admin/Agent/User liên quan Báo cáo/Thanh toán/Lịch sử/Đối soát đều truy vấn từ `report_records`**
  - Admin: Báo cáo, Thanh toán & Công nợ, Đối soát & Xử lý
  - Agent: Báo cáo, Thanh Toán
  - User: Lịch sử, Báo cáo, Thanh Toán

- [ ] **Cơ chế `transaction_index + runTransaction` đảm bảo không tồn tại duplicate `transactionCode` ở `report_records`, `user_bills`, `merchant_transactions`**
  - Mỗi `transactionCode` chỉ có 1 entry trong `transaction_index`
  - Mỗi entry chỉ trỏ đến 1 `reportRecordId`
  - `user_bills`: Chặn upload bill trùng (check `index.userBillId`)
  - `merchant_transactions`: Skip transaction trùng (check `index.merchantTransactionId`)
  - `report_records`: Chỉ tạo qua `transaction_index`

- [ ] **Tất cả `reconciliationStatus` dùng 4 giá trị mới: `WAITING_FOR_MERCHANT`, `WAITING_FOR_BILL`, `MATCHED`, `ERROR`**
  - Không còn dùng `PENDING` hoặc `UNMATCHED` (trừ migration)

- [ ] **UI hiển thị `reconciliationStatus` dưới dạng tiếng Việt theo mapping**
  - `WAITING_FOR_MERCHANT` → "Chờ file merchants"
  - `WAITING_FOR_BILL` → "Chờ người dùng up bill"
  - `MATCHED` → "Đã đối soát"
  - `ERROR` → "Lỗi đối soát" (kèm `errorMessage`)

- [ ] **`errorMessage` được lưu trong `report_records.errorMessage` và hiển thị trên UI**
  - Không tự sinh `errorMessage` ở UI
  - Chỉ hiển thị `errorMessage` từ database

---

## X. TÓM TẮT

Sau khi refactor V2:

1. **Tất cả màn hình báo cáo/thanh toán/lịch sử** chỉ query từ `report_records`
2. **`user_bills` và `merchant_transactions`** chỉ lưu raw data, không dùng để query
3. **`transaction_index`** dùng `runTransaction` đảm bảo mỗi `transactionCode` chỉ có 1 `reportRecordId`
4. **Không còn duplicate `transactionCode`** trong database (nhờ chặn ở 3 bảng)
5. **`reconciliationStatus`** dùng 4 giá trị mới, hiển thị tiếng Việt trên UI
6. **Logic đối soát và thanh toán** giữ nguyên, chỉ thay đổi cách lấy data
7. **Performance tốt hơn** vì không cần merge nhiều bảng client-side
8. **Dễ maintain** vì logic tập trung ở `ReportService`

