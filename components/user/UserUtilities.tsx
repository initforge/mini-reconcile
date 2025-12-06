import React, { useState, useEffect } from 'react';
import { Lock, Upload, QrCode, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { UserService } from '../../src/lib/userServices';
import { hashPassword } from '../../src/lib/authServices';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { User } from '../../types';

const UserUtilities: React.FC = () => {
  const userAuth = localStorage.getItem('userAuth');
  const userId = userAuth ? JSON.parse(userAuth).userId : null;

  const { data: usersData } = useRealtimeData<Record<string, User>>('/users');
  const users = FirebaseUtils.objectToArray(usersData || {});
  const currentUser = users.find(u => u.id === userId);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedQRFile, setSelectedQRFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [savedQRCode, setSavedQRCode] = useState<string | null>(null);
  const [isUploadingQR, setIsUploadingQR] = useState(false);
  const [qrMessage, setQrMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync preview with saved QR code when user data changes
  useEffect(() => {
    if (currentUser?.qrCodeBase64) {
      setSavedQRCode(currentUser.qrCodeBase64);
      // Only set preview to saved if no local selection
      if (!selectedQRFile) {
        setQrPreview(currentUser.qrCodeBase64);
      }
    } else {
      setSavedQRCode(null);
      if (!selectedQRFile) {
        setQrPreview(null);
      }
    }
  }, [currentUser, selectedQRFile]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (qrPreview && qrPreview.startsWith('blob:')) {
        URL.revokeObjectURL(qrPreview);
      }
    };
  }, [qrPreview]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsChangingPassword(true);
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu xác nhận không khớp' });
      setIsChangingPassword(false);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu phải có ít nhất 6 ký tự' });
      setIsChangingPassword(false);
      return;
    }

    try {
      // In a real app, you'd verify current password first
      // For now, we'll just update it
      const hashedPassword = await hashPassword(newPassword);
      await UserService.updateUser(userId!, { password: hashedPassword } as Partial<User>);
      
      setPasswordMessage({ type: 'success', text: 'Đổi mật khẩu thành công!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      setPasswordMessage({ type: 'error', text: error.message || 'Đã xảy ra lỗi khi đổi mật khẩu' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleQRFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setQrMessage({ type: 'error', text: 'Vui lòng chọn file hình ảnh' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setQrMessage({ type: 'error', text: 'File quá lớn. Vui lòng chọn file nhỏ hơn 2MB' });
      return;
    }

    // Revoke previous object URL if exists
    if (qrPreview && qrPreview.startsWith('blob:')) {
      URL.revokeObjectURL(qrPreview);
    }

    setSelectedQRFile(file);
    setQrMessage(null);

    // Create object URL for preview (local, not saved)
    const objectUrl = URL.createObjectURL(file);
    setQrPreview(objectUrl);
  };

  const handleUploadQR = async () => {
    if (!selectedQRFile || !userId) {
      setQrMessage({ type: 'error', text: 'Vui lòng chọn ảnh QR code' });
      return;
    }

    setIsUploadingQR(true);
    setQrMessage(null);

    try {
      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedQRFile);
      });

      // Save to Firebase
      await UserService.updateUser(userId, { qrCodeBase64: base64Data } as Partial<User>);

      // Update saved state
      setSavedQRCode(base64Data);
      
      // Revoke object URL and switch to base64
      if (qrPreview && qrPreview.startsWith('blob:')) {
        URL.revokeObjectURL(qrPreview);
      }
      setQrPreview(base64Data); // Now showing saved version
      setSelectedQRFile(null);
      
      setQrMessage({ type: 'success', text: 'Lưu QR code thành công!' });
    } catch (error: any) {
      setQrMessage({ type: 'error', text: error.message || 'Đã xảy ra lỗi khi lưu QR code' });
    } finally {
      setIsUploadingQR(false);
    }
  };

  if (!userId) {
    return <div>Vui lòng đăng nhập</div>;
  }

  return (
    <div className="space-y-6">
      {/* Change Password */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Lock className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Đổi mật khẩu</h2>
            <p className="text-sm text-slate-500">Cập nhật mật khẩu đăng nhập của bạn</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Mật khẩu hiện tại</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Nhập mật khẩu hiện tại"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Mật khẩu mới</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Xác nhận mật khẩu mới</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Nhập lại mật khẩu mới"
              minLength={6}
            />
          </div>

          {passwordMessage && (
            <div className={`p-3 rounded-lg flex items-center space-x-2 ${
              passwordMessage.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {passwordMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <p className="text-sm">{passwordMessage.text}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isChangingPassword}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            {isChangingPassword ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </button>
        </form>
      </div>

      {/* Upload QR Code */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <QrCode className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">QR Code thanh toán</h2>
            <p className="text-sm text-slate-500">Upload QR code để đại lý quét thanh toán</p>
          </div>
        </div>

        <div className="space-y-4">
          {qrPreview && (
            <div className="flex flex-col items-center space-y-2">
              <div className="w-48 h-48 border-2 border-slate-200 rounded-lg overflow-hidden bg-white p-2 relative">
                <img
                  src={qrPreview}
                  alt="QR Code"
                  className="w-full h-full object-contain"
                />
                {/* Status badge */}
                {selectedQRFile ? (
                  <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>Chưa lưu</span>
                  </div>
                ) : savedQRCode ? (
                  <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Đã lưu</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Chọn ảnh QR code</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleQRFileSelect}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            <p className="text-xs text-slate-500 mt-1">PNG, JPG tối đa 2MB</p>
          </div>

          {qrMessage && (
            <div className={`p-3 rounded-lg flex items-center space-x-2 ${
              qrMessage.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {qrMessage.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <p className="text-sm">{qrMessage.text}</p>
            </div>
          )}

          {selectedQRFile && (
            <button
              onClick={handleUploadQR}
              disabled={isUploadingQR}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              {isUploadingQR ? 'Đang lưu...' : 'Lưu QR Code'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserUtilities;

