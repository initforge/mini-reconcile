import { GoogleGenAI } from "@google/genai";
import { ReconciliationRecord, TransactionStatus, AgentSubmission } from "../types";

/**
 * Get Gemini API Key with priority:
 * 1. localStorage (user-provided key)
 * 2. Environment variable (VITE_GEMINI_API_KEY or GEMINI_API_KEY)
 */
function getApiKey(): string | null {
  // Check localStorage first (user-provided key)
  if (typeof window !== 'undefined') {
    const userKey = localStorage.getItem('payreconcile:geminiApiKey');
    if (userKey && userKey.trim()) {
      console.log('🔑 Loaded API key from localStorage');
      console.log('🔑 API key preview:', userKey.substring(0, 10) + '...');
      return userKey.trim();
    }
  }

  // Fallback to environment variable
  const envKey = import.meta.env.VITE_GEMINI_API_KEY || 
                 import.meta.env.GEMINI_API_KEY || 
                 (typeof process !== 'undefined' && process.env ? (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY) : null) ||
                 null;
  
  if (envKey) {
    console.log('🔑 Loaded API key from environment variable');
    return envKey;
  }

  console.warn('⚠️ No API key found in localStorage or environment variables');
  return null;
}

export const generateReconciliationReport = async (records: ReconciliationRecord[]): Promise<string> => {
  const API_KEY = getApiKey();
  
  if (!API_KEY) {
    return "API Key chưa được cấu hình. Vui lòng:\n1. Dán Gemini API key trên trang Upload Bill, hoặc\n2. Thêm VITE_GEMINI_API_KEY vào file .env.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    // Filter for errors to keep context size manageable
    const errors = records.filter(r => r.status !== TransactionStatus.MATCHED);
    const errorSummary = errors.slice(0, 50).map(e => ({
      code: e.transactionCode,
      status: e.status,
      diff: e.difference,
      merchantAmt: e.merchantData?.amount,
      agentAmt: e.agentData?.amount
    }));

    const prompt = `
      Analyze the following payment reconciliation error log. 
      Provide a professional summary for a finance admin in Vietnamese.
      
      1. Summarize the total number of errors and types.
      2. Provide specific advice on how to resolve the "ERROR_AMOUNT" and "MISSING_IN_MERCHANT" issues based on standard accounting practices.
      3. Keep the tone formal and concise.

      Error Data: ${JSON.stringify(errorSummary)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Không thể tạo báo cáo vào lúc này.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    return `Đã xảy ra lỗi khi kết nối với AI: ${errorMessage}`;
  }
};

/**
 * Retry helper with exponential backoff
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a retryable error (503, 429, or network errors)
      const isRetryable = 
        error?.error?.code === 503 || 
        error?.error?.code === 429 ||
        error?.error?.status === 'UNAVAILABLE' ||
        error?.message?.includes('overloaded') ||
        error?.message?.includes('rate limit') ||
        error?.message?.includes('network');
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`⚠️ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Extract transaction information from VNPay screenshot using Gemini Vision API
 * Only extracts 3 critical fields: transactionCode, amount, invoiceNumber
 */
export const extractTransactionFromImage = async (
  imageBase64: string,
  agentId: string = 'unknown',
  retryCount: number = 0
): Promise<AgentSubmission> => {
  const API_KEY = getApiKey();
  
  if (!API_KEY) {
    throw new Error("API Key chưa được cấu hình. Vui lòng:\n1. Dán Gemini API key trên trang Upload Bill, hoặc\n2. Thêm VITE_GEMINI_API_KEY vào file .env.");
  }

  // Log API key info for debugging (first 10 chars only for security)
  if (retryCount === 0) {
    console.log('🔑 Using API key:', API_KEY.substring(0, 10) + '...');
    console.log('🔑 API key length:', API_KEY.length);
  }

  return retryWithBackoff(async () => {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    // Remove data URL prefix if present
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    const prompt = `
Bạn là chuyên gia OCR chuyên đọc thông tin giao dịch từ nhiều loại màn hình thanh toán (VNPay, PhonePOS, VietinBank, và các app ngân hàng khác).

Nhiệm vụ: Trích xuất CHÍNH XÁC các thông tin quan trọng từ ảnh screenshot màn hình thanh toán:

**CÁC LOẠI BILL CẦN NHẬN DIỆN (QUAN TRỌNG - PHẢI XÁC ĐỊNH LOẠI BILL):**

1. **VNPay** → paymentMethod: "QR 1 (VNPay)": 
   - Tìm "Mã giao dịch" hoặc "Transaction ID" (số dài 17-18 chữ số)
   - Tìm "Số tiền thanh toán" hoặc "Tổng tiền" (VND)
   - Tìm "Số hóa đơn" (có thể là "MUA1", "MUA12", "MAU11", v.v.)
   - Tìm "Tên điểm thanh toán" hoặc "Thông tin điểm thanh toán" → "Tên" (ví dụ: "ANCATTUONG66PKV01", "TUAN VU THD 01")
   - Dấu hiệu nhận biết: Logo VNPay, "VNPay", "Thanh toán qua VNPay"

2. **PhonePOS / POS** → paymentMethod: "POS":
   - Tìm "Mã chuẩn chỉ" (transaction code, có thể ngắn hơn, ví dụ: "596950")
   - Tìm số tiền (thường hiển thị lớn, ví dụ: "20,027,000 ₫")
   - Tìm "ĐIỂM BÁN" (ví dụ: "MINH THAO 122PVD 01")
   - Tìm "Số hóa đơn" (ví dụ: "000016")
   - Dấu hiệu nhận biết: "PhonePOS", "POS", "Máy POS"

3. **VietinBank / App Bank** → paymentMethod: "QR 2 (App Bank)":
   - Tìm "Mã giao dịch" hoặc số tham chiếu (ví dụ: "5416900607")
   - Tìm "Số tiền" (VND)
   - Tìm "Thanh toán cho" (có thể chứa điểm thu, ví dụ: "MINHTHAO/ điểm bán MINH THAO 122PVD 01")
   - Tìm "Số hóa đơn" (ví dụ: "000000164970345")
   - Dấu hiệu nhận biết: Logo VietinBank, "VietinBank", "Vietcombank", "BIDV", "Techcombank", hoặc tên ngân hàng khác

4. **Sofpos** → paymentMethod: "Sofpos":
   - Tìm mã giao dịch (transaction code/ID)
   - Tìm số tiền thanh toán
   - Tìm điểm thu/điểm bán (point of sale/collection point)
   - Dấu hiệu nhận biết: "Sofpos", "SOFPOS", logo Sofpos

**THÔNG TIN CẦN TRÍCH XUẤT:**

1. **transactionCode** (BẮT BUỘC): Mã giao dịch/Mã chuẩn chi - có thể là số dài (17-18 chữ số) hoặc số ngắn (6-7 chữ số)
2. **amount** (BẮT BUỘC): Số tiền thanh toán (VND) - loại bỏ dấu chấm/phẩy, chuyển thành số nguyên
3. **paymentMethod** (BẮT BUỘC): Loại bill - PHẢI là một trong 4 giá trị sau:
   - "QR 1 (VNPay)" - nếu là VNPay
   - "POS" - nếu là PhonePOS hoặc máy POS
   - "QR 2 (App Bank)" - nếu là VietinBank, Vietcombank, BIDV, Techcombank hoặc app ngân hàng khác
   - "Sofpos" - nếu là Sofpos
4. **invoiceNumber** (TÙY CHỌN): Số hóa đơn nếu có
5. **pointOfSaleName** (TÙY CHỌN): Tên điểm thu/điểm bán - tìm trong các field: "Điểm bán", "Tên điểm thanh toán", "Payment point", "ĐIỂM BÁN", "Thanh toán cho" (extract phần điểm bán nếu có)
6. **bankAccount** (TÙY CHỌN): Số tài khoản ngân hàng - tìm trong field "Số tài khoản", "Số TK", "Account number" (ví dụ: "093451103")
7. **timestamp** (TÙY CHỌN): Thời gian giao dịch, format ISO string

**QUAN TRỌNG:**
- transactionCode, amount và paymentMethod là BẮT BUỘC - nếu không tìm thấy, trả về lỗi
- paymentMethod PHẢI là một trong 4 giá trị: "QR 1 (VNPay)", "POS", "QR 2 (App Bank)", "Sofpos"
- pointOfSaleName: Extract từ các field liên quan đến điểm thu/điểm bán, có thể nằm trong "Thanh toán cho" (ví dụ: "MINHTHAO/ điểm bán MINH THAO 122PVD 01" → "MINH THAO 122PVD 01")
- amount phải là số nguyên (không có dấu chấm/phẩy), đơn vị VND

**Format output JSON:**
{
  "transactionCode": "20436098128882688",
  "amount": 268000,
  "paymentMethod": "QR 1 (VNPay)",
  "invoiceNumber": "MUA1",
  "pointOfSaleName": "ANCATTUONG66PKV01",
  "bankAccount": "093451103",
  "timestamp": "2025-11-18T10:28:00.000Z"
}

**Lưu ý:**
- Nếu không tìm thấy pointOfSaleName, để trống (không phải lỗi)
- timestamp: parse từ "Thời gian giao dịch" nếu có, format ISO string. Nếu không có thì dùng thời gian hiện tại.
- Chỉ trả về JSON, không có text thừa.
`;

    // Try to detect image MIME type from base64 or default to jpeg
    let mimeType = 'image/jpeg';
    if (base64Data.startsWith('/9j/') || base64Data.startsWith('iVBORw0KGgo')) {
      mimeType = base64Data.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
  }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
    });

    const responseText = response.text || '';
    
    if (!responseText || responseText.trim().length === 0) {
      throw new Error("API không trả về dữ liệu. Vui lòng kiểm tra API key và thử lại.");
    }
    
    // Extract JSON from response (handle cases where response has extra text)
    let jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Full response:", responseText);
      throw new Error("Không thể parse JSON từ response. Response: " + responseText.substring(0, 200));
    }

    let extracted;
    try {
      extracted = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("JSON string:", jsonMatch[0]);
      throw new Error("Lỗi parse JSON từ response: " + (parseError as Error).message);
    }

    // Validate required fields
    if (!extracted.transactionCode || !extracted.amount || !extracted.paymentMethod) {
      throw new Error(`Thiếu thông tin bắt buộc: transactionCode=${extracted.transactionCode}, amount=${extracted.amount}, paymentMethod=${extracted.paymentMethod}`);
    }

    // Validate paymentMethod
    const validPaymentMethods = ['QR 1 (VNPay)', 'QR 2 (App Bank)', 'POS', 'Sofpos'];
    if (!validPaymentMethods.includes(extracted.paymentMethod)) {
      throw new Error(`Loại bill không hợp lệ: ${extracted.paymentMethod}. Phải là một trong: ${validPaymentMethods.join(', ')}`);
    }

    // Parse amount - handle Vietnamese number format
    let amount = extracted.amount;
    if (typeof amount === 'string') {
      // Remove dots and commas, then parse
      amount = parseFloat(amount.replace(/[.,]/g, ''));
    }
    if (isNaN(amount) || amount <= 0) {
      throw new Error(`Số tiền không hợp lệ: ${extracted.amount}`);
    }

    // Parse timestamp
    let timestamp = extracted.timestamp;
    if (!timestamp) {
      timestamp = new Date().toISOString();
    } else {
      try {
        // Validate timestamp format
        new Date(timestamp);
      } catch {
        timestamp = new Date().toISOString();
      }
    }

    // Extract point of sale name if available
    let pointOfSaleName: string | undefined = undefined;
    if (extracted.pointOfSaleName) {
      pointOfSaleName = String(extracted.pointOfSaleName).trim();
      // Clean up point of sale name (remove extra text like "điểm bán" prefix)
      pointOfSaleName = pointOfSaleName.replace(/^.*điểm bán\s*/i, '').replace(/^.*point of sale\s*/i, '').trim();
      if (pointOfSaleName === '') pointOfSaleName = undefined;
    }

    // Extract bank account if available (số tài khoản ngân hàng từ ảnh VNPay)
    let bankAccount: string | undefined = undefined;
    if (extracted.bankAccount || extracted.paymentPhone) {
      // Support both field names for backward compatibility
      const accountValue = extracted.bankAccount || extracted.paymentPhone;
      bankAccount = String(accountValue).trim();
      // Remove any non-digit characters except + (for international numbers)
      bankAccount = bankAccount.replace(/[^\d+]/g, '');
      if (bankAccount === '' || bankAccount.length < 8) bankAccount = undefined;
    }

    // Extract paymentMethod
    const paymentMethod = extracted.paymentMethod as 'QR 1 (VNPay)' | 'QR 2 (App Bank)' | 'POS' | 'Sofpos';

    // Create AgentSubmission object (for backward compatibility)
    const submission: AgentSubmission = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      transactionCode: String(extracted.transactionCode).trim(),
      amount: Math.round(amount),
      timestamp,
      imageUrl: imageBase64, // Store base64 for reference
      invoiceNumber: extracted.invoiceNumber ? String(extracted.invoiceNumber).trim() : undefined,
      pointOfSaleName,
      bankAccount: bankAccount, // Số tài khoản ngân hàng từ ảnh VNPay
      ocrConfidence: 0.9 // Default confidence, can be enhanced later
    };

    // Return submission with paymentMethod added
    return { ...submission, paymentMethod };
  }, 3, 2000); // 3 retries, 2s base delay (2s, 4s, 8s)
};