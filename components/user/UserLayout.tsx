import React from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import UserSidebar from './UserSidebar';
import { useRealtimeData } from '../../src/lib/firebaseHooks';
import type { User } from '../../types';

const UserLayout: React.FC = () => {
  const location = useLocation();
  
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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <UserSidebar activeTab={getActiveTab()} onLogout={handleLogout} />
      
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen" style={{ position: 'relative', zIndex: 1 }}>
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {location.pathname.includes('/upbill') && 'Up Bill'}
              {location.pathname.includes('/history') && 'Lịch Sử Bill'}
              {location.pathname.includes('/report') && 'Báo cáo'}
              {location.pathname.includes('/payment') && 'Thanh Toán'}
              {location.pathname.includes('/utilities') && 'Tiện Ích'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {user?.fullName && `Xin chào, ${user.fullName}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">
              {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </header>

        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default UserLayout;

