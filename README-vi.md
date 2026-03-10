🇬🇧 [Read in English](README.md)

# Mini Reconcile — Đối soát Giao dịch bằng AI

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=white) ![Gemini API](https://img.shields.io/badge/Gemini%20API-8E75B2?style=flat-square) ![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)

Công cụ dùng OCR và Gemini API để tự động đối soát giao dịch tài chính từ chứng từ scan với dữ liệu số.

## Xem trước

![Mini Reconcile — Đối soát Giao dịch bằng AI](docs/screenshot.png)

## Tính năng chính

- **Quét tài liệu OCR** — trích xuất dữ liệu giao dịch từ ảnh/PDF
- **AI matching** — Gemini API đối chiếu bản scan với database
- **Phát hiện sai lệch** — highlight mismatch, thiếu entries, sai số tiền
- **Xuất Excel** — báo cáo đối soát định dạng xlsx có format

## Cài đặt

```bash
git clone https://github.com/initforge/mini-reconcile.git
cd mini-reconcile
npm install
npm run dev  # Cần Gemini API key trong env
```

---

**Xuan Linh** — Fullstack Developer

[![GitHub](https://img.shields.io/badge/GitHub-initforge-181717?style=flat-square&logo=github)](https://github.com/initforge) [![LinkedIn](https://img.shields.io/badge/LinkedIn-linhnx--dev-0A66C2?style=flat-square&logo=linkedin)](https://linkedin.com/in/linhnx-dev)
