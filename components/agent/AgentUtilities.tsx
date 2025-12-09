import React, { useState, useEffect } from 'react';
import { Link2, Copy, CheckCircle } from 'lucide-react';
import { useRealtimeData, FirebaseUtils } from '../../src/lib/firebaseHooks';
import type { Agent } from '../../types';

const AgentUtilities: React.FC = () => {
  const agentAuth = localStorage.getItem('agentAuth');
  const agentId = agentAuth ? JSON.parse(agentAuth).agentId : null;

  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const agent = agents.find(a => a.id === agentId);

  const [userLinkCopied, setUserLinkCopied] = useState(false);

  // Generate full URL for user link
  const baseUrl = 'https://mini-reconcile.vercel.app';
  const userLink = agent?.referralLinkUser 
    ? (agent.referralLinkUser.startsWith('http') 
        ? agent.referralLinkUser 
        : `${baseUrl}${agent.referralLinkUser.startsWith('/') ? '' : '/'}${agent.referralLinkUser}`)
    : (agent ? `${baseUrl}/user/upbill?agent=${agent.code}` : '');

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setUserLinkCopied(true);
      setTimeout(() => setUserLinkCopied(false), 2000);
    } catch (error) {
      alert('Không thể copy link. Vui lòng copy thủ công.');
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

    </div>
  );
};

export default AgentUtilities;

