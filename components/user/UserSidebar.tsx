import React from 'react';
import { Upload, History, CreditCard, Settings, LogOut, FileText } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface UserSidebarProps {
  activeTab: string;
  onLogout: () => void;
}

const UserSidebar: React.FC<UserSidebarProps> = ({ activeTab, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

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
    <div className="w-64 bg-slate-900 text-white min-h-screen flex flex-col fixed left-0 top-0 z-[100] border-r border-slate-800">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold">PayReconcile</h1>
        <p className="text-sm text-slate-400 mt-1">Người dùng</p>
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

