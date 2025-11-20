import React from 'react';
import { History } from 'lucide-react';
import { ReconciliationSession } from '../../types';
import { ReconciliationService } from '../../src/lib/firebaseServices';

interface HistoryPanelProps {
  sessionHistory: ReconciliationSession[];
  loadingHistory: boolean;
  onLoadSession: (sessionId: string) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  sessionHistory,
  loadingHistory,
  onLoadSession
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Lịch sử phiên đối soát</h3>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {loadingHistory ? (
          <div className="text-center py-8 text-slate-400">Đang tải lịch sử...</div>
        ) : sessionHistory.length > 0 ? (
          sessionHistory.map((session) => {
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
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                onClick={() => onLoadSession(session.id)}
              >
                <div className="flex items-center space-x-3 flex-1">
                  {/* Status badge */}
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    session.status === 'COMPLETED' ? 'bg-emerald-500' :
                    session.status === 'PROCESSING' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></span>
                  
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
                  </div>
                </div>
                
                {/* Status badge */}
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  session.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                  session.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                  {session.status === 'COMPLETED' ? 'Hoàn thành' :
                   session.status === 'PROCESSING' ? 'Đang xử lý' : 'Lỗi'}
                </span>
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
    </div>
  );
};

export default HistoryPanel;

