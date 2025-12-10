
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ReconciliationModule from './components/ReconciliationModule';
import AdminReport from './components/AdminReport';
import Login from './components/Login';
import HomePage from './components/HomePage';
import PersonnelManagement from './components/admin/PersonnelManagement';
import Agents from './components/Agents';
import Merchants from './components/Merchants';
import Payouts from './components/Payouts';
import Reports from './components/Reports';
import Settings from './components/Settings';
import { Stats } from './types';
// User components
import UserLogin from './components/user/UserLogin';
import UserRegister from './components/user/UserRegister';
import UserLayout from './components/user/UserLayout';
import UploadBill from './components/user/UploadBill';
import BillHistory from './components/user/BillHistory';
import UserReport from './components/user/UserReport';
import PaymentStatus from './components/user/PaymentStatus';
import UserUtilities from './components/user/UserUtilities';
// Agent components
import AgentLogin from './components/agent/AgentLogin';
import AgentLayout from './components/agent/AgentLayout';
import AgentReport from './components/agent/AgentReport';
import AgentReconciliationDetail from './components/agent/AgentReconciliationDetail';
import AgentPayments from './components/agent/AgentPayments';
import AgentUtilities from './components/agent/AgentUtilities';
// import { useAuth } from './src/lib/firebaseHooks'; // Disabled for mock auth

// Placeholder components for views not fully implemented in this demo
const PlaceholderView = ({ title, icon: Icon, desc }: any) => (
  <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
    <div className="bg-slate-100 p-6 rounded-full mb-4">
      <Icon className="w-12 h-12" />
    </div>
    <h2 className="text-xl font-bold text-slate-700">{title}</h2>
    <p className="mt-2 max-w-md text-center">{desc}</p>
    <button className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
      Thêm mới {title}
    </button>
  </div>
);

// Protected Route Component for Admin
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = localStorage.getItem('mockAuth') === 'true';
  return isAuthenticated ? <>{children}</> : <Navigate to="/admin" replace />;
};

// Protected Route Component for User
const ProtectedUserRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userAuth = localStorage.getItem('userAuth');
  return userAuth ? <>{children}</> : <Navigate to="/user/login" replace />;
};

// Protected Route Component for Agent
const ProtectedAgentRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const agentAuth = localStorage.getItem('agentAuth');
  return agentAuth ? <>{children}</> : <Navigate to="/agent/login" replace />;
};

// Wrapper component to force remount on route change
const PayoutsWrapper: React.FC = () => {
  const location = useLocation();
  return <Payouts key={location.pathname + location.search} />;
};

// Layout Component with Sidebar
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Map pathname to activeTab ID for sidebar highlighting
  const getActiveTab = (pathname: string): string => {
    if (pathname === '/admin/report' || pathname.startsWith('/admin/report')) {
      return 'report';
    }
    return pathname.slice(1) || 'reconciliation';
  };
  const currentPath = getActiveTab(location.pathname);

  const handleLogout = () => {
    console.log('🚪 Mock logout triggered');
    localStorage.removeItem('mockAuth');
    window.location.href = '/admin';
  };

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50" style={{ position: 'relative' }}>
      <Sidebar 
        activeTab={currentPath}
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
            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center text-xs text-slate-600 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              Bình thường
            </div>
          </div>
        </div>

        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">
              {currentPath === 'reconciliation' && 'Trung tâm đối soát'}
              {currentPath === 'personnel' && 'Quản lý nhân sự'}
              {currentPath === 'merchants' && 'Danh sách Điểm bán'}
              {currentPath === 'agents' && 'Danh sách Đại lý'}
              {currentPath === 'payouts' && 'Quản lý Thanh toán'}
              {currentPath === 'reports' && 'Báo cáo Công nợ'}
              {currentPath === 'settings' && 'Cài đặt'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          
          <div className="hidden lg:flex items-center space-x-4 w-full sm:w-auto">
             <div className="bg-white border border-slate-200 rounded-lg px-3 md:px-4 py-2 flex items-center text-xs md:text-sm text-slate-600 shadow-sm">
               <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
               <span className="hidden sm:inline">Hệ thống hoạt động: </span>Bình thường
             </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="animate-fade-in" key={location.pathname}>
          {children}
        </div>
      </main>
    </div>
  );
};

function App() {
  
  const handleLogin = () => {
    console.log('🔐 Mock login triggered');
    localStorage.setItem('mockAuth', 'true');
    window.location.href = '/reconciliation'; // Redirect to admin main management page
  };

  return (
    <Router>
      <Routes>
        {/* Homepage */}
        <Route path="/" element={<HomePage />} />
        
        {/* Admin Report Route (must be before /admin route to avoid conflict) */}
        <Route 
          path="/admin/report" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <AdminReport />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        {/* Admin Login Route (Private) */}
        <Route 
          path="/admin" 
          element={<Login onLogin={handleLogin} />} 
        />
        
        {/* Protected Routes */}
        <Route 
          path="/reconciliation" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <ReconciliationModule />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/merchants" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Merchants />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/agents" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Agents />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/personnel" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <PersonnelManagement />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/payouts" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <PayoutsWrapper />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/reports" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Reports />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/settings" 
          element={
            <ProtectedRoute>
              <AppLayout>
                <Settings />
              </AppLayout>
            </ProtectedRoute>
          } 
        />
        
        {/* User Routes */}
        <Route path="/user/login" element={<UserLogin />} />
        <Route path="/user/register" element={<UserRegister />} />
        <Route 
          path="/user" 
          element={
            <ProtectedUserRoute>
              <UserLayout />
            </ProtectedUserRoute>
          }
        >
          <Route path="upbill" element={<UploadBill />} />
          <Route path="history" element={<BillHistory />} />
          <Route path="report" element={<UserReport />} />
          <Route path="payment" element={<PaymentStatus />} />
          <Route path="utilities" element={<UserUtilities />} />
          <Route index element={<Navigate to="/user/upbill" replace />} />
        </Route>

        {/* Agent Routes */}
        <Route path="/agent/login" element={<AgentLogin />} />
        <Route 
          path="/agent" 
          element={
            <ProtectedAgentRoute>
              <AgentLayout />
            </ProtectedAgentRoute>
          }
        >
          <Route path="report" element={<AgentReport />} />
          <Route path="reconciliation/:sessionId" element={<AgentReconciliationDetail />} />
          <Route path="payment" element={<AgentPayments />} />
          <Route path="utilities" element={<AgentUtilities />} />
          <Route index element={<Navigate to="/agent/report" replace />} />
        </Route>
        
        {/* Default Redirects */}
        <Route 
          path="*" 
          element={<Navigate to="/" replace />} 
        />
      </Routes>
    </Router>
  );
}

export default App;
