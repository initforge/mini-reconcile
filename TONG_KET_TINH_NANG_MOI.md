# 📋 TỔNG KẾT TÍNH NĂNG MỚI
## Hệ thống Đối soát Thanh toán PayReconcile Pro

---

<div style="page-break-after: always;"></div>

## 🎯 1. TỰ ĐỘNG LINK ĐẠI LÝ BẰNG SỐ TÀI KHOẢN NGÂN HÀNG

### 📍 Sẽ thấy ở đâu:
- **Quản lý Đại lý** → Form thêm/sửa đại lý → Field "Số tài khoản ngân hàng"

### 🔍 Làm gì sẽ thấy:
1. Nhập số tài khoản ngân hàng vào form đại lý
2. Upload ảnh bill trong **Đối soát**
3. Hệ thống tự động link đại lý (không cần chọn tay)

### ⚠️ Lưu ý
Số tài khoản ngân hàng = số hiển thị trên ảnh VNPay (có thể trùng số điện thoại, nhưng đây là số TK ngân hàng)

---

<div style="page-break-after: always;"></div>

## 💰 2. CHIẾT KHẤU THEO TỪNG ĐIỂM THU

### 📍 Sẽ thấy ở đâu:
- **Quản lý Đại lý** → Form thêm/sửa → Phần "Bước 1: Gán Điểm thu" và "Bước 2: Cấu hình Chiết khấu"

### 🔍 Làm gì sẽ thấy:
1. **Bước 1**: Chọn các điểm thu (checkbox)
2. **Bước 2**: Với mỗi điểm thu đã chọn, cấu hình chiết khấu riêng (QR 1, QR 2, Sofpos, POS)
3. Mỗi điểm thu có thể có mức chiết khấu khác nhau

---

<div style="page-break-after: always;"></div>

## ✏️ 3. SỬA THỦ CÔNG GIAO DỊCH

### 📍 Sẽ thấy ở đâu:
- **Đối soát** → Bước 3: Kết quả → Bảng kết quả → Cột "Thao tác" → Nút **Sửa**

### 🔍 Làm gì sẽ thấy:
1. Click nút **Sửa** ở dòng giao dịch cần sửa
2. Modal hiện ra cho phép sửa: mã chuẩn chi, số tiền, điểm thu, đại lý
3. Click **Lưu thay đổi** → Hệ thống tự động tính lại trạng thái

---

<div style="page-break-after: always;"></div>

## 🏪 4. GÁN ĐIỂM BÁN KHI OCR KHÔNG TÌM THẤY

### 📍 Sẽ thấy ở đâu:
- **Đối soát** → Bước 3: Kết quả → Bảng kết quả → Cột "Điểm thu" → Dropdown

### 🔍 Làm gì sẽ thấy:
1. Nếu OCR không đọc được điểm bán → Cột "Điểm thu" hiển thị "Chưa có điểm bán"
2. Click dropdown → Chọn điểm bán từ danh sách
3. Hệ thống tự động cập nhật

---

<div style="page-break-after: always;"></div>

## 🚨 5. BÁO LỖI CHI TIẾT VÀ PHÂN LOẠI

### 📍 Sẽ thấy ở đâu:
- **Đối soát** → Bước 3: Kết quả → Card "Phân loại lỗi chi tiết" (ngay dưới Summary Banner)
- Bảng kết quả → Cột "Trạng thái" → Badge màu
- Filter Bar → Dropdown "Tất cả lỗi" → Chọn loại lỗi

### 🔍 Làm gì sẽ thấy:
1. Sau khi đối soát xong → Thấy card với 5 loại lỗi:
   - 🔴 **Sai số tiền** (đỏ)
   - 🟣 **Sai điểm bán** (tím)
   - 🟡 **Sai đại lý** (hồng)
   - 🟠 **Trùng lặp** (cam)
   - ⚠️ **Không tìm thấy** (vàng)
2. Trong bảng: Mỗi bill lỗi có badge màu tương ứng
3. Filter: Click "Lỗi" → Chọn loại lỗi → Chỉ thấy bill loại đó

