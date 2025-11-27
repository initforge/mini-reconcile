# TỔNG KẾT TÍNH NĂNG HỆ THỐNG ĐỐI SOÁT THANH TOÁN

## 📋 MỤC LỤC
1. [Tổng quan hệ thống](#tổng-quan-hệ-thống)
2. [Các tính năng chính](#các-tính-năng-chính)
3. [Tính năng mới được thêm vào](#tính-năng-mới-được-thêm-vào)
4. [Hướng dẫn sử dụng](#hướng-dẫn-sử-dụng)
5. [Lưu ý quan trọng](#lưu-ý-quan-trọng)

---

## 🎯 TỔNG QUAN HỆ THỐNG

Hệ thống **PayReconcile Pro** là một ứng dụng web giúp đối soát thanh toán tự động giữa:
- **Hệ thống Merchant** (điểm bán): Upload file Excel chứa danh sách giao dịch
- **Đại lý** (Agent): Upload ảnh screenshot từ app VNPay/ngân hàng

Hệ thống sẽ tự động:
- ✅ Đọc và phân tích dữ liệu từ Excel và ảnh
- ✅ So khớp giao dịch theo mã chuẩn chi
- ✅ Phát hiện lỗi: sai số tiền, trùng lặp, thiếu dữ liệu
- ✅ Tính toán chiết khấu và tạo lệnh thanh toán
- ✅ Xuất báo cáo chi tiết

---

## 🚀 CÁC TÍNH NĂNG CHÍNH

### 1. **Quản lý Điểm bán (Merchants)**
- Thêm, sửa, xóa thông tin điểm bán
- Cấu hình: tên, mã, số tài khoản, điểm thu
- Quản lý nhiều điểm thu cho mỗi điểm bán

### 2. **Quản lý Đại lý (Agents)**
- Thêm, sửa, xóa thông tin đại lý
- Cấu hình số tài khoản ngân hàng
- **MỚI**: Gán điểm thu và cấu hình chiết khấu theo từng điểm thu
- **MỚI**: Thêm số điện thoại thanh toán để tự động link đại lý
- Upload mã QR thanh toán

### 3. **Đối soát (Reconciliation)**
- Upload file Excel từ Merchant (nhiều file cùng lúc)
- Upload ảnh screenshot từ Agent (nhiều ảnh cùng lúc)
- Tự động OCR (đọc chữ từ ảnh) bằng AI Gemini
- So khớp giao dịch theo mã chuẩn chi
- Hiển thị kết quả chi tiết với phân loại lỗi rõ ràng

### 4. **Báo cáo (Reports)**
- Báo cáo công nợ theo đại lý
- Báo cáo công nợ theo STK Admin
- Báo cáo giao dịch không khớp
- Lọc theo ngày/tuần/tháng
- Xuất Excel với định dạng đẹp

### 5. **Thanh toán (Payouts)**
- Xem danh sách giao dịch chưa thanh toán
- Tự động tính phí chiết khấu
- Tạo lệnh thanh toán cho đại lý
- Hiển thị mã QR thanh toán

### 6. **Tổng quan (Dashboard)**
- Thống kê tổng quan: tổng số tiền, số giao dịch, tỷ lệ khớp
- Biểu đồ tuần hiển thị xu hướng
- Lọc theo ngày/tuần/tháng
- Xuất báo cáo Excel

### 7. **Quản lý Nhân sự (Personnel)**
- Quản lý người dùng hệ thống
- Phân quyền: Admin, Kế toán, Vận hành, Người xem

---

## ✨ TÍNH NĂNG MỚI ĐƯỢC THÊM VÀO

### 1. **Tự động Link Đại lý bằng Số tài khoản ngân hàng**
- **Mô tả**: Khi đại lý upload ảnh bill, hệ thống tự động đọc số tài khoản ngân hàng từ ảnh VNPay và tìm đại lý tương ứng
- **Lợi ích**: Không cần nhập tay, giảm sai sót, tăng tốc độ xử lý
- **Cách dùng**: 
  - Vào **Quản lý Đại lý** → Thêm/Sửa đại lý → Nhập **Số tài khoản ngân hàng** (số này chính là số hiển thị trên ảnh VNPay)
  - Khi upload ảnh, hệ thống tự động link nếu số tài khoản khớp
  - **Lưu ý**: Số tài khoản ngân hàng này chính là số hiển thị trên ảnh VNPay (có thể trùng với số điện thoại, nhưng đây là số tài khoản ngân hàng)

### 2. **Chiết khấu theo Từng Điểm thu (Workflow mới)**
- **Mô tả**: Thay vì cấu hình chiết khấu chung cho tất cả điểm thu, giờ có thể cấu hình riêng cho từng điểm thu
- **Lợi ích**: Linh hoạt hơn, phù hợp với thực tế kinh doanh (mỗi điểm thu có thể có mức chiết khấu khác nhau)
- **Cách dùng**:
  1. Vào **Quản lý Đại lý** → Thêm/Sửa đại lý
  2. **Bước 1**: Gán các điểm thu mà đại lý được phép xử lý
  3. **Bước 2**: Cấu hình chiết khấu cho từng điểm thu đã gán (QR 1, QR 2, Sofpos, POS)

### 3. **Sửa thủ công Giao dịch**
- **Mô tả**: Admin/CSO có thể sửa thủ công các thông tin giao dịch: mã chuẩn chi, số tiền, điểm thu, đại lý
- **Lợi ích**: Xử lý các trường hợp đặc biệt, sửa lỗi OCR, điều chỉnh dữ liệu
- **Cách dùng**:
  1. Sau khi đối soát, vào bảng kết quả
  2. Click nút **Sửa** ở cột "Thao tác"
  3. Sửa các thông tin cần thiết
  4. Click **Lưu thay đổi**
  5. Hệ thống tự động lưu lịch sử thay đổi

### 4. **Gán Điểm bán khi OCR không tìm thấy**
- **Mô tả**: Khi OCR không đọc được điểm bán từ ảnh, có thể chọn thủ công từ danh sách
- **Lợi ích**: Xử lý các ảnh chất lượng kém, ảnh không rõ
- **Cách dùng**: Trong bảng kết quả, nếu cột "Điểm thu" hiển thị "Chưa có điểm bán", chọn từ dropdown

### 5. **Báo lỗi Chi tiết và Phân loại**
- **Mô tả**: Hệ thống phân loại và hiển thị rõ ràng các loại lỗi:
  - 🔴 **Sai số tiền**: Số tiền Merchant ≠ Agent
  - 🟣 **Sai điểm bán**: Điểm bán không khớp
  - 🟡 **Sai đại lý**: Đại lý claim bill không đúng
  - 🟠 **Trùng lặp**: Bill bị trùng trong cùng đại lý hoặc khác đại lý
  - ⚠️ **Không tìm thấy**: Bill không có trong hệ thống Merchant hoặc Agent chưa up
- **Lợi ích**: Dễ dàng xác định nguyên nhân lỗi, xử lý nhanh hơn

### 6. **Lọc và Xuất Bill lỗi**
- **Mô tả**: Có thể lọc chỉ xem các bill lỗi và xuất ra Excel để đại lý up lại
- **Lợi ích**: Tập trung xử lý lỗi, dễ theo dõi
- **Cách dùng**:
  1. Sau khi đối soát, click **Lọc** → Chọn **Lỗi**
  2. Có thể chọn loại lỗi cụ thể (Sai điểm bán, Sai số tiền, v.v.)
  3. Click **Xuất Bill lỗi** để tải file Excel

### 7. **Lưu Dữ liệu Tổng hợp**
- **Mô tả**: Hệ thống tự động lưu dữ liệu tổng hợp theo mã giao dịch, điểm thu, đại lý
- **Lợi ích**: 
  - Xử lý bill bổ sung/quên sau này
  - Phát hiện duplicate cross-session
  - Tăng tốc độ truy vấn báo cáo

### 8. **Xử lý Bill bổ sung**
- **Mô tả**: Khi đại lý up bill bổ sung/quên, hệ thống tự động phát hiện và báo lỗi nếu bill đã được xử lý trước đó
- **Lợi ích**: Tránh thanh toán trùng, đảm bảo tính chính xác

---

## 📖 HƯỚNG DẪN SỬ DỤNG

### Quy trình Đối soát cơ bản:

1. **Chuẩn bị dữ liệu**:
   - Merchant: Export file Excel từ hệ thống (chứa mã chuẩn chi, số tiền, điểm thu)
   - Agent: Chụp ảnh screenshot từ app VNPay/ngân hàng

2. **Upload dữ liệu**:
   - Vào **Đối soát** → Upload file Excel Merchant (có thể nhiều file)
   - Upload ảnh screenshot Agent (có thể nhiều ảnh)
   - Hệ thống tự động OCR ảnh và đọc Excel

3. **Xem kết quả**:
   - Hệ thống hiển thị:
     - ✅ **Khớp**: Giao dịch khớp hoàn toàn
     - ❌ **Lỗi**: Các loại lỗi (sai số tiền, trùng lặp, v.v.)
   - Có thể lọc, sửa thủ công, hoặc xuất báo cáo

4. **Xử lý lỗi**:
   - Sửa thủ công nếu cần
   - Xuất danh sách bill lỗi để đại lý up lại
   - Gán điểm bán nếu OCR không đọc được

5. **Tạo thanh toán**:
   - Vào **Thanh toán** → Xem danh sách giao dịch chưa thanh toán
   - Hệ thống tự động tính phí chiết khấu
   - Tạo lệnh thanh toán

### Quy trình Cấu hình Đại lý mới:

1. Vào **Quản lý Đại lý** → **Thêm mới**
2. Nhập thông tin cơ bản: Tên, Mã
3. **Quan trọng**: Nhập **Số tài khoản ngân hàng** (số này chính là số hiển thị trên ảnh VNPay, dùng để tự động link đại lý khi OCR)
4. **Bước 1**: Gán các điểm thu mà đại lý được phép xử lý
5. **Bước 2**: Cấu hình chiết khấu cho từng điểm thu:
   - QR 1 (VNPay): X%
   - QR 2 (App Bank): X%
   - Sofpos: X%
   - POS: X%
6. Upload mã QR thanh toán (nếu có)
7. Lưu

---

## ⚠️ LƯU Ý QUAN TRỌNG

### 1. **Số tài khoản ngân hàng**
- Phải nhập chính xác số tài khoản ngân hàng hiển thị trên ảnh VNPay
- **Lưu ý**: Số này chính là số tài khoản ngân hàng (có thể trùng với số điện thoại, nhưng đây là số tài khoản)
- Hệ thống dùng số này để tự động link đại lý khi OCR ảnh bill
- Nếu không nhập, phải chọn đại lý thủ công

### 2. **Chiết khấu theo Điểm thu**
- **Workflow mới**: Gán điểm thu trước, sau đó cấu hình chiết khấu
- Mỗi điểm thu có thể có mức chiết khấu khác nhau
- Nếu không cấu hình chiết khấu theo điểm thu, hệ thống sẽ dùng chiết khấu global (cũ)

### 3. **Bill bổ sung**
- Khi đại lý up bill bổ sung/quên, hệ thống sẽ báo lỗi nếu bill đã được xử lý
- Cần kiểm tra kỹ trước khi thanh toán để tránh trùng

### 4. **Sửa thủ công**
- Chỉ Admin/CSO mới có quyền sửa
- Mọi thay đổi đều được lưu trong lịch sử
- Sau khi sửa, hệ thống tự động tính lại trạng thái (khớp/lỗi)

### 5. **Xuất Excel**
- Tất cả file Excel xuất ra đều có:
  - Header màu xanh, chữ trắng
  - Dòng xen kẽ màu xám nhạt
  - Định dạng số tiền với dấu phẩy
  - Sheet "Thông tin" chứa metadata

### 6. **OCR (Đọc ảnh)**
- Hệ thống dùng AI Gemini để đọc ảnh
- Cần cấu hình API key trong Settings
- Nếu ảnh chất lượng kém, có thể cần sửa thủ công

---

## 📞 HỖ TRỢ

Nếu có vấn đề hoặc câu hỏi, vui lòng liên hệ:
- **Email**: support@upcode.com
- **Hotline**: [Số điện thoại]

---

**Phiên bản**: 2.0  
**Ngày cập nhật**: 2025-11-18  
**Tác giả**: PayReconcile Pro Team

