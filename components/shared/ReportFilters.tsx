import React from 'react';
import { Calendar, Filter } from 'lucide-react';
import type { ReportStatus, User, Agent } from '../../types';

export interface ReportFiltersProps {
  role: 'USER' | 'AGENT' | 'ADMIN';
  filters: {
    dateFrom: string;
    dateTo: string;
    status: ReportStatus | 'all';
    agentId?: string;
    userId?: string;
    pointOfSaleName?: string;
  };
  users?: User[];
  agents?: Agent[];
  pointOfSales?: string[]; // List of available point of sales
  onChange: (filters: {
    dateFrom: string;
    dateTo: string;
    status: ReportStatus | 'all';
    agentId?: string;
    userId?: string;
    pointOfSaleName?: string;
  }) => void;
  onClear?: () => void;
}

const ReportFilters: React.FC<ReportFiltersProps> = ({
  role,
  filters,
  users = [],
  agents = [],
  pointOfSales = [],
  onChange,
  onClear
}) => {
  const handleChange = (field: string, value: string) => {
    onChange({
      ...filters,
      [field]: value
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Filter className="w-5 h-5 text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-900">Bộ lọc</h2>
      </div>
      
      <div className={`grid grid-cols-1 gap-4 ${role === 'ADMIN' ? 'md:grid-cols-7' : role === 'AGENT' ? 'md:grid-cols-6' : 'md:grid-cols-4'}`}>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Từ ngày
          </label>
          <div className="relative">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Calendar className="absolute right-3 top-2.5 w-5 h-5 text-slate-400 pointer-events-none" />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Đến ngày
          </label>
          <div className="relative">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Calendar className="absolute right-3 top-2.5 w-5 h-5 text-slate-400 pointer-events-none" />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Trạng thái
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">Tất cả</option>
            <option value="MATCHED">Khớp</option>
            <option value="UNMATCHED">Chưa khớp</option>
            <option value="ERROR">Lỗi</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Điểm thu
          </label>
          <select
            value={filters.pointOfSaleName || 'all'}
            onChange={(e) => handleChange('pointOfSaleName', e.target.value === 'all' ? '' : e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="all">Tất cả</option>
            {pointOfSales.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </div>

        {role === 'ADMIN' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Đại lý
              </label>
              <select
                value={filters.agentId || 'all'}
                onChange={(e) => handleChange('agentId', e.target.value === 'all' ? '' : e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">Tất cả</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name} ({agent.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Người dùng
              </label>
              <select
                value={filters.userId || 'all'}
                onChange={(e) => handleChange('userId', e.target.value === 'all' ? '' : e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">Tất cả</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.fullName}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {role === 'AGENT' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Người dùng
            </label>
            <select
              value={filters.userId || 'all'}
              onChange={(e) => handleChange('userId', e.target.value === 'all' ? '' : e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Tất cả</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.fullName}</option>
              ))}
            </select>
          </div>
        )}
        
        {(role === 'ADMIN' || role === 'AGENT' || role === 'USER') && (
          <div className="flex items-end">
            {onClear && (
              <button
                onClick={onClear}
                className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportFilters;

