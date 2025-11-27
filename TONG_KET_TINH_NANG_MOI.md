# 📋 TỔNG KẾT TÍNH NĂNG MỚI
## Hệ thống Đối soát Thanh toán PayReconcile Pro

---

<div style="page-break-after: always;"></div>

## 🎯 1. TỰ ĐỘNG LINK ĐẠI LÝ BẰNG SỐ TÀI KHOẢN NGÂN HÀNG

### 📌 Mô tả
Khi đại lý upload ảnh bill, hệ thống tự động đọc số tài khoản ngân hàng từ ảnh VNPay và tìm đại lý tương ứng trong hệ thống.

### ✅ Lợi ích
- ⚡ **Tự động hóa**: Không cần nhập tay, giảm thiểu sai sót
- 🎯 **Chính xác**: Tự động khớp dựa trên số tài khoản
- ⏱️ **Nhanh chóng**: Tăng tốc độ xử lý đối soát

### 📖 Hướng dẫn sử dụng

**Bước 1: Cấu hình Đại lý**
1. Vào **Quản lý Đại lý** → Chọn **Thêm mới** hoặc **Sửa**
2. Nhập **Số tài khoản ngân hàng** (số này chính là số hiển thị trên ảnh VNPay)
3. Lưu thông tin

**Bước 2: Upload ảnh Bill**
- Khi upload ảnh screenshot từ app VNPay
- Hệ thống tự động OCR và đọc số tài khoản ngân hàng
- Tự động link với đại lý có số tài khoản khớp

### ⚠️ Lưu ý quan trọng
> **Số tài khoản ngân hàng** này chính là số hiển thị trên ảnh VNPay (có thể trùng với số điện thoại, nhưng đây là số tài khoản ngân hàng, không phải số điện thoại liên hệ).

---

<div style="page-break-after: always;"></div>

## 💰 2. CHIẾT KHẤU THEO TỪNG ĐIỂM THU (Workflow mới)

### 📌 Mô tả
Thay vì cấu hình chiết khấu chung cho tất cả điểm thu, giờ có thể cấu hình riêng cho từng điểm thu mà đại lý được phép xử lý.

### ✅ Lợi ích
- 🔄 **Linh hoạt**: Mỗi điểm thu có thể có mức chiết khấu khác nhau
- 📊 **Chính xác**: Phù hợp với thực tế kinh doanh
- 🎯 **Tối ưu**: Tính toán phí chính xác hơn

### 📖 Hướng dẫn sử dụng

**Workflow 2 bước:**

#### **Bước 1: Gán Điểm thu**
1. Vào **Quản lý Đại lý** → Thêm/Sửa đại lý
2. Tìm phần **"Bước 1: Gán Điểm thu"**
3. Chọn các điểm thu mà đại lý được phép xử lý (checkbox)
4. Có thể chọn nhiều điểm thu cùng lúc

#### **Bước 2: Cấu hình Chiết khấu**
1. Sau khi gán điểm thu, phần **"Bước 2: Cấu hình Chiết khấu theo Điểm thu"** sẽ hiển thị
2. Với mỗi điểm thu đã gán, cấu hình chiết khấu cho:
   - **QR 1 (VNPay)**: X%
   - **QR 2 (App Bank)**: X%
   - **Sofpos**: X%
   - **POS**: X%
3. Mỗi điểm thu có thể có mức chiết khấu khác nhau

### 📊 Ví dụ
```
Điểm thu: ANCATTUONG66PKV01
- QR 1 (VNPay): 2.5%
- QR 2 (App Bank): 2.0%
- Sofpos: 1.8%
- POS: 1.5%

Điểm thu: MINH THAO 122PVD 01
- QR 1 (VNPay): 3.0%
- QR 2 (App Bank): 2.5%
- Sofpos: 2.0%
- POS: 1.8%
```

---

<div style="page-break-after: always;"></div>

## ✏️ 3. SỬA THỦ CÔNG GIAO DỊCH

