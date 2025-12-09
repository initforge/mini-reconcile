import React from 'react';
import { Upload, History, CreditCard, Settings, LogOut, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { User } from '../../types';

interface UserSidebarProps {
  activeTab: string;
  onLogout: () => void;
}

const UserSidebar: React.FC<UserSidebarProps> = ({ activeTab, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Get user info from localStorage
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;
  
  // Load user data from Firebase
  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const user = usersData && userId ? usersData[userId] : null;

  const menuItems = [
    { id: 'upload', label: 'Up Bill', icon: Upload, path: '/user/upbill' },
    { id: 'history', label: 'Lịch Sử', icon: History, path: '/user/history' },
    { id: 'report', label: 'Báo cáo', icon: FileText, path: '/user/report' },
    { id: 'payment', label: 'Thanh Toán', icon: CreditCard, path: '/user/payment' },
    { id: 'utilities', label: 'Tiện Ích', icon: Settings, path: '/user/utilities' },
  ];

  const handleNavigate = (path: string) => {
    // Preserve query params if navigating to upbill
    if (path === '/user/upbill' && location.search) {
      navigate(`${path}${location.search}`);
    } else {
      navigate(path);
    }
  };

  return (
    <div className="hidden md:flex w-64 bg-slate-900 text-white min-h-screen flex-col fixed left-0 top-0 z-[100] border-r border-slate-800">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold">PayReconcile</h1>
        <p className="text-sm text-slate-400 mt-1">Người dùng</p>
        {user && (
          <p className="text-xs text-slate-300 mt-2 truncate" title={user.fullName}>
            {user.fullName || user.phone || userId}
          </p>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || location.pathname === item.path;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.path)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        {user && (
          <div className="flex items-center space-x-3 px-3 py-2 mb-3 rounded-lg bg-slate-700/30">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-md">
              {(user.fullName || user.phone || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.fullName || user.phone || userId}</p>
              {user.phone && user.fullName && (
                <p className="text-xs text-slate-400 truncate">{user.phone}</p>
              )}
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Đăng xuất</span>
        </button>
      </div>
    </div>
  );
};

export default UserSidebar;

