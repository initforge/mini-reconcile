# 📊 GIẢI THÍCH: TỔNG HỢP DỮ LIỆU (Aggregated Data)

## 🎯 MỤC ĐÍCH

Tính năng "Tổng hợp dữ liệu" có 2 mục đích chính:

1. **Phát hiện Bill bổ sung/quên**: Khi đại lý up lại bill đã xử lý trước đó, hệ thống tự động phát hiện và báo lỗi "Trùng lặp"
2. **Tăng tốc độ truy vấn báo cáo**: Thay vì phải load tất cả `reconciliation_records` (có thể hàng nghìn), chỉ cần đọc `aggregatedData` từ `reconciliation_sessions` (10-100x nhanh hơn)

---

## 🔄 QUY TRÌNH HOẠT ĐỘNG

### **Bước 1: Tính toán khi đối soát**

Khi đối soát xong, hệ thống tự động tính toán và lưu 3 loại dữ liệu tổng hợp:

#### **1.1. Theo Mã giao dịch (`byTransactionCode`)**
```typescript
{
  "20407295176354816": {
    transactionCode: "20407295176354816",
    pointOfSaleName: "ANCATTUONG66PKV01",
    agentId: "agent_001",
    merchantAmount: 18963000,
    agentAmount: 18963000,
    status: "MATCHED",
    lastProcessedAt: "2025-11-27T10:30:00.000Z",
    sessionIds: ["session_001", "session_002"] // Nếu bill được xử lý nhiều lần
  }
}
```

**Mục đích**: 
- Track từng mã giao dịch đã được xử lý ở session nào
- Phát hiện bill bổ sung (nếu `sessionId` khác với session hiện tại)

#### **1.2. Theo Điểm thu (`byPointOfSale`)**
```typescript
{
  "ANCATTUONG66PKV01": {
    pointOfSaleName: "ANCATTUONG66PKV01",
    totalTransactions: 15,
    totalAmount: 250000000,
    matchedCount: 12,
    errorCount: 3
  }
}
```

**Mục đích**: 
- Thống kê nhanh theo từng điểm thu
- Dùng cho báo cáo Dashboard/Reports

#### **1.3. Theo Đại lý (`byAgent`)**
```typescript
{
  "agent_001": {
    agentId: "agent_001",
    totalTransactions: 25,
    totalAmount: 500000000,
    matchedCount: 20,
    errorCount: 5
  }
}
```

**Mục đích**: 
- Thống kê nhanh theo từng đại lý
- Dùng cho báo cáo nợ theo đại lý

---

### **Bước 2: Lưu vào Firebase**

Sau khi tính toán xong, dữ liệu được lưu vào `reconciliation_sessions`:

```typescript
{
  id: "session_001",
  status: "COMPLETED",
  createdAt: "2025-11-27T10:30:00.000Z",
  summary: { ... }, // Tổng hợp đơn giản
  aggregatedData: {  // Dữ liệu tổng hợp chi tiết
    byTransactionCode: { ... },
    byPointOfSale: { ... },
    byAgent: { ... }
  }
}
```

---

### **Bước 3: Sử dụng khi đối soát lần sau**

Khi đối soát lần 2, hệ thống:

1. **Load tất cả `aggregatedData` từ các session trước**:
   ```typescript
   // Load từ tất cả sessions
   allSessions.forEach(session => {
     if (session.aggregatedData?.byTransactionCode) {
       Object.entries(session.aggregatedData.byTransactionCode).forEach(([txCode, txData]) => {
         existingTransactionCodes.set(txCode, {
           sessionId: session.id,
           processedAt: txData.lastProcessedAt
         });
       });
     }
   });
   ```

2. **Check khi đối soát**:
   ```typescript
   // Khi xử lý từng bill
   const existingTx = existingTransactionCodes.get(transactionCode);
   const isSupplementaryDuplicate = existingTx && existingTx.sessionId !== currentSessionId;
   
   if (isSupplementaryDuplicate) {
     // Báo lỗi: "Bill đã được xử lý trong session trước"
     status = TransactionStatus.ERROR_DUPLICATE;
     errorType = 'DUPLICATE';
   }
   ```

