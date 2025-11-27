import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, AlertTriangle, CheckCircle, XCircle, Download, Search, FileText, BrainCircuit, Trash2, FileSpreadsheet, History, Plus, X, RotateCcw, Image as ImageIcon, Loader2, Edit2, Filter, Save, Eye } from 'lucide-react';
import { remove } from 'firebase/database';
import Pagination from './Pagination';
import { ReconciliationRecord, TransactionStatus, PaymentMethod, MerchantTransaction, AgentSubmission, ReconciliationSession, Merchant, Agent, Payment } from '../types';
import { generateMockFiles } from '../constants';
import { generateReconciliationReport, extractTransactionFromImage } from '../services/geminiService';
import { ReconciliationService, SettingsService, PaymentsService } from '../src/lib/firebaseServices';
import { get, ref } from 'firebase/database';
import { database } from '../src/lib/firebase';
import { createStyledWorkbook, createStyledSheet, addMetadataSheet, exportWorkbook, identifyNumberColumns, identifyDateColumns } from '../src/utils/excelExportUtils';
import * as XLSX from 'xlsx';
import { parseExcel, findKey, parseAmount, normalize, guessTransactionCode } from '../src/utils/excelParserUtils';
import { useRealtimeData, FirebaseUtils } from '../src/lib/firebaseHooks';

