
import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, Save, X, Percent, Building, CreditCard, BarChart3, ToggleLeft, ToggleRight, AlertCircle, Users, CheckSquare, Square, Phone, Mail, MapPin, Upload, Image as ImageIcon, QrCode, Store } from 'lucide-react';
import { Agent, Merchant, PaymentMethod } from '../types';
import { useRealtimeData, useFirebaseWrite, FirebaseUtils } from '../src/lib/firebaseHooks';
import { AgentsService } from '../src/lib/firebaseServices';

const Agents: React.FC = () => {
  // Firebase hooks
  const { data: agentsData, loading } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: merchantsData } = useRealtimeData<Record<string, Merchant>>('/merchants');
  const { writeData, updateData, deleteData, loading: actionLoading, error } = useFirebaseWrite();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [agentStats, setAgentStats] = useState<Record<string, { count: number; totalAmount: number }>>({});
  
  // Enhanced state for merchant assignment
  const [showMerchantAssignment, setShowMerchantAssignment] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Convert Firebase object to array
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const merchants = FirebaseUtils.objectToArray(merchantsData || {});
  
  // Form State - enhanced with new fields
  const initialFormState: Omit<Agent, 'id'> = {
    name: '',
    code: '',
    bankAccount: '',
    discountRates: {
      "QR 1 (VNPay)": 0,
      "QR 2 (App Bank)": 0,
      "Sofpos": 0,
      "POS": 0
    },
    isActive: true,
    assignedPointOfSales: [],
    contactPhone: '', // REQUIRED - dùng để login
    password: '', // REQUIRED - admin set password
    contactEmail: '',
    address: '',
    taxCode: '',
    bankBranch: '',
    qrCodeBase64: '',
    notes: '',
    discountRatesByPointOfSale: {}, // Chiết khấu theo từng điểm bán
    referralLinkUser: '',
    referralLinkAdmin: '',
    totalUsers: 0,
    totalBills: 0
  };

  // Get all unique point of sales from merchants
  const allPointOfSales = React.useMemo(() => {
    const posSet = new Set<string>();
    merchants.forEach((m: Merchant) => {
      if (m.pointOfSaleName) posSet.add(m.pointOfSaleName);
      if (m.pointOfSaleCode) posSet.add(m.pointOfSaleCode);
    });
    return Array.from(posSet).sort();
  }, [merchants]);
  
  const [formData, setFormData] = useState<Omit<Agent, 'id'>>(initialFormState);

  // Load unpaid stats for agents
  useEffect(() => {
    const loadStats = async () => {
      const stats: Record<string, { count: number; totalAmount: number }> = {};
      for (const agent of agents) {
        try {
          const agentStat = await AgentsService.getUnpaidStats(agent.id);
          stats[agent.id] = agentStat;
        } catch (error) {
          console.error(`Error loading stats for agent ${agent.id}:`, error);
          stats[agent.id] = { count: 0, totalAmount: 0 };
        }
      }
      setAgentStats(stats);
    };
    
    if (agents.length > 0) {
      loadStats();
    }
  }, [agents]);

  // Filter agents (search by name, code, or phone)
  const filteredAgents = agents.filter((agent: Agent) => {
    const matchesSearch = agent.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agent.contactPhone?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && agent.isActive !== false) ||
                         (statusFilter === 'inactive' && agent.isActive === false);
    
    return matchesSearch && matchesStatus;
  });

  // Toggle agent status
  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await AgentsService.updateStatus(id, !currentStatus);
    } catch (error) {
      console.error('Error updating agent status:', error);
      alert('Có lỗi khi cập nhật trạng thái');
    }
  };

  // Validate discount rates
  const validateDiscountRates = (rates: Record<string, number>): boolean => {
    return AgentsService.validateDiscountRates(rates);
  };

  const handleAddNew = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setFormData({
      name: agent.name,
      code: agent.code,
      bankAccount: agent.bankAccount,
      discountRates: agent.discountRates || {
        "QR 1 (VNPay)": 0,
        "QR 2 (App Bank)": 0,
        "Sofpos": 0,
        "POS": 0
      },
      isActive: agent.isActive,
      assignedPointOfSales: agent.assignedPointOfSales || [],
      contactPhone: agent.contactPhone || '',
      password: '', // Don't show existing password, user needs to enter new one if changing
      contactEmail: agent.contactEmail || '',
      address: agent.address || '',
      taxCode: agent.taxCode || '',
      bankBranch: agent.bankBranch || '',
      qrCodeBase64: agent.qrCodeBase64 || '',
      notes: agent.notes || '',
      discountRatesByPointOfSale: agent.discountRatesByPointOfSale || {},
      referralLinkUser: agent.referralLinkUser || `/user/upbill?agents=${agent.code}`,
      referralLinkAdmin: agent.referralLinkAdmin || `/admin/reconciliation?agent=${agent.code}`,
      totalUsers: agent.totalUsers || 0,
      totalBills: agent.totalBills || 0
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa đại lý này?')) {
      await deleteData(`/agents/${id}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (actionLoading) return; // Prevent duplicate submissions
    
    // Validation
    if (!formData.name.trim() || !formData.code.trim() || !formData.bankAccount.trim()) {
      alert('Vui lòng điền đầy đủ thông tin');
      return;
    }

    // Validate required fields: contactPhone and password
    if (!formData.contactPhone.trim()) {
      alert('Vui lòng nhập số điện thoại (bắt buộc)');
      return;
    }

    if (!editingId && !formData.password.trim()) {
      alert('Vui lòng nhập mật khẩu cho đại lý (bắt buộc)');
      return;
    }

    // Validate discount rates (0-100%)
    if (!validateDiscountRates(formData.discountRates)) {
      alert('Tỷ lệ chiết khấu phải từ 0% đến 100%');
      return;
    }

    try {
      // Kiểm tra mã trùng lặp
      const codeExists = await AgentsService.codeExists(formData.code, editingId || undefined);
      if (codeExists) {
        alert('Mã đại lý đã tồn tại. Vui lòng sử dụng mã khác.');
        return;
    }

      // Hash password if provided
      let hashedPassword = formData.password;
      if (formData.password.trim()) {
        // Save password as plain text (no hashing)
        hashedPassword = formData.password;
      } else if (editingId) {
        // Keep existing password if not changing
        const existingAgent = agents.find(a => a.id === editingId);
        hashedPassword = existingAgent?.password || '';
      }

      // Auto-generate referral links
      const referralLinkUser = `/user/upbill?agents=${formData.code}`;
      const referralLinkAdmin = `/admin/reconciliation?agent=${formData.code}`;
    
    if (editingId) {
      // Edit existing agent
        const updateDataObj: any = {
        ...formData,
          password: hashedPassword,
          referralLinkUser,
          referralLinkAdmin,
          discountRatesByPointOfSale: formData.discountRatesByPointOfSale || {},
        updatedAt: FirebaseUtils.getServerTimestamp()
        };
        // Remove password from update if not changing
        if (!formData.password.trim()) {
          delete updateDataObj.password;
        }
        await updateData(`/agents/${editingId}`, updateDataObj);
        alert('Đã cập nhật thông tin đại lý thành công!');
    } else {
      // Add new agent
      const newId = FirebaseUtils.generateId();
      await writeData(`/agents/${newId}`, {
        ...formData,
          password: hashedPassword,
          referralLinkUser,
          referralLinkAdmin,
          discountRatesByPointOfSale: formData.discountRatesByPointOfSale || {},
        createdAt: FirebaseUtils.getServerTimestamp(),
        updatedAt: FirebaseUtils.getServerTimestamp(),
          isActive: true,
          totalUsers: 0,
          totalBills: 0
      });
        alert('Đã thêm đại lý mới thành công!');
    }
    
    setIsModalOpen(false);
    setFormData(initialFormState);
      setEditingId(null);
    } catch (error: any) {
      console.error('Error saving agent:', error);
      alert(`Có lỗi khi lưu thông tin đại lý: ${error.message || 'Vui lòng thử lại'}`);
    }
  };

  const handleRateChange = (method: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      discountRates: {
        ...prev.discountRates,
        [method]: parseFloat(value) || 0
      }
    }));
  };

  // Handle QR Code Upload
  const handleQRCodeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file hình ảnh');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('File quá lớn. Vui lòng chọn file nhỏ hơn 2MB');
      return;
    }

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setFormData(prev => ({ ...prev, qrCodeBase64: base64 }));
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading QR code:', error);
      alert('Có lỗi khi tải lên mã QR');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-500">Đang tải dữ liệu...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative flex-1 w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            placeholder="Tìm kiếm theo tên, mã đại lý hoặc số điện thoại..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button 
          onClick={handleAddNew}
          className="flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Thêm Đại lý mới
        </button>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAgents.map((agent: Agent) => (
          <div key={agent.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="p-6 border-b border-slate-50">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Building className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{agent.name}</h3>
                    <p className="text-xs font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded w-fit mt-1">{agent.code}</p>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button 
                    onClick={() => handleEdit(agent)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(agent.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
               <div className="flex items-center text-sm text-slate-600">
                 <CreditCard className="w-4 h-4 mr-3 text-slate-400" />
                 <div className="flex-1">
                   <span className="text-xs text-slate-500 block">Tài khoản ngân hàng</span>
                   <span className="font-medium font-mono">{agent.bankAccount}</span>
                 </div>
               </div>

               {/* Discount Rates by Point of Sale */}
               {agent.discountRatesByPointOfSale && Object.keys(agent.discountRatesByPointOfSale).length > 0 ? (
               <div className="bg-slate-50 rounded-lg p-4">
                 <div className="flex items-center mb-3">
                   <Percent className="w-4 h-4 mr-2 text-slate-500" />
                     <span className="text-sm font-semibold text-slate-700">Chiết khấu theo Điểm thu</span>
                   </div>
                   <div className="space-y-3">
                     {Object.entries(agent.discountRatesByPointOfSale).map(([pos, rates]) => (
                       <div key={pos} className="bg-white rounded border border-slate-200 p-2">
                         <div className="font-mono text-xs font-semibold text-indigo-700 mb-2">{pos}</div>
                         <div className="grid grid-cols-2 gap-2">
                           {Object.entries(rates).map(([method, rate]) => (
                             <div key={method} className="flex justify-between items-center text-xs">
                               <span className="text-slate-500 truncate max-w-[80px]" title={method}>{method}</span>
                               <span className="font-bold text-indigo-600">{rate}%</span>
                             </div>
                           ))}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               ) : (
                 <div className="bg-slate-50 rounded-lg p-4">
                   <div className="flex items-center mb-3">
                     <Percent className="w-4 h-4 mr-2 text-slate-500" />
                     <span className="text-sm font-semibold text-slate-700">Cấu hình phí / Chiết khấu (Cũ)</span>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   {Object.entries(agent.discountRates || {}).map(([method, rate]) => (
                     <div key={method} className="flex justify-between items-center text-sm bg-white p-2 rounded border border-slate-100">
                       <span className="text-slate-500 text-xs truncate max-w-[100px]" title={method}>{method}</span>
                       <span className="font-bold text-indigo-600">{rate}%</span>
                     </div>
                   ))}
                 </div>
                   <p className="text-xs text-amber-600 mt-2">⚠️ Vui lòng cập nhật: Gán điểm thu và cấu hình chiết khấu theo từng điểm thu</p>
                 </div>
               )}

               {/* Assigned Point of Sales */}
               {agent.assignedPointOfSales && agent.assignedPointOfSales.length > 0 && (
                 <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                   <div className="flex items-center mb-2">
                     <Store className="w-4 h-4 mr-2 text-indigo-600" />
                     <span className="text-sm font-semibold text-indigo-700">Điểm thu được gán ({agent.assignedPointOfSales.length})</span>
                   </div>
                   <div className="flex flex-wrap gap-2">
                     {agent.assignedPointOfSales.map((pos, idx) => (
                       <span key={idx} className="text-xs font-mono bg-white text-indigo-700 px-2 py-1 rounded border border-indigo-200">
                         {pos}
                       </span>
                     ))}
                   </div>
               </div>
               )}
            </div>
          </div>
        ))}
      </div>

      {filteredAgents.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Không tìm thấy đại lý</h3>
          <p className="text-slate-500 mt-1">Thử tìm kiếm hoặc thêm mới đại lý.</p>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? 'Cập nhật thông tin Đại lý' : 'Thêm Đại lý mới'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">Thông tin chung</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Tên Đại lý <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: Đại lý Minh Khai"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Mã Đại lý <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                      placeholder="VD: AG_001"
                      value={formData.code}
                      onChange={e => setFormData({...formData, code: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Số tài khoản ngân hàng <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                      placeholder="VD: 093451103 (số TK ngân hàng từ ảnh VNPay)"
                      value={formData.bankAccount}
                      onChange={e => setFormData({...formData, bankAccount: e.target.value})}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      <strong>Lưu ý quan trọng:</strong> Số tài khoản ngân hàng này (hiển thị trên ảnh VNPay) sẽ được dùng để tự động link đại lý khi OCR ảnh bill. 
                      Đây chính là số tài khoản ngân hàng, không phải số điện thoại liên hệ.
                    </p>
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">Thông tin đăng nhập</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Số điện thoại <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      type="tel"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: 0901234567"
                      value={formData.contactPhone}
                      onChange={e => setFormData({...formData, contactPhone: e.target.value})}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Số điện thoại này dùng để đăng nhập (bắt buộc)
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Mật khẩu {!editingId && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      required={!editingId}
                      type="password"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder={editingId ? "Để trống nếu không đổi" : "Nhập mật khẩu"}
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {editingId ? 'Để trống nếu không muốn đổi mật khẩu' : 'Mật khẩu đăng nhập cho đại lý (bắt buộc)'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Enhanced Contact Info - Collapsible */}
              <div className="space-y-4">
                <details className="group">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
                      <span>Thông tin liên hệ (Nhấn để mở rộng)</span>
                      <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                    </div>
                  </summary>
                  <div className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Email</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: agent@example.com"
                      value={formData.contactEmail}
                      onChange={e => setFormData({...formData, contactEmail: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Chi nhánh ngân hàng</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: CN Hai Bà Trưng"
                      value={formData.bankBranch}
                      onChange={e => setFormData({...formData, bankBranch: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Mã số thuế</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: 0123456789"
                      value={formData.taxCode}
                      onChange={e => setFormData({...formData, taxCode: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Địa chỉ</label>
                  <textarea
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Địa chỉ đầy đủ của đại lý"
                    rows={2}
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
              </div>
              </details>

              {/* QR Code Upload */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center">
                  <QrCode className="w-4 h-4 mr-2" />
                  Mã QR thanh toán
                </h4>
                <div className="flex items-start space-x-4">
                  {formData.qrCodeBase64 && (
                    <div className="w-32 h-32 border-2 border-slate-200 rounded-lg overflow-hidden bg-white p-2">
                      <img 
                        src={formData.qrCodeBase64} 
                        alt="QR Code" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleQRCodeUpload}
                      className="hidden"
                      id="qr-code-upload"
                    />
                    <label
                      htmlFor="qr-code-upload"
                      className="flex items-center justify-center space-x-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors w-full"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{formData.qrCodeBase64 ? 'Thay đổi mã QR' : 'Tải lên mã QR'}</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-2">
                      PNG, JPG tối đa 2MB. Mã QR này sẽ được hiển thị khi tạo lệnh thanh toán cho đại lý.
                    </p>
                  </div>
                </div>
              </div>

              {/* Point of Sale Assignment - STEP 1: Gán điểm bán trước */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center">
                  <Store className="w-4 h-4 mr-2" />
                  Bước 1: Gán Điểm thu ({formData.assignedPointOfSales?.length || 0} điểm thu)
                </h4>
                <p className="text-xs text-slate-500 bg-blue-50 p-2 rounded border border-blue-100">
                  <strong>Workflow mới:</strong> Gán điểm thu trước, sau đó cấu hình chiết khấu cho từng điểm thu ở bước 2.
                </p>
                
                {allPointOfSales.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="grid grid-cols-1 gap-2">
                      {allPointOfSales.map((pos) => (
                        <label key={pos} className="flex items-center space-x-3 p-2 hover:bg-white rounded cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={formData.assignedPointOfSales?.includes(pos) || false}
                            onChange={(e) => {
                              const current = formData.assignedPointOfSales || [];
                              const discountRatesByPOS = formData.discountRatesByPointOfSale || {};
                              
                              if (e.target.checked) {
                                // Khi check, khởi tạo discount rates cho điểm bán này nếu chưa có
                                if (!discountRatesByPOS[pos]) {
                                  discountRatesByPOS[pos] = {
                                    "QR 1 (VNPay)": 0,
                                    "QR 2 (App Bank)": 0,
                                    "Sofpos": 0,
                                    "POS": 0
                                  };
                                }
                                setFormData({
                                  ...formData, 
                                  assignedPointOfSales: [...current, pos],
                                  discountRatesByPointOfSale: discountRatesByPOS
                                });
                              } else {
                                // Khi uncheck, xóa discount rates của điểm bán này
                                delete discountRatesByPOS[pos];
                                setFormData({
                                  ...formData, 
                                  assignedPointOfSales: current.filter(p => p !== pos),
                                  discountRatesByPointOfSale: discountRatesByPOS
                                });
                              }
                            }}
                          />
                          <div className="flex-1">
                            <div className="font-mono text-sm text-slate-800">{pos}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
                    <Store className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Chưa có điểm thu nào trong hệ thống</p>
                    <p className="text-xs mt-1">Vui lòng thêm điểm thu trong Quản lý Điểm bán trước</p>
                  </div>
                )}
              </div>

              {/* Discount Rates by Point of Sale - STEP 2: Cấu hình chiết khấu cho từng điểm bán */}
              {formData.assignedPointOfSales && formData.assignedPointOfSales.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center">
                    <Percent className="w-4 h-4 mr-2" />
                    Bước 2: Cấu hình Chiết khấu theo Điểm thu
                  </h4>
                  <p className="text-xs text-slate-500">
                    Cấu hình tỷ lệ chiết khấu cho từng điểm thu đã gán. Mỗi điểm thu có thể có chiết khấu khác nhau.
                  </p>
                  
                  <div className="space-y-4">
                    {formData.assignedPointOfSales.map((pos) => {
                      const posDiscountRates = formData.discountRatesByPointOfSale?.[pos] || {
                        "QR 1 (VNPay)": 0,
                        "QR 2 (App Bank)": 0,
                        "Sofpos": 0,
                        "POS": 0
                      };
                      
                      return (
                        <div key={pos} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                          <div className="font-mono text-sm font-semibold text-indigo-700 mb-3">{pos}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {["QR 1 (VNPay)", "QR 2 (App Bank)", "Sofpos", "POS"].map((method) => (
                              <div key={method} className="space-y-1">
                                <label className="text-xs font-medium text-slate-600">{method}</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    value={posDiscountRates[method] || 0}
                                    onChange={e => {
                                      const newRates = { ...formData.discountRatesByPointOfSale };
                                      if (!newRates[pos]) {
                                        newRates[pos] = { ...posDiscountRates };
                                      }
                                      newRates[pos][method] = parseFloat(e.target.value) || 0;
                                      setFormData({ ...formData, discountRatesByPointOfSale: newRates });
                                    }}
                                  />
                                  <span className="absolute right-3 top-2 text-slate-400 text-xs">%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Agents;
