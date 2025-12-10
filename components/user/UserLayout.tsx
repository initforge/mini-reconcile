import React, { useState, useEffect } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import UserSidebar from './UserSidebar';
import { useRealtimeData } from '../../src/lib/firebaseHooks';
import type { User } from '../../types';

const UserLayout: React.FC = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Get current tab from path
  const getActiveTab = () => {
    if (location.pathname.includes('/upbill')) return 'upload';
    if (location.pathname.includes('/history')) return 'history';
    if (location.pathname.includes('/report')) return 'report';
    if (location.pathname.includes('/payment')) return 'payment';
    if (location.pathname.includes('/utilities')) return 'utilities';
    return 'upload';
  };

  // Get user info from localStorage
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;
  
  const { data: userData } = useRealtimeData<Record<string, User>>('/users');
  const user = userData && userId ? Object.values(userData).find(u => u.id === userId) : null;

  const handleLogout = () => {
    localStorage.removeItem('userAuth');
    window.location.href = '/user/login';
  };

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ position: 'relative' }}>
      <UserSidebar 
        activeTab={getActiveTab()} 
        onLogout={handleLogout}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />
      
      <main className="flex-1 lg:ml-64 p-4 md:p-8 overflow-y-auto h-screen" style={{ position: 'relative', zIndex: 1 }}>
        {/* Mobile Header */}
        <div className="lg:hidden mb-4 border-b border-slate-200 pb-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors -ml-2"
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6 text-slate-700" />
            </button>
            <div className="text-right flex-1">
              <p className="text-xs text-slate-500">
                {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <header className="hidden lg:flex justify-between items-center mb-6 md:mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">
              {location.pathname.includes('/upbill') && 'Up Bill'}
              {location.pathname.includes('/history') && 'Lịch Sử Bill'}
              {location.pathname.includes('/report') && 'Báo cáo'}
              {location.pathname.includes('/payment') && 'Thanh Toán'}
              {location.pathname.includes('/utilities') && 'Tiện Ích'}
            </h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {user?.fullName && `Xin chào, ${user.fullName}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">
              {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </header>

        {/* Mobile Title - Chỉ hiển thị title trên mobile, không có greeting */}
        <div className="lg:hidden mb-4">
          <h1 className="text-xl font-bold text-slate-900">
            {location.pathname.includes('/upbill') && 'Up Bill'}
            {location.pathname.includes('/history') && 'Lịch Sử Bill'}
            {location.pathname.includes('/report') && 'Báo cáo'}
            {location.pathname.includes('/payment') && 'Thanh Toán'}
            {location.pathname.includes('/utilities') && 'Tiện Ích'}
          </h1>
        </div>

        {/* Content Area */}
        <div className="animate-fade-in" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default UserLayout;

