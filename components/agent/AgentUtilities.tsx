import React, { useState, useEffect } from 'react';
import { Link2, Copy, CheckCircle, Lock, QrCode, AlertCircle } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import { hashPassword } from '../../src/lib/authServices';
import { AgentsService } from '../../src/lib/firebaseServices';
import type { Agent } from '../../types';

const AgentUtilities: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;

  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const agent = agents.find(a => a.id === agentId);

  const [userLinkCopied, setUserLinkCopied] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const userLink = agent?.referralLinkUser || (agent ? `/user/upbill?agents=${agent.code}` : '');

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setUserLinkCopied(true);
      setTimeout(() => setUserLinkCopied(false), 2000);
    } catch (error) {
      alert('Không thể copy link. Vui lòng copy thủ công.');
    }
  };

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
      const hashedPassword = await hashPassword(newPassword);
      await AgentsService.update(agentId!, { password: hashedPassword });
      
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

  if (!agentId || !agent) {
    return <div>Vui lòng đăng nhập</div>;
  }

  return (
    <div className="space-y-6">
      {/* Referral Links */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Link2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Link chia sẻ</h2>
            <p className="text-sm text-slate-500">Copy link để chia sẻ cho khách hàng</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* User Link */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Link cho khách hàng (User)
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={userLink}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 font-mono text-sm"
              />
              <button
                onClick={() => copyToClipboard(userLink)}
                className="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-lg text-slate-700 bg-white hover:bg-slate-50"
              >
                {userLinkCopied ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                    Đã copy
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Gửi link này cho khách hàng để họ up bill
            </p>
          </div>

          {/* QR Code Generation (optional - can be added later) */}
          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-600">
              💡 Tip: Bạn có thể tạo QR code từ link để dễ dàng chia sẻ
            </p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Lock className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Đổi mật khẩu</h2>
            <p className="text-sm text-slate-500">Cập nhật mật khẩu đăng nhập</p>
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
            <Lock className="w-4 h-4 mr-2" />
            {isChangingPassword ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AgentUtilities;

