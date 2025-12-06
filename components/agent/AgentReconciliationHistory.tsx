import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, FileText, CheckCircle, AlertCircle, Eye, Trash2, X } from 'lucide-react';
import { AgentReconciliationService } from '../../src/lib/agentReconciliationServices';
import type { AgentReconciliationSession } from '../../types';

const AgentReconciliationHistory: React.FC = () => {
  const navigate = useNavigate();
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;

  const [sessions, setSessions] = useState<AgentReconciliationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!agentId) {
      window.location.href = '/agent/login';
      return;
    }

    loadSessions();
  }, [agentId]);

  const loadSessions = async () => {
    if (!agentId) return;
    
    setLoading(true);
    try {
      const data = await AgentReconciliationService.getReconciliationSessions(agentId);
      setSessions(data);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
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

  const handleDeleteSession = (sessionId: string) => {
    setDeletingSessionId(sessionId);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSessionId || !agentId) return;

    if (!window.confirm('Bạn có chắc chắn muốn xóa phiên đối soát này? Tất cả dữ liệu liên quan sẽ bị xóa và các bills sẽ được reset về trạng thái chờ đối soát.')) {
      setDeletingSessionId(null);
      return;
    }

    setIsDeleting(true);
    try {
      await AgentReconciliationService.deleteReconciliationSession(deletingSessionId, agentId);
      setDeletingSessionId(null);
      // Reload sessions
      await loadSessions();
    } catch (error: any) {
      console.error('Error deleting session:', error);
      alert(`Lỗi khi xóa phiên đối soát: ${error.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter sessions by selected date
  const filteredSessions = React.useMemo(() => {
    if (!selectedDate) return sessions;
    const selectedDateStr = new Date(selectedDate).toISOString().split('T')[0];
    return sessions.filter(session => {
      const sessionDate = new Date(session.createdAt).toISOString().split('T')[0];
      return sessionDate === selectedDateStr;
    });
  }, [sessions, selectedDate]);

  if (!agentId) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-500">Đang tải dữ liệu...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Lịch Sử Đối Soát</h2>
      </div>

      {/* Date Picker */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700">Chọn ngày:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    {sessions.length === 0 ? 'Chưa có phiên đối soát nào' : 'Không có phiên đối soát cho ngày đã chọn'}
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">
                      {session.id.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {formatDate(session.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4" />
                        <span>{session.merchantFileName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {session.billCount}
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => navigate(`/agent/reconciliation/${session.id}`)}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Xem chi tiết
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.id)}
                          disabled={isDeleting}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border-2 border-red-200">
            <div className="px-6 py-4 bg-red-50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <span className="font-semibold text-red-800">Xác nhận xóa</span>
              </div>
              <button
                onClick={() => setDeletingSessionId(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-700 mb-4">
                Bạn có chắc chắn muốn xóa phiên đối soát này?
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Tất cả dữ liệu đối soát liên quan sẽ bị xóa và các bills sẽ được reset về trạng thái "Chờ đối soát".
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3">
              <button
                onClick={() => setDeletingSessionId(null)}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentReconciliationHistory;

