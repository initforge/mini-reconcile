
import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Building2, CreditCard, CheckCircle, XCircle, Phone, Mail, MapPin, Hash, Users, TrendingUp, DollarSign, Settings, UserCheck, Save, X, Store, ToggleLeft, ToggleRight, Landmark } from 'lucide-react';
import { Merchant, Agent, AgentFeeStructure } from '../types';
import { useRealtimeData, useFirebaseWrite, FirebaseUtils } from '../src/lib/firebaseHooks';
import { MerchantsService } from '../src/lib/firebaseServices';

const Merchants: React.FC = () => {
  // Firebase hooks
  const { data: merchantsData, loading } = useRealtimeData<Record<string, Merchant>>('/merchants');
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { writeData, updateData, deleteData, loading: actionLoading, error } = useFirebaseWrite();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  
  // Enhanced state for fee management
  const [showFeeStructure, setShowFeeStructure] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Convert Firebase object to array
  const merchants = FirebaseUtils.objectToArray(merchantsData || {});
  
  // Form State - Enhanced
  const initialFormState: Omit<Merchant, 'id'> = {
    name: '', // Will be auto-generated from pointOfSaleName if empty
    code: '', // Will be auto-generated from pointOfSaleName if empty
    bankAccount: '',
    bankName: '',
    isActive: true,
    address: '',
    contactPhone: '',
    contactEmail: '',
    mccCode: '',
    businessType: '',
    taxCode: '',
    notes: '',
    // Point of sale fields
    branchName: '',
    pointOfSaleName: '',
    pointOfSaleCode: ''
  };
  
  const [formData, setFormData] = useState<Omit<Merchant, 'id'>>(initialFormState);


  // Filter merchants
  const filteredMerchants = merchants.filter((merchant: Merchant) => {
    const matchesSearch = merchant.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (merchant as any).code?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'active' && merchant.isActive !== false) ||
                         (statusFilter === 'inactive' && merchant.isActive === false);
    
    return matchesSearch && matchesStatus;
  });

  // Toggle merchant status
  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      await MerchantsService.updateStatus(id, !currentStatus);
    } catch (error) {
      console.error('Error updating merchant status:', error);
      alert('Có lỗi khi cập nhật trạng thái');
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const handleEdit = (merchant: Merchant) => {
    setEditingId(merchant.id);
    setFormData({
      name: merchant.name,
      code: merchant.code,
      bankAccount: merchant.bankAccount,
      bankName: merchant.bankName,
      isActive: merchant.isActive !== false,
      address: merchant.address || '',
      contactPhone: merchant.contactPhone || '',
      contactEmail: merchant.contactEmail || '',
      mccCode: merchant.mccCode || '',
      businessType: merchant.businessType || '',
      taxCode: merchant.taxCode || '',
      notes: merchant.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa điểm bán này? Dữ liệu đối soát liên quan có thể bị ảnh hưởng.')) {
      try {
        await MerchantsService.delete(id);
        alert('Đã xóa điểm bán thành công!');
      } catch (error) {
        console.error('Error deleting merchant:', error);
        alert('Có lỗi khi xóa điểm bán. Vui lòng thử lại.');
      }
    }
  };

  const handleSubmit = async () => {
    console.log('🚀 Merchants Save - Bắt đầu lưu:', { formData, editingId });
    
    // Validation - chỉ yêu cầu pointOfSaleName, bankAccount, bankName
    if (!formData.pointOfSaleName?.trim()) {
      console.log('❌ Validation fail - thiếu Tên Điểm thu');
      alert('Vui lòng nhập Tên Điểm thu (bắt buộc)');
      return;
    }
    
    if (!formData.bankAccount.trim() || !formData.bankName.trim()) {
      console.log('❌ Validation fail - thiếu thông tin tài khoản');
      alert('Vui lòng điền đầy đủ thông tin tài khoản nhận tiền (Ngân hàng, Số tài khoản)');
      return;
    }

    // Tự động generate name và code từ pointOfSaleName nếu chưa có
    const finalFormData = {
      ...formData,
      name: formData.name.trim() || formData.pointOfSaleName.trim(),
      code: formData.code.trim() || formData.pointOfSaleName.trim().toUpperCase().replace(/\s+/g, '_')
    };

    try {
      console.log('🔍 Kiểm tra mã trùng lặp...');
      // Kiểm tra mã trùng lặp (chỉ khi tạo mới)
      if (!editingId) {
        const codeExists = await MerchantsService.codeExists(finalFormData.code, undefined);
        console.log('✅ Check code result:', codeExists);
        
        if (codeExists) {
          console.log('❌ Mã đã tồn tại');
          alert('Mã điểm bán đã tồn tại. Vui lòng sử dụng mã khác.');
          return;
        }
      }

      if (editingId) {
        console.log('📝 Updating merchant:', editingId);
        // Edit existing merchant
        await MerchantsService.update(editingId, finalFormData);
        console.log('✅ Update successful');
        alert('Đã cập nhật thông tin điểm bán thành công!');
      } else {
        console.log('➕ Creating new merchant');
        // Add new merchant  
        const newId = await MerchantsService.create({
          ...finalFormData,
          isActive: true
        });
        console.log('✅ Create successful, ID:', newId);
        alert('Đã thêm điểm bán mới thành công!');
      }
      
      console.log('🏁 Hoàn thành save, đóng modal');
      setIsModalOpen(false);
      setFormData(initialFormState);
      setEditingId(null);
    } catch (error) {
      console.error('🚨 CRITICAL ERROR trong Merchants Save:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        formData,
        editingId
      });
      alert(`Có lỗi khi lưu thông tin: ${error.message}`);
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
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 w-full sm:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
              placeholder="Tìm kiếm theo tên hoặc mã điểm bán..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Status Filter */}
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button 
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                statusFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Tất cả ({merchants.length})
            </button>
            <button 
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                statusFilter === 'active' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Hoạt động ({merchants.filter((m: Merchant) => m.isActive !== false).length})
            </button>
            <button 
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                statusFilter === 'inactive' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Tạm dừng ({merchants.filter((m: Merchant) => m.isActive === false).length})
            </button>
          </div>
        </div>
        
        <button 
          onClick={handleAddNew}
          className="flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 mr-2" />
          Thêm Điểm bán
        </button>
      </div>

      {/* Merchants Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredMerchants.map((merchant: Merchant) => (
          <div key={merchant.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 group">
            <div className="p-6 border-b border-slate-50">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    merchant.isActive !== false ? 'bg-emerald-100' : 'bg-slate-100'
                  }`}>
                    <Store className={`w-6 h-6 ${
                      merchant.isActive !== false ? 'text-emerald-600' : 'text-slate-400'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">{merchant.name}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        merchant.isActive !== false 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {merchant.isActive !== false ? 'Hoạt động' : 'Tạm dừng'}
                      </span>
                    </div>
                    <div className="flex items-center mt-1 space-x-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Mã:</span>
                        <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">{merchant.code}</span>
                        {merchant.pointOfSaleName && (
                          <>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200" title="Điểm thu">
                              {merchant.pointOfSaleName}
                            </span>
                          </>
                        )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  {/* Toggle Status */}
                  <button
                    onClick={() => handleToggleStatus(merchant.id, merchant.isActive !== false)}
                    className="p-2 hover:bg-slate-50 rounded-full transition-colors"
                    title={merchant.isActive !== false ? 'Tạm dừng hoạt động' : 'Kích hoạt lại'}
                  >
                    {merchant.isActive !== false ? 
                      <ToggleRight className="w-5 h-5 text-emerald-600" /> : 
                      <ToggleLeft className="w-5 h-5 text-slate-400" />
                    }
                  </button>
                  
                  <button 
                    onClick={() => handleEdit(merchant)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(merchant.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
               {/* Enhanced Contact Info */}
               {(merchant.contactPhone || merchant.contactEmail || merchant.address) && (
                 <div>
                   <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Thông tin liên hệ</h4>
                   <div className="space-y-2">
                     {merchant.contactPhone && (
                       <div className="flex items-center">
                         <Phone className="w-4 h-4 mr-2 text-slate-400" />
                         <span className="text-sm text-slate-700">{merchant.contactPhone}</span>
                       </div>
                     )}
                     {merchant.contactEmail && (
                       <div className="flex items-center">
                         <Mail className="w-4 h-4 mr-2 text-slate-400" />
                         <span className="text-sm text-slate-700">{merchant.contactEmail}</span>
                       </div>
                     )}
                     {merchant.address && (
                       <div className="flex items-start">
                         <MapPin className="w-4 h-4 mr-2 text-slate-400 mt-0.5" />
                         <span className="text-sm text-slate-700">{merchant.address}</span>
                       </div>
                     )}
                   </div>
                 </div>
               )}

               {/* Business Info */}
               <div>
                 <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Thông tin kinh doanh</h4>
                 <div className="grid grid-cols-2 gap-3 text-sm">
                   {merchant.businessType && (
                     <div>
                       <span className="text-slate-500 block">Loại hình KD</span>
                       <span className="font-medium text-slate-700">{merchant.businessType}</span>
                     </div>
                   )}
                   {merchant.mccCode && (
                     <div>
                       <span className="text-slate-500 block">MCC Code</span>
                       <span className="font-mono font-medium text-slate-700">{merchant.mccCode}</span>
                     </div>
                   )}
                 </div>
               </div>


               {/* Point of Sale Info */}
               {(merchant.branchName || merchant.pointOfSaleName || merchant.pointOfSaleCode) && (
                 <div>
                   <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Thông tin Điểm thu</h4>
                   <div className="space-y-2 bg-slate-50 rounded-lg p-4 border border-slate-100">
                     {merchant.branchName && (
                       <div className="flex items-start">
                         <Building2 className="w-4 h-4 mr-3 text-slate-400 mt-0.5" />
                         <div className="flex-1">
                           <span className="text-xs text-slate-500 block">Chi nhánh</span>
                           <span className="font-medium text-slate-700">{merchant.branchName}</span>
                         </div>
                       </div>
                     )}
                     {merchant.pointOfSaleName && (
                       <div className="flex items-start">
                         <Store className="w-4 h-4 mr-3 text-slate-400 mt-0.5" />
                         <div className="flex-1">
                           <span className="text-xs text-slate-500 block">Tên Điểm thu</span>
                           <span className="font-mono font-medium text-slate-800">{merchant.pointOfSaleName}</span>
                         </div>
                       </div>
                     )}
                     {merchant.pointOfSaleCode && (
                       <div className="flex items-start">
                         <Hash className="w-4 h-4 mr-3 text-slate-400 mt-0.5" />
                         <div className="flex-1">
                           <span className="text-xs text-slate-500 block">Mã Điểm thu</span>
                           <span className="font-mono font-medium text-slate-800">{merchant.pointOfSaleCode}</span>
                         </div>
                       </div>
                     )}
                   </div>
                 </div>
               )}

               {/* Payment Info */}
               <div>
                 <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Thông tin thanh toán</h4>
                 <div className="space-y-3 bg-slate-50 rounded-lg p-4 border border-slate-100">
                   <div className="flex items-start">
                     <Building2 className="w-4 h-4 mr-3 text-slate-400 mt-0.5" />
                     <div className="flex-1">
                       <span className="text-xs text-slate-500 block">Ngân hàng</span>
                       <span className="font-medium text-slate-700">{merchant.bankName || 'Chưa cập nhật'}</span>
                     </div>
                   </div>
                   <div className="flex items-start">
                     <CreditCard className="w-4 h-4 mr-3 text-slate-400 mt-0.5" />
                     <div className="flex-1">
                       <span className="text-xs text-slate-500 block">Số tài khoản</span>
                       <span className="font-mono font-bold text-slate-800 tracking-wide">{merchant.bankAccount || 'Chưa cập nhật'}</span>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        ))}
      </div>

      {filteredMerchants.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Store className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Không tìm thấy điểm bán</h3>
          <p className="text-slate-500 mt-1">Thử tìm kiếm hoặc thêm mới điểm bán vào hệ thống.</p>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <h3 className="text-lg font-bold text-slate-800">
                {editingId ? 'Cập nhật Điểm bán' : 'Thêm Điểm bán mới'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Basic Info */}
              {/* Point of Sale Info */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Thông tin Điểm thu</h4>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Tên Chi nhánh</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: AN CÁT TƯỜNG"
                      value={formData.branchName}
                      onChange={e => setFormData({...formData, branchName: e.target.value})}
                    />
                    <p className="text-xs text-slate-500">Tên chi nhánh từ file Excel (cột "Chi nhánh")</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Điểm thu <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                      placeholder="VD: ANCATTUONG66PKV01"
                      value={formData.pointOfSaleName}
                      onChange={e => setFormData({...formData, pointOfSaleName: e.target.value})}
                    />
                    <p className="text-xs text-slate-500">Tên điểm thu từ file Excel (cột "Điểm thu") - dùng để match với Agent</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Mã Điểm thu</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                      placeholder="VD: NVAUDIO1"
                      value={formData.pointOfSaleCode}
                      onChange={e => setFormData({...formData, pointOfSaleCode: e.target.value})}
                    />
                    <p className="text-xs text-slate-500">Mã điểm thu từ file Excel (cột "Mã điểm thu")</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Thông tin tài khoản nhận tiền</h4>
                 <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Ngân hàng</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="VD: Vietcombank, Techcombank..."
                          value={formData.bankName}
                          onChange={e => setFormData({...formData, bankName: e.target.value})}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Số tài khoản</label>
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                          placeholder="VD: 0011223344"
                          value={formData.bankAccount}
                          onChange={e => setFormData({...formData, bankAccount: e.target.value})}
                        />
                    </div>
                 </div>
              </div>

              {/* Enhanced Info */}
              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Thông tin bổ sung</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Số điện thoại</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: 0901234567"
                      value={formData.contactPhone}
                      onChange={e => setFormData({...formData, contactPhone: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Email liên hệ</label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="VD: contact@merchant.com"
                      value={formData.contactEmail}
                      onChange={e => setFormData({...formData, contactEmail: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">MCC Code</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                      placeholder="VD: 5411"
                      value={formData.mccCode}
                      onChange={e => setFormData({...formData, mccCode: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Loại hình KD</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      value={formData.businessType}
                      onChange={e => setFormData({...formData, businessType: e.target.value})}
                    >
                      <option value="">Chọn loại hình</option>
                      <option value="Siêu thị">Siêu thị</option>
                      <option value="Cửa hàng tiện lợi">Cửa hàng tiện lợi</option>
                      <option value="Nhà hàng">Nhà hàng</option>
                      <option value="Cafe">Cafe</option>
                      <option value="Khác">Khác</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1 mt-4">
                  <label className="text-sm font-medium text-slate-700">Địa chỉ</label>
                  <textarea
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Địa chỉ đầy đủ của điểm bán"
                    rows={2}
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
              </div>

            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end space-x-3 bg-slate-50 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {actionLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Merchants;