---

<div style="page-break-after: always;"></div>

## 🔍 6. LỌC VÀ XUẤT BILL LỖI

### 📍 Sẽ thấy ở đâu:
- **Đối soát** → Bước 3: Kết quả → Filter Bar → Nút "Lỗi" + Dropdown loại lỗi
- Action Bar → Nút **"Xuất Bill lỗi"** (màu vàng)

### 🔍 Làm gì sẽ thấy:
1. Click **"Lỗi"** trong Filter → Chỉ thấy bill lỗi
2. Chọn loại lỗi cụ thể từ dropdown (tùy chọn)
3. Click **"Xuất Bill lỗi"** → Tải file Excel `Bill_loi_YYYY-MM-DD.xlsx`

---

<div style="page-break-after: always;"></div>

## 💾 7. LƯU DỮ LIỆU TỔNG HỢP

### 📍 Sẽ thấy ở đâu:
- **Đối soát** → Bước 3: Kết quả → Card **"Dữ liệu Tổng hợp (Aggregated Data)"** (màu xanh dương, sau Summary Banner)

### 🔍 Làm gì sẽ thấy:
1. Sau khi đối soát xong → Thấy card với 3 số liệu:
   - Mã giao dịch: X
   - Điểm thu: Y
   - Đại lý: Z
2. Click **"Xem chi tiết"** → Mở rộng hiển thị:
   - **Theo Điểm thu**: Danh sách điểm thu với số GD, khớp, lỗi, tổng tiền
   - **Theo Đại lý**: Danh sách đại lý với số GD, khớp, lỗi, tổng tiền

### 💡 Mục đích
- Phát hiện bill bổ sung/quên
- Tăng tốc độ truy vấn báo cáo (10-100x nhanh hơn)

---

<div style="page-break-after: always;"></div>

## 📦 8. XỬ LÝ BILL BỔ SUNG

### 📍 Sẽ thấy ở đâu:
- **Đối soát** → Bước 3: Kết quả → Bảng kết quả → Badge **"Trùng lặp"** (màu cam)

### 🔍 Làm gì sẽ thấy:
1. Đối soát lần 1: Upload bill → Khớp bình thường
2. Đối soát lần 2: Upload lại bill có mã chuẩn chi trùng
3. Hệ thống tự động phát hiện → Badge **"Trùng lặp"** + Chi tiết: **"Bill đã được xử lý trong session trước (session_id)"**

---

<div style="page-break-after: always;"></div>

## 📊 TỔNG KẾT VỊ TRÍ

| Tính năng | Vị trí hiển thị |
|-----------|----------------|
| **1. Auto-link đại lý** | Quản lý Đại lý → Form → Field "Số tài khoản ngân hàng" |
| **2. Chiết khấu theo điểm thu** | Quản lý Đại lý → Form → Bước 1 & 2 |
| **3. Sửa thủ công** | Đối soát → Bước 3 → Bảng → Cột "Thao tác" → Nút "Sửa" |
| **4. Gán điểm bán** | Đối soát → Bước 3 → Bảng → Cột "Điểm thu" → Dropdown |
| **5. Báo lỗi chi tiết** | Đối soát → Bước 3 → Card "Phân loại lỗi chi tiết" + Badge màu |
| **6. Lọc & xuất bill lỗi** | Đối soát → Bước 3 → Filter Bar + Nút "Xuất Bill lỗi" |
| **7. Dữ liệu tổng hợp** | Đối soát → Bước 3 → Card "Dữ liệu Tổng hợp" → "Xem chi tiết" |
| **8. Bill bổ sung** | Đối soát → Bước 3 → Badge "Trùng lặp" khi upload bill trùng |

---

**Lưu ý**: Tất cả tính năng ở **Bước 3: Kết quả** chỉ hiển thị **SAU KHI ĐỐI SOÁT XONG**

**Phiên bản**: 2.0  
**Ngày cập nhật**: 2025-11-18