### 📌 Mô tả
Admin/CSO có thể sửa thủ công các thông tin giao dịch sau khi đối soát để xử lý các trường hợp đặc biệt.

### ✅ Lợi ích
- 🔧 **Linh hoạt**: Xử lý các trường hợp đặc biệt
- 🐛 **Sửa lỗi**: Điều chỉnh dữ liệu khi OCR sai
- 📝 **Theo dõi**: Lưu lịch sử mọi thay đổi

### 📖 Hướng dẫn sử dụng

**Bước 1: Mở màn hình Sửa**
1. Sau khi đối soát, vào bảng kết quả
2. Tìm giao dịch cần sửa
3. Click nút **Sửa** ở cột "Thao tác"

**Bước 2: Sửa thông tin**
Có thể sửa các thông tin sau:
- **Mã chuẩn chi**: Sửa mã giao dịch
- **Số tiền Merchant**: Số tiền từ hệ thống
- **Số tiền Agent**: Số tiền từ bill đại lý
- **Điểm thu**: Chọn điểm thu từ dropdown
- **Đại lý**: Chọn đại lý từ dropdown
- **Ghi chú**: Thêm ghi chú về thay đổi

**Bước 3: Lưu thay đổi**
1. Click **Lưu thay đổi**
2. Hệ thống tự động:
   - Tính lại trạng thái (khớp/lỗi)
   - Lưu lịch sử thay đổi
   - Cập nhật vào database

### 📋 Lịch sử thay đổi
Mọi thay đổi đều được lưu với thông tin:
- Field đã thay đổi
- Giá trị cũ
- Giá trị mới
- Thời gian thay đổi
- Người thay đổi

---

<div style="page-break-after: always;"></div>

## 🏪 4. GÁN ĐIỂM BÁN KHI OCR KHÔNG TÌM THẤY

### 📌 Mô tả
Khi OCR không đọc được điểm bán từ ảnh (do chất lượng ảnh kém, ảnh không rõ), có thể chọn thủ công từ danh sách điểm bán đã khai báo.

### ✅ Lợi ích
- 🔧 **Xử lý lỗi**: Khắc phục khi OCR không đọc được
- ⚡ **Nhanh chóng**: Chọn từ dropdown, không cần nhập lại
- ✅ **Chính xác**: Đảm bảo dữ liệu đúng

### 📖 Hướng dẫn sử dụng

**Khi nào cần dùng:**
- OCR không đọc được điểm bán từ ảnh
- Ảnh chất lượng kém, không rõ
- Điểm bán không có trong ảnh

**Cách thực hiện:**
1. Trong bảng kết quả đối soát
2. Tìm giao dịch có cột "Điểm thu" hiển thị **"Chưa có điểm bán"**
3. Click vào dropdown
4. Chọn điểm bán từ danh sách đã khai báo
5. Hệ thống tự động cập nhật

### 💡 Mẹo
- Nên kiểm tra ảnh gốc để xác nhận điểm bán
- Có thể sửa thủ công sau khi đối soát xong

---

<div style="page-break-after: always;"></div>

## 🚨 5. BÁO LỖI CHI TIẾT VÀ PHÂN LOẠI

### 📌 Mô tả
Hệ thống phân loại và hiển thị rõ ràng các loại lỗi với icon và màu sắc riêng, giúp dễ dàng xác định nguyên nhân.

### ✅ Lợi ích
- 🎯 **Rõ ràng**: Dễ dàng xác định loại lỗi
- ⚡ **Nhanh chóng**: Xử lý lỗi nhanh hơn
- 📊 **Thống kê**: Dễ dàng thống kê các loại lỗi

### 📋 Các loại lỗi

#### 🔴 **Sai số tiền** (WRONG_AMOUNT)
- **Mô tả**: Số tiền Merchant ≠ Số tiền Agent
- **Ví dụ**: Merchant: 100,000đ, Agent: 95,000đ
- **Xử lý**: Kiểm tra lại bill gốc, yêu cầu đại lý up lại

