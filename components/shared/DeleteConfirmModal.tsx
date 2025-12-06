import React, { useState, useEffect } from 'react';
import { X, Trash2, Archive, AlertTriangle } from 'lucide-react';
import { DeletionService, type DeletionStats } from '../../src/lib/deletionService';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (deleteType: 'cascade' | 'soft') => Promise<void>;
  entityType: 'user' | 'agent';
  entityName: string;
  entityId: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  entityType,
  entityName,
  entityId
}) => {
  const [deleteType, setDeleteType] = useState<'cascade' | 'soft'>('soft');
  const [stats, setStats] = useState<DeletionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (isOpen && entityId) {
      loadStats();
    }
  }, [isOpen, entityId]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const statsData = entityType === 'user'
        ? await DeletionService.countUserRelatedData(entityId)
        : await DeletionService.countAgentRelatedData(entityId);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading deletion stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(deleteType);
      onClose();
    } catch (error) {
      console.error('Error during deletion:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalItems = stats
    ? stats.bills + stats.reportRecords + stats.payments + (stats.sessions || 0) + (stats.adminPayments || 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-slate-500 bg-opacity-75" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">
                  Xác nhận xóa {entityType === 'user' ? 'khách hàng' : 'đại lý'}
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
              <p className="text-sm text-slate-600 mb-2">
                Bạn đang xóa: <span className="font-semibold text-slate-900">{entityName}</span>
              </p>
              
              {loadingStats ? (
                <div className="text-sm text-slate-500">Đang tải thống kê...</div>
              ) : stats ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 mb-2">
                        Dữ liệu liên quan sẽ bị ảnh hưởng:
                      </p>
                      <ul className="text-sm text-amber-700 space-y-1">
                        <li>• {stats.bills} hóa đơn</li>
                        <li>• {stats.reportRecords} báo cáo đối soát</li>
                        <li>• {stats.payments} thanh toán</li>
                        {entityType === 'agent' && stats.sessions !== undefined && (
                          <li>• {stats.sessions} phiên đối soát</li>
                        )}
                        {entityType === 'agent' && stats.adminPayments !== undefined && (
                          <li>• {stats.adminPayments} thanh toán từ admin</li>
                        )}
                      </ul>
                      <p className="text-xs text-amber-600 mt-2">
                        Tổng cộng: <span className="font-semibold">{totalItems} mục dữ liệu</span>
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Delete Type Selection */}
            <div className="space-y-3 mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Chọn phương thức xóa:
              </label>

              {/* Soft Delete Option */}
              <div
                onClick={() => setDeleteType('soft')}
                className={`cursor-pointer border-2 rounded-lg p-4 transition-all ${
                  deleteType === 'soft'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                      deleteType === 'soft'
                        ? 'border-indigo-500 bg-indigo-500'
                        : 'border-slate-300'
                    }`}
                  >
                    {deleteType === 'soft' && (
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <Archive className="w-4 h-4 text-indigo-600" />
                      <span className="font-semibold text-slate-900">Xóa mềm (Khuyến nghị)</span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Đánh dấu {entityType === 'user' ? 'khách hàng' : 'đại lý'} đã xóa nhưng giữ lại tất cả dữ liệu lịch sử.
                      Có thể khôi phục sau này.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cascade Delete Option */}
              <div
                onClick={() => setDeleteType('cascade')}
                className={`cursor-pointer border-2 rounded-lg p-4 transition-all ${
                  deleteType === 'cascade'
                    ? 'border-red-500 bg-red-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                      deleteType === 'cascade'
                        ? 'border-red-500 bg-red-500'
                        : 'border-slate-300'
                    }`}
                  >
                    {deleteType === 'cascade' && (
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <Trash2 className="w-4 h-4 text-red-600" />
                      <span className="font-semibold text-slate-900">Xóa hoàn toàn</span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Xóa {entityType === 'user' ? 'khách hàng' : 'đại lý'} và tất cả dữ liệu liên quan ({totalItems} mục).
                      <span className="text-red-600 font-medium"> Hành động này không thể hoàn tác!</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              onClick={handleConfirm}
              disabled={loading || loadingStats}
              className={`
                w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:ml-3 sm:w-auto sm:text-sm
                ${deleteType === 'cascade'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang xử lý...
                </span>
              ) : (
                <>
                  {deleteType === 'cascade' ? 'Xóa hoàn toàn' : 'Xóa mềm'}
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;

