import React, { useState } from 'react';
import { Search, Users, Plus, Edit2, Trash2, Eye, X, Save, Phone, Mail, User as UserIcon } from 'lucide-react';
import { UserService } from '../../src/lib/userServices';
import { useRealtimeData, FirebaseUtils, useFirebaseWrite } from '../../src/lib/firebaseHooks';
import { DeletionService } from '../../src/lib/deletionService';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import type { User } from '../../types';

const PersonnelManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<{ id: string; name: string } | null>(null);
  const { writeData, updateData, deleteData } = useFirebaseWrite();

  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const allUsers = FirebaseUtils.objectToArray(usersData || {});

  // Form state
  const [formData, setFormData] = useState<Omit<User, 'id' | 'createdAt' | 'lastActive'>>({
    phone: '',
    password: '',
    fullName: '',
    email: '',
    qrCodeBase64: ''
  });

  // Filter users by search term (name or phone) - exclude deleted users
  const filteredUsers = allUsers.filter(user => {
    // Exclude soft-deleted users
    if (user.deleted) return false;
    
    const lowerSearch = searchTerm.toLowerCase();
    return (
      user.fullName?.toLowerCase().includes(lowerSearch) ||
      user.phone?.toLowerCase().includes(lowerSearch) ||
      (user.email && user.email.toLowerCase().includes(lowerSearch))
    );
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleAdd = () => {
    setEditingId(null);
    setFormData({
      phone: '',
      password: '',
      fullName: '',
      email: '',
      qrCodeBase64: ''
    });
    setIsModalOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({
      phone: user.phone || '',
      password: '', // Don't show password
      fullName: user.fullName,
      email: user.email || '',
      qrCodeBase64: user.qrCodeBase64 || ''
    });
    setIsModalOpen(true);
  };

  const handleView = (user: User) => {
    setViewingId(user.id);
  };

  const handleDelete = (user: User) => {
    setDeletingUser({ id: user.id, name: user.fullName || user.phone });
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (deleteType: 'cascade' | 'soft') => {
    if (!deletingUser) return;

    try {
      let result;
      if (deleteType === 'cascade') {
        result = await DeletionService.cascadeDeleteUser(deletingUser.id);
      } else {
        result = await DeletionService.softDeleteUser(deletingUser.id);
      }

      if (result.success) {
        alert(result.message);
        setDeleteModalOpen(false);
        setDeletingUser(null);
      } else {
        alert(`Lỗi: ${result.message}`);
      }
    } catch (error: any) {
      alert(`Lỗi khi xóa: ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        // Update existing user
        const updateDataObj: any = {
          ...formData,
          updatedAt: FirebaseUtils.getServerTimestamp()
        };
        // Don't update password if empty
        if (!formData.password.trim()) {
          delete updateDataObj.password;
        }
        await updateData(`/users/${editingId}`, updateDataObj);
        alert('Đã cập nhật khách hàng thành công');
      } else {
        // Create new user
        const newUser: Omit<User, 'id'> = {
          ...formData,
          phone: formData.phone, // Required
          password: formData.password, // Plain text
          createdAt: FirebaseUtils.getServerTimestamp(),
          lastActive: FirebaseUtils.getServerTimestamp()
        };
        const newId = FirebaseUtils.generateId();
        await writeData(`/users/${newId}`, newUser);
        alert('Đã thêm khách hàng mới thành công');
      }
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({
        phone: '',
        password: '',
        fullName: '',
        email: '',
        qrCodeBase64: ''
      });
    } catch (error) {
      alert('Có lỗi khi lưu khách hàng');
    }
  };

  const selectedUser = viewingId ? allUsers.find(u => u.id === viewingId) : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Quản lý Khách hàng</h2>
        <button
          onClick={handleAdd}
          className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-5 h-5" />
          <span>Thêm khách hàng mới</span>
        </button>
      </div>

      <div className="space-y-4">
          {/* Search Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                placeholder="Tìm kiếm theo tên hoặc số điện thoại..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Số điện thoại</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Họ tên</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ngày đăng ký</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        {searchTerm ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {user.phone || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          {user.fullName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {user.email || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {formatDate(user.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleView(user)}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEdit(user)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Sửa"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(user)}
                              className="text-red-600 hover:text-red-900"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-900">
                {editingId ? 'Sửa khách hàng' : 'Thêm khách hàng mới'}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingId(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Số điện thoại <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => {
                      // Cho phép số và chữ x/X
                      const value = e.target.value.replace(/[^0-9xX]/g, '');
                      setFormData({ ...formData, phone: value });
                    }}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nhập số điện thoại (ví dụ: 0932433xxx)"
                    maxLength={11}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Họ tên <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nhập họ tên"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Nhập email (tùy chọn)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mật khẩu {!editingId && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  required={!editingId}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder={editingId ? "Để trống nếu không đổi mật khẩu" : "Nhập mật khẩu"}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingId(null);
                  }}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewingId && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-900">Chi tiết khách hàng</h3>
              <button
                onClick={() => setViewingId(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
                <p className="text-slate-900">{selectedUser.phone || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên</label>
                <p className="text-slate-900">{selectedUser.fullName}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <p className="text-slate-900">{selectedUser.email || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ngày đăng ký</label>
                <p className="text-slate-900">{formatDate(selectedUser.createdAt)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Lần hoạt động cuối</label>
                <p className="text-slate-900">{formatDate(selectedUser.lastActive)}</p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setViewingId(null)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <DeleteConfirmModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setDeletingUser(null);
          }}
          onConfirm={handleConfirmDelete}
          entityType="user"
          entityName={deletingUser.name}
          entityId={deletingUser.id}
        />
      )}
    </div>
  );
};

export default PersonnelManagement;

