import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, AlertTriangle, CheckCircle, XCircle, Download, Search, FileText, BrainCircuit, Trash2, FileSpreadsheet, History, Plus, X, RotateCcw, Image as ImageIcon, Loader2, Edit2, Filter, Save, Eye, AlertCircle } from 'lucide-react';
import { remove } from 'firebase/database';
import Pagination from './Pagination';
import { ReconciliationRecord, TransactionStatus, PaymentMethod, MerchantTransaction, AgentSubmission, ReconciliationSession, Merchant, Agent, Payment, AgentReconciliationSession } from '../types';
import { generateMockFiles } from '../constants';
import { generateReconciliationReport, extractTransactionFromImage } from '../services/geminiService';
import { ReconciliationService, SettingsService, PaymentsService, MerchantTransactionsService } from '../src/lib/firebaseServices';
import { AgentReconciliationService } from '../src/lib/agentReconciliationServices';
import { ReportService } from '../src/lib/reportServices';
import { UserService } from '../src/lib/userServices';
import { get, ref } from 'firebase/database';
import { database } from '../src/lib/firebase';
import { createStyledWorkbook, createStyledSheet, addMetadataSheet, exportWorkbook, identifyNumberColumns, identifyDateColumns } from '../src/utils/excelExportUtils';
import * as XLSX from 'xlsx';
import { parseExcel, findKey, parseAmount, normalize, guessTransactionCode } from '../src/utils/excelParserUtils';
import { useRealtimeData, FirebaseUtils } from '../src/lib/firebaseHooks';
import PendingBillsPanel from './reconciliation/PendingBillsPanel';
import UserBillsModal from './reconciliation/UserBillsModal';
import type { UserBill, ReportRecord, ReportStatus } from '../types';

