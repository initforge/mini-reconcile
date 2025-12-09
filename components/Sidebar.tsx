
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Store, FileText, Settings, UploadCloud, CreditCard, UserCog, LogOut, BarChart3 } from 'lucide-react';
import { SettingsService } from '../src/lib/firebaseServices';
import { AppSettings } from '../types';

interface SidebarProps {
  activeTab: string;
  onLogout?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onLogout }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [adminName, setAdminName] = useState<string>('Admin User');

  useEffect(() => {
    loadSettings();
    loadAdminInfo();
    
    // Listen for settings changes (reload every 30 seconds)
    const interval = setInterval(() => {
      loadSettings();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadAdminInfo = () => {
    try {
      const adminAuth = localStorage.getItem('adminAuth');
      if (adminAuth) {
        const adminInfo = JSON.parse(adminAuth);
        setAdminName(adminInfo.fullName || adminInfo.username || 'Admin User');
      }
    } catch (error) {
      console.error('Error loading admin info:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const currentSettings = await SettingsService.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Error loading settings in Sidebar:', error);
    }
  };

  const menuItems = [
    { id: 'reconciliation', label: 'Đối soát & Xử lý', icon: FileText, path: '/reconciliation' },
    { id: 'report', label: 'Báo cáo', icon: BarChart3, path: '/admin/report' },
    { id: 'merchants', label: 'Quản lý Điểm bán', icon: Store, path: '/merchants' },
    { id: 'agents', label: 'Quản lý Đại lý', icon: Users, path: '/agents' },
    { id: 'personnel', label: 'Quản lý Khách hàng', icon: UserCog, path: '/personnel' },
    { id: 'payouts', label: 'Thanh toán & Công nợ', icon: CreditCard, path: '/payouts' },
    { id: 'settings', label: 'Cấu hình', icon: Settings, path: '/settings' },
  ];

  const companyName = settings?.companyName || 'PayReconcile';
  const logoUrl = settings?.logoUrl;

  return (
    <>
      {/* Mobile overlay */}
      <div className="hidden md:block fixed inset-0 bg-black/50 z-[90] md:hidden" />
      
      {/* Sidebar */}
      <div className="hidden md:flex w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white min-h-screen flex-col shadow-2xl fixed left-0 top-0 z-[100] border-r border-slate-700">
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center space-x-3">
          {logoUrl ? (
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center bg-white/10 border border-white/20">
              <img 
                src={logoUrl} 
                alt={companyName}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <UploadCloud className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <span className="text-xl font-bold tracking-tight text-white">{companyName}</span>
            <p className="text-xs text-slate-400 mt-0.5">Hệ thống đối soát</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Link
              key={item.id}
              to={item.path}
              replace={false}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
              }`}
              style={{ position: 'relative', zIndex: 101, pointerEvents: 'auto' }}
            >
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
              <span className="font-medium text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700/50 bg-slate-800/30">
        <div className="flex items-center space-x-3 px-3 py-2 mb-3 rounded-lg bg-slate-700/30">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-md">AD</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{adminName}</p>
            <p className="text-xs text-slate-400 truncate">Super Administrator</p>
          </div>
        </div>
        
        <button 
          onClick={onLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-sm font-medium text-red-300 hover:text-red-200 hover:bg-red-900/20 rounded-xl transition-all duration-200 border border-red-900/30 hover:border-red-800/50"
        >
          <LogOut className="w-4 h-4" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
    </>
  );
};

export default Sidebar;
