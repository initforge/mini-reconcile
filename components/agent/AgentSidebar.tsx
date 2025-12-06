import React from 'react';
import { FileText, CreditCard, Settings, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface AgentSidebarProps {
  activeTab: string;
  onLogout: () => void;
}

const AgentSidebar: React.FC<AgentSidebarProps> = ({ activeTab, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { id: 'report', label: 'Báo cáo', icon: FileText, path: '/agent/report' },
    { id: 'payment', label: 'Thanh Toán', icon: CreditCard, path: '/agent/payment' },
    { id: 'utilities', label: 'Tiện Ích', icon: Settings, path: '/agent/utilities' },
  ];

  return (
    <div className="w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white min-h-screen flex flex-col shadow-2xl fixed left-0 top-0 z-[100] border-r border-slate-700">
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-xl font-bold">P</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">PayReconcile</h1>
            <p className="text-xs text-slate-400">Đại lý</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 mt-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id || location.pathname === item.path;
          
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
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
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-slate-300 hover:bg-red-600/20 hover:text-red-300 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Đăng xuất</span>
        </button>
      </div>
    </div>
  );
};

export default AgentSidebar;