const ReconciliationModule: React.FC = () => {
  const [step, setStep] = useState<0 | 1 | 2>(0); // Step 0: Upload merchants, Step 1: Process, Step 2: Results
  
  // Firebase hooks for merchants and agents
  const { data: merchantsData } = useRealtimeData<Record<string, Merchant>>('/merchants');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const merchants = FirebaseUtils.objectToArray(merchantsData || {});
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  
  // Admin reconciles all users - no agent selection needed
  // No longer need session loading - admin reconciles all pending bills directly

  // Helper: Timezone-safe date range
  const getDateRange = (dateStr: string): { start: Date; end: Date } => {
    const date = new Date(dateStr + 'T00:00:00');
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };
  
  // No longer need agent link paste - admin reconciles all users
  
  // File State - Updated for multi-file support
  const [merchantFiles, setMerchantFiles] = useState<File[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  
  // Parsed Data State
  const [merchantData, setMerchantData] = useState<MerchantTransaction[]>([]);
  
  // Merchant matching warnings
  const [merchantMatchWarnings, setMerchantMatchWarnings] = useState<Map<string, string>>(new Map());

  // UI State
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Admin reconciliation results (new system)
  const [adminReconciliationResults, setAdminReconciliationResults] = useState<{
    matched: number;
    errors: number;
    results: Array<{ billId: string; status: 'MATCHED' | 'ERROR'; errorMessage?: string }>;
  } | null>(null);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'error'>('all');
  const [errorTypeFilter, setErrorTypeFilter] = useState<string>('all');
  
  // Manual edit state
  const [editingRecord, setEditingRecord] = useState<ReconciliationRecord | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Point of sale assignment state (khi OCR không tìm thấy)
  const [assigningPOS, setAssigningPOS] = useState<{ index: number; pointOfSaleName?: string } | null>(null);
  
  // Session và History State
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<ReconciliationSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'reconciliation' | 'history'>('reconciliation');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Pagination state for session history (lazy loading)
  const [historyPage, setHistoryPage] = useState(1);
  const historyItemsPerPage = 5;
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [allLoadedHistory, setAllLoadedHistory] = useState<ReconciliationSession[]>([]);

  // Refs for hidden file inputs
  const merchantInputRef = useRef<HTMLInputElement>(null);

  // Pending bills panel state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  const [showUserBillsModal, setShowUserBillsModal] = useState(false);
  const [currentUploadSessionId, setCurrentUploadSessionId] = useState<string | null>(null);

  // Load session history on component mount (lazy loading - chỉ load trang đầu)
  useEffect(() => {
    loadSessionHistory(1, true);
  }, []);

  const loadSessionHistory = async (page: number = 1, reset: boolean = false) => {
    try {
      setLoadingHistory(true);
      
      // Load paginated history
      const { sessions, hasMore, total } = await ReconciliationService.getSessionHistory(page, historyItemsPerPage);
      
      // Load records cho mỗi session để tính chính xác stats
      const historyWithRealStats = await Promise.all(sessions.map(async (session) => {
        try {
          const records = await ReconciliationService.getRecordsBySession(session.id);
          const matchedCount = records.filter(r => r.status === TransactionStatus.MATCHED).length;
          const errorCount = records.filter(r => 
            r.status === TransactionStatus.ERROR_AMOUNT || 
            r.status === TransactionStatus.ERROR_DUPLICATE
          ).length;
          const missingCount = records.filter(r => 
            r.status === TransactionStatus.MISSING_IN_MERCHANT || 
            r.status === TransactionStatus.MISSING_IN_AGENT || 
            r.status === TransactionStatus.ERROR_DUPLICATE
          ).length;
          const totalAmount = records.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0);
          
          return {
            ...session,
            totalRecords: records.length,
            matchedCount,
            errorCount,
            missingCount,
            totalAmount
          };
        } catch (e) {
          console.warn(`⚠️ Không thể load records cho session ${session.id}:`, e);
          return session;
        }
      }));
      
      if (reset) {
        // Reset: chỉ giữ trang mới
        setAllLoadedHistory(historyWithRealStats);
        setSessionHistory(historyWithRealStats);
      } else {
        // Append: thêm vào danh sách đã load, nhưng chỉ hiển thị trang hiện tại
        const updatedHistory = [...allLoadedHistory, ...historyWithRealStats];
        setAllLoadedHistory(updatedHistory);
        // Chỉ hiển thị trang hiện tại (page)
        const startIndex = (page - 1) * historyItemsPerPage;
        const endIndex = startIndex + historyItemsPerPage;
        setSessionHistory(updatedHistory.slice(startIndex, endIndex));
      }
      
      setHistoryHasMore(hasMore);
      setHistoryTotal(total);
    } catch (error) {
      console.error('Error loading session history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };
  
  const handleHistoryPageChange = async (newPage: number) => {
    setHistoryPage(newPage);
    // Nếu trang mới chưa được load, load nó
    const maxLoadedPage = Math.ceil(allLoadedHistory.length / historyItemsPerPage);
    if (newPage > maxLoadedPage && historyHasMore) {
      await loadSessionHistory(newPage, false);
    } else {
      // Hiển thị dữ liệu đã load
      const startIndex = (newPage - 1) * historyItemsPerPage;
      const endIndex = startIndex + historyItemsPerPage;
      setSessionHistory(allLoadedHistory.slice(startIndex, endIndex));
    }
  };
  
  // Calculate pagination for session history (lazy loading - chỉ hiển thị trang hiện tại)
  const historyTotalPages = Math.ceil(historyTotal / historyItemsPerPage);
  const paginatedHistory = sessionHistory; // Đã được filter theo trang trong loadSessionHistory

  // Helper to get status details với errorType chi tiết
  const getStatusBadge = (record: ReconciliationRecord) => {
    const status = record.status;
    const errorType = record.errorType;
    
    switch (status) {
      case TransactionStatus.MATCHED:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center w-fit"><CheckCircle className="w-3 h-3 mr-1" /> Khớp</span>;
      case TransactionStatus.ERROR_AMOUNT:
        if (errorType === 'WRONG_POINT_OF_SALE') {
          return <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 flex items-center w-fit"><AlertTriangle className="w-3 h-3 mr-1" /> Sai điểm bán</span>;
        } else if (errorType === 'WRONG_AMOUNT') {
          return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center w-fit"><AlertTriangle className="w-3 h-3 mr-1" /> Sai số tiền</span>;
        }
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 flex items-center w-fit"><AlertTriangle className="w-3 h-3 mr-1" /> Lệch tiền</span>;
      case TransactionStatus.ERROR_DUPLICATE:
        if (errorType === 'WRONG_AGENT') {
          return <span className="px-2 py-1 rounded-full text-xs font-medium bg-pink-100 text-pink-700 flex items-center w-fit"><AlertTriangle className="w-3 h-3 mr-1" /> Sai đại lý</span>;
        } else if (errorType === 'DUPLICATE') {
          return <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 flex items-center w-fit"><AlertTriangle className="w-3 h-3 mr-1" /> Trùng lặp</span>;
        }
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 flex items-center w-fit"><AlertTriangle className="w-3 h-3 mr-1" /> Trùng lặp</span>;
      case TransactionStatus.MISSING_IN_MERCHANT:
        if (errorType === 'MISSING_MERCHANT') {
          return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 flex items-center w-fit"><Search className="w-3 h-3 mr-1" /> Không tìm thấy (Merchant)</span>;
        }
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 flex items-center w-fit"><Search className="w-3 h-3 mr-1" /> Không tìm thấy (Merchant)</span>;
      case TransactionStatus.MISSING_IN_AGENT:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 flex items-center w-fit"><Search className="w-3 h-3 mr-1" /> Không tìm thấy (Agent)</span>;
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Chờ xử lý</span>;
    }
  };


  // Handle multiple merchant files upload
  const handleMerchantFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types
    const invalidFiles = files.filter(file => !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls'));
    if (invalidFiles.length > 0) {
      alert(`Các file không hợp lệ: ${invalidFiles.map(f => f.name).join(', ')}\nVui lòng chọn file Excel (.xlsx hoặc .xls)`);
      return;
    }

    setMerchantFiles(files);
    setIsProcessingFiles(true);
    setMergeProgress(0);

    try {
      const allMerchantData: MerchantTransaction[] = [];
      const duplicateMap = new Map<string, number>(); // Track duplicates by transaction code
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setMergeProgress(Math.round(((i + 1) / files.length) * 100));
        
        console.log(`📂 Processing file ${i + 1}/${files.length}:`, file.name);
        const rawData = await parseExcel(file);
        
        if (rawData.length === 0) {
          console.warn(`⚠️ File ${file.name} trống hoặc không có dữ liệu hợp lệ`);
          continue;
        }

        const mappedData: (MerchantTransaction | null)[] = rawData.map((row: any, index) => {
          // Process same as single file but with file source tracking
          // Extract point of sale information TRƯỚC để tránh lấy nhầm
          const pointOfSaleName = findKey(row, ['điểm thu', 'tên điểm thu', 'point of sale', 'pos name', 'collection point']);
          
          // Debug: Log tất cả keys để xem Excel có những cột gì
          if (index === 0) {
            console.log(`📋 Row 0 - All available keys:`, Object.keys(row));
            console.log(`📋 Row 0 - All values:`, Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(', '));
          }
          
          // Tìm mã chuẩn chi - ưu tiên "Mã trừ tiền/Mã chuẩn chi" (cột H trong Excel)
          // QUAN TRỌNG: Phải tìm từ cột H, không được lấy pointOfSaleName
          let transactionCode = findKey(row, [
            'mã trừ tiền/mã chuẩn chi', 'mã trừ tiền mã chuẩn chi', 'mã trừ tiền', 'mã chuẩn chi', 'mã truy tiền', 
            'mã giao dịch', 'mã gd', 'transaction code', 'transaction','transaction id',
            'reference','ref','txn','trace','stan','rrn','transaction_id'
          ]);
          
          // Nếu không tìm thấy bằng findKey, thử tìm thủ công trong tất cả các keys
          if (!transactionCode || transactionCode === '') {
            const allKeys = Object.keys(row);
            // Tìm key có chứa "mã trừ tiền" hoặc "mã chuẩn chi"
            const manualMatch = allKeys.find(k => {
              const nk = normalize(k);
              return nk.includes('ma tru tien') || nk.includes('ma chuan chi') || 
                     nk.includes('ma truy tien') || (nk.includes('ma') && nk.includes('chuan'));
            });
            if (manualMatch) {
              transactionCode = row[manualMatch];
              console.log(`✅ Row ${index}: Tìm thấy mã chuẩn chi từ key "${manualMatch}": ${transactionCode}`);
            }
          }
          
          // Debug: Log để kiểm tra
          if (index < 3) {
            console.log(`🔍 Row ${index} - pointOfSaleName:`, pointOfSaleName);
            console.log(`🔍 Row ${index} - transactionCode (after findKey):`, transactionCode);
          }
          
          // VALIDATION QUAN TRỌNG: transactionCode KHÔNG ĐƯỢC là pointOfSaleName
          if (transactionCode && transactionCode === pointOfSaleName) {
            console.warn(`⚠️ Row ${index}: transactionCode trùng với pointOfSaleName (${transactionCode}), reset và tìm lại...`);
            transactionCode = undefined; // Reset để tìm lại
          }
          
          // Nếu không tìm thấy hoặc bị reset, tìm trong tất cả các cột - chỉ lấy số dài (>= 10 chữ số)
          if (!transactionCode || transactionCode === '') {
            const allKeys = Object.keys(row);
            let bestCandidate: string | undefined;
            
            for (const key of allKeys) {
              const val = String(row[key] || '').trim();
              // Chỉ lấy giá trị là số dài (>= 10 chữ số) - đây là mã chuẩn chi
              // Loại trừ pointOfSaleName và các giá trị ngắn
              if (val && /^\d{10,}$/.test(val) && val !== pointOfSaleName) {
                if (!bestCandidate || val.length > bestCandidate.length) {
                  bestCandidate = val;
                }
              }
            }
            
            if (bestCandidate) {
              transactionCode = bestCandidate;
              console.log(`✅ Row ${index}: Tìm thấy mã chuẩn chi (số dài): ${transactionCode}`);
            } else {
              // Fallback: thử guess nhưng LOẠI TRỪ pointOfSaleName
              const guess = guessTransactionCode(row);
              if (guess && guess !== pointOfSaleName && !/^[A-Z]/.test(guess)) {
                // Chỉ dùng guess nếu không phải là text (pointOfSaleName thường là text)
                transactionCode = guess;
                console.log(`✅ Row ${index}: Used guessTransactionCode: ${transactionCode}`);
              } else {
                console.warn(`⚠️ Row ${index}: Không tìm thấy mã chuẩn chi hợp lệ`);
              }
            }
          }
          
          // Validate lại lần nữa - không được là pointOfSaleName
          if (transactionCode === pointOfSaleName) {
            console.error(`❌ Row ${index}: transactionCode vẫn trùng với pointOfSaleName sau khi tìm lại!`);
            // Tìm lại từ tất cả các cột, loại trừ pointOfSaleName và các cột không phải mã chuẩn chi
            const allKeys = Object.keys(row);
            const excludedKeys = [
              'điểm thu', 'tên điểm thu', 'point of sale', 'pos name', 
              'chi nhánh', 'branch', 'số tiền', 'amount', 'mã điểm thu',
              'số hóa đơn', 'invoice', 'mã khuyến mại', 'promotion', 'phone'
            ];
            const candidateKeys = allKeys.filter(k => {
              const normalizedKey = normalize(k);
              const keyValue = String(row[k] || '').trim();
              // Loại trừ các key bị exclude
              if (excludedKeys.some(ex => normalizedKey.includes(normalize(ex)))) return false;
              // Loại trừ giá trị trùng với pointOfSaleName
              if (keyValue === pointOfSaleName) return false;
              // Ưu tiên giá trị là số dài (>= 10 chữ số) - thường là mã chuẩn chi
              if (keyValue && /^\d{10,}$/.test(keyValue)) return true;
              return false;
            });
            
            // Tìm giá trị dài nhất và là số (thường là mã chuẩn chi)
            let bestCandidate: string | undefined;
            for (const key of candidateKeys) {
              const val = String(row[key] || '').trim();
              if (val && /^\d{10,}$/.test(val)) {
                if (!bestCandidate || val.length > bestCandidate.length) {
                  bestCandidate = val;
                }
              }
            }
            if (bestCandidate) {
              transactionCode = bestCandidate;
              console.log(`✅ Row ${index}: Tìm thấy mã chuẩn chi từ cột khác: ${transactionCode}`);
            } else {
              console.error(`❌ Row ${index}: KHÔNG TÌM THẤY mã chuẩn chi hợp lệ!`);
            }
          }
          
          // Only use UNK_ as last resort if we really can't find anything
          if (!transactionCode || transactionCode === '') {
            // Try one more time: look for any numeric value >= 10 digits
            const allValues = Object.values(row).map(v => String(v || '').trim()).filter(v => v && /^\d{10,}$/.test(v));
            if (allValues.length > 0) {
              transactionCode = allValues[0];
              console.log(`✅ Row ${index}: Found transactionCode from numeric value: ${transactionCode}`);
            } else {
              transactionCode = `UNK_${file.name}_${index}`;
              console.warn(`⚠️ Row ${index}: Cannot find transactionCode, using UNK_${file.name}_${index}`);
            }
          } else {
            transactionCode = String(transactionCode);
          }
          
          // Validate: transactionCode không được là pointOfSaleName
          if (transactionCode === pointOfSaleName) {
            console.error(`❌ Row ${index}: transactionCode vẫn trùng với pointOfSaleName: ${transactionCode}`);
            // Try to find another value
            const allValues = Object.values(row).map(v => String(v || '').trim()).filter(v => v && v !== pointOfSaleName && v.length >= 6);
            if (allValues.length > 0) {
              transactionCode = allValues[0];
              console.log(`✅ Row ${index}: Replaced transactionCode with: ${transactionCode}`);
            }
          }
          
          // Check for duplicates - CHỈ dựa trên transactionCode
          if (duplicateMap.has(transactionCode)) {
            const count = duplicateMap.get(transactionCode)! + 1;
            duplicateMap.set(transactionCode, count);
            console.log(`🔄 Duplicate transactionCode found: ${transactionCode} (count: ${count})`);
          } else {
            duplicateMap.set(transactionCode, 1);
          }

          let amount = findKey(row, [
            'số tiền sau km','số tiền trước km','số tiền','số tiền giao dịch','thành tiền','tổng tiền','amount','amount vnd','giá trị','vnd','money','value','total','sum','tổng'
          ]);
          
          console.log(`💰 Row ${index} - Found amount key:`, amount, 'Type:', typeof amount);
          console.log(`💰 Row ${index} - All row keys:`, Object.keys(row));
          console.log(`💰 Row ${index} - Sample row data:`, Object.fromEntries(Object.entries(row).slice(0, 5)));
          
          if (!amount || parseAmount(amount) === 0) {
            console.log(`⚠️ Row ${index} - Amount not found or invalid, searching numeric columns...`);
            const numericKeys = Object.keys(row).map(k => {
              const val = parseAmount(row[k]);
              // Loại bỏ giá trị quá nhỏ (< 1000 VND) - không phải số tiền giao dịch
              // Loại bỏ giá trị quá lớn (> 10 tỷ) - có thể là tổng hoặc lỗi
              const isValid = !isNaN(val) && val >= 1000 && val < 10000000000;
              if (isValid) {
                console.log(`  ✅ Found numeric column "${k}": ${row[k]} -> ${val}`);
              }
              return { key: k, value: val, isValid };
            }).filter(item => item.isValid);
            
            if (numericKeys.length > 0) {
              // Smart selection: prefer values in typical transaction range (100k - 100M)
              // Avoid very small values (likely phone numbers/IDs) and very large values (likely totals)
              const typicalRange = numericKeys.filter(item => 
                item.value >= 100000 && item.value <= 100000000
              );
              
              if (typicalRange.length > 0) {
                // Prefer larger values in the typical range (more likely to be transaction amounts)
                // Also prefer values in columns that look like amount columns (_EMPTY_15, _EMPTY_16, etc.)
                const bestMatch = typicalRange.reduce((best, current) => {
                  // Score based on:
                  // 1. Value size (larger is better, but not too large)
                  // 2. Column name (prefer _EMPTY_15, _EMPTY_16 over _EMPTY_10, _EMPTY_11)
                  const currentScore = 
                    (current.value / 1000000) + // Size score (millions)
                    (current.key.includes('_EMPTY_15') || current.key.includes('_EMPTY_16') ? 10 : 0) + // Column name bonus
                    (current.value % 1000 !== 0 ? 1 : 0); // Prefer non-round numbers
                  
                  const bestScore = 
                    (best.value / 1000000) +
                    (best.key.includes('_EMPTY_15') || best.key.includes('_EMPTY_16') ? 10 : 0) +
                    (best.value % 1000 !== 0 ? 1 : 0);
                  
                  return currentScore > bestScore ? current : best;
                });
                amount = row[bestMatch.key];
                console.log(`  📌 Using column "${bestMatch.key}" as amount (smart selection): ${amount} -> ${bestMatch.value}`);
              } else {
                // Fallback: try wider range (10k - 100M) but still prefer larger values
                const widerRange = numericKeys.filter(item => 
                  item.value >= 10000 && item.value <= 100000000
                );
                if (widerRange.length > 0) {
                  const bestMatch = widerRange.reduce((best, current) => 
                    current.value > best.value ? current : best
                  );
                  amount = row[bestMatch.key];
                  console.log(`  📌 Using column "${bestMatch.key}" as amount (wider range fallback): ${amount} -> ${bestMatch.value}`);
                } else {
                  // Last resort: first valid numeric column
                  amount = row[numericKeys[0].key];
                  console.log(`  📌 Using column "${numericKeys[0].key}" as amount (last resort): ${amount}`);
                }
              }
            }
          }
          
          // Parse số tiền sau KM (dùng để hiển thị)
          const parsedAmount = parseAmount(amount);
          
          // Parse số tiền trước KM (dùng để match)
          const amountBeforeDiscountKey = findKey(row, [
            'số tiền trước km', 'số tiền trước khuyến mại', 'amount before discount', 
            'giá trị trước km', 'tổng tiền trước km'
          ]);
          const amountBeforeDiscount = amountBeforeDiscountKey ? parseAmount(amountBeforeDiscountKey) : parsedAmount;
          
          // Validate: amount phải >= 100 VND (giảm threshold để parse được nhiều hơn), nếu không thì skip row này
          if (!parsedAmount || parsedAmount < 100) {
            console.warn(`⚠️ Row ${index}: Amount không hợp lệ (${parsedAmount}), skip row này`);
            return null; // Skip row này
          }
          
          console.log(`💰 Row ${index} - Final parsed amount: ${parsedAmount} (from: ${amount}), amountBeforeDiscount: ${amountBeforeDiscount}`);
          amount = parsedAmount;
          const timestamp = String(
            findKey(row, ['thời gian','thời gian giao dịch','ngày','ngày giao dịch','time','date','datetime','created']) 
            || new Date().toISOString()
          );
          const method = findKey(row, ['phương thức','phương thức thanh toán','method','loại','type','payment']) || PaymentMethod.QR_VNPAY;
          
          // Extract point of sale information (pointOfSaleName đã được extract ở trên)
          const branchName = findKey(row, ['chi nhánh', 'branch', 'branch name', 'tên chi nhánh']);
          
          // Parse thêm các field mới
          const invoiceNumber = findKey(row, ['số hóa đơn', 'invoice number', 'invoice', 'hóa đơn', 'so hoa don']);
          const phoneNumber = findKey(row, ['số điện thoại', 'phone number', 'phone', 'sdt', 'so dien thoai']);
          const promotionCode = findKey(row, ['mã khuyến mại', 'promotion code', 'promo code', 'ma khuyen mai', 'mã km']);
          
          // Match merchant via point of sale ONLY (không check merchantCode/merchant name)
          let matchedMerchant: Merchant | null = null;
          
          if (pointOfSaleName) {
            matchedMerchant = merchants.find(m => 
              (m.pointOfSaleName === pointOfSaleName || normalize(m.pointOfSaleName || '') === normalize(pointOfSaleName))
            ) || null;
            
            if (matchedMerchant) {
              console.log(`✅ Matched merchant: ${matchedMerchant.pointOfSaleName} via point of sale`);
            } else {
              console.warn(`⚠️ Không tìm thấy Merchant cho điểm thu: ${pointOfSaleName}`);
            }
          }
          
          // Convert timestamp to ISO format for transactionDate with validation
          let transactionDate: string;
          try {
            if (timestamp.includes('T')) {
              // Already ISO format
              transactionDate = timestamp;
            } else {
              // Try to parse as date
              const parsedDate = new Date(timestamp);
              if (isNaN(parsedDate.getTime())) {
                // Invalid date, use current date
                console.warn(`⚠️ Row ${index}: Invalid timestamp "${timestamp}", using current date`);
                transactionDate = new Date().toISOString();
              } else {
                transactionDate = parsedDate.toISOString();
              }
            }
          } catch (error) {
            console.warn(`⚠️ Row ${index}: Error parsing timestamp "${timestamp}": ${error}, using current date`);
            transactionDate = new Date().toISOString();
          }
          
          return {
            id: `MER_${file.name}_${index}`,
            merchantCode: matchedMerchant?.code || 'MER_UPLOAD', // Default to MER_UPLOAD if no match
            transactionCode,
            amount, // Số tiền sau KM
            amountBeforeDiscount: amountBeforeDiscount || undefined, // Số tiền trước KM (dùng để match)
            transactionDate,
            uploadSessionId: '', // Will be set when saving to DB
            pointOfSaleName: pointOfSaleName ? String(pointOfSaleName) : undefined,
            branchName: branchName ? String(branchName) : undefined,
            invoiceNumber: invoiceNumber ? String(invoiceNumber) : undefined,
            phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
            promotionCode: promotionCode ? String(promotionCode) : undefined,
            rawRowIndex: index
          };
        });

        // Filter out null values (rows that were skipped due to invalid amount)
        const validData = mappedData.filter((item): item is MerchantTransaction => item !== null);
        allMerchantData.push(...validData);
        console.log(`✅ Processed ${file.name}: ${validData.length} valid transactions (${mappedData.length - validData.length} rows skipped)`);
      }

      // Remove duplicates (keep first occurrence) - CHỈ dựa trên transactionCode (mã chuẩn chi)
      // Validate và filter invalid transactionCodes trước
      const validData = allMerchantData.filter(item => {
        // TransactionCode không được là pointOfSaleName
        if (item.transactionCode === item.pointOfSaleName) {
          console.error(`❌ Invalid: transactionCode trùng với pointOfSaleName: "${item.transactionCode}" - Skip row`);
          return false;
        }
        // TransactionCode phải có độ dài hợp lý (ít nhất 3 ký tự)
        if (!item.transactionCode || item.transactionCode.length < 3) {
          console.warn(`⚠️ Warning: transactionCode quá ngắn: "${item.transactionCode}" - Skip row`);
          return false;
        }
        // Warn về UNK_xxx nhưng vẫn giữ lại để có thể xử lý sau
        if (item.transactionCode.startsWith('UNK_')) {
          console.warn(`⚠️ Warning: transactionCode là UNK_xxx: "${item.transactionCode}" - Vẫn giữ lại để xử lý`);
        }
        return true;
      });
      
      // Remove duplicates dựa trên transactionCode
      const seenCodes = new Map<string, MerchantTransaction>();
      const duplicateDetails: Array<{code: string, count: number, files: string[]}> = [];
      
      for (const item of validData) {
        if (seenCodes.has(item.transactionCode)) {
          // Duplicate found
          const existing = duplicateDetails.find(d => d.code === item.transactionCode);
          if (existing) {
            existing.count++;
            if (!existing.files.includes(item.sourceFile)) {
              existing.files.push(item.sourceFile);
            }
          } else {
            const firstItem = seenCodes.get(item.transactionCode)!;
            duplicateDetails.push({ 
              code: item.transactionCode, 
              count: 2,
              files: [firstItem.sourceFile, item.sourceFile]
            });
          }
          console.log(`🔄 Duplicate mã chuẩn chi: ${item.transactionCode} (đã có ${duplicateDetails.find(d => d.code === item.transactionCode)?.count || 2} lần)`);
        } else {
          seenCodes.set(item.transactionCode, item);
        }
      }
      
      const uniqueData = Array.from(seenCodes.values());
      const duplicatesRemoved = validData.length - uniqueData.length;
      
      if (duplicatesRemoved > 0) {
        console.log(`🗑️ Removed ${duplicatesRemoved} duplicate transactions (dựa trên mã chuẩn chi)`);
        duplicateDetails.forEach(d => {
          console.log(`   - ${d.code}: ${d.count} lần (files: ${d.files.join(', ')})`);
        });
      } else {
        console.log(`✅ Không có duplicate transactions - tất cả ${uniqueData.length} mã chuẩn chi đều unique`);
      }

      setMerchantData(uniqueData);
      console.log(`🎯 Final merged data: ${uniqueData.length} unique transactions from ${files.length} files`);
      
      // Save to merchant_transactions with uploadSessionId
      const uploadSessionId = `UPLOAD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setCurrentUploadSessionId(uploadSessionId);
      
      console.log(`💾 Saving ${uniqueData.length} merchant transactions to database...`);
      const transactionsToSave = uniqueData.map(item => {
        // Map old MerchantTransaction format to new format
        let transactionDate: string;
        try {
          // If item already has transactionDate (new format), use it
          if ('transactionDate' in item && item.transactionDate) {
            transactionDate = item.transactionDate;
          } else if ('timestamp' in item && item.timestamp) {
            // Old format - convert timestamp to transactionDate
            const timestamp = item.timestamp;
            if (timestamp.includes('T')) {
              transactionDate = timestamp;
            } else {
              const parsedDate = new Date(timestamp);
              if (isNaN(parsedDate.getTime())) {
                console.warn(`⚠️ Invalid timestamp "${timestamp}", using current date`);
                transactionDate = new Date().toISOString();
              } else {
                transactionDate = parsedDate.toISOString();
              }
            }
          } else {
            // No timestamp, use current date
            transactionDate = new Date().toISOString();
          }
        } catch (error) {
          console.warn(`⚠️ Error parsing date for transaction ${item.transactionCode}: ${error}, using current date`);
          transactionDate = new Date().toISOString();
        }
        
        return {
          merchantCode: item.merchantCode || 'MER_UPLOAD',
          transactionCode: item.transactionCode,
          amount: item.amount,
          amountBeforeDiscount: item.amountBeforeDiscount || undefined,
          transactionDate: transactionDate,
          uploadSessionId: uploadSessionId,
          pointOfSaleName: item.pointOfSaleName || undefined,
          branchName: item.branchName || undefined,
          invoiceNumber: item.invoiceNumber || undefined,
          phoneNumber: item.phoneNumber || undefined,
          promotionCode: item.promotionCode || undefined,
          rawRowIndex: item.rawRowIndex // Preserve rawRowIndex if available
        };
      });
      
      await MerchantTransactionsService.createBatch(transactionsToSave);
      console.log(`✅ Saved ${transactionsToSave.length} merchant transactions with uploadSessionId: ${uploadSessionId}`);
      
      // Reset input sau khi xử lý thành công để có thể upload lại
      if (merchantInputRef.current) {
        merchantInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Error processing merchant files:', error);
      alert(`Lỗi khi xử lý files: ${error}`);
      // Reset input on error để có thể upload lại
      if (merchantInputRef.current) {
        merchantInputRef.current.value = '';
      }
    } finally {
      setIsProcessingFiles(false);
      setMergeProgress(0);
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'merchant' | 'agent') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Vui lòng chọn file Excel (.xlsx hoặc .xls)');
      return;
    }

    try {
      console.log(`Đang đọc file ${type}:`, file.name);
      const rawData = await parseExcel(file);
      console.log(`Dữ liệu raw từ ${type}:`, rawData);
      
      if (rawData.length === 0) {
        alert('File Excel trống hoặc không có dữ liệu hợp lệ');
        return;
      }

      if (type === 'merchant') {
        setMerchantFiles([file]);
        const mappedData: (MerchantTransaction | null)[] = rawData.map((row: any, index) => {
          console.log(`🔄 Processing merchant row ${index}:`, row);
          
          // Try to find transaction code in more places
          // Tìm mã chuẩn chi - ưu tiên "Mã trừ tiền/Mã chuẩn chi" (cột H trong Excel)
          let transactionCode = findKey(row, [
            'mã trừ tiền/mã chuẩn chi', 'mã trừ tiền', 'mã chuẩn chi', 'mã truy tiền',
            'mã giao dịch','mã gd','transaction code','transaction','transaction id',
            'reference','ref','txn','trace','stan','rrn','transaction_id'
          ]);
          
          // If not found, look for any cell that looks like a transaction ID (contains numbers/letters)
          if (!transactionCode || transactionCode === '') {
            // Avoid picking date/time columns as code; use heuristic
            const guess = guessTransactionCode(row);
            if (guess) transactionCode = guess;
          }
          
          transactionCode = String(transactionCode || `UNK_${index}`);
          
          // Look for amount in multiple ways
          let amount = findKey(row, [
            'số tiền sau km','số tiền trước km','số tiền','số tiền giao dịch','thành tiền','tổng tiền','amount','amount vnd','giá trị','vnd','money','value','total','sum','tổng'
          ]);
          
          // If not found, find any numeric column (chỉ lấy >= 1000 VND)
          if (!amount || parseAmount(amount) < 1000) {
            const numericKeys = Object.keys(row).filter(k => {
              const val = parseAmount(row[k]);
              return !isNaN(val) && val >= 1000 && val < 10000000000; // Chỉ lấy >= 1000 VND
            });
            if (numericKeys.length > 0) {
              // Ưu tiên giá trị lớn nhất trong range hợp lý
              const bestKey = numericKeys.reduce((best, k) => {
                const bestVal = parseAmount(row[best]);
                const currentVal = parseAmount(row[k]);
                return currentVal > bestVal ? k : best;
              });
              amount = row[bestKey];
            }
          }
          
          const parsedAmount = parseAmount(amount);
          // Validate: amount phải >= 1000 VND, nếu không thì skip row này
          if (!parsedAmount || parsedAmount < 1000) {
            console.warn(`⚠️ Row ${index}: Amount không hợp lệ (${parsedAmount}), skip row này`);
            return null;
          }
          amount = parsedAmount;
          const timestamp = String(
            findKey(row, ['thời gian','thời gian giao dịch','ngày','ngày giao dịch','time','date','datetime','created']) 
            || new Date().toISOString()
          );
          const method = findKey(row, ['phương thức','phương thức thanh toán','method','loại','type','payment']) || PaymentMethod.QR_VNPAY;
          
          console.log(`✅ Mapped merchant row ${index}:`, { transactionCode, amount, timestamp, method });
          
          return {
            id: `MER_${index}`,
            merchantCode: 'MER_UPLOAD',
            transactionCode,
            amount,
            timestamp,
            method
          };
        }).filter(item => {
          console.log('🔍 Validating merchant row:', item);
          
          // More flexible validation
          const hasValidCode = item.transactionCode && 
                               item.transactionCode !== '' && 
                               !item.transactionCode.startsWith('UNK_');
          const hasValidAmount = item.amount && Number(item.amount) > 0;
          
          console.log('💰 Merchant validation:', { 
            code: item.transactionCode, 
            codeValid: hasValidCode,
            amount: item.amount, 
            amountValid: hasValidAmount 
          });
          
          const isValid = hasValidCode && hasValidAmount;
          if (!isValid) console.log('❌ Filtered out invalid merchant row:', item);
          return isValid;
        });
        
        console.log(`Đã parse ${mappedData.length} giao dịch merchant`);
        // Filter out null values (rows that were skipped due to invalid amount)
        const validData = mappedData.filter((item): item is MerchantTransaction => item !== null);
        setMerchantData(validData);
        if (mappedData.length !== validData.length) {
          console.warn(`⚠️ Skipped ${mappedData.length - validData.length} rows with invalid amount`);
        }
        if (mappedData.length > 0) {
          alert(`✅ Đã tải thành công ${mappedData.length} giao dịch từ file Merchant`);
        } else {
          alert('⚠️ Không tìm thấy dữ liệu hợp lệ trong file Merchant. Kiểm tra lại cột: Mã GD, Số tiền');
        }
      }
    } catch (error) {
      console.error("Error parsing excel:", error);
      alert(`❌ Lỗi khi đọc file Excel: ${error}. Vui lòng kiểm tra định dạng file.`);
    }
  };

  const loadDemoData = () => {
    const { merchantFile, agentFile } = generateMockFiles();
    
    // Transform mock data structure to fit our state structure
    const mappedMerch: MerchantTransaction[] = merchantFile.map((m, i) => ({
        id: `MOCK_M_${i}`,
        merchantCode: 'MOCK_MERCH',
        transactionCode: m.code,
        amount: m.amount,
        timestamp: m.time,
        method: m.method
    }));

    setMerchantData(mappedMerch);
    
    // Create fake file objects for UI state
    const demoMerchantFiles = [
      new File([""], "demo_merchant_data_1.xlsx"),
      new File([""], "demo_merchant_data_2.xlsx")
    ];
    setMerchantFiles(demoMerchantFiles);
  };

  // Core reconciliation function: Compare merchant transactions vs session records
  const performReconciliation = (
    merchantTransactions: MerchantTransaction[],
    baseRecords: ReconciliationRecord[]
  ): ReconciliationRecord[] => {
    // Extract agentData from session records (only source for admin reconciliation)
    const baseAgentData: AgentSubmission[] = baseRecords
      .filter(r => r.agentData)
      .map(r => r.agentData!);

    if (merchantTransactions.length === 0 || baseAgentData.length === 0) {
      return [];
    }

    // Load paid transactions to check for double payment
    // This will be handled in handleProcess, but we need the logic here too
    // For now, we'll create records without payment checks (handled in handleProcess)
    const results: ReconciliationRecord[] = [];
    const processedAgentCodes = new Set<string>();
    const agentDuplicateMap = new Map<string, AgentSubmission[]>();
    
    // Step 1: INDEX MERCHANT DATA (O(n) - chỉ làm 1 lần)
    const merchantIndex = new Map<string, MerchantTransaction>();
    merchantTransactions.forEach(m => {
      merchantIndex.set(m.transactionCode, m); // Match by transactionCode only
    });
    
    // Step 2: Detect duplicates in Agent data
    baseAgentData.forEach((agentTx) => {
      if (!agentDuplicateMap.has(agentTx.transactionCode)) {
        agentDuplicateMap.set(agentTx.transactionCode, []);
      }
      agentDuplicateMap.get(agentTx.transactionCode)!.push(agentTx);
    });

    // Step 3: FAST MATCHING với early exit (O(m) với O(1) lookup per tx)
    baseAgentData.forEach((agentTx, agentIndex) => {
      const code = agentTx.transactionCode;
      const merchantMatch = merchantIndex.get(code);
      const duplicateCount = agentDuplicateMap.get(code)?.length || 1;
      const isFirstOccurrence = !processedAgentCodes.has(code);
      
      // Check for duplicate
      if (duplicateCount > 1 && !isFirstOccurrence) {
        return; // Skip subsequent duplicates
      }
      
      let status: TransactionStatus;
      let diff = 0;
      let errorDetail = '';
      let errorType: ReconciliationRecord['errorType'] = undefined;
      
      // Check 1: Duplicate
      if (duplicateCount > 1 && isFirstOccurrence) {
        status = TransactionStatus.ERROR_DUPLICATE;
        errorType = 'DUPLICATE';
        errorDetail = `Bill ${code} bị trùng ${duplicateCount} lần`;
        diff = 0;
      }
      // Check 2: Missing in Merchant
      else if (!merchantMatch) {
        status = TransactionStatus.MISSING_IN_MERCHANT;
        errorType = 'MISSING_MERCHANT';
        errorDetail = `Bill ${code} không tồn tại trong hệ thống Merchant`;
        diff = 0;
      }
      // Check 3: Amount mismatch
      else if (Math.abs(merchantMatch.amount - agentTx.amount) > 0.01) {
        status = TransactionStatus.ERROR_AMOUNT;
        errorType = 'WRONG_AMOUNT';
        errorDetail = `Sai số tiền: Merchant ${merchantMatch.amount.toLocaleString('vi-VN')}đ vs Agent ${agentTx.amount.toLocaleString('vi-VN')}đ`;
        diff = agentTx.amount - merchantMatch.amount;
      }
      // All good - MATCHED
      else {
        status = TransactionStatus.MATCHED;
        errorDetail = '';
        diff = 0;
      }

      // Find merchant by point of sale
      const matchedMerchant = merchants.find(m => 
        m.pointOfSaleName === merchantMatch?.pointOfSaleName
      );

      const completeRecord: ReconciliationRecord = {
        id: `REC_${Date.now()}_${agentIndex}`,
        transactionCode: agentTx.transactionCode,
        agentData: agentTx,
        merchantData: merchantMatch,
        status,
        difference: diff,
        processedAt: new Date().toISOString(),
        errorDetail,
        errorType,
        merchantCode: merchantMatch?.merchantCode || 'N/A',
        merchantId: matchedMerchant?.id,
        agentId: agentTx.agentId,
        paymentMethod: merchantMatch?.method || PaymentMethod.QR_VNPAY,
        transactionDate: merchantMatch?.timestamp || agentTx.timestamp,
        merchantAmount: merchantMatch?.amount || 0,
        agentAmount: agentTx.amount,
        sourceFile: (merchantMatch as any)?.sourceFile || 'Unknown',
        pointOfSaleName: merchantMatch?.pointOfSaleName || agentTx.pointOfSaleName,
      };

      results.push(completeRecord);
      processedAgentCodes.add(code);
    });

    // Step 4: Find MISSING_IN_AGENT
    merchantTransactions.forEach((merTx, merchIndex) => {
      if (!processedAgentCodes.has(merTx.transactionCode)) {
        const matchedMerchant = merchants.find(m => 
          m.pointOfSaleName === merTx.pointOfSaleName
        );
        
        const missingRecord: ReconciliationRecord = {
          id: `REC_MISSING_${Date.now()}_${merchIndex}`,
          transactionCode: merTx.transactionCode,
          merchantData: merTx,
          agentData: undefined,
          status: TransactionStatus.MISSING_IN_AGENT,
          difference: 0,
          processedAt: new Date().toISOString(),
          errorDetail: `Giao dịch ${merTx.transactionCode} từ hệ thống chưa có Agent nào up bill`,
          merchantCode: merTx.merchantCode,
          merchantId: matchedMerchant?.id,
          agentId: 'N/A',
          paymentMethod: merTx.method,
          transactionDate: merTx.timestamp,
          merchantAmount: merTx.amount,
          agentAmount: 0,
          sourceFile: (merTx as any)?.sourceFile || 'Unknown',
          pointOfSaleName: merTx.pointOfSaleName,
        };
        
        results.push(missingRecord);
      }
    });

    return results;
  };

  // Handler for user click in PendingBillsPanel
  const handleUserClick = (userId: string, userName: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(userName);
    setShowUserBillsModal(true);
  };

  const handleProcess = async () => {
    setIsLoading(true);

    try {
      // NEW FLOW: Load pending user_bills instead of session records
      // Get all pending user_bills (optionally filtered by date/agent)
      const billsSnapshot = await get(ref(database, 'user_bills'));
      const allBills = FirebaseUtils.objectToArray<UserBill>(billsSnapshot.val() || {});
      
      // Debug: Log all bills and their statuses
      console.log(`📊 Total bills loaded: ${allBills.length}`);
      console.log(`📊 Bills status breakdown:`, {
        PENDING: allBills.filter(b => b.status === 'PENDING').length,
        DONE: allBills.filter(b => b.status === 'DONE').length,
        MATCHED: allBills.filter(b => b.status === 'MATCHED').length,
        other: allBills.filter(b => b.status !== 'PENDING' && b.status !== 'DONE' && b.status !== 'MATCHED').length
      });
      
      // Check for case-insensitive and different status values
      const pendingBills = allBills.filter(bill => {
        const status = String(bill.status || '').toUpperCase();
        return status === 'PENDING';
      });
      
      console.log(`📊 Pending bills found: ${pendingBills.length}`);
      if (pendingBills.length > 0) {
        console.log(`📊 Sample pending bill:`, {
          id: pendingBills[0].id,
          userId: pendingBills[0].userId,
          status: pendingBills[0].status,
          transactionCode: pendingBills[0].transactionCode
        });
      }
      
      if (pendingBills.length === 0) {
        // Show more detailed error message
        const statusCounts = {
          PENDING: allBills.filter(b => String(b.status || '').toUpperCase() === 'PENDING').length,
          DONE: allBills.filter(b => String(b.status || '').toUpperCase() === 'DONE').length,
          MATCHED: allBills.filter(b => String(b.status || '').toUpperCase() === 'MATCHED').length,
          other: allBills.filter(b => {
            const s = String(b.status || '').toUpperCase();
            return s !== 'PENDING' && s !== 'DONE' && s !== 'MATCHED';
          }).length
        };
        console.error('❌ No pending bills found. Status breakdown:', statusCounts);
        alert(`Không có bills đang chờ đối soát.\n\nTổng số bills: ${allBills.length}\nPENDING: ${statusCounts.PENDING}\nDONE: ${statusCounts.DONE}\nMATCHED: ${statusCounts.MATCHED}\nKhác: ${statusCounts.other}`);
        setIsLoading(false);
        return;
      }

      // Validate: Must have merchant transactions (from current upload session or all)
      let merchantTransactions: MerchantTransaction[] = [];
      if (currentUploadSessionId) {
        // Load merchant transactions from current upload session
        merchantTransactions = await MerchantTransactionsService.getByUploadSession(currentUploadSessionId);
      } else if (merchantData.length > 0) {
        // Fallback: use in-memory merchantData (convert old format to new format if needed)
        merchantTransactions = merchantData.map(item => {
          // Check if it's old format (has timestamp) or new format (has transactionDate)
          if ('timestamp' in item && !('transactionDate' in item)) {
            // Old format - convert to new format
            const transactionDate = item.timestamp.includes('T') 
              ? item.timestamp 
              : new Date(item.timestamp).toISOString();
            return {
              id: item.id,
              merchantCode: item.merchantCode,
              transactionCode: item.transactionCode,
              amount: item.amount,
              transactionDate,
              uploadSessionId: currentUploadSessionId || '',
              pointOfSaleName: item.pointOfSaleName,
              rawRowIndex: undefined
            };
          }
          // Already new format
          return item;
        });
      } else {
        alert('Vui lòng tải lên file merchants và đảm bảo có dữ liệu hợp lệ.');
        setIsLoading(false);
        return;
      }

      if (merchantTransactions.length === 0) {
        alert('Không có dữ liệu merchant transactions để đối soát.');
        setIsLoading(false);
        return;
      }

      console.log(`📊 Reconciling ${merchantTransactions.length} merchant transactions against ${pendingBills.length} pending bills`);

      // Create reconciliation session ID
      const reconciliationSessionId = `RECON_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create index of merchant transactions by transactionCode
      const merchantIndex = new Map<string, MerchantTransaction[]>();
      merchantTransactions.forEach(mt => {
        if (!merchantIndex.has(mt.transactionCode)) {
          merchantIndex.set(mt.transactionCode, []);
        }
        merchantIndex.get(mt.transactionCode)!.push(mt);
      });

      // Process each pending bill and create report_records
      const reportRecords: Array<Omit<ReportRecord, 'id' | 'createdAt'>> = [];
      const now = new Date().toISOString();
      
      for (const bill of pendingBills) {
        const matchingMerchants = merchantIndex.get(bill.transactionCode) || [];
        let status: ReportStatus;
        let errorMessage: string | undefined;
        let merchantTransactionId: string | undefined;
        let merchantCode: string | undefined;
        let merchantAmount: number | undefined;
        
        if (matchingMerchants.length === 0) {
          // No matching merchant transaction
          status = 'UNMATCHED';
          errorMessage = 'Không tìm thấy giao dịch merchant tương ứng';
        } else {
          // Simple logic: Find merchant that matches all 3 conditions
          // 1. Transaction code (already matched)
          // 2. Amount
          // 3. Point of sale name (if both have it)
          const matchedMerchant = matchingMerchants.find(mt => {
            // Check amount
            const merchantAmountToCheck = mt.amountBeforeDiscount || mt.amount;
            const billAmountToCheck = bill.amount;
            
            // Validate amounts
            if (!merchantAmountToCheck || !billAmountToCheck || 
                isNaN(merchantAmountToCheck) || isNaN(billAmountToCheck) ||
                !isFinite(merchantAmountToCheck) || !isFinite(billAmountToCheck)) {
              return false;
            }
            
            const amountMatch = Math.abs(merchantAmountToCheck - billAmountToCheck) <= 0.01;
            if (!amountMatch) return false;
            
            // Check point of sale name (if both have it)
            if (bill.pointOfSaleName && mt.pointOfSaleName) {
              const posMatch = mt.pointOfSaleName === bill.pointOfSaleName || 
                              normalize(mt.pointOfSaleName) === normalize(bill.pointOfSaleName);
              return posMatch;
          }
          
            // If one doesn't have pointOfSaleName, still consider it a match if amount matches
            return true;
          });
          
          if (matchedMerchant) {
            // Perfect match - all conditions met
            status = 'MATCHED';
            merchantTransactionId = matchedMerchant.id;
            merchantCode = matchedMerchant.merchantCode;
            merchantAmount = matchedMerchant.amount;
          } else {
            // Check why it didn't match
            const firstMerchant = matchingMerchants[0];
            const merchantAmountToCheck = firstMerchant.amountBeforeDiscount || firstMerchant.amount;
            const billAmountToCheck = bill.amount;
            
            // Validate amounts
            const isValidMerchantAmount = merchantAmountToCheck != null && 
                                         !isNaN(merchantAmountToCheck) && 
                                         isFinite(merchantAmountToCheck) && 
                                         merchantAmountToCheck > 0;
            const isValidBillAmount = billAmountToCheck != null && 
                                     !isNaN(billAmountToCheck) && 
                                     isFinite(billAmountToCheck) && 
                                     billAmountToCheck > 0;
            
            if (!isValidMerchantAmount || !isValidBillAmount) {
              status = 'ERROR';
              errorMessage = `Số tiền không hợp lệ: Merchant ${merchantAmountToCheck} vs Bill ${billAmountToCheck}`;
            } else if (Math.abs(merchantAmountToCheck - billAmountToCheck) > 0.01) {
              status = 'ERROR';
              errorMessage = `Số tiền không khớp: Merchant ${merchantAmountToCheck.toLocaleString('vi-VN')}đ vs Bill ${billAmountToCheck.toLocaleString('vi-VN')}đ`;
            } else if (bill.pointOfSaleName && firstMerchant.pointOfSaleName) {
              // Amount matches but point of sale doesn't
              status = 'ERROR';
              errorMessage = 'Điểm thu không khớp';
            } else {
              // Should not happen, but fallback
              status = 'ERROR';
              errorMessage = 'Không thể đối soát';
            }
          }
        }
        
        // Get merchant transaction details if matched
        const matchedMerchant = status === 'MATCHED' && merchantTransactionId 
          ? merchantTransactions.find(mt => mt.id === merchantTransactionId)
          : null;
        
        // Create report record - only include errorMessage if it has a value
        const reportRecord: Omit<ReportRecord, 'id' | 'createdAt'> = {
          // Thông tin từ Bill
          userBillId: bill.id,
          userId: bill.userId,
          agentId: bill.agentId,
          agentCode: bill.agentCode,
          transactionCode: bill.transactionCode,
          amount: bill.amount,
          paymentMethod: bill.paymentMethod,
          pointOfSaleName: bill.pointOfSaleName,
          transactionDate: bill.timestamp || bill.createdAt,
          userBillCreatedAt: bill.createdAt,
          invoiceNumber: bill.invoiceNumber,
          
          // Thông tin từ Merchants (file Excel)
          merchantTransactionId: merchantTransactionId || undefined,
          merchantCode: merchantCode || undefined,
          merchantAmount: merchantAmount || undefined,
          merchantAmountBeforeDiscount: matchedMerchant?.amountBeforeDiscount || undefined,
          merchantPointOfSaleName: matchedMerchant?.pointOfSaleName || undefined,
          merchantBranchName: matchedMerchant?.branchName || undefined,
          merchantInvoiceNumber: matchedMerchant?.invoiceNumber || undefined,
          merchantPhoneNumber: matchedMerchant?.phoneNumber || undefined,
          merchantPromotionCode: matchedMerchant?.promotionCode || undefined,
          merchantTransactionDate: matchedMerchant?.transactionDate || undefined,
          
          // Reconciliation result
          status,
          ...(errorMessage ? { errorMessage } : {}), // Only include errorMessage if it exists
          reconciledAt: now,
          reconciledBy: 'ADMIN',
          reconciliationSessionId
        };
        
        reportRecords.push(reportRecord);
      }
      
      // Create all report records in batch
      console.log(`💾 Creating ${reportRecords.length} report records...`);
      await ReportService.createReportRecords(reportRecords);
      console.log(`✅ Created ${reportRecords.length} report records`);
      
      // Update user_bills status:
      // - MATCHED: DONE (đã xử lý)
      // - ERROR hoặc UNMATCHED: PENDING (trả về bill đang chờ đối soát với error message cụ thể)
      const updatePromises = pendingBills.map((bill, index) => {
        const reportRecord = reportRecords[index];
        // Chỉ update bill tương ứng với reportRecord này
        if (reportRecord.status === 'MATCHED') {
          // MATCHED: đánh dấu DONE cho bill này
          return UserService.updateUserBill(bill.id, { status: 'DONE' as const });
        } else {
          // ERROR hoặc UNMATCHED: trả về PENDING với error message cụ thể
          // Lưu error message vào note field để admin biết lý do
          const errorMsg = reportRecord.errorMessage || 
                          (reportRecord.status === 'ERROR' ? 'Lỗi đối soát' : 'Chưa khớp');
          return UserService.updateUserBill(bill.id, { 
            status: 'PENDING' as const,
            note: errorMsg // Lưu error message để admin biết lý do
          });
        }
      });
      await Promise.all(updatePromises);
      const unmatchedCount = reportRecords.filter(r => r.status === 'UNMATCHED').length;
      const doneCount = pendingBills.length - unmatchedCount;
      console.log(`✅ Updated ${doneCount} user_bills status to DONE, ${unmatchedCount} bills trả về PENDING (chỉ các bill UNMATCHED)`);
      
      // Calculate stats
      const matched = reportRecords.filter(r => r.status === 'MATCHED').length;
      const errors = reportRecords.filter(r => r.status === 'ERROR').length;
      const unmatched = reportRecords.filter(r => r.status === 'UNMATCHED').length;
      
      // Show results
      setAdminReconciliationResults({
        matched,
        errors: errors + unmatched,
        results: reportRecords.map(r => ({
          billId: r.userBillId,
          status: r.status === 'MATCHED' ? 'MATCHED' : 'ERROR',
          errorMessage: r.errorMessage
        }))
      });
      
      alert(`Đối soát hoàn tất!\n- Khớp: ${matched}\n- Lỗi: ${errors}\n- Chưa khớp: ${unmatched}`);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error during reconciliation:', error);
      alert('Có lỗi xảy ra khi đối soát. Vui lòng thử lại.');
      setIsLoading(false);
    }
  };

  const handleAIAnalysis = async () => {
    if (isAnalyzing || records.length === 0) return;
    
    try {
      setIsAnalyzing(true);
      const report = await generateReconciliationReport(records);
      setAiReport(report);
    } catch (error: any) {
      console.error('Error generating AI report:', error);
      alert(`Có lỗi khi phân tích dữ liệu: ${error.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetProcess = () => {
    if (window.confirm('Bạn có chắc chắn muốn bắt đầu phiên đối soát mới? Tất cả dữ liệu hiện tại sẽ bị xóa.')) {
      setStep(0);
      setMerchantFiles([]);
      setMerchantData([]);
      setRecords([]);
      setAiReport('');
      setCurrentSessionId(null);
      setAdminReconciliationResults(null);
      setCurrentUploadSessionId(null);
      // Reset file input để có thể upload lại
      if (merchantInputRef.current) {
        merchantInputRef.current.value = '';
      }
    }
  };

  // Export kết quả đối soát hiện tại
  const handleExportResults = async () => {
    if (!currentSessionId || records.length === 0) {
      alert('Không có dữ liệu để xuất. Vui lòng thực hiện đối soát trước.');
      return;
    }
    
    try {
      const exportData = await ReconciliationService.exportReconciliationResult(currentSessionId);
      const settings = await SettingsService.getSettings();
      const workbook = createStyledWorkbook();
      
      // Sheet kết quả đối soát
      const resultsHeaders = ['Mã giao dịch', 'Merchant (VNĐ)', 'Agent (VNĐ)', 'Chênh lệch', 'Trạng thái', 'Thời gian xử lý'];
      const resultsData = records.map(record => ({
        'Mã giao dịch': record.transactionCode,
        'Merchant (VNĐ)': record.merchantData?.amount || 0,
        'Agent (VNĐ)': record.agentData?.amount || 0,
        'Chênh lệch': record.difference,
        'Trạng thái': record.status === 'MATCHED' ? 'Khớp' : 
                     record.status === 'ERROR_AMOUNT' ? 'Lệch tiền' :
                     record.status === 'ERROR_DUPLICATE' ? 'Trùng lặp' : 'Thiếu dữ liệu',
        'Thời gian xử lý': new Date(record.processedAt).toISOString()
      }));
      const resultsNumberCols = identifyNumberColumns(resultsHeaders);
      const resultsDateCols = identifyDateColumns(resultsHeaders);
      createStyledSheet(workbook, 'Kết quả đối soát', resultsHeaders, resultsData, {
        numberColumns: resultsNumberCols,
        dateColumns: resultsDateCols,
        highlightTotalRow: false
      });
      
      // Bỏ sheet thống kê (theo yêu cầu)
      
      // Add metadata
      addMetadataSheet(workbook, settings, {
        exportDate: new Date().toISOString(),
        dateRange: exportData.metadata.dateRange,
        reportType: 'Báo cáo kết quả đối soát'
      });
      
      const fileName = `Reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`;
      exportWorkbook(workbook, fileName);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Có lỗi khi export dữ liệu');
    }
  };

  // State để hiển thị aggregated data
  const [currentSessionData, setCurrentSessionData] = useState<ReconciliationSession | null>(null);

  // Load session cũ để xem lại
  const loadHistorySession = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const session = await ReconciliationService.getSessionById(sessionId);
      const sessionRecords = await ReconciliationService.getRecordsBySession(sessionId);
      
      if (session && sessionRecords) {
        // Nếu session không có aggregatedData, tính lại từ records
        let aggregatedData = session.aggregatedData;
        
        if (!aggregatedData || !aggregatedData.byTransactionCode || Object.keys(aggregatedData.byTransactionCode).length === 0) {
          console.log('⚠️ Session không có aggregatedData, tính lại từ records...');
          
          // Tính lại aggregatedData từ records
          aggregatedData = {
            byTransactionCode: {} as Record<string, {
              transactionCode: string;
              pointOfSaleName?: string;
              agentId?: string;
              merchantAmount: number;
              agentAmount: number;
              status: TransactionStatus;
              lastProcessedAt: string;
              sessionIds: string[];
            }>,
            byPointOfSale: {} as Record<string, {
              pointOfSaleName: string;
              totalTransactions: number;
              totalAmount: number;
              matchedCount: number;
              errorCount: number;
            }>,
            byAgent: {} as Record<string, {
              agentId: string;
              totalTransactions: number;
              totalAmount: number;
              matchedCount: number;
              errorCount: number;
            }>
          };
          
          sessionRecords.forEach(record => {
            const agentId = record.agentData?.agentId;
            const amount = record.merchantData?.amount || 0;
            const transactionCode = record.transactionCode;
            const pointOfSaleName = record.pointOfSaleName;
            
            // byTransactionCode
            if (!aggregatedData.byTransactionCode[transactionCode]) {
              aggregatedData.byTransactionCode[transactionCode] = {
                transactionCode,
                pointOfSaleName,
                agentId,
                merchantAmount: record.merchantAmount || 0,
                agentAmount: record.agentAmount || 0,
                status: record.status,
                lastProcessedAt: record.processedAt,
                sessionIds: [sessionId]
              };
            }
            
            // byPointOfSale
            if (pointOfSaleName) {
              if (!aggregatedData.byPointOfSale[pointOfSaleName]) {
                aggregatedData.byPointOfSale[pointOfSaleName] = {
                  pointOfSaleName,
                  totalTransactions: 0,
                  totalAmount: 0,
                  matchedCount: 0,
                  errorCount: 0
                };
              }
              const posData = aggregatedData.byPointOfSale[pointOfSaleName];
              posData.totalTransactions++;
              posData.totalAmount += amount;
              if (record.status === TransactionStatus.MATCHED) {
                posData.matchedCount++;
              } else {
                posData.errorCount++;
              }
            }
            
            // byAgent
            if (agentId) {
              if (!aggregatedData.byAgent[agentId]) {
                aggregatedData.byAgent[agentId] = {
                  agentId,
                  totalTransactions: 0,
                  totalAmount: 0,
                  matchedCount: 0,
                  errorCount: 0
                };
              }
              const agentData = aggregatedData.byAgent[agentId];
              agentData.totalTransactions++;
              agentData.totalAmount += amount;
              if (record.status === TransactionStatus.MATCHED) {
                agentData.matchedCount++;
              } else {
                agentData.errorCount++;
              }
            }
          });
          
          console.log('✅ Đã tính lại aggregatedData:', {
            byTransactionCode: Object.keys(aggregatedData.byTransactionCode).length,
            byPointOfSale: Object.keys(aggregatedData.byPointOfSale).length,
            byAgent: Object.keys(aggregatedData.byAgent).length
          });
          
          // Lưu lại vào Firebase để lần sau không cần tính lại
          try {
            // Clean undefined values trước khi lưu
            const cleanAggregatedData = (data: typeof aggregatedData) => {
              return JSON.parse(JSON.stringify(data, (key, value) => {
                if (value === undefined) return null;
                return value;
              }));
            };
            
            await ReconciliationService.updateSession(sessionId, {
              aggregatedData: cleanAggregatedData(aggregatedData)
            });
            console.log('✅ Đã lưu aggregatedData vào Firebase');
          } catch (e) {
            console.warn('⚠️ Không thể lưu aggregatedData vào Firebase:', e);
          }
        } else {
          console.log('✅ Session đã có aggregatedData:', {
            byTransactionCode: Object.keys(aggregatedData.byTransactionCode).length,
            byPointOfSale: Object.keys(aggregatedData.byPointOfSale).length,
            byAgent: Object.keys(aggregatedData.byAgent).length
          });
        }
        
        setCurrentSessionId(sessionId);
        setCurrentSessionData({
          ...session,
          aggregatedData: aggregatedData // Đảm bảo aggregatedData được set
        });
        setRecords(sessionRecords);
        setStep(2); // Results step
        setShowHistory(false);
      }
    } catch (error) {
      console.error('Error loading history session:', error);
      alert('Không thể tải phiên đối soát này');
    } finally {
      setIsLoading(false);
    }
  };

  // Xóa phiên đối soát
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await ReconciliationService.deleteSession(sessionId);
      await loadSessionHistory(1, true); // Reload history from page 1
      if (currentSessionId === sessionId) {
        // Nếu đang xem session bị xóa, reset về step 1
        setStep(0);
        setCurrentSessionId(null);
        setRecords([]);
      }
      alert('Đã xóa phiên đối soát thành công');
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Có lỗi khi xóa phiên đối soát');
    }
  };

  // Filter sessions by selected date
  const filteredHistoryByDate = React.useMemo(() => {
    if (!selectedHistoryDate) return sessionHistory;
    const selectedDate = new Date(selectedHistoryDate).toISOString().split('T')[0];
    return sessionHistory.filter(session => {
      const sessionDate = new Date(session.createdAt).toISOString().split('T')[0];
      return sessionDate === selectedDate;
    });
  }, [sessionHistory, selectedHistoryDate]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Đối soát giao dịch</h2>
          <p className="text-slate-500">Quy trình tải lên Excel, ghép file và kiểm tra lỗi tự động.</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 bg-white rounded-lg border border-slate-200 p-1">
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'reconciliation'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Đối soát
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Lịch sử đối soát
          </button>
        </div>
      </div>

      {/* Pending Bills Panel - Always visible in reconciliation tab */}
      {activeTab === 'reconciliation' && (
        <PendingBillsPanel onUserClick={handleUserClick} />
      )}

      {/* User Bills Modal */}
      {selectedUserId && (
        <UserBillsModal
          userId={selectedUserId}
          userName={selectedUserName}
          isOpen={showUserBillsModal}
          onClose={() => {
            setShowUserBillsModal(false);
            setSelectedUserId(null);
            setSelectedUserName('');
          }}
        />
      )}

      {/* Tab Content: Lịch sử đối soát */}
      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-800">Lịch sử phiên đối soát</h3>
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-slate-700">Chọn ngày:</label>
              <input
                type="date"
                value={selectedHistoryDate}
                onChange={(e) => setSelectedHistoryDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="text-center py-8 text-slate-400">Đang tải lịch sử...</div>
            ) : filteredHistoryByDate.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Session ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ngày</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">File</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Số bill</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Khớp</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Lỗi</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {filteredHistoryByDate.map((session) => {
                      const date = new Date(session.createdAt);
                      const formattedDate = date.toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      
                      return (
                        <tr key={session.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                            {session.id.substring(0, 8)}...
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            {formattedDate}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            <div className="flex items-center space-x-2">
                              <FileText className="w-4 h-4" />
                              <span>{session.merchantFileName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                            {session.totalRecords}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span className="text-sm font-medium text-green-600">{session.matchedCount}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-1">
                              <AlertCircle className="w-4 h-4 text-red-600" />
                              <span className="text-sm font-medium text-red-600">{session.errorCount}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {session.status === 'COMPLETED' ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                Hoàn thành
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                                Lỗi
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có lịch sử đối soát cho ngày đã chọn</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Đối soát (workflow hiện tại) */}
      {activeTab === 'reconciliation' && (
        <>
          {/* Progress steps - chỉ hiển thị khi ở tab Đối soát */}
          {step > 0 && (
            <div className="flex justify-end">
          <div className="flex space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1. Upload</span>
            <span className="text-slate-300">→</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2. Xử lý</span>
            <span className="text-slate-300">→</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${step >= 3 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3. Kết quả</span>
          </div>
        </div>
          )}

      {/* History Panel - Giữ lại để tương thích, nhưng ẩn khi ở tab history */}
      {showHistory && activeTab === 'reconciliation' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Lịch sử phiên đối soát</h3>
            <span className="text-sm text-slate-500">
              Tổng: {historyTotal > 0 ? historyTotal : sessionHistory.length} phiên
            </span>
          </div>
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="text-center py-8 text-slate-400">Đang tải lịch sử...</div>
            ) : paginatedHistory.length > 0 ? (
              paginatedHistory.map((session) => {
                const date = new Date(session.createdAt);
                const formattedDate = date.toLocaleDateString('vi-VN', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                const formattedAmount = session.totalAmount > 0 
                  ? `${(session.totalAmount / 1000000).toFixed(1)}M VND`
                  : '0 VND';
                
                return (
                  <div 
                    key={session.id} 
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group"
                  >
                    <div 
                      className="flex items-center space-x-3 flex-1 cursor-pointer"
                      onClick={() => loadHistorySession(session.id)}
                    >
                      {/* Status badge - chỉ hiển thị cho COMPLETED */}
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-emerald-500"></span>
                      
                      {/* Date */}
                      <span className="text-sm font-medium text-slate-700 min-w-[140px]">
                        {formattedDate}
                      </span>
                      
                      {/* Amount */}
                      <span className="text-sm font-semibold text-slate-900 min-w-[100px]">
                        {formattedAmount}
                      </span>
                      
                      {/* Stats */}
                      <div className="flex items-center space-x-3 text-sm">
                        <span className="text-emerald-600 font-medium">
                          ✓ {session.matchedCount}
                        </span>
                        <span className="text-red-600 font-medium">
                          ✗ {session.errorCount}
                        </span>
                        {(session as any).missingCount > 0 && (
                          <span className="text-orange-600 font-medium">
                            ⚠ {(session as any).missingCount}
                          </span>
                        )}
                      </div>
                      
                      {/* Merchant info */}
                      {session.merchantIds && session.merchantIds.length > 0 && (
                        <div className="text-xs text-slate-500">
                          {session.merchantIds.length} điểm bán
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Bạn có chắc chắn muốn xóa phiên đối soát này? Tất cả dữ liệu liên quan sẽ bị xóa.')) {
                            handleDeleteSession(session.id);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Xóa phiên đối soát"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-400">
                <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có lịch sử đối soát</p>
              </div>
            )}
          </div>
          
          {/* Pagination for history (lazy loading) */}
          {historyTotal > historyItemsPerPage && (
            <div className="mt-4">
              <Pagination
                currentPage={historyPage}
                totalPages={historyTotalPages}
                onPageChange={handleHistoryPageChange}
                itemsPerPage={historyItemsPerPage}
                totalItems={historyTotal}
              />
              {loadingHistory && (
                <div className="text-center text-sm text-slate-500 mt-2">
                  Đang tải thêm dữ liệu...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 0: Upload Merchant Files - Chỉ hiển thị khi ở tab Đối soát */}
      {activeTab === 'reconciliation' && step === 0 && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={loadDemoData}
              className="text-sm text-indigo-600 hover:text-indigo-800 underline font-medium"
            >
              Sử dụng dữ liệu mẫu (Demo)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Multi Merchant Upload */}
            <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors ${merchantFiles.length > 0 ? 'border-green-500 bg-green-50' : 'border-slate-300 hover:border-indigo-400 bg-white'}`}>
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                ref={merchantInputRef}
                className="hidden"
                multiple
                onChange={handleMerchantFilesUpload}
              />
              
              {merchantFiles.length > 0 ? (
                <>
                   <FileSpreadsheet className="w-12 h-12 mb-4 text-green-500" />
                   <h3 className="text-lg font-semibold text-green-700">
                     {merchantFiles.length} Merchant Files
                   </h3>
                   <p className="text-sm text-green-600 mb-2">
                     Đã merge {merchantData.length} giao dịch từ {merchantFiles.length} files
                   </p>
                   
                   {/* File list */}
                   <div className="max-h-20 overflow-y-auto w-full mb-4">
                     {merchantFiles.map((file, index) => (
                       <div key={index} className="text-xs text-green-600 text-center py-1 truncate">
                         📄 {file.name}
                       </div>
                     ))}
                   </div>

                   {/* Progress bar when processing */}
                   {isProcessingFiles && (
                     <div className="w-full mb-4">
                       <div className="flex justify-between text-xs text-green-600 mb-1">
                         <span>Đang xử lý files...</span>
                         <span>{mergeProgress}%</span>
                       </div>
                       <div className="w-full bg-green-200 rounded-full h-2">
                         <div 
                           className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                           style={{ width: `${mergeProgress}%` }}
                         ></div>
                       </div>
                     </div>
                   )}
                   
                   <div className="flex space-x-3">
                      <button 
                        onClick={() => merchantInputRef.current?.click()}
                        className="px-3 py-1 text-xs font-medium bg-white border border-green-200 rounded hover:bg-green-100 text-green-700"
                        disabled={isProcessingFiles}
                      >
                        <Plus className="w-3 h-3 mr-1 inline" />
                        Thêm files
                      </button>
                      <button 
                        onClick={() => {
                          setMerchantFiles([]);
                          setMerchantData([]);
                          setCurrentUploadSessionId(null);
                          // Reset file input để có thể upload lại
                          if (merchantInputRef.current) {
                            merchantInputRef.current.value = '';
                          }
                        }}
                        className="px-3 py-1 text-xs font-medium bg-white border border-red-200 rounded hover:bg-red-100 text-red-700"
                        disabled={isProcessingFiles}
                      >
                        <Trash2 className="w-3 h-3 mr-1 inline" />
                        Xóa tất cả
                      </button>
                   </div>
                </>
              ) : (
                <>
                  <FileText className="w-12 h-12 mb-4 text-slate-400" />
                  <h3 className="text-lg font-semibold text-slate-700">Files Merchant (Hệ thống)</h3>
                  <p className="text-sm text-slate-500 text-center mb-4">
                    Chọn nhiều file .xlsx từ các điểm bán<br />
                    Hệ thống sẽ tự động merge và loại bỏ trùng lặp
                  </p>
                  <div className="text-xs text-indigo-600 mb-6 text-center">
                    💡 Có thể chọn nhiều files cùng lúc<br />
                    🔄 Auto-merge theo mã giao dịch<br />
                    🗑️ Tự động loại bỏ duplicate
                  </div>
                  <button 
                    onClick={() => merchantInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg font-medium flex items-center bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Upload className="w-4 h-4 mr-2" /> 
                    Chọn nhiều Merchant Files
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-8">
            <button 
              onClick={handleProcess}
              disabled={isLoading || merchantData.length === 0 || isProcessingFiles}
              className={`px-8 py-3 rounded-lg font-bold shadow-lg flex items-center transition-all ${(merchantData.length === 0 || isProcessingFiles) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'}`}
            >
              {isLoading || isProcessingFiles ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isLoading ? 'Đang đối soát...' : 'Đang xử lý...'}
                </>
              ) : (
                <>
                  Bắt đầu Đối soát <Play className="w-4 h-4 ml-2 fill-current" />
                </>
              )}
            </button>
          </div>
        </div>
      )}


      {/* Step 2: Results - Chỉ hiển thị khi ở tab Đối soát */}
      {activeTab === 'reconciliation' && step === 2 && (
        <div className="space-y-6">
          {/* Admin Reconciliation Results (New System) */}
          {adminReconciliationResults && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Kết quả đối soát</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm text-green-700">Khớp</p>
                      <p className="text-2xl font-bold text-green-900">{adminReconciliationResults.matched}</p>
                                 </div>
                                 </div>
                             </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="text-sm text-red-700">Lỗi</p>
                      <p className="text-2xl font-bold text-red-900">{adminReconciliationResults.errors}</p>
                                   </div>
                                   </div>
                                     </div>
                                     </div>

              {/* Results Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mã GD</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Số tiền</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Điểm thu</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {adminReconciliationResults.results.map((result) => {
                      return (
                        <tr key={result.billId}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                            {result.billId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                            -
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            -
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {result.status === 'MATCHED' ? (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                Khớp
                                       </span>
                            ) : (
                              <div>
                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                                  Lỗi
                                </span>
                                {result.errorMessage && (
                                  <p className="text-xs text-red-600 mt-1">{result.errorMessage}</p>
                                   )}
                                 </div>
                               )}
                          </td>
                        </tr>
                         );
                       })}
                  </tbody>
                </table>
                   </div>

              <div className="mt-6 flex justify-end space-x-3">
                      <button 
                        onClick={() => {
                    setStep(0);
                    setSelectedAgentId(null);
                    setMerchantFiles([]);
                    setAdminReconciliationResults(null);
                  }}
                  className="px-6 py-3 rounded-lg font-medium text-slate-600 hover:bg-slate-100"
                 >
                  Đối soát mới
                 </button>
               </div>
        </div>
      )}

          {/* Legacy Results (Old System) */}
          {!adminReconciliationResults && records.length > 0 && (
            <>
          {/* Summary Banner */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4">
             <div className="text-center border-r border-slate-100 last:border-0">
                <p className="text-sm text-slate-500">Tổng xử lý</p>
                <p className="text-2xl font-bold text-slate-800">{records.length}</p>
             </div>
             <div className="text-center border-r border-slate-100 last:border-0">
                <p className="text-sm text-slate-500">Khớp hoàn toàn</p>
                <p className="text-2xl font-bold text-emerald-600">{records.filter(r => r.status === TransactionStatus.MATCHED).length}</p>
             </div>
             <div className="text-center border-r border-slate-100 last:border-0">
                <p className="text-sm text-slate-500">Lỗi lệch tiền</p>
                <p className="text-2xl font-bold text-red-600">{records.filter(r => r.status === TransactionStatus.ERROR_AMOUNT).length}</p>
             </div>
             <div className="text-center border-r border-slate-100 last:border-0">
                <p className="text-sm text-slate-500">Thiếu/Trùng</p>
                <p className="text-2xl font-bold text-orange-600">
                  {records.filter(r => [TransactionStatus.MISSING_IN_MERCHANT, TransactionStatus.MISSING_IN_AGENT, TransactionStatus.ERROR_DUPLICATE].includes(r.status)).length}
                </p>
             </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-slate-100">
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={resetProcess}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Đối soát mới
              </button>
              <button 
                onClick={handleAIAnalysis}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:opacity-90 flex items-center disabled:opacity-50"
              >
                {isAnalyzing ? <span className="animate-pulse">Đang phân tích...</span> : <><BrainCircuit className="w-4 h-4 mr-2" /> Gemini Insights</>}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  const errorRecords = records.filter(r => r.status !== TransactionStatus.MATCHED);
                  const workbook = XLSX.utils.book_new();
                  const errorSheet = XLSX.utils.json_to_sheet(
                    errorRecords.map(r => ({
                      'Mã chuẩn chi': r.transactionCode,
                      'Điểm thu': r.pointOfSaleName || 'N/A',
                      'Số tiền Agent': r.agentAmount || 0,
                      'Số tiền Merchant': r.merchantAmount || 0,
                      'Loại lỗi': r.errorType || r.status,
                      'Chi tiết lỗi': r.errorDetail || ''
                    }))
                  );
                  XLSX.utils.book_append_sheet(workbook, errorSheet, 'Bill lỗi');
                  XLSX.writeFile(workbook, `Bill_loi_${new Date().toISOString().split('T')[0]}.xlsx`);
                }}
                disabled={records.filter(r => r.status !== TransactionStatus.MATCHED).length === 0}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-2" /> Xuất Bill lỗi
              </button>
              <button 
                onClick={handleExportResults}
                disabled={!currentSessionId}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 mr-2" /> Xuất báo cáo Excel
              </button>
            </div>
          </div>


          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Lọc:</span>
            </div>
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Tất cả ({records.length})
              </button>
              <button
                onClick={() => setStatusFilter('matched')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  statusFilter === 'matched' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Khớp ({records.filter(r => r.status === TransactionStatus.MATCHED).length})
              </button>
              <button
                onClick={() => setStatusFilter('error')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  statusFilter === 'error' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Lỗi ({records.filter(r => r.status !== TransactionStatus.MATCHED).length})
              </button>
            </div>
            {statusFilter === 'error' && (
              <select
                value={errorTypeFilter}
                onChange={(e) => setErrorTypeFilter(e.target.value)}
                className="px-3 py-1 text-sm border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">Tất cả lỗi</option>
                <option value="WRONG_POINT_OF_SALE">Sai điểm bán</option>
                <option value="WRONG_AMOUNT">Sai số tiền</option>
                <option value="WRONG_AGENT">Sai đại lý</option>
                <option value="DUPLICATE">Trùng lặp</option>
                <option value="MISSING_MERCHANT">Không tìm thấy (Merchant)</option>
                <option value="MISSING_AGENT">Không tìm thấy (Agent)</option>
              </select>
            )}
          </div>

          {/* AI Report Section */}
          {aiReport && (
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-6 rounded-xl border border-purple-100">
               <div className="flex items-center mb-3">
                 <BrainCircuit className="w-5 h-5 text-purple-600 mr-2" />
                 <h3 className="font-bold text-purple-800">Báo cáo Thông minh (AI Analysis)</h3>
               </div>
               <div className="prose text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                 {aiReport}
               </div>
            </div>
          )}

          {/* Detail Table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="p-4 font-semibold border-b">Mã chuẩn chi</th>
                    <th className="p-4 font-semibold border-b">Điểm thu</th>
                    <th className="p-4 font-semibold border-b">Merchant (Hệ thống)</th>
                    <th className="p-4 font-semibold border-b">Agent (Bill up)</th>
                    <th className="p-4 font-semibold border-b text-right">Chênh lệch</th>
                    <th className="p-4 font-semibold border-b text-center">Trạng thái</th>
                    <th className="p-4 font-semibold border-b">Chi tiết lỗi</th>
                    <th className="p-4 font-semibold border-b text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {records
                    .filter(record => {
                      if (statusFilter === 'matched') return record.status === TransactionStatus.MATCHED;
                      if (statusFilter === 'error') {
                        if (errorTypeFilter === 'all') return record.status !== TransactionStatus.MATCHED;
                        return record.errorType === errorTypeFilter;
                      }
                      return true;
                    })
                    .map((record) => {
                    // Match merchant by pointOfSaleName ONLY (không check merchantCode)
                    const matchedMerchant = record.pointOfSaleName ? merchants.find(m => 
                      m.pointOfSaleName === record.pointOfSaleName || 
                      normalize(m.pointOfSaleName || '') === normalize(record.pointOfSaleName || '')
                    ) : null;
                    const matchedAgent = record.agentId && record.agentId !== 'N/A' ? agents.find(a => a.id === record.agentId || a.code === record.agentId) : null;
                    const agentNotMatched = record.agentData && !matchedAgent;
                    
                    return (
                      <tr key={record.id} className={`hover:bg-slate-50 ${record.status !== TransactionStatus.MATCHED ? 'bg-red-50/30' : ''}`}>
                        <td className="p-4 font-mono font-medium text-slate-700">
                          {record.transactionCode}
                          <div className="text-xs text-slate-400 mt-1">
                            {new Date(record.transactionDate || record.processedAt).toLocaleDateString('vi-VN')}
                          </div>
                        </td>
                        <td className="p-4">
                          {record.pointOfSaleName ? (
                            <div>
                              <div className="font-mono text-sm font-medium text-indigo-700">{record.pointOfSaleName}</div>
                              {record.merchantData?.branchName && (
                                <div className="text-xs text-slate-500 mt-1">{record.merchantData.branchName}</div>
                              )}
                              {matchedMerchant && (
                                <div className="text-xs text-emerald-600 mt-1">✓ {matchedMerchant.pointOfSaleName}</div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="text-slate-400 italic text-xs block">Chưa có điểm bán</span>
                              <select
                                className="text-xs border border-orange-300 rounded px-2 py-1 bg-orange-50 text-orange-700 w-full"
                                value={record.pointOfSaleName || ''}
                                onChange={async (e) => {
                                  const newPOS = e.target.value;
                                  const updatedRecord = {
                                    ...record,
                                    pointOfSaleName: newPOS || undefined
                                  };
                                  
                                  // Update local state
                                  setRecords(records.map(r => r.id === record.id ? updatedRecord : r));
                                  
                                  // Update Firebase
                                  try {
                                    await ReconciliationService.updateRecord(record.id, updatedRecord);
                                  } catch (error) {
                                    console.error('Error updating point of sale:', error);
                                    alert('Có lỗi khi cập nhật điểm bán');
                                  }
                                }}
                              >
                                <option value="">-- Chọn điểm bán --</option>
                                {merchants.map(m => (
                                  <option key={m.id} value={m.pointOfSaleName || ''}>
                                    {m.pointOfSaleName || m.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          {record.merchantData ? (
                            <div>
                              <div className="font-medium text-emerald-700">{record.merchantData.amount.toLocaleString('vi-VN')} đ</div>
                              <div className="text-xs text-slate-400">{record.merchantData.method}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">-- Chưa có giao dịch --</span>
                          )}
                        </td>
                        <td className="p-4">
                          {record.agentData ? (
                            <div>
                              <div className="font-medium text-blue-700">{record.agentData.amount.toLocaleString('vi-VN')} đ</div>
                              <div className="text-xs text-slate-400">
                                {matchedAgent ? (
                                  <span className="text-emerald-700">{matchedAgent.name}</span>
                                ) : (
                                  <span>{record.agentData.agentId}</span>
                                )}
                              </div>
                              {agentNotMatched && (
                                <div className="mt-1">
                                  <select
                                    className="text-xs border border-orange-300 rounded px-2 py-1 bg-orange-50 text-orange-700"
                                    value={record.agentId || ''}
                                    onChange={(e) => {
                                      // TODO: Implement agent selection update
                                      console.log('Select agent:', e.target.value);
                                    }}
                                  >
                                    <option value="">-- Chọn Agent --</option>
                                    {agents.map(a => (
                                      <option key={a.id} value={a.id}>
                                        {a.name} ({a.code})
                                      </option>
                                    ))}
                                  </select>
                                  <div className="text-xs text-orange-600 mt-1 flex items-center">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Chưa match Agent
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-red-400 italic">-- Agent chưa up bill --</span>
                          )}
                        </td>
                        <td className={`p-4 text-right font-mono font-bold ${
                          record.status === TransactionStatus.MISSING_IN_MERCHANT || record.status === TransactionStatus.MISSING_IN_AGENT
                            ? 'text-slate-400' 
                            : record.difference !== 0 
                            ? 'text-red-600' 
                            : 'text-slate-300'
                        }`}>
                          {record.status === TransactionStatus.MISSING_IN_MERCHANT || record.status === TransactionStatus.MISSING_IN_AGENT
                            ? '--'
                            : record.difference !== 0 
                            ? `${record.difference > 0 ? '+' : ''}${record.difference.toLocaleString('vi-VN')}đ` 
                            : '0đ'}
                        </td>
                        <td className="p-4 text-center">
                          {getStatusBadge(record)}
                          {record.isPaid && (
                            <div className="text-xs text-emerald-600 mt-1 flex items-center justify-center">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Đã thanh toán
                            </div>
                          )}
                        </td>
                        <td className="p-4 max-w-xs">
                          {record.errorDetail ? (
                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border">
                              {record.errorDetail}
                            </div>
                          ) : (
                            <div className="text-xs text-emerald-600 bg-emerald-50 p-2 rounded border">
                              ✅ Khớp hoàn toàn
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => {
                              setEditingRecord(record);
                              setShowEditModal(true);
                            }}
                            className="px-3 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 flex items-center mx-auto"
                            title="Sửa thủ công (Admin/CSO)"
                          >
                            <Edit2 className="w-3 h-3 mr-1" />
                            Sửa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-center pt-4">
             <button onClick={resetProcess} className="text-slate-500 hover:text-slate-700 text-sm underline flex items-center">
               <Trash2 className="w-4 h-4 mr-1" /> Xóa & Bắt đầu phiên đối soát mới
             </button>
          </div>
            </>
          )}
        </div>
      )}
        </>
      )}

      {/* Manual Edit Modal */}
      {showEditModal && editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Sửa thủ công giao dịch</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingRecord(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mã chuẩn chi</label>
                  <input
                    type="text"
                    value={editingRecord.transactionCode}
                    onChange={(e) => setEditingRecord({...editingRecord, transactionCode: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền Merchant (VNĐ)</label>
                    <input
                      type="number"
                      value={editingRecord.merchantAmount || 0}
                      onChange={(e) => {
                        const newAmount = parseFloat(e.target.value) || 0;
                        setEditingRecord({
                          ...editingRecord,
                          merchantAmount: newAmount,
                          difference: (editingRecord.agentAmount || 0) - newAmount
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền Agent (VNĐ)</label>
                    <input
                      type="number"
                      value={editingRecord.agentAmount || 0}
                      onChange={(e) => {
                        const newAmount = parseFloat(e.target.value) || 0;
                        setEditingRecord({
                          ...editingRecord,
                          agentAmount: newAmount,
                          difference: newAmount - (editingRecord.merchantAmount || 0)
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Điểm thu</label>
                  <select
                    value={editingRecord.pointOfSaleName || ''}
                    onChange={(e) => setEditingRecord({...editingRecord, pointOfSaleName: e.target.value || undefined})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">-- Chọn điểm thu --</option>
                    {merchants.map(m => (
                      <option key={m.id} value={m.pointOfSaleName || ''}>
                        {m.pointOfSaleName || m.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Đại lý</label>
                  <select
                    value={editingRecord.agentId || ''}
                    onChange={(e) => setEditingRecord({...editingRecord, agentId: e.target.value || undefined})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">-- Chọn đại lý --</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú</label>
                  <textarea
                    value={editingRecord.note || ''}
                    onChange={(e) => setEditingRecord({...editingRecord, note: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    rows={3}
                    placeholder="Ghi chú về thay đổi này..."
                  />
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingRecord(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  if (!editingRecord) return;
                  
                  // Tạo edit history
                  const editHistory = editingRecord.editHistory || [];
                  const editedFields: string[] = [];
                  
                  // So sánh với record gốc để tìm các field đã thay đổi
                  const originalRecord = records.find(r => r.id === editingRecord.id);
                  if (originalRecord) {
                    if (originalRecord.transactionCode !== editingRecord.transactionCode) {
                      editedFields.push('transactionCode');
                      editHistory.push({
                        field: 'transactionCode',
                        oldValue: originalRecord.transactionCode,
                        newValue: editingRecord.transactionCode,
                        editedAt: new Date().toISOString(),
                        editedBy: 'current_user' // TODO: Get from auth
                      });
                    }
                    if (originalRecord.merchantAmount !== editingRecord.merchantAmount) {
                      editedFields.push('merchantAmount');
                      editHistory.push({
                        field: 'merchantAmount',
                        oldValue: originalRecord.merchantAmount,
                        newValue: editingRecord.merchantAmount,
                        editedAt: new Date().toISOString(),
                        editedBy: 'current_user'
                      });
                    }
                    if (originalRecord.agentAmount !== editingRecord.agentAmount) {
                      editedFields.push('agentAmount');
                      editHistory.push({
                        field: 'agentAmount',
                        oldValue: originalRecord.agentAmount,
                        newValue: editingRecord.agentAmount,
                        editedAt: new Date().toISOString(),
                        editedBy: 'current_user'
                      });
                    }
                    if (originalRecord.pointOfSaleName !== editingRecord.pointOfSaleName) {
                      editedFields.push('pointOfSaleName');
                      editHistory.push({
                        field: 'pointOfSaleName',
                        oldValue: originalRecord.pointOfSaleName,
                        newValue: editingRecord.pointOfSaleName,
                        editedAt: new Date().toISOString(),
                        editedBy: 'current_user'
                      });
                    }
                    if (originalRecord.agentId !== editingRecord.agentId) {
                      editedFields.push('agentId');
                      editHistory.push({
                        field: 'agentId',
                        oldValue: originalRecord.agentId,
                        newValue: editingRecord.agentId,
                        editedAt: new Date().toISOString(),
                        editedBy: 'current_user'
                      });
                    }
                  }
                  
                  // Recalculate status based on new values
                  let newStatus = editingRecord.status;
                  let newErrorType = editingRecord.errorType;
                  let newErrorDetail = editingRecord.errorDetail;
                  
                  if (editingRecord.merchantAmount && editingRecord.agentAmount) {
                    const diff = Math.abs(editingRecord.merchantAmount - editingRecord.agentAmount);
                    if (diff > 0.01) {
                      newStatus = TransactionStatus.ERROR_AMOUNT;
                      newErrorType = 'WRONG_AMOUNT';
                      newErrorDetail = `Sai số tiền: Merchant ${editingRecord.merchantAmount.toLocaleString('vi-VN')}đ vs Agent ${editingRecord.agentAmount.toLocaleString('vi-VN')}đ`;
                    } else {
                      newStatus = TransactionStatus.MATCHED;
                      newErrorType = undefined;
                      newErrorDetail = '';
                    }
                  }
                  
                  const updatedRecord: ReconciliationRecord = {
                    ...editingRecord,
                    status: newStatus,
                    errorType: newErrorType,
                    errorDetail: newErrorDetail,
                    difference: (editingRecord.agentAmount || 0) - (editingRecord.merchantAmount || 0),
                    isManuallyEdited: true,
                    editedFields,
                    editHistory,
                    noteUpdatedAt: new Date().toISOString(),
                    noteUpdatedBy: 'current_user'
                  };
                  
                  // Update in local state
                  setRecords(records.map(r => r.id === editingRecord.id ? updatedRecord : r));
                  
                  // Update in Firebase
                  try {
                    await ReconciliationService.updateRecord(editingRecord.id, updatedRecord);
                    alert('Đã cập nhật giao dịch thành công!');
                    setShowEditModal(false);
                    setEditingRecord(null);
                  } catch (error) {
                    console.error('Error updating record:', error);
                    alert('Có lỗi khi cập nhật: ' + (error as Error).message);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center"
              >
                <Save className="w-4 h-4 mr-2" />
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconciliationModule;