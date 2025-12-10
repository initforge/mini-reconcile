/**
 * Sanitize transactionCode để dùng làm Firebase key
 * Loại bỏ các kí tự không hợp lệ cho Firebase key: . # $ [ ]
 */
export function sanitizeTransactionCode(code: string): string {
  return code.replace(/[.#$\[\]]/g, '_');
}