---

### **Bước 4: Hiển thị trên UI**

Card "Dữ liệu Tổng hợp" hiển thị:

1. **3 số liệu tổng quan**:
   - Mã giao dịch: Tổng số mã đã xử lý
   - Điểm thu: Tổng số điểm thu
   - Đại lý: Tổng số đại lý

2. **Chi tiết (khi click "Xem chi tiết")**:
   - **Theo Điểm thu**: Danh sách điểm thu với số GD, khớp, lỗi, tổng tiền
   - **Theo Đại lý**: Danh sách đại lý với số GD, khớp, lỗi, tổng tiền

---

## 💡 VÍ DỤ THỰC TẾ

### **Scenario 1: Phát hiện Bill bổ sung**

**Lần 1 (Session A)**:
- Đại lý up bill mã `20407295176354816` → Khớp ✅
- Hệ thống lưu vào `aggregatedData.byTransactionCode["20407295176354816"]` với `sessionIds: ["session_A"]`

**Lần 2 (Session B)**:
- Đại lý up lại bill mã `20407295176354816` (quên đã up rồi)
- Hệ thống check `existingTransactionCodes.get("20407295176354816")` → Tìm thấy `sessionId: "session_A"` (khác với `session_B`)
- → Báo lỗi: **"⚠️ Bill 20407295176354816 đã được xử lý trong session trước (session_A). Đây là bill bổ sung/quên."**
- Badge: **"Trùng lặp"** (màu cam)

### **Scenario 2: Tăng tốc báo cáo**

**Trước (không có aggregatedData)**:
```typescript
// Phải load TẤT CẢ records (có thể hàng nghìn)
const allRecords = await getAllReconciliationRecords(); // 5-10 giây
const stats = calculateStats(allRecords); // Tính toán lại từ đầu
```

**Sau (có aggregatedData)**:
```typescript
// Chỉ load sessions và đọc aggregatedData
const sessions = await getSessions(); // 0.5-1 giây
const stats = sessions.reduce((sum, s) => {
  return {
    totalVolume: sum.totalVolume + s.summary.totalAmount,
    totalTransactions: sum.totalTransactions + s.summary.totalRecords,
    // ...
  };
}, {});
// → 10-100x nhanh hơn!
```

---

## 🔍 CẤU TRÚC DỮ LIỆU CHI TIẾT

### **byTransactionCode**
- **Key**: `transactionCode` (mã chuẩn chi)
- **Value**: Thông tin chi tiết của giao dịch đó
- **Dùng để**: Phát hiện duplicate cross-session

### **byPointOfSale**
- **Key**: `pointOfSaleName` (tên điểm thu)
- **Value**: Thống kê tổng hợp theo điểm thu
- **Dùng để**: Báo cáo theo điểm thu

### **byAgent**
- **Key**: `agentId` (ID đại lý)
- **Value**: Thống kê tổng hợp theo đại lý
- **Dùng để**: Báo cáo nợ theo đại lý

---

## ⚡ LỢI ÍCH

1. **Phát hiện Bill bổ sung tự động**: Không cần check thủ công
2. **Tăng tốc báo cáo**: 10-100x nhanh hơn (không cần load tất cả records)
3. **Tiết kiệm tài nguyên**: Chỉ lưu summary, không lưu toàn bộ dữ liệu chi tiết
4. **Dễ mở rộng**: Có thể thêm thống kê mới vào `aggregatedData` mà không ảnh hưởng performance

---

## 📍 VỊ TRÍ TRONG CODE

- **Tính toán**: `components/ReconciliationModule.tsx:1445-1563`
- **Lưu vào Firebase**: `components/ReconciliationModule.tsx:1591`
- **Sử dụng để phát hiện duplicate**: `components/ReconciliationModule.tsx:1070-1081, 1121-1166`
- **Hiển thị UI**: `components/ReconciliationModule.tsx:2392-2477`

---

**Tóm lại**: "Tổng hợp dữ liệu" là một cơ chế tối ưu để:
- ✅ Phát hiện bill bổ sung/quên tự động
- ✅ Tăng tốc độ truy vấn báo cáo
- ✅ Giảm tải cho database

