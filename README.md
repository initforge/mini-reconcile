# Pay Reconcile Pro

> Hệ thống đối soát thanh toán tự động sử dụng AI OCR cho doanh nghiệp

A comprehensive payment reconciliation system that automatically matches merchant transactions with agent submissions using AI-powered OCR technology. Built for Vietnamese payment providers (VNPay, PhonePOS, VietinBank) with support for automated bill recognition, error detection, and financial reporting.

## ✨ Tính năng chính

- **🤖 AI OCR tự động**: Nhận diện thông tin giao dịch từ ảnh bill (VNPay, PhonePOS, VietinBank) sử dụng Google Gemini Vision API
- **📊 Đối soát tự động**: So khớp giao dịch giữa Merchant và Agent dựa trên mã chuẩn chi
- **💰 Quản lý công nợ**: Theo dõi công nợ theo Đại lý và STK Admin
- **💳 Tạo đợt chi trả**: Tự động tính toán chiết khấu và tạo đợt chi trả cho đại lý
- **📈 Báo cáo chi tiết**: Xuất báo cáo công nợ và thống kê giao dịch
- **🏢 Quản lý đa điểm**: Quản lý nhiều điểm bán và đại lý
- **⚙️ Cấu hình linh hoạt**: Tùy chỉnh thông tin công ty, logo, API keys

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Firebase Realtime Database
- **AI/OCR**: Google Gemini 2.5 Flash (Vision API)
- **UI Framework**: Tailwind CSS
- **Icons**: Lucide React
- **Excel Processing**: XLSX.js
- **Routing**: React Router DOM v7

## 📦 Cài đặt

### Prerequisites

- Node.js 18+ 
- npm hoặc yarn
- Firebase project với Realtime Database
- Google Gemini API key (từ [Google AI Studio](https://aistudio.google.com/app/apikey))

### Installation

1. **Clone repository:**
```bash
git clone <repository-url>
cd pay-reconcile-pro
```

2. **Install dependencies:**
```bash
npm install
```

3. **Cấu hình Firebase:**
   - Tạo Firebase project tại [Firebase Console](https://console.firebase.google.com/)
   - Bật Realtime Database
   - Copy Firebase config vào `src/lib/firebase.ts`

4. **Cấu hình Gemini API Key:**
   - Lấy API key từ [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Có 2 cách cấu hình:
     - **Option 1**: Thêm vào `.env.local`:
       ```
       VITE_GEMINI_API_KEY=your_api_key_here
       ```
     - **Option 2**: Vào Settings → API & Tích hợp trong app và nhập API key

5. **Chạy ứng dụng:**
```bash
npm run dev
```

Ứng dụng sẽ chạy tại `http://localhost:5173` (hoặc port khác nếu 5173 đã được sử dụng)

## 🚀 Sử dụng

### 1. Thiết lập ban đầu

- **Quản lý Điểm bán**: Thêm các điểm bán với thông tin điểm thu, chi nhánh
- **Quản lý Đại lý**: Thêm đại lý và gán vào các điểm thu tương ứng
- **Cấu hình**: Thiết lập thông tin công ty, logo, API keys

### 2. Đối soát giao dịch

1. Vào **Đối soát & Xử lý**
2. Upload file Excel từ Merchant (chứa danh sách giao dịch)
3. Upload ảnh bill từ Agent (screenshot màn hình thanh toán)
4. Hệ thống tự động:
   - OCR ảnh để trích xuất thông tin
   - So khớp với dữ liệu Excel
   - Phát hiện lỗi (lệch tiền, trùng, thiếu)
   - Tạo bản ghi đối soát

### 3. Quản lý công nợ và thanh toán

- **Báo cáo Công nợ**: Xem công nợ theo Đại lý hoặc STK Admin
- **Thanh toán & Công nợ**: Tạo đợt chi trả tự động với tính toán chiết khấu
- **Xuất Excel**: Export báo cáo và danh sách thanh toán

## 📁 Cấu trúc dự án

```
pay-reconcile-pro/
├── components/          # React components
│   ├── Dashboard.tsx
│   ├── ReconciliationModule.tsx
│   ├── Merchants.tsx
│   ├── Agents.tsx
│   ├── Payouts.tsx
│   ├── Reports.tsx
│   └── Settings.tsx
├── services/            # Service layers
│   └── geminiService.ts # Gemini AI/OCR service
├── src/
│   ├── lib/             # Firebase configuration & services
│   ├── utils/           # Utility functions
│   │   ├── excelParserUtils.ts
│   │   ├── excelExportUtils.ts
│   │   ├── formatUtils.ts
│   │   └── dateFilterUtils.ts
│   └── styles/          # Design tokens
├── test xlxs/           # Test data (Excel files & images)
├── App.tsx              # Main app component
├── types.ts             # TypeScript type definitions
└── package.json
```

## 🔧 Cấu hình

### Firebase Realtime Database Structure

```
{
  "merchants": { ... },
  "agents": { ... },
  "reconciliation_sessions": { ... },
  "reconciliation_records": { ... },
  "payments": { ... },
  "payment_batches": { ... },
  "settings": { ... }
}
```

### Environment Variables

Tạo file `.env.local`:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
```

Hoặc cấu hình trực tiếp trong app qua Settings.

## 📝 Tính năng chi tiết

### OCR & Nhận diện Bill

- Hỗ trợ nhiều loại bill: VNPay, PhonePOS, VietinBank, các app ngân hàng khác
- Trích xuất tự động: Mã giao dịch, số tiền, số hóa đơn, điểm thu
- Retry logic với exponential backoff cho API calls

### Đối soát thông minh

- So khớp theo mã chuẩn chi (Transaction Code)
- Phát hiện lỗi: Lệch tiền, giao dịch trùng, giao dịch thiếu
- Tính toán chênh lệch tự động
- Hỗ trợ nhiều định dạng Excel

### Quản lý thanh toán

- Tự động tính chiết khấu theo phương thức thanh toán
- Tạo đợt chi trả với nhiều đại lý
- Xuất Excel với thông tin chuyển khoản
- Hỗ trợ QR code cho chuyển khoản nhanh

## 🐛 Troubleshooting

### Lỗi OCR không hoạt động

- Kiểm tra Gemini API key đã được cấu hình đúng
- Kiểm tra quota API key còn hạn
- Xem Console để kiểm tra lỗi chi tiết

### Lỗi Firebase connection

- Kiểm tra Firebase config trong `src/lib/firebase.ts`
- Đảm bảo Realtime Database đã được bật
- Kiểm tra quyền truy cập database

### Lỗi Excel parsing

- Đảm bảo file Excel có định dạng đúng
- Kiểm tra có cột "Mã chuẩn chi" hoặc "Mã trừ tiền"
- Xem Console log để debug

## 📄 License

Proprietary - All rights reserved

## 👤 Author

Developed for payment reconciliation automation

---

**Note**: Đây là dự án đặc thù cho hệ thống đối soát thanh toán. Vui lòng không sử dụng cho mục đích thương mại mà không có sự cho phép.
