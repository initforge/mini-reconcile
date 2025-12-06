import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, User as UserIcon, Clock, CheckCircle, X } from 'lucide-react';
import { UserService } from '../../src/lib/userServices';
import Pagination from '../Pagination';

interface PendingBillsSummary {
  userId: string;
  userName: string;
  userPhone: string;
  pendingCount: number;
  matchedCount: number;
}

interface PendingBillsPanelProps {
  onUserClick: (userId: string, userName: string) => void;
}

const PendingBillsPanel: React.FC<PendingBillsPanelProps> = ({ onUserClick }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [summary, setSummary] = useState<PendingBillsSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const data = await UserService.getPendingBillsSummary();
      setSummary(data);
    } catch (error) {
      console.error('Error loading pending bills summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(summary.length / itemsPerPage);
  const paginatedSummary = summary.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPending = summary.reduce((sum, s) => sum + s.pendingCount, 0);
  const totalUsers = summary.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 mb-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-yellow-600" />
          </div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-slate-900">Bills đang chờ đối soát</h3>
            <p className="text-sm text-slate-500">
              {totalPending} bills từ {totalUsers} người dùng
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-slate-200">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-sm text-slate-500">Đang tải...</p>
            </div>
          ) : paginatedSummary.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-2" />
              <p className="text-slate-500">Không có bills đang chờ đối soát</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Người dùng
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        Số điện thoại
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                        Chờ đối soát
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                        Đã khớp
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paginatedSummary.map((item) => (
                      <tr key={item.userId} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <UserIcon className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-900">{item.userName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {item.userPhone}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            {item.pendingCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {item.matchedCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => onUserClick(item.userId, item.userName)}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                          >
                            Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="p-4 border-t border-slate-200">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PendingBillsPanel;