#### 🟣 **Sai điểm bán** (WRONG_POINT_OF_SALE)
- **Mô tả**: Điểm bán từ OCR không khớp với điểm bán trong hệ thống
- **Ví dụ**: OCR đọc "ANCATTUONG", hệ thống có "ANCATTUONG66PKV01"
- **Xử lý**: Gán lại điểm bán thủ công hoặc sửa thông tin điểm bán

#### 🟡 **Sai đại lý** (WRONG_AGENT)
- **Mô tả**: Đại lý claim bill không đúng với điểm bán
- **Ví dụ**: Bill thuộc điểm bán A nhưng đại lý B claim
- **Xử lý**: Chuyển bill cho đại lý đúng hoặc sửa thủ công

#### 🟠 **Trùng lặp** (DUPLICATE)
- **Mô tả**: Bill bị trùng trong cùng đại lý hoặc khác đại lý
- **Ví dụ**: Cùng một mã chuẩn chi xuất hiện 2 lần
- **Xử lý**: Xóa bill trùng, chỉ giữ lại 1 bill

#### ⚠️ **Không tìm thấy** (MISSING)
- **MISSING_IN_MERCHANT**: Bill không có trong hệ thống Merchant
- **MISSING_IN_AGENT**: Agent chưa up bill
- **Xử lý**: Kiểm tra lại dữ liệu, yêu cầu up lại

### 📊 Hiển thị trong bảng kết quả
Mỗi loại lỗi có:
- **Icon riêng**: Dễ nhận biết
- **Màu sắc riêng**: Phân biệt trực quan
- **Mô tả chi tiết**: Giải thích rõ nguyên nhân

---

<div style="page-break-after: always;"></div>

## 🔍 6. LỌC VÀ XUẤT BILL LỖI

### 📌 Mô tả
Có thể lọc chỉ xem các bill lỗi và xuất ra file Excel để đại lý up lại hoặc xử lý sau.

### ✅ Lợi ích
- 🎯 **Tập trung**: Chỉ xem các bill cần xử lý
- 📊 **Theo dõi**: Dễ dàng theo dõi và quản lý lỗi
- 📄 **Xuất file**: Xuất Excel để gửi đại lý

### 📖 Hướng dẫn sử dụng

**Bước 1: Lọc Bill lỗi**
1. Sau khi đối soát, vào bảng kết quả
2. Tìm phần **"Lọc"** ở trên bảng
3. Click **"Lỗi"** để chỉ hiển thị các bill lỗi

**Bước 2: Lọc theo loại lỗi (tùy chọn)**
1. Sau khi chọn "Lỗi", dropdown loại lỗi sẽ hiển thị
2. Chọn loại lỗi cụ thể:
   - Tất cả lỗi
   - Sai điểm bán
   - Sai số tiền
   - Sai đại lý
   - Trùng lặp
   - Không tìm thấy (Merchant)
   - Không tìm thấy (Agent)

**Bước 3: Xuất Bill lỗi**
1. Click nút **"Xuất Bill lỗi"** (màu vàng)
2. File Excel sẽ được tải xuống với tên: `Bill_loi_YYYY-MM-DD.xlsx`
3. File chứa các cột:
   - Mã chuẩn chi
   - Điểm thu
   - Số tiền Agent
   - Số tiền Merchant
   - Loại lỗi
   - Chi tiết lỗi

### 📄 Format file Excel
- Header màu xanh, chữ trắng
- Dòng xen kẽ màu xám nhạt
- Định dạng số tiền với dấu phẩy
- Dễ đọc và in ấn

---

<div style="page-break-after: always;"></div>

## 💾 7. LƯU DỮ LIỆU TỔNG HỢP

### 📌 Mô tả
Hệ thống tự động lưu dữ liệu tổng hợp (aggregated data) theo mã giao dịch, điểm thu, đại lý để tối ưu hiệu năng và xử lý bill bổ sung.

