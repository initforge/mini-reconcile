import React from 'react';
import { Upload, History, CreditCard, Settings, LogOut, FileText, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { User } from '../../types';

interface UserSidebarProps {
  activeTab: string;
  onLogout: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

const UserSidebar: React.FC<UserSidebarProps> = ({ activeTab, onLogout, isMobileOpen = false, onMobileClose }) => {
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

  // Shared sidebar content component
  const SidebarContent = () => (
    <>
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-xl font-bold">P</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">{user?.fullName || 'PayReconcile'}</h1>
              <p className="text-xs text-slate-400">Người dùng</p>
            </div>
          </div>
          {/* Mobile close button */}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 mt-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || location.pathname === item.path;
          
          return (
            <button
              key={item.id}
              onClick={() => {
                handleNavigate(item.path);
                onMobileClose?.();
              }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/50 transform scale-[1.02]'
                  : 'text-slate-300 hover:bg-slate-700/50 hover:text-white hover:translate-x-1'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700/50">
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
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-300 hover:bg-red-600/20 hover:text-red-300 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Đăng xuất</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-[90] transition-opacity"
          onClick={onMobileClose}
        />
      )}
      
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white min-h-screen flex-col shadow-2xl fixed left-0 top-0 z-[100] border-r border-slate-700">
        <SidebarContent />
      </div>

      {/* Mobile Drawer */}
      <div className={`lg:hidden fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex-col shadow-2xl z-[100] border-r border-slate-700 transform transition-transform duration-300 ease-in-out ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <SidebarContent />
      </div>
    </>
  );
};

export default UserSidebar;

