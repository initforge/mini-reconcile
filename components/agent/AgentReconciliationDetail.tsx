import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { AgentReconciliationService } from '../../src/lib/agentReconciliationServices';
import type { ReconciliationRecord } from '../../types';
import { TransactionStatus } from '../../types';

const AgentReconciliationDetail: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;

  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'error' | 'matched'>('all');
  const recordsPerPage = 50;

  useEffect(() => {
    if (!agentId || !sessionId) {
      navigate('/agent/history');
      return;
    }

    loadRecords();
  }, [agentId, sessionId, navigate]);

  const loadRecords = async () => {
    if (!agentId || !sessionId) return;

    setLoading(true);
    setError(null);
    try {
      const data = await AgentReconciliationService.getReconciliationRecordsBySession(sessionId, agentId);
      setRecords(data);
    } catch (err: any) {
      console.error('Error loading records:', err);
      setError(err.message || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
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

  const getStatusBadge = (status: TransactionStatus) => {
    switch (status) {
      case TransactionStatus.MATCHED:
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Khớp</span>;
      case TransactionStatus.ERROR_AMOUNT:
      case TransactionStatus.ERROR_DUPLICATE:
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Lỗi</span>;
      case TransactionStatus.MISSING_IN_MERCHANT:
      case TransactionStatus.MISSING_IN_AGENT:
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Thiếu</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-800 rounded-full text-xs font-medium">Chờ xử lý</span>;
    }
  };

  // Filter records
  const filteredRecords = React.useMemo(() => {
    return records.filter(r => {
      if (filter === 'error') return r.status !== TransactionStatus.MATCHED;
      if (filter === 'matched') return r.status === TransactionStatus.MATCHED;
      return true;
    });
  }, [records, filter]);

  // Paginate filtered records
  const paginatedRecords = React.useMemo(() => {
    const start = (currentPage - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    return filteredRecords.slice(start, end);
  }, [filteredRecords, currentPage]);

  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);

  if (!agentId || !sessionId) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-500">Đang tải dữ liệu...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => navigate('/agent/history')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/agent/history')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-2xl font-bold text-slate-800">Chi tiết đối soát</h2>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-slate-700">Lọc:</span>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tất cả ({records.length})
          </button>
          <button
            onClick={() => setFilter('matched')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'matched'
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Khớp ({records.filter(r => r.status === TransactionStatus.MATCHED).length})
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Lỗi ({records.filter(r => r.status !== TransactionStatus.MATCHED).length})
          </button>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mã GD</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Số tiền</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Điểm thu</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Phương thức</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ngày</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Trạng thái</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Lỗi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                      {record.transactionCode}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {formatAmount(record.merchantAmount || record.agentAmount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {record.pointOfSaleName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {record.paymentMethod || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {record.transactionDate ? formatDate(record.transactionDate) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {record.errorDetail || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-200">
            <div className="text-sm text-slate-700">
              Hiển thị {(currentPage - 1) * recordsPerPage + 1} - {Math.min(currentPage * recordsPerPage, filteredRecords.length)} / {filteredRecords.length}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                Trước
              </button>
              <span className="px-3 py-2 text-sm text-slate-700">
                Trang {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentReconciliationDetail;

