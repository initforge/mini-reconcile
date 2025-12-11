import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Upload, Image as ImageIcon, CheckCircle, AlertCircle, X, Loader, RefreshCw, HelpCircle, ExternalLink, Trash2, Calendar, Search, Filter } from 'lucide-react';
import { extractTransactionFromImage } from '../../services/geminiService';
import { UserService } from '../../src/lib/userServices';
import { ReportService } from '../../src/lib/reportServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { Agent, PaymentMethod, UserBill, ReportRecord } from '../../types';
import Pagination from '../Pagination';

type BillPreview = {
  file: File;
  preview: string; // Object URL (will be revoked on cleanup)
  objectUrl: string; // Store separately for cleanup
  ocrStatus: 'idle' | 'processing' | 'done' | 'error';
  ocrResult?: {
    transactionCode: string;
    amount: number;
    paymentMethod: PaymentMethod;
    pointOfSaleName?: string;
    timestamp: string;
    invoiceNumber?: string;
  };
  ocrError?: string;
};

const UploadBill: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const agentCode = searchParams.get('agents');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  
  // Get user from localStorage
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;
  
  // Load Gemini API key from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('payreconcile:geminiApiKey');
    if (stored) {
      setGeminiApiKey(stored);
    }
  }, []);

  // Load agents to validate
  const { data: agentsData, loading: agentsLoading, error: agentsError } = useRealtimeData<Record<string, Agent>>('/agents');
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const normalizedCode = agentCode?.trim().toUpperCase();
  const selectedAgent = agents.find(a => a.code?.trim().toUpperCase() === normalizedCode);

  const [billPreviews, setBillPreviews] = useState<BillPreview[]>([]);
  const ocrConcurrencyLimit = 5; // Increased from 3 to 5 for faster processing
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ total: number; completed: number }>({ total: 0, completed: 0 });

  useEffect(() => {
    if (!userId) {
      navigate('/user/login');
      return;
    }

    // Reset state when agentCode changes
    if (!agentCode) {
      setErrorMessage('Thiếu mã đại lý. Vui lòng sử dụng link từ đại lý.');
      return;
    }

    // Still loading - don't show error yet
    if (agentsLoading) {
      setErrorMessage('');
      return;
    }

    // Load failed - show different error
    if (agentsError) {
      setErrorMessage('Không thể tải danh sách đại lý. Vui lòng thử lại.');
      return;
    }

    // Data loaded - check if agent exists
    const normalizedCode = agentCode.trim().toUpperCase();
    const foundAgent = agents.find(a => a.code?.trim().toUpperCase() === normalizedCode);

    if (foundAgent) {
      setErrorMessage(''); // Clear error when agent found
    } else {
      setErrorMessage(`Không tìm thấy đại lý với mã: ${agentCode}`);
    }
  }, [agentCode, agentsData, agentsLoading, agentsError, agents, userId, navigate]);


  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      setBillPreviews(prev => {
        prev.forEach(preview => {
          if (preview.objectUrl && preview.objectUrl.startsWith('blob:')) {
            URL.revokeObjectURL(preview.objectUrl);
          }
        });
        return prev;
      });
    };
  }, []);

  const processOCR = async (index: number) => {
    if (!selectedAgent) return;
    
    // Check if Gemini API key is set
    if (!geminiApiKey.trim()) {
      setBillPreviews(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            ocrStatus: 'error',
            ocrError: 'Vui lòng dán Gemini API key trước khi OCR'
          };
        }
        return updated;
      });
      return;
    }

    // Get preview data first
    let preview: BillPreview | undefined;
    setBillPreviews(prev => {
      if (prev[index]?.ocrStatus !== 'idle') {
        preview = undefined;
        return prev;
      }
      const updated = [...prev];
      updated[index] = { ...updated[index], ocrStatus: 'processing' };
      preview = updated[index];
      return updated;
    });

    if (!preview) return;

    try {
      // Convert object URL to base64 if needed
      let base64Data: string;
      if (preview.preview.startsWith('blob:')) {
        // Object URL - need to convert to base64
        const response = await fetch(preview.preview);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(blob);
        });
      } else {
        base64Data = preview.preview.includes(',') 
          ? preview.preview.split(',')[1] 
          : preview.preview;
      }

      // Call OCR with timeout
      const ocrPromise = extractTransactionFromImage(base64Data, selectedAgent.id);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OCR timeout sau 30 giây')), 30000)
      );
      
      const extracted = await Promise.race([ocrPromise, timeoutPromise]) as any;
      const paymentMethod = extracted.paymentMethod as PaymentMethod;

      if (!paymentMethod) {
        throw new Error('Không thể xác định loại bill');
      }

      // Update with success
      setBillPreviews(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            ocrStatus: 'done',
            ocrResult: {
              transactionCode: extracted.transactionCode,
              amount: extracted.amount,
              paymentMethod,
              pointOfSaleName: extracted.pointOfSaleName,
              timestamp: extracted.timestamp,
              invoiceNumber: extracted.invoiceNumber
            },
            ocrError: undefined
          };
        }
        return updated;
      });
    } catch (error: any) {
      // Update with error
      setBillPreviews(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            ocrStatus: 'error',
            ocrError: error.message || 'Lỗi không xác định'
          };
        }
        return updated;
      });
    }
  };

  // Track which indices are already being processed to avoid duplicate triggers
  const processingIndicesRef = useRef<Set<number>>(new Set());

  // Auto-trigger OCR when new idle items are added
  useEffect(() => {
    if (!selectedAgent) return;
    
    const idleIndices = billPreviews
      .map((p, i) => ({ preview: p, index: i }))
      .filter(({ preview, index }) => 
        preview.ocrStatus === 'idle' && !processingIndicesRef.current.has(index)
      )
      .map(({ index }) => index);

    if (idleIndices.length > 0) {
      console.log(`🚀 Auto-triggering OCR for ${idleIndices.length} idle images`);
      
      // Mark as processing
      idleIndices.forEach(idx => processingIndicesRef.current.add(idx));
      
      // Process in batches with concurrency limit
      for (let i = 0; i < idleIndices.length; i += ocrConcurrencyLimit) {
        const batch = idleIndices.slice(i, i + ocrConcurrencyLimit);
        // Process batch in parallel (fire and forget)
        batch.forEach((index, batchIdx) => {
          // Use setTimeout to ensure state is updated and stagger requests
          setTimeout(() => {
            processOCR(index).finally(() => {
              // Remove from processing set when done
              processingIndicesRef.current.delete(index);
            });
          }, (i + batchIdx) * 100); // Stagger by 100ms per item
        });
      }
    }
  }, [billPreviews.length, selectedAgent]); // Only trigger on length change, not status changes

  const retryOCR = (index: number) => {
    setBillPreviews(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ocrStatus: 'idle', ocrError: undefined };
      return updated;
    });
    // Process this specific index
    setTimeout(() => processOCR(index), 0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files
    const invalidFiles: string[] = [];
    const validFiles: File[] = [];

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        invalidFiles.push(file.name);
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        invalidFiles.push(`${file.name} (quá lớn)`);
        return;
      }

      validFiles.push(file);
    });

    if (invalidFiles.length > 0) {
      setErrorMessage(`Các file không hợp lệ: ${invalidFiles.join(', ')}`);
      return;
    }

    setErrorMessage('');
    setUploadStatus('idle');

    // Create previews with object URLs and trigger OCR
    const newPreviews: BillPreview[] = validFiles.map((file) => {
      const objectUrl = URL.createObjectURL(file);
      return {
        file,
        preview: objectUrl,
        objectUrl,
        ocrStatus: 'idle' as const
      };
    });

    setBillPreviews(prev => [...prev, ...newPreviews]);
    // OCR will auto-trigger via useEffect when billPreviews updates
  };

  const handleUpload = async () => {
    // Filter out images that are still processing or have errors
    const readyBills = billPreviews.filter(p => p.ocrStatus === 'done' && p.ocrResult);
    const processingBills = billPreviews.filter(p => p.ocrStatus === 'processing');
    const errorBills = billPreviews.filter(p => p.ocrStatus === 'error');

    if (readyBills.length === 0) {
      if (processingBills.length > 0) {
        setErrorMessage('Vui lòng đợi OCR hoàn tất cho tất cả ảnh');
      } else if (errorBills.length > 0) {
        setErrorMessage('Vui lòng sửa lỗi OCR hoặc thử lại cho các ảnh bị lỗi');
      } else {
        setErrorMessage('Vui lòng chọn ít nhất một ảnh bill');
      }
      return;
    }

    if (!selectedAgent || !userId) {
      setErrorMessage('Thiếu thông tin đại lý hoặc người dùng');
      return;
    }

    setIsUploading(true);
    setErrorMessage('');
    setSuccessMessage('');
    setUploadStatus('idle');
    setUploadProgress({ total: readyBills.length, completed: 0 });

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const successfullyUploadedCodes = new Set<string>(); // Track successfully uploaded transaction codes

    try {
      // Create a session ID for this upload batch
      const uploadSessionId = `USER_UPLOAD_${Date.now()}_${userId.substring(0, 8)}`;
      
      // Process each bill using pre-extracted OCR data (single source of truth)
      for (let i = 0; i < readyBills.length; i++) {
        const preview = readyBills[i];
        const ocrResult = preview.ocrResult!;
        
        try {
          // Check for duplicate transaction code
          const existingBill = await UserService.findBillByTransactionCode(ocrResult.transactionCode);
          if (existingBill) {
            errorCount++;
            const errorMsg = `Bill số ${existingBill.invoiceNumber || existingBill.transactionCode} với mã giao dịch ${ocrResult.transactionCode} đã tồn tại trên hệ thống (Bill ID: ${existingBill.id})`;
            errors.push(errorMsg);
            alert(`⚠️ Bill trùng lặp!\n\n${errorMsg}\n\nVui lòng kiểm tra lại.`);
            console.warn(`⚠️ Duplicate bill detected: ${ocrResult.transactionCode}`);
            continue;
          }

          // Convert object URL to base64 for storage
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(preview.file);
          });

          // Create user bill with session ID
          const billData = {
            userId,
            agentId: selectedAgent.id,
            agentCode: selectedAgent.code,
            transactionCode: ocrResult.transactionCode,
            amount: ocrResult.amount,
            paymentMethod: ocrResult.paymentMethod,
            pointOfSaleName: ocrResult.pointOfSaleName,
            imageUrl: base64Data,
            timestamp: ocrResult.timestamp,
            invoiceNumber: ocrResult.invoiceNumber,
            status: 'PENDING' as const,
            isPaidByAgent: false,
            uploadSessionId,
            createdAt: FirebaseUtils.getServerTimestamp()
          };

          await UserService.createUserBill(billData);
          successCount++;
          successfullyUploadedCodes.add(ocrResult.transactionCode);
          console.log(`✅ Uploaded bill ${i + 1}/${readyBills.length}: ${ocrResult.transactionCode}`);
        } catch (error: any) {
          errorCount++;
          const errorMsg = error.message || `File ${preview.file.name}: Lỗi không xác định`;
          errors.push(errorMsg);
          console.error(`❌ Failed to upload bill ${i + 1}/${readyBills.length} (${preview.file.name}):`, error);
        }

        setUploadProgress({ total: readyBills.length, completed: i + 1 });
      }

      // Show results
      if (successCount > 0) {
        setUploadStatus('success');
        setSuccessMessage(`Đã upload thành công ${successCount}/${readyBills.length} bill${successCount > 1 ? 's' : ''}`);
      }

      if (errorCount > 0) {
        setErrorMessage(`Có ${errorCount} file lỗi:\n${errors.join('\n')}`);
      }

      // Remove uploaded bills from preview (keep duplicates and errors)
      if (successCount > 0) {
        setBillPreviews(prev => {
          const remaining = prev.filter(p => {
            if (p.ocrStatus === 'done' && p.ocrResult) {
              // Keep bills that were NOT successfully uploaded
              return !successfullyUploadedCodes.has(p.ocrResult.transactionCode);
            }
            return true; // Keep processing/error bills
          });

          // Cleanup object URLs of uploaded bills
          prev.forEach(preview => {
            if (preview.ocrStatus === 'done' && preview.ocrResult) {
              if (successfullyUploadedCodes.has(preview.ocrResult.transactionCode)) {
                if (preview.objectUrl && preview.objectUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(preview.objectUrl);
                }
              }
            }
          });

          return remaining;
        });

        // Clear file input if all bills uploaded
        if (billPreviews.filter(p => p.ocrStatus === 'done' && p.ocrResult).length === 0) {
          if (document.getElementById('file-input') as HTMLInputElement) {
            (document.getElementById('file-input') as HTMLInputElement).value = '';
          }
        }
      }
    } catch (error: any) {
      setUploadStatus('error');
      setErrorMessage(error.message || 'Đã xảy ra lỗi khi upload bill');
    } finally {
      setIsUploading(false);
    }
  };

  if (!userId) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Up Bill</h2>
      </div>

      {/* Agent Selection / Info - Unified Panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        {!selectedAgent ? (
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Chọn đại lý để upload bill</h3>
            <p className="text-sm text-slate-600 mb-4">
              Vui lòng sử dụng link từ đại lý với tham số ?agents=AG_XXX để chọn đại lý.
            </p>
            </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <span className="text-indigo-600 font-bold">{selectedAgent.code}</span>
              </div>
              <div>
                <h3 className="font-semibold text-indigo-900">{selectedAgent.name}</h3>
                <p className="text-sm text-indigo-600">Mã đại lý: {selectedAgent.code}</p>
              </div>
            </div>
            <button
              onClick={() => {
                setSearchParams({});
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Chọn đại lý khác
            </button>
          </div>
        )}
        
        {/* Gemini API Key Input - Always visible */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">
              Gemini API key
            </label>
            <a
              href="https://www.youtube.com/watch?v=JZCjL3hrvcY"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 rounded-lg transition-colors text-sm font-medium border border-indigo-200 hover:border-indigo-300"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Hướng dẫn lấy API key</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => {
              const value = e.target.value;
              setGeminiApiKey(value);
              localStorage.setItem('payreconcile:geminiApiKey', value);
            }}
            placeholder="Nhập Gemini API key từ Google AI Studio (VD: AIzaSy...)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            API key để sử dụng tính năng OCR đọc ảnh VNPay. 
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline ml-1">
              Lấy API key tại đây
            </a>
          </p>
          {!geminiApiKey.trim() && (
            <p className="text-xs text-red-600 mt-1">
              ⚠️ Vui lòng dán Gemini API key trước khi upload ảnh để sử dụng OCR
            </p>
          )}
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-600">{errorMessage}</p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <p className="text-green-600">{successMessage}</p>
        </div>
      )}

      {/* Upload Area */}
      <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-12 text-center hover:border-indigo-400 transition-colors">
        {billPreviews.length === 0 ? (
          <>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-slate-400" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Chọn ảnh bill để upload</h3>
            <p className="text-sm text-slate-500 mb-4">
              Hỗ trợ: JPG, PNG (tối đa 5MB mỗi file). Có thể chọn nhiều ảnh cùng lúc.
            </p>
            <label
              htmlFor="file-input"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer transition-colors"
            >
              <ImageIcon className="w-5 h-5 mr-2" />
              Chọn ảnh
            </label>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        ) : (
          <div className="space-y-6">
            {/* Preview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {billPreviews.map((preview, index) => (
                <div key={index} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="relative">
                    <img
                      src={preview.preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-48 object-cover rounded-lg border border-slate-200"
                    />
                    <button
                      onClick={() => {
                        // Cleanup object URL before removing
                        if (preview.objectUrl && preview.objectUrl.startsWith('blob:')) {
                          URL.revokeObjectURL(preview.objectUrl);
                        }
                        setBillPreviews(prev => prev.filter((_, i) => i !== index));
                      }}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {/* OCR Status Indicator */}
                    <div className="absolute top-2 left-2">
                      {preview.ocrStatus === 'processing' && (
                        <div className="bg-blue-500 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                          <Loader className="w-3 h-3 animate-spin" />
                          <span>Đang OCR...</span>
                        </div>
                      )}
                      {preview.ocrStatus === 'done' && (
                        <div className="bg-green-500 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Hoàn thành</span>
                        </div>
                      )}
                      {preview.ocrStatus === 'error' && (
                        <div className="bg-red-500 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Lỗi</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 truncate">{preview.file.name}</p>
                  
                  {/* OCR Results */}
                  {preview.ocrStatus === 'done' && preview.ocrResult && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                      <div className="font-semibold text-green-900 mb-1">Thông tin đã trích xuất:</div>
                      <div className="space-y-1 text-green-800">
                        <div>Mã GD: <span className="font-mono">{preview.ocrResult.transactionCode}</span></div>
                        <div>Số tiền: <span className="font-semibold">{preview.ocrResult.amount.toLocaleString('vi-VN')} ₫</span></div>
                        <div>Loại: {preview.ocrResult.paymentMethod}</div>
                        {preview.ocrResult.pointOfSaleName && (
                          <div>Điểm thu: {preview.ocrResult.pointOfSaleName}</div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* OCR Error with Retry */}
                  {preview.ocrStatus === 'error' && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                      <div className="text-red-800 mb-2">{preview.ocrError || 'Lỗi OCR'}</div>
                      <button
                        onClick={() => retryOCR(index)}
                        className="w-full px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 flex items-center justify-center space-x-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Thử lại OCR</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">
                    Đang xử lý: {uploadProgress.completed}/{uploadProgress.total}
                  </span>
                  <span className="text-sm text-blue-600">
                    {Math.round((uploadProgress.completed / uploadProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.completed / uploadProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-center space-x-3">
              <button
                onClick={handleUpload}
                disabled={isUploading || !selectedAgent || billPreviews.some(p => p.ocrStatus === 'processing') || billPreviews.filter(p => p.ocrStatus === 'done').length === 0}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isUploading ? (
                  <>
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    Upload {billPreviews.filter(p => p.ocrStatus === 'done').length} Bill{billPreviews.filter(p => p.ocrStatus === 'done').length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
              <label
                htmlFor="file-input"
                className="inline-flex items-center px-6 py-3 border border-slate-300 text-base font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Thêm ảnh
              </label>
              <button
                onClick={() => {
                  // Cleanup all object URLs
                  billPreviews.forEach(preview => {
                    if (preview.objectUrl && preview.objectUrl.startsWith('blob:')) {
                      URL.revokeObjectURL(preview.objectUrl);
                    }
                  });
                  setBillPreviews([]);
                  if (document.getElementById('file-input') as HTMLInputElement) {
                    (document.getElementById('file-input') as HTMLInputElement).value = '';
                  }
                }}
                className="inline-flex items-center px-6 py-3 border border-slate-300 text-base font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 transition-colors"
              >
                Xóa tất cả
              </button>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Hướng dẫn:</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Chụp ảnh rõ ràng màn hình thanh toán (VNPay, PhonePOS, VietinBank, Sofpos)</li>
          <li>Đảm bảo ảnh có đầy đủ thông tin: Mã giao dịch, Số tiền, Điểm thu</li>
          <li>Hệ thống sẽ tự động nhận diện loại bill và trích xuất thông tin</li>
        </ul>
      </div>

      {/* Lịch sử up bill - Gộp chung với Tab Up bill */}
      <BillHistorySection userId={userId} />
    </div>
  );
};

// Component riêng cho Lịch sử up bill
const BillHistorySection: React.FC<{ userId: string | null }> = ({ userId }) => {
  const { data: billsData } = useRealtimeData<Record<string, UserBill>>('/user_bills');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: reportRecordsData } = useRealtimeData<Record<string, ReportRecord>>('/report_records');
  
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const allBills = FirebaseUtils.objectToArray(billsData || {});
  
  // Filter states
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Delete confirmation state
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Get user's bills
  const userBills = useMemo(() => {
    if (!userId) return [];
    return allBills.filter(bill => bill.userId === userId);
  }, [allBills, userId]);
  
  // Filter agents that have bills for this user
  const agentsWithBills = useMemo(() => {
    if (!userId) return [];
    return agents.filter(agent => {
      return userBills.some(bill => bill.agentId === agent.id);
    });
  }, [agents, userBills, userId]);
  
  // Load report records to check status
  const [reportRecordsFromDB, setReportRecordsFromDB] = useState<ReportRecord[]>([]);
  
  useEffect(() => {
    const loadReportRecords = async () => {
      if (!userId) return;
      
      try {
        const result = await ReportService.getAllReportRecordsWithMerchants({
          userId,
          dateFrom: undefined,
          dateTo: undefined,
          status: undefined,
          agentId: undefined,
          agentCode: undefined,
          pointOfSaleName: undefined
        }, {
          limit: 10000
        });
        
        setReportRecordsFromDB(result.records);
      } catch (error) {
        console.error('[BillHistorySection] Error loading report records:', error);
      }
    };
    
    loadReportRecords();
  }, [userId]);
  
  // Map billId -> ReportRecord
  const reportRecordsByBillId = useMemo(() => {
    const map: Record<string, ReportRecord> = {};
    reportRecordsFromDB.forEach((record: ReportRecord) => {
      if (record.userBillId) {
        map[record.userBillId] = record;
      }
    });
    return map;
  }, [reportRecordsFromDB]);
  
  // Filter bills
  const filteredBills = useMemo(() => {
    let filtered = userBills;
    
    // Filter by agent
    if (selectedAgentId !== 'all') {
      filtered = filtered.filter(bill => bill.agentId === selectedAgentId);
    }
    
    // Filter by date
    if (dateFrom || dateTo) {
      filtered = filtered.filter(bill => {
        const billDate = bill.createdAt || bill.transactionDate;
        if (!billDate) return true;
        try {
          const dateStr = typeof billDate === 'string' ? billDate : billDate.toISOString();
          const date = dateStr.split('T')[0];
          if (dateFrom && date < dateFrom) return false;
          if (dateTo && date > dateTo) return false;
          return true;
        } catch {
          return true;
        }
      });
    }
    
    return filtered;
  }, [userBills, selectedAgentId, dateFrom, dateTo]);
  
  // Sort by date (newest first)
  const sortedBills = useMemo(() => {
    return [...filteredBills].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [filteredBills]);
  
  // Paginate
  const totalPages = Math.ceil(sortedBills.length / itemsPerPage);
  const paginatedBills = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedBills.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedBills, currentPage, itemsPerPage]);
  
  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? agent.name : 'N/A';
  };
  
  const getAgentCode = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? agent.code : 'N/A';
  };
  
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const getStatusBadge = (bill: UserBill) => {
    const reportRecord = reportRecordsByBillId[bill.id];
    
    if (reportRecord) {
      const status = reportRecord.reconciliationStatus || reportRecord.status;
      switch (status) {
        case 'MATCHED':
        case 'DONE':
          return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Đã đối soát</span>;
        case 'ERROR':
          return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Lỗi đối soát</span>;
        case 'UNMATCHED':
          return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Chưa khớp</span>;
        case 'PENDING':
          return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Chờ đối soát</span>;
        default:
          return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Đã đối soát</span>;
      }
    }
    
    switch (bill.status) {
      case 'MATCHED':
      case 'DONE':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Đã đối soát</span>;
      case 'ERROR':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Lỗi</span>;
      case 'PENDING':
      default:
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Chờ đối soát</span>;
    }
  };
  
  const isBillLocked = (bill: UserBill): boolean => {
    // Chỉ khóa khi đại lý đã đối soát (đã thanh toán cho user)
    // Không khóa khi chỉ khớp với merchants
    return bill.agentPaymentStatus === 'PAID';
  };
  
  const handleDeleteBill = (billId: string) => {
    setDeletingBillId(billId);
  };
  
  const handleConfirmDelete = async () => {
    if (!deletingBillId) return;
    
    setIsDeleting(true);
    try {
      await UserService.deleteUserBill(deletingBillId);
      setDeletingBillId(null);
      setCurrentPage(1); // Reset to first page after deletion
    } catch (error: any) {
      console.error('Error deleting bill:', error);
      alert('Có lỗi khi xóa bill. Vui lòng thử lại.');
    } finally {
      setIsDeleting(false);
    }
  };
  
  if (!userId) {
    return null;
  }
  
  return (
    <div className="space-y-6 mt-12">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Lịch sử up bill</h2>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Từ ngày</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Đến ngày</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Đại lý</label>
            <select
              value={selectedAgentId}
              onChange={(e) => {
                setSelectedAgentId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Tất cả đại lý</option>
              {agentsWithBills.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name} ({agent.code})</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Bills Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Đại lý</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Ngày</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Mã GD</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Số tiền</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Loại bill</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Điểm thu</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {paginatedBills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    Không có bill nào
                  </td>
                </tr>
              ) : (
                paginatedBills.map((bill) => {
                  const locked = isBillLocked(bill);
                  return (
                    <tr key={bill.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{getAgentName(bill.agentId)}</div>
                          <div className="text-sm text-slate-500">{getAgentCode(bill.agentId)}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {formatDate(bill.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                        {bill.transactionCode}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {formatAmount(bill.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {bill.paymentMethod}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {bill.pointOfSaleName || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(bill)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {!locked && (
                          <button
                            onClick={() => handleDeleteBill(bill.id)}
                            className="p-2 rounded-lg transition-colors text-red-600 hover:bg-red-50"
                            title="Thu hồi bill"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {locked && (
                          <span className="text-xs text-slate-400">Đã khóa</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {sortedBills.length > 0 && (
          <div className="bg-white px-6 py-4 border-t border-slate-200">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      {deletingBillId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Xác nhận thu hồi</h3>
            </div>
            
            <p className="text-slate-600 mb-6">
              Bạn có chắc chắn muốn thu hồi bill này? Bill sẽ bị xóa khỏi hệ thống và mã giao dịch có thể được sử dụng lại cho đại lý khác. Hành động này không thể hoàn tác.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingBillId(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Đang xóa...' : 'Thu hồi'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadBill;

