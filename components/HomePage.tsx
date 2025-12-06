import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, Users, ArrowRight, UploadCloud } from 'lucide-react';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const roleCards = [
    {
      id: 'agent',
      title: 'Đại lý',
      description: 'Xem báo cáo, quản lý thanh toán cho khách hàng',
      icon: UserCheck,
      path: '/agent/login',
      gradient: 'from-blue-600 to-cyan-600',
      hoverGradient: 'from-blue-700 to-cyan-700',
      textColor: 'text-white',
      features: ['Xem báo cáo', 'Thanh toán khách hàng', 'Quản lý giao dịch']
    },
    {
      id: 'user',
      title: 'Người dùng',
      description: 'Upload hóa đơn, xem lịch sử và trạng thái thanh toán',
      icon: Users,
      path: '/user/login',
      gradient: 'from-green-600 to-emerald-600',
      hoverGradient: 'from-green-700 to-emerald-700',
      textColor: 'text-white',
      features: ['Upload hóa đơn', 'Xem lịch sử', 'Kiểm tra thanh toán']
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex justify-center items-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl">
              <UploadCloud className="w-10 h-10 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            PayReconcile
          </h1>
          <p className="text-xl text-slate-300">
            Hệ thống quản lý và đối soát thanh toán
          </p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {roleCards.map((role) => {
            const Icon = role.icon;
            return (
              <div
                key={role.id}
                onClick={() => navigate(role.path)}
                className={`
                  relative bg-white rounded-2xl shadow-2xl overflow-hidden
                  cursor-pointer transform transition-all duration-300
                  hover:scale-105 hover:shadow-3xl
                  group
                `}
              >
                {/* Gradient Header */}
                <div className={`h-32 bg-gradient-to-r ${role.gradient} flex items-center justify-center transition-all`}>
                  <div className="bg-white/20 backdrop-blur-sm rounded-full p-6 group-hover:scale-110 transition-transform">
                    <Icon className="w-12 h-12 text-white" />
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h2 className="text-2xl font-bold mb-2 text-slate-800">
                    {role.title}
                  </h2>
                  <p className="text-slate-600 mb-4 text-sm">
                    {role.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-2 mb-6">
                    {role.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center text-sm text-slate-500">
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${role.gradient} mr-2`}></div>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Action Button */}
                  <button
                    className={`
                      w-full py-3 px-4 rounded-xl font-semibold
                      bg-gradient-to-r ${role.gradient} ${role.textColor}
                      hover:shadow-lg transform hover:-translate-y-0.5
                      transition-all duration-200
                      flex items-center justify-center space-x-2
                    `}
                  >
                    <span>Đăng nhập</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Decorative Corner */}
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${role.gradient} opacity-10 rounded-bl-full`}></div>
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="text-center mt-12">
          <p className="text-slate-400 text-sm">
            Chọn vai trò của bạn để tiếp tục
          </p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;