### ✅ Lợi ích
- ⚡ **Hiệu năng**: Tăng tốc độ truy vấn báo cáo (10-100x nhanh hơn)
- 🔄 **Bill bổ sung**: Xử lý bill quên/thiếu sau này
- 🔍 **Duplicate**: Phát hiện duplicate cross-session
- 📊 **Báo cáo**: Tạo báo cáo nhanh chóng

### 📋 Cấu trúc dữ liệu tổng hợp

#### **Theo Mã giao dịch** (byTransactionCode)
- Mã chuẩn chi
- Điểm thu
- Đại lý
- Số tiền Merchant
- Số tiền Agent
- Trạng thái
- Thời gian xử lý cuối
- Danh sách session đã xử lý

#### **Theo Điểm thu** (byPointOfSale)
- Tên điểm thu
- Tổng số giao dịch
- Tổng số tiền
- Số giao dịch khớp
- Số giao dịch lỗi

#### **Theo Đại lý** (byAgent)
- ID đại lý
- Tổng số giao dịch
- Tổng số tiền
- Số giao dịch khớp
- Số giao dịch lỗi

### 🔄 Tự động cập nhật
Dữ liệu tổng hợp được tự động cập nhật mỗi khi:
- Tạo session đối soát mới
- Xử lý bill bổ sung
- Sửa thủ công giao dịch

---

<div style="page-break-after: always;"></div>

## 📦 8. XỬ LÝ BILL BỔ SUNG

### 📌 Mô tả
Khi đại lý up bill bổ sung/quên sau khi đã đối soát, hệ thống tự động phát hiện và báo lỗi nếu bill đã được xử lý trước đó.

### ✅ Lợi ích
- 🚫 **Tránh trùng**: Phát hiện bill đã xử lý
- ✅ **Chính xác**: Đảm bảo không thanh toán trùng
- 📊 **Theo dõi**: Biết bill nào đã xử lý, bill nào mới

### 📖 Cách hoạt động

**Khi upload bill bổ sung:**
1. Hệ thống kiểm tra mã chuẩn chi trong dữ liệu tổng hợp
2. Nếu tìm thấy bill đã xử lý:
   - Hiển thị lỗi: **"Bill đã được xử lý trong session trước"**
   - Ghi rõ session ID đã xử lý
   - Đánh dấu là bill bổ sung/quên
3. Nếu không tìm thấy:
   - Xử lý bình thường như bill mới

### 🔍 Kiểm tra Cross-Session
Hệ thống kiểm tra bill trong:
- Tất cả các session đã xử lý
- Dữ liệu tổng hợp (aggregated data)
- Các reconciliation records

### ⚠️ Lưu ý
- Bill bổ sung sẽ được đánh dấu là **DUPLICATE** với loại lỗi đặc biệt
- Cần kiểm tra kỹ trước khi thanh toán để tránh trùng
- Có thể xem lịch sử session để biết bill đã được xử lý khi nào

---

<div style="page-break-after: always;"></div>

## 📊 TỔNG KẾT

### 🎯 Các tính năng mới giúp:
- ⚡ **Tăng tốc độ**: Tự động hóa nhiều thao tác
- ✅ **Tăng độ chính xác**: Phát hiện và xử lý lỗi tốt hơn
- 📊 **Dễ quản lý**: Dữ liệu tổng hợp, báo cáo chi tiết
- 🔧 **Linh hoạt**: Sửa thủ công, xử lý trường hợp đặc biệt

### 📞 Hỗ trợ
Nếu có vấn đề hoặc câu hỏi, vui lòng liên hệ:
- **Email**: support@upcode.com
- **Hotline**: [Số điện thoại]

---

**Phiên bản**: 2.0  
**Ngày cập nhật**: 2025-11-18  
**Tác giả**: PayReconcile Pro Team

