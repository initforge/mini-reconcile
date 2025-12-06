import React from 'react';
import { X, AlertTriangle, Upload, XCircle } from 'lucide-react';

export interface DuplicateBill {
  fileName: string;
  transactionCode: string;
}

export interface DuplicateBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  duplicateBills: DuplicateBill[];
  validBillsCount: number;
}

const DuplicateBillsModal: React.FC<DuplicateBillsModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  duplicateBills,
  validBillsCount
}) => {
  // Debug log
  React.useEffect(() => {
    if (isOpen) {
      console.log('📋 DuplicateBillsModal opened:', {
        duplicateCount: duplicateBills.length,
        validCount: validBillsCount,
        duplicates: duplicateBills
      });
    }
  }, [isOpen, duplicateBills, validBillsCount]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-black bg-opacity-60" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border-4 border-amber-400">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">
                  Phát hiện mã giao dịch trùng lặp
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-4">
                Phát hiện <span className="font-semibold text-amber-600">{duplicateBills.length}</span> bill bị trùng mã giao dịch và sẽ <span className="font-semibold text-red-600">KHÔNG được upload</span>.
                {validBillsCount > 0 ? (
                  <span className="block mt-2">
                    Vẫn còn <span className="font-semibold text-green-600">{validBillsCount} bill</span> hợp lệ có thể upload.
                  </span>
                ) : (
                  <span className="block mt-2 font-semibold text-red-600">
                    Tất cả bills đều bị trùng! Không có bill nào có thể upload.
                  </span>
                )}
              </p>

              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 max-h-80 overflow-y-auto">
                <div className="flex items-center space-x-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <p className="text-sm font-bold text-amber-900">Danh sách bills bị trùng:</p>
                </div>
                <ul className="space-y-3">
                  {duplicateBills.map((bill, index) => (
                    <li key={index} className="flex items-start space-x-3 text-sm bg-white p-3 rounded-lg border border-amber-200 shadow-sm">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900 mb-1">{bill.fileName}</div>
                        <div className="text-slate-600">
                          <span className="font-medium">Mã giao dịch: </span>
                          <span className="font-mono text-amber-900 bg-amber-100 px-2 py-0.5 rounded">{bill.transactionCode}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`rounded-lg p-4 mb-4 ${validBillsCount > 0 ? 'bg-blue-50 border-2 border-blue-300' : 'bg-red-50 border-2 border-red-300'}`}>
              <div className="flex items-start space-x-2">
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${validBillsCount > 0 ? 'text-blue-600' : 'text-red-600'}`} />
                <div>
                  <p className={`text-sm font-semibold ${validBillsCount > 0 ? 'text-blue-900' : 'text-red-900'} mb-1`}>
                    {validBillsCount > 0 ? 'Thông báo' : 'Cảnh báo'}
                  </p>
                  <p className={`text-xs ${validBillsCount > 0 ? 'text-blue-800' : 'text-red-800'}`}>
                    {validBillsCount > 0 ? (
                      <>
                        Các bill bị trùng sẽ <strong>KHÔNG được upload</strong> vào hệ thống. 
                        Bạn có thể tiếp tục upload <strong>{validBillsCount} bill hợp lệ</strong> còn lại hoặc hủy để kiểm tra lại.
                      </>
                    ) : (
                      <>
                        <strong>TẤT CẢ bills đều bị trùng mã giao dịch!</strong> Không có bill nào có thể được upload. 
                        Vui lòng kiểm tra lại các file đã chọn hoặc liên hệ admin nếu cần hỗ trợ.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            {validBillsCount > 0 ? (
              <button
                onClick={onContinue}
                className="w-full inline-flex justify-center items-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:ml-3 sm:w-auto sm:text-sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                Tiếp tục upload {validBillsCount} bill hợp lệ
              </button>
            ) : (
              <button
                onClick={onClose}
                className="w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Đã hiểu
              </button>
            )}
            <button
              onClick={onClose}
              className={`mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 sm:mt-0 ${validBillsCount > 0 ? 'sm:ml-3' : 'sm:ml-3 sm:w-auto'} sm:text-sm`}
            >
              {validBillsCount > 0 ? 'Hủy' : 'Đóng'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuplicateBillsModal;

