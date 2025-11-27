# 📊 TỔNG HỢP DỮ LIỆU - CÁCH HOẠT ĐỘNG

## 🎯 MỤC ĐÍCH

Tính năng này giúp hệ thống:

1. **Tự động phát hiện bill bổ sung/quên**: Khi đại lý up lại bill đã xử lý trước đó, hệ thống tự động nhận biết và báo lỗi
2. **Tăng tốc độ báo cáo**: Thay vì phải đọc tất cả dữ liệu chi tiết (có thể rất nhiều), hệ thống chỉ cần đọc phần tóm tắt → nhanh hơn rất nhiều

---

## 🔄 CÁCH HOẠT ĐỘNG

### **Bước 1: Khi đối soát xong**

Sau mỗi lần đối soát, hệ thống tự động **tổng hợp** và **lưu lại** 3 loại thông tin:

#### **1. Theo Mã giao dịch**
- Hệ thống ghi nhớ: Mã giao dịch này đã được xử lý ở phiên đối soát nào
- **Đếm TẤT CẢ** transaction codes (kể cả records không có điểm thu/đại lý)
- Ví dụ: Mã `20407295176354816` đã được xử lý ở phiên A
- **Lưu ý**: Số này có thể lớn hơn số giao dịch trong "Theo Điểm thu" hoặc "Theo Đại lý" vì bao gồm cả records MISSING_IN_MERCHANT hoặc MISSING_IN_AGENT

#### **2. Theo Điểm thu**
- Hệ thống tính tổng: Điểm thu này có bao nhiêu giao dịch, tổng tiền bao nhiêu, bao nhiêu khớp, bao nhiêu lỗi
- **Chỉ đếm** records có `pointOfSaleName` (từ merchant hoặc agent)
- Ví dụ: Điểm thu "ANCATTUONG66PKV01" có 15 giao dịch, tổng 250 triệu, 12 khớp, 3 lỗi
- **Lưu ý**: Records không có `pointOfSaleName` sẽ không được tính vào đây

#### **3. Theo Đại lý**
- Hệ thống tính tổng: Đại lý này có bao nhiêu giao dịch, tổng tiền bao nhiêu, bao nhiêu khớp, bao nhiêu lỗi
- **Chỉ đếm** records có `agentId` (từ agent submission)
- Ví dụ: Đại lý A có 25 giao dịch, tổng 500 triệu, 20 khớp, 5 lỗi
- **Lưu ý**: Records không có `agentId` (ví dụ: MISSING_IN_AGENT) sẽ không được tính vào đây

---

### **Bước 2: Lưu vào hệ thống**

Tất cả thông tin tổng hợp này được **lưu lại** cùng với phiên đối soát, để dùng cho các lần sau.

---

### **Bước 3: Khi đối soát lần sau**

Khi đối soát lần 2, hệ thống sẽ:

1. **Đọc lại** tất cả thông tin tổng hợp từ các phiên đối soát trước
2. **Kiểm tra** từng bill mới:
   - Nếu mã giao dịch đã có trong phiên trước → Báo lỗi: **"Bill đã được xử lý trong phiên trước"**
   - Nếu chưa có → Xử lý bình thường

---

### **Bước 4: Hiển thị trên màn hình**

Sau khi đối soát xong, bạn sẽ thấy:

1. **Card "Dữ liệu Tổng hợp"** với 3 số liệu:
   - **Mã giao dịch**: Tổng số unique transaction codes (bao gồm tất cả records)
   - **Điểm thu**: Số lượng unique điểm thu (chỉ những records có pointOfSaleName)
   - **Đại lý**: Số lượng unique đại lý (chỉ những records có agentId)
   
   **Lưu ý**: Số "Mã giao dịch" có thể lớn hơn số giao dịch trong chi tiết "Theo Điểm thu" hoặc "Theo Đại lý" vì:
   - Mã giao dịch đếm TẤT CẢ transaction codes
   - Chi tiết chỉ đếm records có đủ thông tin (pointOfSaleName hoặc agentId)

2. **Khi click "Xem chi tiết"**:
   - **Theo Điểm thu**: Danh sách điểm thu với số GD, khớp, lỗi, tổng tiền (chỉ records có pointOfSaleName)
   - **Theo Đại lý**: Danh sách đại lý với số GD, khớp, lỗi, tổng tiền (chỉ records có agentId)

---

## 💡 VÍ DỤ THỰC TẾ

### **Ví dụ 1: Phát hiện Bill bổ sung**

**Lần 1 (Phiên A)**:
- Đại lý up bill mã `20407295176354816` → Khớp ✅
- Hệ thống ghi nhớ: Mã này đã xử lý ở Phiên A

**Lần 2 (Phiên B)**:
- Đại lý up lại bill mã `20407295176354816` (quên đã up rồi)
- Hệ thống kiểm tra → Tìm thấy mã này đã xử lý ở Phiên A (khác Phiên B)
- → Báo lỗi: **"⚠️ Bill 20407295176354816 đã được xử lý trong phiên trước (Phiên A). Đây là bill bổ sung/quên."**
- Badge hiển thị: **"Trùng lặp"** (màu cam)

### **Ví dụ 2: Tăng tốc báo cáo**

**Trước (không có tổng hợp)**:
- Hệ thống phải đọc TẤT CẢ các giao dịch chi tiết (có thể hàng nghìn) → Mất 5-10 giây
- Sau đó tính toán lại từ đầu

**Sau (có tổng hợp)**:
- Hệ thống chỉ cần đọc phần tóm tắt từ các phiên đối soát → Mất 0.5-1 giây
- → **Nhanh hơn 10-100 lần!**

---

## ⚡ LỢI ÍCH

1. **Tự động phát hiện bill bổ sung**: Không cần kiểm tra thủ công, hệ thống tự động báo
2. **Báo cáo nhanh hơn**: 10-100 lần nhanh hơn so với trước
3. **Tiết kiệm tài nguyên**: Chỉ lưu phần tóm tắt, không lưu toàn bộ chi tiết
4. **Dễ mở rộng**: Có thể thêm thống kê mới mà không làm chậm hệ thống

---

## 📍 TÓM TẮT

**"Tổng hợp dữ liệu"** là cách hệ thống **ghi nhớ** và **tóm tắt** kết quả đối soát, giúp:

- ✅ Tự động phát hiện khi đại lý up lại bill đã xử lý
- ✅ Báo cáo nhanh hơn rất nhiều
- ✅ Giảm tải cho hệ thống

**Đơn giản**: Giống như bạn ghi sổ tay tóm tắt những gì đã làm, để lần sau tra cứu nhanh hơn thay vì phải đọc lại toàn bộ chi tiết.
