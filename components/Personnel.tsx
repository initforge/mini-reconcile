
import React, { useState } from 'react';
import { UserPlus, Search, Filter, Shield, Mail, Lock, UserCheck, Trash2, Edit2, X, Save, Key, DollarSign } from 'lucide-react';
import { UserRole, UserStatus, User } from '../types';
import { useRealtimeData, useFirebaseWrite, FirebaseUtils } from '../src/lib/firebaseHooks';

const Personnel: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Firebase hooks
  const { data: usersData, loading } = useRealtimeData<Record<string, User>>('/users');
  const { writeData, updateData, deleteData, loading: actionLoading } = useFirebaseWrite();
  const users = FirebaseUtils.objectToArray(usersData || {});
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    username: '',
    fullName: '',
    email: '',
    role: UserRole.VIEWER,
    department: '',
    password: '' // Not stored in main User object, used for form only
  });

  const filteredUsers = users.filter(user => 
    user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddNew = () => {
    setEditingUser(null);
    setFormData({
      id: `U${Date.now()}`,
      username: '',
      fullName: '',
      email: '',
      role: UserRole.VIEWER,
      department: '',
      password: ''
    });
    setIsModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      ...user,
      password: '' // Don't load actual password
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa nhân viên này?')) {
      try {
        await deleteData(`/users/${id}`);
        alert('Đã xóa nhân viên thành công!');
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Có lỗi khi xóa nhân viên');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.username.trim() || !formData.fullName.trim() || !formData.email.trim()) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    try {
      const userData: User = {
        id: formData.id,
        username: formData.username,
        fullName: formData.fullName,
        email: formData.email,
        role: formData.role,
        department: formData.department,
        status: UserStatus.ACTIVE,
        lastActive: editingUser ? editingUser.lastActive : new Date().toISOString(),
        avatarUrl: '',
        createdAt: editingUser?.createdAt || new Date().toISOString()
      };

      if (editingUser) {
        // Update existing user
        await updateData(`/users/${editingUser.id}`, userData);
        alert('Đã cập nhật thông tin nhân viên thành công!');
      } else {
        // Add new user
        await writeData(`/users/${userData.id}`, userData);
        alert('Đã thêm nhân viên mới thành công!');
      }

      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving user:', error);
      alert('Có lỗi khi lưu thông tin nhân viên');
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return <Shield className="w-6 h-6 text-purple-600" />;
      case UserRole.ACCOUNTANT:
        return <DollarSign className="w-6 h-6 text-blue-600" />;
      case UserRole.SUPPORT:
        return <UserCheck className="w-6 h-6 text-green-600" />;
      default:
        return <UserPlus className="w-6 h-6 text-slate-600" />;
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return <span className="px-2 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">Administrator</span>;
      case UserRole.ACCOUNTANT:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Kế toán</span>;
      case UserRole.SUPPORT:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Vận hành</span>;
      default:
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Viewer</span>;
    }
  };
  
  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-100';
      case UserRole.ACCOUNTANT:
        return 'bg-blue-100';
      case UserRole.SUPPORT:
        return 'bg-green-100';
      default:
        return 'bg-slate-100';
    }
  };

  const getStatusBadge = (status: UserStatus) => {
    return status === UserStatus.ACTIVE 
      ? <span className="flex items-center text-xs font-medium text-green-600"><span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>{status}</span>
      : <span className="flex items-center text-xs font-medium text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-400 mr-2"></span>{status}</span>;
  };

  return (
    <div className="space-y-6 relative">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="relative flex-1 w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            placeholder="Tìm kiếm nhân viên..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button className="flex items-center justify-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none">
            <Filter className="w-4 h-4 mr-2" />
            Bộ lọc
          </button>
          <button 
            onClick={handleAddNew}
            className="flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none w-full sm:w-auto"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Thêm nhân sự
          </button>
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <div key={user.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
            <div className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full ${getRoleColor(user.role)} flex items-center justify-center shadow-sm`}>
                    {getRoleIcon(user.role)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{user.fullName}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{user.department}</p>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button 
                    onClick={() => handleEdit(user)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" 
                    title="Chỉnh sửa"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(user.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center text-sm text-slate-600 bg-slate-50 p-2 rounded-md">
                  <Lock className="w-4 h-4 mr-3 text-slate-400" />
                  <div className="flex-1 flex justify-between items-center">
                    <span className="text-xs text-slate-500">Tên đăng nhập:</span>
                    <span className="font-medium font-mono text-slate-700">{user.username}</span>
                  </div>
                </div>
                
                <div className="flex items-center text-sm text-slate-600">
                  <Mail className="w-4 h-4 mr-3 text-slate-400" />
                  {user.email}
                </div>
                <div className="flex items-center text-sm text-slate-600">
                  <Shield className="w-4 h-4 mr-3 text-slate-400" />
                  <div className="flex-1 flex justify-between items-center">
                    <span>Vai trò</span>
                    {getRoleBadge(user.role)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs text-slate-400">Hoạt động: {user.lastActive}</span>
            </div>
          </div>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Không tìm thấy kết quả</h3>
          <p className="text-slate-500 mt-1">Thử tìm kiếm với từ khóa khác.</p>
        </div>
      )}

      {/* Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                {editingUser ? 'Chỉnh sửa nhân sự' : 'Thêm nhân sự mới'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* User Identity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Tên đăng nhập <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                  />
                </div>
                 <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Mật khẩu {editingUser && <span className="font-normal text-slate-400 text-xs">(Để trống nếu không đổi)</span>}</label>
                  <div className="relative">
                     <input
                      type="password"
                      className="w-full px-3 py-2 pl-9 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder={editingUser ? "••••••" : "Nhập mật khẩu"}
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      required={!editingUser}
                    />
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Họ và tên <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.fullName}
                  onChange={e => setFormData({...formData, fullName: e.target.value})}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Email <span className="text-red-500">*</span></label>
                <input
                  required
                  type="email"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Phòng ban</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.department}
                  onChange={e => setFormData({...formData, department: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Vai trò</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    value={formData.role}
                    onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                  >
                    {Object.values(UserRole).map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {actionLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Personnel;