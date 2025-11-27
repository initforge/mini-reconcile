# 📖 HƯỚNG DẪN XEM CÁC TÍNH NĂNG MỚI

## 🚨 1. BÁO LỖI CHI TIẾT VÀ PHÂN LOẠI

### Cách xem:
1. **Thực hiện đối soát**:
   - Vào tab **Đối soát**
   - Upload file Excel Merchant và ảnh Agent
   - Click **Bắt đầu Đối soát**
   - Đợi hệ thống xử lý xong

2. **Xem phân loại lỗi**:
   - Sau khi đối soát xong, vào **Bước 3: Kết quả**
   - **Phần "Phân loại lỗi chi tiết"** sẽ hiển thị ngay dưới Summary Banner
   - Sẽ thấy các card màu với số lượng từng loại lỗi:
     - 🔴 **Sai số tiền** (màu đỏ)
     - 🟣 **Sai điểm bán** (màu tím)
     - 🟡 **Sai đại lý** (màu hồng)
     - 🟠 **Trùng lặp** (màu cam)
     - ⚠️ **Không tìm thấy** (màu vàng)

3. **Xem chi tiết từng loại lỗi**:
   - Trong bảng kết quả, cột **"Trạng thái"** sẽ hiển thị badge màu tương ứng
   - Click vào bộ lọc **"Lỗi"** → Chọn loại lỗi cụ thể từ dropdown
   - Bảng sẽ chỉ hiển thị các bill có loại lỗi đó

### Ví dụ:
- Nếu có bill sai số tiền → Badge màu đỏ "Sai số tiền" sẽ hiển thị
- Nếu có bill sai điểm bán → Badge màu tím "Sai điểm bán" sẽ hiển thị
- Click filter "Sai điểm bán" → Chỉ thấy các bill sai điểm bán

---

## 💾 2. LƯU DỮ LIỆU TỔNG HỢP (Aggregated Data)

### Cách xem:
1. **Sau khi đối soát xong**:
   - Vào **Bước 3: Kết quả**
   - Tìm phần **"Dữ liệu Tổng hợp (Aggregated Data)"** (card màu xanh dương)
   - Phần này hiển thị ngay sau Summary Banner và trước Filter Bar

2. **Xem tổng quan**:
   - Sẽ thấy 3 số liệu:
     - **Mã giao dịch**: Tổng số mã giao dịch đã xử lý
     - **Điểm thu**: Tổng số điểm thu
     - **Đại lý**: Tổng số đại lý

3. **Xem chi tiết**:
   - Click nút **"Xem chi tiết"** (màu xanh)
   - Sẽ mở rộng hiển thị:
     - **Theo Điểm thu**: Danh sách điểm thu với số GD, số khớp, số lỗi, tổng tiền
     - **Theo Đại lý**: Danh sách đại lý với số GD, số khớp, số lỗi, tổng tiền

### Lưu ý:
- Dữ liệu tổng hợp được tự động lưu vào Firebase
- Dùng để phát hiện bill bổ sung/quên khi đối soát lần sau
- Tăng tốc độ truy vấn báo cáo (10-100x nhanh hơn)

---

## 📦 3. XỬ LÝ BILL BỔ SUNG

### Cách kiểm tra:
1. **Đối soát lần đầu**:
   - Upload bill và đối soát bình thường
   - Hệ thống lưu aggregated data

2. **Đối soát lần 2 (bill bổ sung)**:
   - Upload bill có mã chuẩn chi đã xử lý trước đó
   - Hệ thống sẽ tự động phát hiện
   - Trong bảng kết quả, bill đó sẽ có:
     - Badge **"Trùng lặp"** (màu cam)
     - Chi tiết lỗi: **"Bill đã được xử lý trong session trước (session_id)"**

### Ví dụ:
- Lần 1: Đối soát bill mã "123456" → Khớp
- Lần 2: Đối soát lại bill mã "123456" → Sẽ báo lỗi "Bill đã được xử lý trong session trước"

---

## 💡 TÓM TẮT

### Để thấy **Báo lỗi chi tiết**:
✅ Thực hiện đối soát → Xem phần "Phân loại lỗi chi tiết" → Xem badge màu trong bảng → Dùng filter để lọc

### Để thấy **Dữ liệu tổng hợp**:
✅ Thực hiện đối soát → Xem phần "Dữ liệu Tổng hợp" → Click "Xem chi tiết" → Xem breakdown theo điểm thu/đại lý

### Để thấy **Xử lý bill bổ sung**:
✅ Đối soát lần 1 → Đối soát lại bill trùng → Xem badge "Trùng lặp" với chi tiết "Bill đã được xử lý trong session trước"

---

**Lưu ý**: Tất cả các tính năng này chỉ hiển thị **SAU KHI ĐỐI SOÁT XONG** (Bước 3: Kết quả)

