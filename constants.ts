
import { Agent, Merchant, PaymentMethod, User, UserRole, UserStatus } from "./types";

export const MOCK_USERS: User[] = [
  {
    id: 'U001',
    username: 'admin_sys',
    fullName: 'Nguyễn Văn Admin',
    email: 'admin@payreconcile.com',
    role: UserRole.ADMIN,
    department: 'Ban Giám Đốc',
    status: UserStatus.ACTIVE,
    lastActive: 'Vừa xong',
    avatarUrl: 'https://ui-avatars.com/api/?name=Nguyen+Van+Admin&background=6366f1&color=fff'
  },
  {
    id: 'U002',
    username: 'ketoan_truong',
    fullName: 'Trần Thị Kế Toán',
    email: 'accountant@payreconcile.com',
    role: UserRole.ACCOUNTANT,
    department: 'Phòng Tài Chính',
    status: UserStatus.ACTIVE,
    lastActive: '15 phút trước',
    avatarUrl: 'https://ui-avatars.com/api/?name=Tran+Thi+Ke+Toan&background=10b981&color=fff'
  },
  {
    id: 'U003',
    username: 'vanhanh_01',
    fullName: 'Lê Vận Hành',
    email: 'ops@payreconcile.com',
    role: UserRole.SUPPORT,
    department: 'Phòng Vận Hành',
    status: UserStatus.ACTIVE,
    lastActive: '1 giờ trước',
    avatarUrl: 'https://ui-avatars.com/api/?name=Le+Van+Hanh&background=f59e0b&color=fff'
  },
  {
    id: 'U004',
    username: 'staff_old',
    fullName: 'Phạm Nghỉ Việc',
    email: 'old_staff@payreconcile.com',
    role: UserRole.VIEWER,
    department: 'N/A',
    status: UserStatus.LOCKED,
    lastActive: '30 ngày trước',
    avatarUrl: 'https://ui-avatars.com/api/?name=Pham+Nghi+Viec&background=64748b&color=fff'
  }
];

export const MOCK_AGENTS: Agent[] = [
  {
    id: 'A001',
    name: 'Đại lý Minh Khai',
    code: 'DL_MK',
    bankAccount: '190333888999',
    discountRate: {
      [PaymentMethod.QR_VNPAY]: 0.5,
      [PaymentMethod.QR_BANK]: 0.3,
      [PaymentMethod.SOFPOS]: 0.8,
      [PaymentMethod.POS]: 1.0
    }
  },
  {
    id: 'A002',
    name: 'Đại lý Cầu Giấy',
    code: 'DL_CG',
    bankAccount: '001122334455',
    discountRate: {
      [PaymentMethod.QR_VNPAY]: 0.6,
      [PaymentMethod.QR_BANK]: 0.4,
      [PaymentMethod.SOFPOS]: 0.9,
      [PaymentMethod.POS]: 1.1
    }
  }
];

export const MOCK_MERCHANTS: Merchant[] = [
  {
    id: 'M001',
    name: 'Siêu thị MiniMart',
    code: 'MER_MINI',
    bankAccount: '999888777',
    bankName: 'Vietcombank'
  },
  {
    id: 'M002',
    name: 'Cafe HighTech',
    code: 'MER_CAFE',
    bankAccount: '666555444',
    bankName: 'Techcombank'
  }
];

// Helper to generate random transactions
export const generateMockFiles = () => {
  const transactionCodes = ['TRX001', 'TRX002', 'TRX003', 'TRX004', 'TRX005', 'TRX006', 'TRX007', 'TRX008'];
  
  // Merchant File (The "Truth" from the system)
  const merchantFile = [
    { code: 'TRX001', amount: 100000, method: PaymentMethod.QR_VNPAY, time: '2023-10-25T08:30:00' },
    { code: 'TRX002', amount: 250000, method: PaymentMethod.POS, time: '2023-10-25T09:15:00' },
    { code: 'TRX003', amount: 50000, method: PaymentMethod.QR_BANK, time: '2023-10-25T10:00:00' },
    { code: 'TRX004', amount: 500000, method: PaymentMethod.SOFPOS, time: '2023-10-25T11:30:00' },
    { code: 'TRX005', amount: 120000, method: PaymentMethod.QR_VNPAY, time: '2023-10-25T12:00:00' }, // Agent has wrong amount
    { code: 'TRX006', amount: 90000, method: PaymentMethod.QR_VNPAY, time: '2023-10-25T12:05:00' }, // Agent Missing this
  ];

  // Agent File (What they claim they collected)
  const agentFile = [
    { code: 'TRX001', amount: 100000, agent: 'DL_MK' }, // Match
    { code: 'TRX002', amount: 250000, agent: 'DL_MK' }, // Match
    { code: 'TRX003', amount: 50000, agent: 'DL_CG' },  // Match
    { code: 'TRX004', amount: 500000, agent: 'DL_MK' }, // Match
    { code: 'TRX005', amount: 100000, agent: 'DL_CG' }, // Error: Amount Mismatch (Real is 120k)
    { code: 'TRX007', amount: 300000, agent: 'DL_MK' }, // Error: Missing in Merchant (Fake bill?)
    { code: 'TRX002', amount: 250000, agent: 'DL_CG' }, // Error: Duplicate (Claimed by DL_MK already)
  ];

  return { merchantFile, agentFile };
};