const ReconciliationModule: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Firebase hooks for merchants and agents
  const { data: merchantsData } = useRealtimeData<Record<string, Merchant>>('/merchants');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const merchants = FirebaseUtils.objectToArray(merchantsData || {});
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  
  // File State - Updated for multi-file support
  const [merchantFiles, setMerchantFiles] = useState<File[]>([]);
  const [agentFiles, setAgentFiles] = useState<File[]>([]); // Now contains image files
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isProcessingAgentFiles, setIsProcessingAgentFiles] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [agentMergeProgress, setAgentMergeProgress] = useState(0);
  
  // Agent Image & OCR State
  const [agentImages, setAgentImages] = useState<string[]>([]); // Base64 previews
  const [agentOcrResults, setAgentOcrResults] = useState<{
    file: File;
    result?: AgentSubmission;
    error?: string;
    status: 'pending' | 'processing' | 'success' | 'error';
  }[]>([]);
  
  // Parsed Data State
  const [merchantData, setMerchantData] = useState<MerchantTransaction[]>([]);
  const [agentData, setAgentData] = useState<AgentSubmission[]>([]);
  
  // Merchant matching warnings
  const [merchantMatchWarnings, setMerchantMatchWarnings] = useState<Map<string, string>>(new Map());

  // UI State
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
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
  
  // Pagination state for session history (lazy loading)
  const [historyPage, setHistoryPage] = useState(1);
  const historyItemsPerPage = 5;
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [allLoadedHistory, setAllLoadedHistory] = useState<ReconciliationSession[]>([]);

  // Refs for hidden file inputs
  const merchantInputRef = useRef<HTMLInputElement>(null);
  const agentInputRef = useRef<HTMLInputElement>(null);

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
        // Append: thêm vào danh sách đã load
        const updatedHistory = [...allLoadedHistory, ...historyWithRealStats];
        setAllLoadedHistory(updatedHistory);
        setSessionHistory(updatedHistory);
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

        const mappedData: MerchantTransaction[] = rawData.map((row: any, index) => {
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
          
          transactionCode = String(transactionCode || `UNK_${file.name}_${index}`);
          
          // Validate: transactionCode không được là pointOfSaleName
          if (transactionCode === pointOfSaleName) {
            console.error(`❌ Row ${index}: transactionCode vẫn trùng với pointOfSaleName: ${transactionCode}`);
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
          
          const parsedAmount = parseAmount(amount);
          
          // Validate: amount phải >= 1000 VND, nếu không thì skip row này
          if (!parsedAmount || parsedAmount < 1000) {
            console.warn(`⚠️ Row ${index}: Amount không hợp lệ (${parsedAmount}), skip row này`);
            return null; // Skip row này
          }
          
          console.log(`💰 Row ${index} - Final parsed amount: ${parsedAmount} (from: ${amount})`);
          amount = parsedAmount;
          const timestamp = String(
            findKey(row, ['thời gian','thời gian giao dịch','ngày','ngày giao dịch','time','date','datetime','created']) 
            || new Date().toISOString()
          );
          const method = findKey(row, ['phương thức','phương thức thanh toán','method','loại','type','payment']) || PaymentMethod.QR_VNPAY;
          
          // Extract point of sale information (pointOfSaleName đã được extract ở trên)
          const pointOfSaleCode = findKey(row, ['mã điểm thu', 'mã điểm bán', 'point of sale code', 'pos code', 'collection point code']);
          const branchName = findKey(row, ['chi nhánh', 'branch', 'branch name', 'tên chi nhánh']);
          
          // Match merchant via point of sale ONLY (không check merchantCode/merchant name)
          let matchedMerchant: Merchant | null = null;
          
          if (pointOfSaleName || pointOfSaleCode) {
            matchedMerchant = merchants.find(m => 
              (pointOfSaleName && (m.pointOfSaleName === pointOfSaleName || normalize(m.pointOfSaleName || '') === normalize(pointOfSaleName))) ||
              (pointOfSaleCode && (m.pointOfSaleCode === pointOfSaleCode || normalize(m.pointOfSaleCode || '') === normalize(pointOfSaleCode)))
            ) || null;
            
            if (matchedMerchant) {
              console.log(`✅ Matched merchant: ${matchedMerchant.pointOfSaleName} via point of sale`);
            } else {
              console.warn(`⚠️ Không tìm thấy Merchant cho điểm thu: ${pointOfSaleName || pointOfSaleCode}`);
            }
          }
          
          return {
            id: `MER_${file.name}_${index}`,
            merchantCode: matchedMerchant?.code || 'N/A', // Chỉ dùng để display, không dùng để match
            transactionCode,
            amount,
            timestamp,
            method,
            sourceFile: file.name, // Track source file
            pointOfSaleName: pointOfSaleName ? String(pointOfSaleName) : undefined,
            pointOfSaleCode: pointOfSaleCode ? String(pointOfSaleCode) : undefined,
            branchName: branchName ? String(branchName) : undefined
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
          console.error(`❌ Invalid: transactionCode trùng với pointOfSaleName: "${item.transactionCode}" - Skip row from ${item.sourceFile}`);
          return false;
        }
        // TransactionCode phải có độ dài hợp lý (ít nhất 6 ký tự, không phải UNK_xxx)
        if (item.transactionCode.startsWith('UNK_')) {
          console.warn(`⚠️ Warning: transactionCode là UNK_xxx: "${item.transactionCode}" - Row from ${item.sourceFile}`);
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
      
    } catch (error) {
      console.error('Error processing merchant files:', error);
      alert(`Lỗi khi xử lý files: ${error}`);
    } finally {
      setIsProcessingFiles(false);
      setMergeProgress(0);
    }
  };

  // Handle agent images upload (screenshots from VNPay app)
  const handleAgentImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types - only images
    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      alert(`Các file không hợp lệ: ${invalidFiles.map(f => f.name).join(', ')}\nVui lòng chọn file ảnh (JPG, PNG, WebP)`);
      return;
    }

    // Validate file size (max 5MB per image)
    const oversizedFiles = files.filter(file => file.size > 5 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      alert(`Các file quá lớn (tối đa 5MB): ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }

    setAgentFiles(files);
    
    // Convert to base64 for preview
    const base64Promises = files.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      });
    });
    
    const base64Images = await Promise.all(base64Promises);
    setAgentImages(base64Images);
    
    // Initialize OCR results state
    const initialResults = files.map(file => ({
      file,
      status: 'pending' as const
    }));
    setAgentOcrResults(initialResults);
    
    // Auto-start OCR processing
    await processAgentImages(files, base64Images);
  };

  // Process agent images with OCR
  const processAgentImages = async (files: File[], base64Images: string[]) => {
    setIsProcessingAgentFiles(true);
    setAgentMergeProgress(0);
    
    const allAgentData: AgentSubmission[] = [];
    const updatedResults: Array<{
      file: File;
      status: 'pending' | 'processing' | 'success' | 'error';
      result?: AgentSubmission;
      error?: string;
    }> = files.map(file => ({
      file,
      status: 'pending' as const
    }));
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = base64Images[i];
        const progress = Math.round(((i + 1) / files.length) * 100);
        setAgentMergeProgress(progress);
        
        // Update status to processing
        updatedResults[i] = { ...updatedResults[i], status: 'processing' as const };
        setAgentOcrResults([...updatedResults]);
        
        try {
          console.log(`🔍 OCR processing image ${i + 1}/${files.length}:`, file.name);
          
          // Extract agent ID from filename (fallback)
          const agentIdFromFile = file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '').toUpperCase() || 'unknown';
          
          // Call OCR service (with built-in retry logic)
          const result = await extractTransactionFromImage(base64, agentIdFromFile);
          
          // Auto-link agent bằng bankAccount (số tài khoản ngân hàng) nếu có
          if (result.bankAccount) {
            const ocrBankAccount = result.bankAccount.replace(/[^\d]/g, '');
            const matchedAgent = agents.find(a => {
              const agentBankAccount = a.bankAccount?.replace(/[^\d]/g, '') || '';
              return agentBankAccount && agentBankAccount === ocrBankAccount;
            });
            
            if (matchedAgent) {
              result.agentId = matchedAgent.id;
              console.log(`🔗 Auto-linked agent: ${matchedAgent.name} (${matchedAgent.code}) via bankAccount: ${ocrBankAccount}`);
            } else {
              console.warn(`⚠️ Không tìm thấy đại lý với bankAccount: ${ocrBankAccount}`);
            }
          }
          
          // Update status to success
          updatedResults[i] = {
            file,
            result,
            status: 'success' as const
          };
          setAgentOcrResults([...updatedResults]);
          
          allAgentData.push(result);
          console.log(`✅ OCR success for ${file.name}:`, result);
          
          // Increased delay to avoid rate limiting (especially for 503 errors)
          if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds between requests
          }
        } catch (error: any) {
          console.error(`❌ OCR error for ${file.name}:`, error);
          
          // Provide more user-friendly error message
          let errorMessage = error.message || 'Không thể đọc thông tin từ ảnh';
          if (errorMessage.includes('overloaded') || errorMessage.includes('503')) {
            errorMessage = 'Model đang quá tải. Vui lòng thử lại sau vài giây.';
          } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            errorMessage = 'Quá nhiều yêu cầu. Vui lòng đợi vài giây rồi thử lại.';
          }
          
          updatedResults[i] = {
            file,
            error: errorMessage,
            status: 'error' as const
          };
          setAgentOcrResults([...updatedResults]);
        }
      }
      
      setAgentData(allAgentData);
      console.log(`✅ Processed ${allAgentData.length} images successfully`);
    } catch (error) {
      console.error('Error processing agent images:', error);
      alert(`Lỗi khi xử lý ảnh: ${error}`);
    } finally {
      setIsProcessingAgentFiles(false);
      setAgentMergeProgress(0);
    }
  };

  // Retry OCR for a failed image
  const retryOcr = async (index: number) => {
    const file = agentFiles[index];
    const base64 = agentImages[index];
    if (!file || !base64) return;
    
    const updatedResults = [...agentOcrResults];
    updatedResults[index] = { ...updatedResults[index], status: 'processing' };
    setAgentOcrResults([...updatedResults]);
    
    try {
      // Add delay before retry to avoid immediate rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const agentIdFromFile = file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '').toUpperCase() || 'unknown';
      const result = await extractTransactionFromImage(base64, agentIdFromFile);
      
        // Auto-link agent bằng bankAccount (số tài khoản ngân hàng) nếu có
        if (result.bankAccount) {
          const ocrBankAccount = result.bankAccount.replace(/[^\d]/g, '');
          const matchedAgent = agents.find(a => {
            const agentBankAccount = a.bankAccount?.replace(/[^\d]/g, '') || '';
            return agentBankAccount && agentBankAccount === ocrBankAccount;
          });
          
          if (matchedAgent) {
            result.agentId = matchedAgent.id;
            console.log(`🔗 Auto-linked agent: ${matchedAgent.name} (${matchedAgent.code}) via bankAccount: ${ocrBankAccount}`);
          }
        }
      
      updatedResults[index] = { file, result, status: 'success' };
      setAgentOcrResults([...updatedResults]);
      
      // Update agentData
      const newAgentData = [...agentData];
      const existingIndex = newAgentData.findIndex(a => a.id === result.id);
      if (existingIndex >= 0) {
        newAgentData[existingIndex] = result;
      } else {
        newAgentData.push(result);
      }
      setAgentData(newAgentData);
      
      console.log(`✅ Retry successful for ${file.name}`);
    } catch (error: any) {
      console.error(`❌ Retry failed for ${file.name}:`, error);
      updatedResults[index] = {
        file,
        error: error.message || 'Không thể đọc thông tin từ ảnh',
        status: 'error'
      };
      setAgentOcrResults([...updatedResults]);
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
      } else {
        setAgentFiles([file]);
        const mappedData: AgentSubmission[] = rawData.map((row: any, index) => {
          console.log(`🔄 Processing agent row ${index}:`, row);
          
          const agentId = String(findKey(row, ['đại lý', 'agent', 'nguồn', 'source', 'merchant', 'store']) || 'Unknown Agent');
          // Try to find agent transaction code in more places
          let transactionCode = findKey(row, [
            'mã giao dịch','mã gd','mã chuẩn chi','mã truy tiền','transaction','transaction id','id','reference','ref','txn','trace','stan','rrn'
          ]);
          
          // If not found, look for any cell that looks like a transaction ID
          if (!transactionCode || transactionCode === '') {
            const guess = guessTransactionCode(row);
            if (guess) transactionCode = guess;
          }
          
          transactionCode = String(transactionCode || `UNK_${index}`);
          
          // Look for amount in multiple ways
          let amount = findKey(row, [
            'số tiền sau km','số tiền trước km','số tiền','số tiền thực thu','thành tiền','tổng tiền','amount','amount vnd','giá trị','vnd','money','value','total','sum','tổng'
          ]);
          
          // If not found, find any numeric column
          if (!amount || parseAmount(amount) === 0) {
            const numericKeys = Object.keys(row).filter(k => {
              const val = parseAmount(row[k]);
              return !isNaN(val) && val > 0 && val < 10000000000; // reasonable amount range
            });
            if (numericKeys.length > 0) amount = row[numericKeys[0]];
          }
          amount = parseAmount(amount) || 0;
          const timestamp = String(
            findKey(row, ['thời gian gd','thời gian đối soát','thời gian','thời gian giao dịch','ngày','ngày giao dịch','time','date','datetime','created']) 
            || new Date().toISOString()
          );
          
          console.log(`✅ Mapped agent row ${index}:`, { agentId, transactionCode, amount, timestamp });
          
          return {
            id: `AG_${index}`,
            agentId,
            transactionCode,
            amount,
            timestamp
          };
        }).filter(item => {
          console.log('🔍 Validating agent row:', item);
          
          // More flexible validation
          const hasValidCode = item.transactionCode && 
                               item.transactionCode !== '' && 
                               !item.transactionCode.startsWith('UNK_');
          const hasValidAmount = item.amount && Number(item.amount) > 0;
          
          console.log('💰 Agent validation:', { 
            code: item.transactionCode, 
            codeValid: hasValidCode,
            amount: item.amount, 
            amountValid: hasValidAmount 
          });
          
          const isValid = hasValidCode && hasValidAmount;
          if (!isValid) console.log('❌ Filtered out invalid agent row:', item);
          return isValid;
        });

        console.log(`Đã parse ${mappedData.length} giao dịch agent`);
        setAgentData(mappedData);
        if (mappedData.length > 0) {
          alert(`✅ Đã tải thành công ${mappedData.length} giao dịch từ file Agent`);
        } else {
          alert('⚠️ Không tìm thấy dữ liệu hợp lệ trong file Agent. Kiểm tra lại cột: Mã GD, Số tiền');
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
    
    const mappedAgent: AgentSubmission[] = agentFile.map((a, i) => ({
        id: `MOCK_A_${i}`,
        agentId: a.agent,
        transactionCode: a.code,
        amount: a.amount,
        timestamp: new Date().toISOString()
    }));

    setMerchantData(mappedMerch);
    setAgentData(mappedAgent);
    
    // Create fake file objects for UI state - Updated for multi-file support
    const demoMerchantFiles = [
      new File([""], "demo_merchant_data_1.xlsx"),
      new File([""], "demo_merchant_data_2.xlsx")
    ];
    const demoAgentFiles = [
      new File([""], "demo_agent_DL_MK.xlsx"),
      new File([""], "demo_agent_DL_CG.xlsx")
    ];
    setMerchantFiles(demoMerchantFiles);
    setAgentFiles(demoAgentFiles);
  };

  const handleProcess = async () => {
    setIsLoading(true);

    try {
      // Validate input data first to avoid empty processing
      if (merchantData.length === 0 || agentData.length === 0) {
        alert('Vui lòng tải lên cả hai file và đảm bảo có dữ liệu hợp lệ.');
        setIsLoading(false);
        return;
      }

      // Tạo session trước (có thể fail nếu Firebase chưa cấu hình)
      let sessionId: string | null = null;
      try {
        sessionId = await ReconciliationService.createSession({
          createdBy: 'current_user', // TODO: Get from auth context
          createdAt: new Date().toISOString(),
          status: 'PROCESSING' as const,
          merchantFileName: merchantFiles.length > 0 ? `${merchantFiles.length} merchant files: ${merchantFiles.map(f => f.name).join(', ')}` : 'Unknown',
          agentFileName: agentFiles.length > 0 ? `${agentFiles.length} agent files: ${agentFiles.map(f => f.name).join(', ')}` : 'Unknown',
          totalRecords: merchantData.length + agentData.length,
          matchedCount: 0,
          errorCount: 0,
          totalAmount: 0
        });
        setCurrentSessionId(sessionId);
      } catch (e) {
        console.warn('⚠️ Không thể tạo session trên Firebase. Sẽ xử lý local.', e);
        sessionId = null; // continue locally
        setCurrentSessionId(null);
      }

      // Load paid transactions to check for double payment
      let paidTransactionCodes = new Set<string>();
      // Load existing transaction codes from previous sessions (for supplementary bills check)
      let existingTransactionCodes = new Map<string, { sessionId: string; processedAt: string }>();
      
      try {
        // Load all reconciliation records to check which transactionCodes are already paid
        const recordsSnapshot = await get(ref(database, 'reconciliation_records'));
        const allRecords = FirebaseUtils.objectToArray(recordsSnapshot.val() || {}) as ReconciliationRecord[];
        
        // Load payments
        const paymentsSnapshot = await get(ref(database, 'payments'));
        const payments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {}) as Payment[];
        
        // Get set of paid record IDs
        const paidRecordIds = new Set<string>();
        payments.forEach(payment => {
          if (payment.status === 'PAID' && payment.transactionIds) {
            payment.transactionIds.forEach(id => paidRecordIds.add(id));
          }
        });
        
        // Get transaction codes from paid records
        allRecords.forEach(record => {
          if (paidRecordIds.has(record.id) && record.transactionCode) {
            paidTransactionCodes.add(record.transactionCode);
          }
          
          // Track all existing transaction codes for duplicate check (supplementary bills)
          if (record.transactionCode && (record as any).sessionId) {
            const existing = existingTransactionCodes.get(record.transactionCode);
            if (!existing || new Date(record.processedAt) > new Date(existing.processedAt)) {
              existingTransactionCodes.set(record.transactionCode, {
                sessionId: (record as any).sessionId,
                processedAt: record.processedAt
              });
            }
          }
        });
        
        // Also check aggregated data from sessions for faster lookup
        const sessionsSnapshot = await get(ref(database, 'reconciliation_sessions'));
        const allSessions = FirebaseUtils.objectToArray(sessionsSnapshot.val() || {}) as ReconciliationSession[];
        allSessions.forEach(session => {
          if (session.aggregatedData?.byTransactionCode) {
            Object.entries(session.aggregatedData.byTransactionCode).forEach(([txCode, txData]) => {
              const existing = existingTransactionCodes.get(txCode);
              if (!existing || new Date(txData.lastProcessedAt) > new Date(existing.processedAt)) {
                existingTransactionCodes.set(txCode, {
                  sessionId: session.id,
                  processedAt: txData.lastProcessedAt
                });
              }
            });
          }
        });
      } catch (e) {
        console.warn('⚠️ Không thể load payments để check double payment. Tiếp tục...', e);
      }

      // OPTIMIZED MATCHING ALGORITHM - Index-based O(1) lookup
      // CHỈ MATCH THEO MÃ CHUẨN CHI (transactionCode)
      const results: ReconciliationRecord[] = [];
      const processedAgentCodes = new Set<string>();
      const agentDuplicateMap = new Map<string, AgentSubmission[]>();
      
      // Step 1: INDEX MERCHANT DATA (O(n) - chỉ làm 1 lần)
      const merchantIndex = new Map<string, MerchantTransaction>();
      merchantData.forEach(m => {
        merchantIndex.set(m.transactionCode, m); // Match by transactionCode only
      });
      
      // Step 2: Detect duplicates in Agent data with cross-agent tracking (O(m))
      agentData.forEach((agentTx) => {
        if (!agentDuplicateMap.has(agentTx.transactionCode)) {
          agentDuplicateMap.set(agentTx.transactionCode, []);
        }
        agentDuplicateMap.get(agentTx.transactionCode)!.push(agentTx);
      });

      // Check for cross-agent duplicates (same bill claimed by different agents)
      const crossAgentDuplicates = Array.from(agentDuplicateMap.entries())
        .filter(([_, submissions]) => {
          const uniqueAgents = new Set(submissions.map(s => s.agentId));
          return submissions.length > 1 && uniqueAgents.size > 1; // Multiple agents claiming same bill
        });

      // Step 3: FAST MATCHING với early exit (O(m) với O(1) lookup per tx)
      agentData.forEach((agentTx, agentIndex) => {
        const code = agentTx.transactionCode; // Mã Chuẩn chi
        const merchantMatch = merchantIndex.get(code); // O(1) lookup - chỉ match theo transactionCode
        const duplicateCount = agentDuplicateMap.get(code)?.length || 1;
        const isFirstOccurrence = !processedAgentCodes.has(code);
        
        // Check for cross-session duplicate (supplementary bills)
        const existingTx = existingTransactionCodes.get(code);
        const isSupplementaryDuplicate = existingTx && existingTx.sessionId !== sessionId;
        
        // Match Agent via point of sale
        let matchedAgent: Agent | null = null;
        if (agentTx.pointOfSaleName) {
          matchedAgent = agents.find(a => 
            a.assignedPointOfSales?.some(pos => 
              normalize(pos) === normalize(agentTx.pointOfSaleName || '')
            )
          ) || null;
          
          if (matchedAgent && agentTx.agentId !== matchedAgent.id && agentTx.agentId !== matchedAgent.code) {
            // Update agentId if matched via point of sale
            agentTx.agentId = matchedAgent.id;
            console.log(`✅ Matched agent: ${matchedAgent.name} (${matchedAgent.code}) via point of sale: ${agentTx.pointOfSaleName}`);
          }
        }
        
        // Check for double payment
        const isPaid = paidTransactionCodes.has(code);
        
        let status: TransactionStatus;
        let diff = 0;
        let errorDetail = '';

        // Early exit checks - chỉ check khi cần
        const isCrossAgentDuplicate = crossAgentDuplicates.some(([dupCode, _]) => dupCode === code);
        const agentSubmissions = agentDuplicateMap.get(code) || [];
        const uniqueAgents = new Set(agentSubmissions.map(s => s.agentId));
        
        let errorType: ReconciliationRecord['errorType'] = undefined;
        
        // Check 0: Already paid (skip if already paid)
        if (isPaid) {
          status = TransactionStatus.MATCHED; // Keep as MATCHED but mark as paid
          errorDetail = '';
          diff = 0;
        }
        // Check 0.5: Cross-session duplicate (supplementary bill đã được xử lý)
        else if (isSupplementaryDuplicate && isFirstOccurrence) {
          status = TransactionStatus.ERROR_DUPLICATE;
          errorType = 'DUPLICATE';
          errorDetail = `⚠️ Bill ${code} đã được xử lý trong session trước (${existingTx.sessionId}). Đây là bill bổ sung/quên.`;
          diff = 0;
        }
        // Check 1: Duplicate (early exit)
        else if (isCrossAgentDuplicate && isFirstOccurrence) {
          status = TransactionStatus.ERROR_DUPLICATE;
          errorType = 'DUPLICATE';
          errorDetail = `🚨 CROSS-AGENT DUPLICATE: Bill ${code} được claim bởi ${uniqueAgents.size} đại lý khác nhau: ${Array.from(uniqueAgents).join(', ')}`;
          diff = 0;
        } else if (duplicateCount > 1 && !isCrossAgentDuplicate && isFirstOccurrence) {
          status = TransactionStatus.ERROR_DUPLICATE;
          errorType = 'DUPLICATE';
          errorDetail = `Bill ${code} bị trùng ${duplicateCount} lần bởi cùng đại lý ${agentTx.agentId}`;
          diff = 0;
        } else if (duplicateCount > 1 && !isFirstOccurrence) {
          // Skip subsequent duplicates
          return;
        } 
        // Check 2: Missing in Merchant (early exit - không check amount nếu không có match)
        else if (!merchantMatch) {
          status = TransactionStatus.MISSING_IN_MERCHANT;
          errorType = 'MISSING_MERCHANT';
          errorDetail = `Bill ${code} không tồn tại trong hệ thống Merchant`;
          diff = 0; // Không tính chênh lệch khi không khớp mã chuẩn chi
        } 
        // Check 3: Point of sale mismatch (nếu có merchantMatch)
        else if (merchantMatch && agentTx.pointOfSaleName && merchantMatch.pointOfSaleName) {
          const normalizedAgentPOS = normalize(agentTx.pointOfSaleName);
          const normalizedMerchantPOS = normalize(merchantMatch.pointOfSaleName);
          if (normalizedAgentPOS !== normalizedMerchantPOS) {
            status = TransactionStatus.ERROR_AMOUNT; // Dùng ERROR_AMOUNT tạm thời, có thể tạo status mới
            errorType = 'WRONG_POINT_OF_SALE';
            errorDetail = `Sai điểm bán: Agent "${agentTx.pointOfSaleName}" vs Merchant "${merchantMatch.pointOfSaleName}"`;
            diff = 0;
          }
          // Check 4: Amount mismatch (chỉ check nếu point of sale đã khớp)
          else if (Math.abs(merchantMatch.amount - agentTx.amount) > 0.01) {
            status = TransactionStatus.ERROR_AMOUNT;
            errorType = 'WRONG_AMOUNT';
            errorDetail = `Sai số tiền: Merchant ${merchantMatch.amount.toLocaleString('vi-VN')}đ vs Agent ${agentTx.amount.toLocaleString('vi-VN')}đ`;
            diff = agentTx.amount - merchantMatch.amount;
          }
          // Check 5: Agent mismatch (nếu có merchantMatch và pointOfSaleName khớp)
          else if (matchedAgent && agentTx.agentId && matchedAgent.id !== agentTx.agentId && matchedAgent.code !== agentTx.agentId) {
            status = TransactionStatus.ERROR_DUPLICATE; // Dùng tạm thời
            errorType = 'WRONG_AGENT';
            const agentName = agents.find(a => a.id === agentTx.agentId || a.code === agentTx.agentId)?.name || agentTx.agentId;
            errorDetail = `Sai đại lý: Bill được claim bởi "${agentName}" nhưng điểm bán "${agentTx.pointOfSaleName}" thuộc về "${matchedAgent.name}"`;
            diff = 0;
          }
          // All good - MATCHED
          else {
            status = TransactionStatus.MATCHED;
            errorDetail = '';
            diff = 0;
          }
        }
        // Check 4: Amount mismatch (nếu không có point of sale check)
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

        // Find merchant by point of sale ONLY (không check merchantCode)
        const matchedMerchant = merchants.find(m => 
          m.pointOfSaleName === merchantMatch?.pointOfSaleName ||
          m.pointOfSaleCode === merchantMatch?.pointOfSaleCode
        );

        // Tạo Complete Transaction Record với đầy đủ thông tin
        const completeRecord: ReconciliationRecord = {
          id: `REC_${Date.now()}_${agentIndex}`,
          transactionCode: agentTx.transactionCode,
          agentData: agentTx,
          merchantData: merchantMatch,
          status,
          difference: diff,
          processedAt: new Date().toISOString(),
          // Enhanced fields for complete record
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
          isPaid,
        };

        results.push(completeRecord);
        processedAgentCodes.add(code);
      });

      // Step 4: Find MISSING_IN_AGENT (O(n) - chỉ loop merchant 1 lần)
      merchantData.forEach((merTx, merchIndex) => {
        if (!processedAgentCodes.has(merTx.transactionCode)) {
          // Find merchant by point of sale ONLY (không check merchantCode)
          const matchedMerchant = merchants.find(m => 
            m.pointOfSaleName === merTx.pointOfSaleName ||
            m.pointOfSaleCode === merTx.pointOfSaleCode
          );
          
          const missingRecord: ReconciliationRecord = {
            id: `REC_MISSING_${Date.now()}_${merchIndex}`,
            transactionCode: merTx.transactionCode,
            merchantData: merTx,
            agentData: undefined,
            status: TransactionStatus.MISSING_IN_AGENT,
            difference: 0, // Không tính chênh lệch khi không khớp mã chuẩn chi
            processedAt: new Date().toISOString(),
            // Enhanced fields
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

      // Lưu records vào Firebase (nếu tạo được session)
      if (sessionId) {
        try {
          await ReconciliationService.saveRecords(sessionId, results);
        } catch (e) {
          console.warn('⚠️ Không thể lưu records lên Firebase. Vẫn tiếp tục hiển thị kết quả.', e);
        }
      }

      // Tự động tạo Payouts cho các giao dịch MATCHED và chưa thanh toán
      const matchedUnpaidRecords = results.filter(r => 
        r.status === TransactionStatus.MATCHED && 
        !r.isPaid && 
        r.agentId && 
        r.agentId !== 'N/A' &&
        r.merchantAmount && 
        r.merchantAmount > 0
      );

      if (matchedUnpaidRecords.length > 0) {
        try {
          // Group by agent
          const agentGroups = new Map<string, ReconciliationRecord[]>();
          matchedUnpaidRecords.forEach(record => {
            const agentId = record.agentId!;
            if (!agentGroups.has(agentId)) {
              agentGroups.set(agentId, []);
            }
            agentGroups.get(agentId)!.push(record);
          });

          // Create payment for each agent
          for (const [agentId, records] of agentGroups.entries()) {
            const agent = agents.find(a => a.id === agentId || a.code === agentId);
            if (!agent) {
              console.warn(`⚠️ Không tìm thấy agent ${agentId} để tạo payment`);
              continue;
            }

            // Calculate totals
            let totalAmount = 0;
            let totalFee = 0;
            const transactionIds: string[] = [];

            records.forEach(record => {
              const amount = record.merchantAmount || 0;
              totalAmount += amount;
              transactionIds.push(record.id);

              // Calculate fee based on agent's discount rates by point of sale (NEW WORKFLOW)
              const paymentMethod = record.paymentMethod || record.merchantData?.method || PaymentMethod.QR_VNPAY;
              const pointOfSaleName = record.pointOfSaleName;
              
              let feePercentage = 0;
              // Ưu tiên dùng discountRatesByPointOfSale nếu có
              if (agent.discountRatesByPointOfSale && pointOfSaleName && agent.discountRatesByPointOfSale[pointOfSaleName]) {
                feePercentage = agent.discountRatesByPointOfSale[pointOfSaleName][paymentMethod] || 0;
              } else if (agent.discountRates) {
                // Fallback về discountRates global (cũ)
                feePercentage = agent.discountRates[paymentMethod] || 0;
              }
              
              const fee = (amount * feePercentage) / 100;
              totalFee += fee;
            });

            const netAmount = totalAmount - totalFee;

            // Check if payment already exists for these transactions
            let existingPaymentId: string | null = null;
            try {
              const paymentsSnapshot = await get(ref(database, 'payments'));
              const allPayments = FirebaseUtils.objectToArray(paymentsSnapshot.val() || {}) as Payment[];
              const existingPayment = allPayments.find(p => 
                p.agentId === agentId && 
                p.status !== 'CANCELLED' &&
                transactionIds.some(txId => p.transactionIds?.includes(txId))
              );
              if (existingPayment) {
                existingPaymentId = existingPayment.id;
                console.log(`ℹ️ Payment đã tồn tại cho agent ${agentId}: ${existingPaymentId}`);
              }
            } catch (e) {
              console.warn('⚠️ Không thể check existing payments', e);
            }

            // Create payment if not exists
            if (!existingPaymentId) {
              try {
                const paymentId = await PaymentsService.createPayment({
                  agentId,
                  agentName: agent.name,
                  agentCode: agent.code,
                  bankAccount: agent.bankAccount,
                  totalAmount,
                  feeAmount: totalFee,
                  netAmount,
                  transactionIds,
                  transactionCount: records.length,
                  status: 'PENDING',
                  createdAt: new Date().toISOString(),
                  createdBy: 'system' // Auto-created by system
                });

                // Update records with paymentId
                records.forEach(record => {
                  record.paymentId = paymentId;
                });

                console.log(`✅ Đã tạo payment ${paymentId} cho agent ${agent.name}: ${netAmount.toLocaleString('vi-VN')}đ`);
              } catch (e) {
                console.error(`❌ Lỗi khi tạo payment cho agent ${agentId}:`, e);
              }
            } else {
              // Update records with existing paymentId
              records.forEach(record => {
                record.paymentId = existingPaymentId!;
                record.isPaid = false; // Still pending
              });
            }
          }
        } catch (e) {
          console.error('❌ Lỗi khi tự động tạo payouts:', e);
        }
      }

      // Calculate stats (O(1) - chỉ loop results 1 lần duy nhất)
      const matched = results.filter(r => r.status === TransactionStatus.MATCHED).length;
      // Error count: chỉ đếm các lỗi thực sự (ERROR_AMOUNT, ERROR_DUPLICATE), không đếm MISSING_IN_*
      const errors = results.filter(r => 
        r.status === TransactionStatus.ERROR_AMOUNT || 
        r.status === TransactionStatus.ERROR_DUPLICATE
      ).length;
      const totalVol = results.reduce((acc, r) => acc + (r.merchantData?.amount || 0), 0);
      
      // Calculate session summary for optimized queries
      const summary = {
        byAgent: {} as Record<string, { count: number; amount: number }>,
        byMerchant: {} as Record<string, { count: number; amount: number }>
      };
      
      // Aggregated data for supplementary bills và export
      const aggregatedData = {
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
      
      results.forEach(record => {
        const agentId = record.agentData?.agentId;
        const merchantCode = record.merchantData?.merchantCode;
        const amount = record.merchantData?.amount || 0;
        const transactionCode = record.transactionCode;
        const pointOfSaleName = record.pointOfSaleName;
        
        // Summary for optimized queries
        if (agentId) {
          if (!summary.byAgent[agentId]) {
            summary.byAgent[agentId] = { count: 0, amount: 0 };
          }
          summary.byAgent[agentId].count++;
          summary.byAgent[agentId].amount += amount;
        }
        
        if (merchantCode) {
          if (!summary.byMerchant[merchantCode]) {
            summary.byMerchant[merchantCode] = { count: 0, amount: 0 };
          }
          summary.byMerchant[merchantCode].count++;
          summary.byMerchant[merchantCode].amount += amount;
        }
        
        // Aggregated data by transactionCode (for supplementary bills)
        if (!aggregatedData.byTransactionCode[transactionCode]) {
          aggregatedData.byTransactionCode[transactionCode] = {
            transactionCode,
            pointOfSaleName,
            agentId,
            merchantAmount: record.merchantAmount || 0,
            agentAmount: record.agentAmount || 0,
            status: record.status,
            lastProcessedAt: record.processedAt,
            sessionIds: sessionId ? [sessionId] : []
          };
        } else {
          // Update if this is a newer processing
          const existing = aggregatedData.byTransactionCode[transactionCode];
          if (new Date(record.processedAt) > new Date(existing.lastProcessedAt)) {
            existing.merchantAmount = record.merchantAmount || 0;
            existing.agentAmount = record.agentAmount || 0;
            existing.status = record.status;
            existing.lastProcessedAt = record.processedAt;
          }
          if (sessionId && !existing.sessionIds.includes(sessionId)) {
            existing.sessionIds.push(sessionId);
          }
        }
        
        // Aggregated data by point of sale
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
        
        // Aggregated data by agent
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
      
      // Get primary agentId from summary (agent with most transactions)
      const primaryAgentId = Object.entries(summary.byAgent)
        .sort((a, b) => b[1].count - a[1].count)[0]?.[0];
      
      // Get merchantIds
      const merchantIds = Object.keys(summary.byMerchant);

      // Cập nhật session với kết quả cuối và summary metadata (nếu có sessionId)
      if (sessionId) {
        try {
          // Đếm lại chính xác từ results
          const actualMatched = results.filter(r => r.status === TransactionStatus.MATCHED).length;
          const actualErrors = results.filter(r => 
            r.status === TransactionStatus.ERROR_AMOUNT || 
            r.status === TransactionStatus.ERROR_DUPLICATE
          ).length;
          
          await ReconciliationService.updateSession(sessionId, {
            matchedCount: actualMatched,
            errorCount: actualErrors,
            totalRecords: results.length,
            totalAmount: totalVol,
            status: 'COMPLETED',
            agentId: primaryAgentId,
            merchantIds: merchantIds,
            summary: summary,
            aggregatedData: aggregatedData
          });
          
          console.log(`✅ Updated session ${sessionId}: ${actualMatched} matched, ${actualErrors} errors, ${results.length} total`);
          
          // Load session data để hiển thị aggregated data
          const updatedSession = await ReconciliationService.getSessionById(sessionId);
          if (updatedSession) {
            setCurrentSessionData(updatedSession);
          }
        } catch (e) {
          console.warn('⚠️ Không thể cập nhật session trên Firebase.', e);
        }
      }

      setRecords(results);
      
      // Load session data để hiển thị aggregated data
      if (sessionId) {
        try {
          const updatedSession = await ReconciliationService.getSessionById(sessionId);
          if (updatedSession) {
            setCurrentSessionData(updatedSession);
          }
        } catch (e) {
          console.warn('⚠️ Không thể load session data:', e);
        }
      }
      
      // Reload history để hiển thị session mới
      await loadSessionHistory(1, true);
      
      setIsLoading(false);
      setStep(3);
    } catch (error) {
      console.error('Error processing reconciliation:', error);
      alert('Có lỗi khi xử lý đối soát. Vui lòng thử lại.');
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
      setStep(1);
      setMerchantFiles([]);
      setAgentFiles([]);
      setAgentImages([]);
      setAgentOcrResults([]);
      setMerchantData([]);
      setAgentData([]);
      setRecords([]);
      setAiReport('');
      setCurrentSessionId(null);
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
      
      // Sheet thống kê
      const statsHeaders = ['Thống kê', 'Giá trị'];
      const statsData = [
        { 'Thống kê': 'Tổng giao dịch', 'Giá trị': records.length },
        { 'Thống kê': 'Đã khớp', 'Giá trị': records.filter(r => r.status === 'MATCHED').length },
        { 'Thống kê': 'Lỗi', 'Giá trị': records.filter(r => r.status !== 'MATCHED').length },
        { 'Thống kê': 'Tổng giá trị (VNĐ)', 'Giá trị': records.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0) }
      ];
      const statsNumberCols = identifyNumberColumns(statsHeaders);
      createStyledSheet(workbook, 'Thống kê', statsHeaders, statsData, {
        numberColumns: statsNumberCols.filter(i => i === 1), // Only 'Giá trị' column
        highlightTotalRow: false
      });
      
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
  const [showAggregatedData, setShowAggregatedData] = useState(false);
  const [currentSessionData, setCurrentSessionData] = useState<ReconciliationSession | null>(null);

  // Load session cũ để xem lại
  const loadHistorySession = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const session = await ReconciliationService.getSessionById(sessionId);
      const sessionRecords = await ReconciliationService.getRecordsBySession(sessionId);
      
      if (session && sessionRecords) {
        setCurrentSessionId(sessionId);
        setCurrentSessionData(session);
        setRecords(sessionRecords);
        setStep(3);
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
        setStep(1);
        setCurrentSessionId(null);
        setRecords([]);
      }
      alert('Đã xóa phiên đối soát thành công');
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Có lỗi khi xóa phiên đối soát');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Đối soát giao dịch</h2>
          <p className="text-slate-500">Quy trình tải lên Excel, ghép file và kiểm tra lỗi tự động.</p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Nút lịch sử */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <History className="w-4 h-4" />
            <span>Lịch sử ({historyTotal > 0 ? historyTotal : sessionHistory.length})</span>
          </button>
          
          {/* Progress steps */}
          <div className="flex space-x-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1. Upload</span>
            <span className="text-slate-300">→</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2. Xử lý</span>
            <span className="text-slate-300">→</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${step >= 3 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3. Kết quả</span>
          </div>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
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

      {step === 1 && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={loadDemoData}
              className="text-sm text-indigo-600 hover:text-indigo-800 underline font-medium"
            >
              Sử dụng dữ liệu mẫu (Demo)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            {/* Agent Images Upload (OCR) */}
            <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors ${agentFiles.length > 0 ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-indigo-400 bg-white'}`}>
              <input 
                type="file" 
                accept="image/*" 
                ref={agentInputRef}
                className="hidden"
                multiple
                onChange={handleAgentImagesUpload}
              />
              
              {agentFiles.length > 0 ? (
                <>
                   <ImageIcon className="w-12 h-12 mb-4 text-blue-500" />
                   <h3 className="text-lg font-semibold text-blue-700">
                     {agentFiles.length} Ảnh Screenshot
                   </h3>
                   <p className="text-sm text-blue-600 mb-2">
                     Đã OCR {agentData.length}/{agentFiles.length} ảnh thành công
                   </p>
                   
                   {/* Image Preview Grid */}
                   <div className="w-full max-h-64 overflow-y-auto mb-4">
                     <div className="grid grid-cols-3 gap-3">
                       {agentFiles.map((file, index) => {
                         const ocrResult = agentOcrResults[index];
                         const imageUrl = agentImages[index];
                         
                         return (
                           <div key={index} className="relative border-2 rounded-lg overflow-hidden bg-white">
                             {/* Image Preview */}
                             {imageUrl && (
                               <img 
                                 src={imageUrl} 
                                 alt={file.name}
                                 className="w-full h-24 object-cover"
                               />
                             )}
                             
                             {/* OCR Status Badge */}
                             <div className="absolute top-1 right-1">
                               {ocrResult?.status === 'processing' && (
                                 <div className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
                                   <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                   Đang xử lý
                                 </div>
                               )}
                               {ocrResult?.status === 'success' && (
                                 <div className="bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
                                   <CheckCircle className="w-3 h-3 mr-1" />
                                   Thành công
                                 </div>
                               )}
                               {ocrResult?.status === 'error' && (
                                 <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center">
                                   <XCircle className="w-3 h-3 mr-1" />
                                   Lỗi
                                 </div>
                               )}
                               {ocrResult?.status === 'pending' && (
                                 <div className="bg-slate-400 text-white text-xs px-2 py-1 rounded-full">
                                   Chờ xử lý
                                 </div>
                               )}
                             </div>
                             
                             {/* File name and extracted data */}
                             <div className="p-2 text-xs">
                               <div className="font-medium truncate">{file.name}</div>
                               {ocrResult?.result && (
                                 <div className="mt-1 text-slate-600">
                                   <div>Mã GD: {ocrResult.result.transactionCode.substring(0, 10)}...</div>
                                   <div>Tiền: {ocrResult.result.amount.toLocaleString('vi-VN')}đ</div>
                                 </div>
                               )}
                               {ocrResult?.error && (
                                 <div className="mt-1 text-red-600 text-xs truncate" title={ocrResult.error}>
                                   {ocrResult.error}
                                 </div>
                               )}
                               {ocrResult?.status === 'error' && (
                                 <button
                                   onClick={() => retryOcr(index)}
                                   className="mt-1 text-xs text-blue-600 hover:underline"
                                 >
                                   Thử lại
                                 </button>
                               )}
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>

                   {/* Progress bar when processing */}
                   {isProcessingAgentFiles && (
                     <div className="w-full mb-4">
                       <div className="flex justify-between text-xs text-blue-600 mb-1">
                         <span>Đang OCR ảnh...</span>
                         <span>{agentMergeProgress}%</span>
                       </div>
                       <div className="w-full bg-blue-200 rounded-full h-2">
                         <div 
                           className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                           style={{ width: `${agentMergeProgress}%` }}
                         ></div>
                       </div>
                     </div>
                   )}
                   
                   <div className="flex space-x-3">
                      <button 
                        onClick={() => agentInputRef.current?.click()}
                        className="px-3 py-1 text-xs font-medium bg-white border border-blue-200 rounded hover:bg-blue-100 text-blue-700"
                        disabled={isProcessingAgentFiles}
                      >
                        <Plus className="w-3 h-3 mr-1 inline" />
                        Thêm ảnh
                      </button>
                      <button 
                        onClick={() => {
                          setAgentFiles([]);
                          setAgentImages([]);
                          setAgentOcrResults([]);
                          setAgentData([]);
                        }}
                        className="px-3 py-1 text-xs font-medium bg-white border border-red-200 rounded hover:bg-red-100 text-red-700"
                        disabled={isProcessingAgentFiles}
                      >
                        <Trash2 className="w-3 h-3 mr-1 inline" />
                        Xóa tất cả
                      </button>
                   </div>
                </>
              ) : (
                <>
                  <ImageIcon className="w-12 h-12 mb-4 text-slate-400" />
                  <h3 className="text-lg font-semibold text-slate-700">Ảnh Screenshot Đại lý</h3>
                  <p className="text-sm text-slate-500 text-center mb-4">
                    Upload ảnh chụp màn hình từ app VNPay<br />
                    Hệ thống sẽ tự động OCR và extract thông tin
                  </p>
                  <div className="text-xs text-indigo-600 mb-6 text-center">
                    📸 Upload nhiều ảnh cùng lúc<br />
                    🤖 Tự động OCR với Gemini AI<br />
                    ✅ Preview kết quả ngay
                  </div>
                  <button 
                    onClick={() => agentInputRef.current?.click()}
                    className="px-4 py-2 rounded-lg font-medium flex items-center bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Upload className="w-4 h-4 mr-2" /> 
                    Chọn ảnh Screenshot
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-8">
            <button 
              disabled={merchantFiles.length === 0 || agentFiles.length === 0 || isProcessingFiles || isProcessingAgentFiles}
              onClick={() => setStep(2)}
              className={`px-8 py-3 rounded-lg font-bold shadow-lg flex items-center transition-all ${(merchantFiles.length === 0 || agentFiles.length === 0 || isProcessingFiles || isProcessingAgentFiles) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'}`}
            >
              {isProcessingFiles || isProcessingAgentFiles ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  Tiếp tục <Play className="w-4 h-4 ml-2 fill-current" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-xl shadow-sm p-12 flex flex-col items-center justify-center min-h-[400px]">
          {!isLoading ? (
             <div className="text-center">
               <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Play className="w-8 h-8 ml-1" />
               </div>
               <h3 className="text-xl font-bold text-slate-800 mb-2">Sẵn sàng xử lý dữ liệu</h3>
               <p className="text-slate-500 mb-6 max-w-md mx-auto">
                 Hệ thống sẽ đối chiếu <strong>{merchantData.length}</strong> giao dịch hệ thống với <strong>{agentData.length}</strong> bill đại lý.
               </p>
               <div className="flex gap-4 justify-center">
                 <button 
                  onClick={() => setStep(1)}
                  className="px-6 py-3 rounded-lg font-medium text-slate-600 hover:bg-slate-100"
                 >
                   Quay lại
                 </button>
                 <button 
                  onClick={handleProcess}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg hover:bg-indigo-700 transition-all transform hover:scale-105"
                 >
                   Bắt đầu Đối soát
                 </button>
               </div>
             </div>
          ) : (
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-6"></div>
              <h3 className="text-xl font-semibold text-slate-700">Đang xử lý...</h3>
              <p className="text-slate-500 mt-2">Đang quét và so khớp dữ liệu...</p>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
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

          {/* Error Type Breakdown - Hiển thị phân loại lỗi chi tiết */}
          {records.filter(r => r.status !== TransactionStatus.MATCHED).length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-amber-600" />
                Phân loại lỗi chi tiết
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-xs text-red-600 font-medium mb-1">Sai số tiền</p>
                  <p className="text-xl font-bold text-red-700">
                    {records.filter(r => r.errorType === 'WRONG_AMOUNT').length}
                  </p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                  <p className="text-xs text-purple-600 font-medium mb-1">Sai điểm bán</p>
                  <p className="text-xl font-bold text-purple-700">
                    {records.filter(r => r.errorType === 'WRONG_POINT_OF_SALE').length}
                  </p>
                </div>
                <div className="text-center p-3 bg-pink-50 rounded-lg border border-pink-100">
                  <p className="text-xs text-pink-600 font-medium mb-1">Sai đại lý</p>
                  <p className="text-xl font-bold text-pink-700">
                    {records.filter(r => r.errorType === 'WRONG_AGENT').length}
                  </p>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <p className="text-xs text-orange-600 font-medium mb-1">Trùng lặp</p>
                  <p className="text-xl font-bold text-orange-700">
                    {records.filter(r => r.errorType === 'DUPLICATE').length}
                  </p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                  <p className="text-xs text-yellow-600 font-medium mb-1">Không tìm thấy</p>
                  <p className="text-xl font-bold text-yellow-700">
                    {records.filter(r => r.errorType === 'MISSING_MERCHANT' || r.errorType === 'MISSING_AGENT' || (!r.errorType && (r.status === TransactionStatus.MISSING_IN_MERCHANT || r.status === TransactionStatus.MISSING_IN_AGENT))).length}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">
                💡 Click vào từng loại lỗi trong bộ lọc để xem chi tiết từng loại
              </p>
            </div>
          )}

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

          {/* Aggregated Data Summary - Hiển thị dữ liệu tổng hợp */}
          {currentSessionData?.aggregatedData && (
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-6 shadow-sm border border-indigo-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-indigo-800 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  Dữ liệu Tổng hợp (Aggregated Data)
                </h3>
                <button
                  onClick={() => setShowAggregatedData(!showAggregatedData)}
                  className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                >
                  {showAggregatedData ? 'Ẩn' : 'Xem chi tiết'}
                  {showAggregatedData ? <X className="w-4 h-4 ml-1" /> : <Eye className="w-4 h-4 ml-1" />}
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white rounded-lg p-3 border border-indigo-200">
                  <p className="text-xs text-slate-600 mb-1">Mã giao dịch</p>
                  <p className="text-lg font-bold text-indigo-700">
                    {Object.keys(currentSessionData.aggregatedData.byTransactionCode || {}).length}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-indigo-200">
                  <p className="text-xs text-slate-600 mb-1">Điểm thu</p>
                  <p className="text-lg font-bold text-indigo-700">
                    {Object.keys(currentSessionData.aggregatedData.byPointOfSale || {}).length}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-indigo-200">
                  <p className="text-xs text-slate-600 mb-1">Đại lý</p>
                  <p className="text-lg font-bold text-indigo-700">
                    {Object.keys(currentSessionData.aggregatedData.byAgent || {}).length}
                  </p>
                </div>
              </div>
              
              {showAggregatedData && (
                <div className="space-y-4 mt-4">
                  {/* By Point of Sale */}
                  {currentSessionData.aggregatedData.byPointOfSale && Object.keys(currentSessionData.aggregatedData.byPointOfSale).length > 0 && (
                    <div className="bg-white rounded-lg p-4 border border-indigo-200">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">Theo Điểm thu</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {Object.entries(currentSessionData.aggregatedData.byPointOfSale).map(([pos, data]) => (
                          <div key={pos} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                            <span className="font-mono text-xs text-slate-600">{pos}</span>
                            <div className="flex items-center space-x-3 text-xs">
                              <span className="text-slate-500">{data.totalTransactions} GD</span>
                              <span className="text-emerald-600 font-medium">{data.matchedCount} khớp</span>
                              <span className="text-red-600 font-medium">{data.errorCount} lỗi</span>
                              <span className="text-slate-700 font-semibold">{data.totalAmount.toLocaleString('vi-VN')}đ</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* By Agent */}
                  {currentSessionData.aggregatedData.byAgent && Object.keys(currentSessionData.aggregatedData.byAgent).length > 0 && (
                    <div className="bg-white rounded-lg p-4 border border-indigo-200">
                      <h4 className="text-sm font-semibold text-slate-700 mb-3">Theo Đại lý</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {Object.entries(currentSessionData.aggregatedData.byAgent).map(([agentId, data]) => {
                          const agent = agents.find(a => a.id === agentId);
                          return (
                            <div key={agentId} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                              <span className="text-slate-700 font-medium">{agent?.name || agentId}</span>
                              <div className="flex items-center space-x-3 text-xs">
                                <span className="text-slate-500">{data.totalTransactions} GD</span>
                                <span className="text-emerald-600 font-medium">{data.matchedCount} khớp</span>
                                <span className="text-red-600 font-medium">{data.errorCount} lỗi</span>
                                <span className="text-slate-700 font-semibold">{data.totalAmount.toLocaleString('vi-VN')}đ</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-slate-500 mt-2">
                    💡 Dữ liệu tổng hợp này được dùng để phát hiện bill bổ sung/quên và tăng tốc độ truy vấn báo cáo
                  </p>
                </div>
              )}
            </div>
          )}

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
        </div>
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