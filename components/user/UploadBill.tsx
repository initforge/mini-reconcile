import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Upload, Image as ImageIcon, CheckCircle, AlertCircle, X, Loader, RefreshCw } from 'lucide-react';
import { extractTransactionFromImage } from '../../services/geminiService';
import { UserService } from '../../src/lib/userServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { Agent, PaymentMethod } from '../../types';

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
  const [agentLinkInput, setAgentLinkInput] = useState('');
  
  // Get user from localStorage
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

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

  // Handle agent link paste
  const handleAgentLinkPaste = () => {
    const match = agentLinkInput.match(/agents=([^&]+)/);
    if (match) {
      const code = match[1];
      const agent = agents.find(a => a.code?.trim().toUpperCase() === code.trim().toUpperCase());
      if (agent) {
        setSearchParams({ agents: agent.code });
        setAgentLinkInput('');
      } else {
        setErrorMessage(`Không tìm thấy đại lý với mã: ${code}`);
      }
    } else {
      setErrorMessage('Link không hợp lệ. Vui lòng dán link từ đại lý.');
    }
  };

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

    try {
      // Create a session ID for this upload batch
      const uploadSessionId = `USER_UPLOAD_${Date.now()}_${userId.substring(0, 8)}`;
      
      // Process each bill using pre-extracted OCR data (single source of truth)
      for (let i = 0; i < readyBills.length; i++) {
        const preview = readyBills[i];
        const ocrResult = preview.ocrResult!; // Already checked above
        
        try {
          // Convert object URL to base64 for storage
          const base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(preview.file);
          });

          // Check duplicate transaction code globally
          const isDuplicate = await UserService.checkTransactionCodeExists(ocrResult.transactionCode);
          if (isDuplicate) {
            throw new Error(`File ${preview.file.name}: Mã giao dịch ${ocrResult.transactionCode} đã tồn tại`);
          }

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
            uploadSessionId, // Link all bills in this batch to the same session
            createdAt: FirebaseUtils.getServerTimestamp()
          };

          await UserService.createUserBill(billData);
          successCount++;
        } catch (error: any) {
          errorCount++;
          errors.push(error.message || `File ${preview.file.name}: Lỗi không xác định`);
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

      // Reset form if all successful
      if (errorCount === 0) {
        // Cleanup object URLs before clearing
        billPreviews.forEach(preview => {
          if (preview.objectUrl && preview.objectUrl.startsWith('blob:')) {
            URL.revokeObjectURL(preview.objectUrl);
          }
        });
        setBillPreviews([]);
        if (document.getElementById('file-input') as HTMLInputElement) {
          (document.getElementById('file-input') as HTMLInputElement).value = '';
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
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {!selectedAgent ? (
          <>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Chọn đại lý để upload bill</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Dán link từ đại lý
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={agentLinkInput}
                  onChange={(e) => setAgentLinkInput(e.target.value)}
                  placeholder="/user/upbill?agents=AG_test"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  onClick={handleAgentLinkPaste}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </>
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
    </div>
  );
};

export default UploadBill;

