import React, { useState, useEffect } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import AgentSidebar from './AgentSidebar';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { Agent } from '../../types';

const AgentLayout: React.FC = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Get current tab from path
  const getActiveTab = () => {
    if (location.pathname.includes('/report')) return 'report';
    if (location.pathname.includes('/reconciliation')) return 'reconciliation';
    if (location.pathname.includes('/payment')) return 'payment';
    if (location.pathname.includes('/utilities')) return 'utilities';
    return 'report';
  };

  // Get agent info from localStorage
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;
  
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const agent = agents.find(a => a.id === agentId);

  const handleLogout = () => {
    localStorage.removeItem('agentAuth');
    window.location.href = '/agent/login';
  };

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ position: 'relative' }}>
      <AgentSidebar 
        activeTab={getActiveTab()} 
        onLogout={handleLogout}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />
      
      <main className="flex-1 lg:ml-64 p-4 md:p-8 overflow-y-auto h-screen" style={{ position: 'relative', zIndex: 1 }}>
        {/* Mobile Header */}
        <div className="lg:hidden mb-4 pb-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-6 h-6 text-slate-700" />
            </button>
            <div className="text-right">
              <p className="text-xs text-slate-500">
                {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        <header className="flex justify-between items-center mb-6 md:mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">
              {location.pathname.includes('/report') && 'Báo cáo'}
              {location.pathname.includes('/reconciliation') && 'Đối Soát'}
              {location.pathname.includes('/payment') && 'Thanh Toán'}
              {location.pathname.includes('/utilities') && 'Tiện Ích'}
            </h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {agent?.name && `${agent.name} (${agent.code})`}
            </p>
          </div>
          <div className="hidden lg:block text-right">
            <p className="text-sm text-slate-500">
              {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </header>

        {/* Content Area */}
        <div className="animate-fade-in" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AgentLayout;

