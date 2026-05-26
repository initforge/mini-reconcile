# Mini Reconcile - AI Payment Reconciliation

[Đọc bằng tiếng Việt](README-vi.md)

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase_Realtime_DB-FFCA28?style=flat-square&logo=firebase&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![Excel](https://img.shields.io/badge/Excel_XLSX-217346?style=flat-square&logo=microsoftexcel&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

Mini Reconcile is a browser-first reconciliation system for payment networks where end users upload payment receipts, agents manage downstream payouts, and admins reconcile those receipts against merchant Excel exports.

The main engineering problem is not OCR alone. The difficult part is preserving a reliable reconciliation trail when the same transaction code can appear from a phone screenshot, a merchant settlement file, a manual correction, a payment batch, and a legacy record path at different times.

## Preview

![Homepage](docs/assets/homepage-current.png)

More verified screenshots:

- [Admin login](docs/assets/admin-login-current.png)
- [User login](docs/assets/user-login-current.png)

## What The System Does

- Reads payment screenshots with Gemini Vision and extracts `transactionCode`, `amount`, `paymentMethod`, `invoiceNumber`, `pointOfSaleName`, `bankAccount`, and `timestamp`.
- Stores users, agents, merchants, uploaded bills, merchant transactions, reports, payments, batches, and settings in Firebase Realtime Database.
- Imports merchant Excel files with header scoring, fuzzy column matching, amount normalization, duplicate detection, and transaction-code indexing.
- Reconciles user bills against merchant transactions by transaction code, amount, and point-of-sale name.
- Separates bills still waiting for a merchant file from records that already have merchant-side evidence.
- Supports admin reporting, agent reports, user bill history, admin-to-agent payment tracking, and agent-to-user payment tracking.
- Exports styled Excel reports with metadata sheets and auto-sized columns.

## Current Product Shape

Mini Reconcile is a Vite single-page app with three visible roles:

| Role | Routes | Main responsibility |
|---|---|---|
| Admin | `/admin`, `/reconciliation`, `/merchants`, `/agents`, `/payouts`, `/reports`, `/settings`, `/admin/report` | Upload merchant Excel files, reconcile records, manage agents/merchants/users, export reports, prepare payout batches |
| User | `/user/login`, `/user/register`, `/user/upbill`, `/user/report`, `/user/payment`, `/user/utilities` | Upload bills, provide Gemini API key, review status, configure payout utility data |
| Agent | `/agent/login`, `/agent/report`, `/agent/reconciliation/:sessionId`, `/agent/payment`, `/agent/admin-payment`, `/agent/utilities` | Review assigned transactions and payment status |

Admin login is currently mock-local (`localStorage.mockAuth`). User and agent login are custom Firebase Realtime Database lookups. Firebase Auth is initialized for persistence, but it is not the active authorization boundary for user/agent flows.

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white) ![React Router](https://img.shields.io/badge/React_Router-7-CA4245?style=flat-square&logo=reactrouter&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white) |
| Build | ![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white) |
| UI | ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_CDN-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Lucide](https://img.shields.io/badge/Lucide-111111?style=flat-square) |
| Data store | ![Firebase](https://img.shields.io/badge/Firebase_Realtime_DB-FFCA28?style=flat-square&logo=firebase&logoColor=white) |
| AI/OCR | ![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-8E75B2?style=flat-square&logo=googlegemini&logoColor=white) |
| Spreadsheet | ![xlsx](https://img.shields.io/badge/xlsx-0.18.5-217346?style=flat-square&logo=microsoftexcel&logoColor=white) ![xlsx-js-style](https://img.shields.io/badge/xlsx--js--style-1.2-217346?style=flat-square) |
| Deploy | ![Vercel](https://img.shields.io/badge/Vercel_SPA_Rewrite-000000?style=flat-square&logo=vercel&logoColor=white) |

## Architecture

```mermaid
flowchart LR
  user["User portal<br/>Upload bill image"] --> gemini["Gemini 2.5 Flash<br/>client-side OCR"]
  gemini --> bills["Firebase RTDB<br/>user_bills"]
  admin["Admin portal<br/>Merchant Excel upload"] --> parser["Excel parser<br/>sheet scoring + fuzzy headers"]
  parser --> merchant["Firebase RTDB<br/>merchant_transactions + byCode index"]
  bills --> reconcile["ReportService.autoReconcileBill<br/>code + amount + POS"]
  merchant --> reconcile
  reconcile --> reports["Firebase RTDB<br/>report_records"]
  reports --> adminReports["Admin/user/agent reports"]
  reports --> payments["Admin -> Agent<br/>Agent -> User payment tracking"]
  payments --> excel["Styled Excel exports"]
```

The code intentionally keeps reconciliation records as snapshots. A `report_record` duplicates selected bill and merchant fields so later edits to the source bill or merchant row do not erase the historical reconciliation result.

## Run Locally

```bash
npm install
npm run dev
```

Default Vite config uses port `3001`:

```text
http://localhost:3001
```

Build:

```bash
npm run build
```

Gemini OCR works when a user either:

- pastes a Gemini API key into the upload screen, stored as `payreconcile:geminiApiKey` in `localStorage`; or
- provides `VITE_GEMINI_API_KEY` / `GEMINI_API_KEY` at build/runtime.

## Documentation

- [Technical specification](docs/01-technical-specification.md)
- [Workflows and operations](docs/02-workflows-and-operations.md)
- [Maintenance notes](docs/03-maintenance-and-risk-register.md)

## Verified State

- `npm ci` completed.
- `npm run build` completed.
- Playwright screenshots were captured from the local Vite app.
- No GitHub Actions workflow exists in this repo at the time of this documentation pass.

Build warnings remain and are documented in the maintenance notes: large bundle size, mixed static/dynamic import of `reportServices.ts`, and a retained `/index.css` reference in `index.html`.
