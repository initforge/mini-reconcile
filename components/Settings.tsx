import React, { useState, useEffect } from 'react';
import { Save, Upload, RefreshCw, Building, Key, AlertCircle, CheckCircle, X } from 'lucide-react';
import { AppSettings } from '../types';
import { SettingsService } from '../src/lib/firebaseServices';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    companyName: '',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VNĐ',
    dateFormat: 'DD/MM/YYYY'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'company' | 'api'>('company');

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const currentSettings = await SettingsService.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
      showMessage('error', 'Có lỗi khi tải cấu hình');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await SettingsService.updateSettings(settings);
      
      // Clear API key cache if geminiApiKey was updated
      if (settings.geminiApiKey) {
        // Dynamically import and clear cache
        import('../services/geminiService').then((module) => {
          if (module.clearApiKeyCache) {
            module.clearApiKeyCache();
            console.log('✅ API key cache đã được làm mới');
          }
        }).catch(() => {
          // Ignore if module doesn't export clearApiKeyCache
        });
      }
      
      // Clear settings cache để áp dụng settings mới
      import('../src/utils/formatUtils').then((module) => {
        if (module.clearSettingsCache) {
          module.clearSettingsCache();
          console.log('✅ Settings cache đã được làm mới');
        }
      }).catch(() => {
        // Ignore if module doesn't export clearSettingsCache
      });
      
      showMessage('success', 'Đã lưu cấu hình thành công');
    } catch (error) {
      console.error('Error saving settings:', error);
      showMessage('error', 'Có lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('Bạn có chắc chắn muốn khôi phục cài đặt mặc định? Tất cả cấu hình hiện tại sẽ bị mất.')) {
      try {
        setSaving(true);
        await SettingsService.resetToDefault();
        await loadSettings();
        showMessage('success', 'Đã khôi phục cài đặt mặc định');
      } catch (error) {
        console.error('Error resetting settings:', error);
        showMessage('error', 'Có lỗi khi khôi phục cài đặt');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showMessage('error', 'Vui lòng chọn file hình ảnh');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showMessage('error', 'File quá lớn. Vui lòng chọn file nhỏ hơn 2MB');
      return;
    }

    try {
      setSaving(true);
      // Convert to base64 for storage (in real app, upload to storage service)
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        await SettingsService.updateLogo(base64);
        setSettings(prev => ({ ...prev, logoUrl: base64 }));
        showMessage('success', 'Đã tải lên logo thành công');
        setSaving(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading logo:', error);
      showMessage('error', 'Có lỗi khi tải lên logo');
      setSaving(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    // Không tự động đóng, người dùng phải bấm nút đóng
  };

  const closeMessage = () => {
    setMessage(null);
  };

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-slate-500">Đang tải cấu hình...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Cài đặt hệ thống</h2>
          <p className="text-slate-500">Cấu hình thông tin công ty và tùy chỉnh hệ thống</p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Khôi phục mặc định</span>
          </button>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
          </button>
        </div>
      </div>

      {/* Message Modal */}
      {message && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className={`bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden ${
            message.type === 'success' ? 'border-2 border-emerald-200' : 'border-2 border-red-200'
          }`}>
            <div className={`px-6 py-4 flex items-center justify-between ${
              message.type === 'success' ? 'bg-emerald-50' : 'bg-red-50'
            }`}>
              <div className="flex items-center space-x-3">
                {message.type === 'success' ? (
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-red-600" />
                )}
                <span className={`font-semibold ${
                  message.type === 'success' ? 'text-emerald-800' : 'text-red-800'
                }`}>
                  {message.type === 'success' ? 'Thành công' : 'Lỗi'}
                </span>
              </div>
              <button
                onClick={closeMessage}
                className={`text-slate-400 hover:text-slate-600 transition-colors ${
                  message.type === 'success' ? 'hover:text-emerald-600' : 'hover:text-red-600'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className={`text-sm ${
                message.type === 'success' ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {message.text}
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={closeMessage}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  message.type === 'success'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('company')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'company' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          Thông tin công ty
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'api' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          API & Tích hợp
        </button>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {activeTab === 'company' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center space-x-2">
              <Building className="w-5 h-5" />
              <span>Thông tin công ty</span>
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tên công ty
                </label>
                <input
                  type="text"
                  value={settings.companyName}
                  onChange={(e) => updateSettings({ companyName: e.target.value })}
                  placeholder="VD: Công ty TNHH ABC"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Địa chỉ
                </label>
                <input
                  type="text"
                  value={settings.companyAddress || ''}
                  onChange={(e) => updateSettings({ companyAddress: e.target.value })}
                  placeholder="Địa chỉ công ty"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Số điện thoại
                </label>
                <input
                  type="text"
                  value={settings.companyPhone || ''}
                  onChange={(e) => updateSettings({ companyPhone: e.target.value })}
                  placeholder="Số điện thoại công ty"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={settings.companyEmail || ''}
                  onChange={(e) => updateSettings({ companyEmail: e.target.value })}
                  placeholder="Email công ty"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            
            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Logo công ty
              </label>
              <div className="flex items-center space-x-4">
                {settings.logoUrl && (
                  <div className="w-16 h-16 border border-slate-200 rounded-lg overflow-hidden">
                    <img 
                      src={settings.logoUrl} 
                      alt="Company Logo" 
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="flex items-center space-x-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{settings.logoUrl ? 'Thay đổi logo' : 'Tải lên logo'}</span>
                  </label>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG tối đa 2MB</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center space-x-2">
              <Key className="w-5 h-5" />
              <span>API & Tích hợp</span>
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Google Gemini API Key
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={settings.geminiApiKey || ''}
                  onChange={(e) => {
                    updateSettings({ geminiApiKey: e.target.value });
                    // Clear cache when API key is updated
                    if (typeof window !== 'undefined') {
                      (window as any).__geminiApiKeyCache = null;
                    }
                  }}
                  placeholder="Nhập API key từ Google AI Studio (VD: AIzaSy...)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 pr-10 font-mono text-sm"
                />
                <Key className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                API key để sử dụng tính năng <strong>OCR đọc ảnh VNPay</strong> và <strong>Gemini Insights</strong> trong đối soát. 
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline ml-1">
                  Lấy API key tại đây
                </a>
              </p>
              {settings.geminiApiKey && (
                <div className="mt-2 flex items-center space-x-2 text-xs text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>API key đã được cấu hình ({settings.geminiApiKey.substring(0, 10)}...)</span>
                </div>
              )}
              
              {/* Test API Key Button */}
              {settings.geminiApiKey && (
                <button
                  onClick={async () => {
                    try {
                      setSaving(true);
                      showMessage('success', 'Đang kiểm tra API key...');
                      
                      // Test API key bằng cách gọi Gemini API
                      const { GoogleGenAI } = await import('@google/genai');
                      const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey! });
                      
                      // Test với một prompt đơn giản (sử dụng cách tương tự như geminiService.ts)
                      const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: 'Test',
                      });
                      
                      // Verify response
                      if (!response || !response.text) {
                        throw new Error('API response is invalid');
                      }
                      
                      showMessage('success', '✅ API key hoạt động bình thường!');
                    } catch (error: any) {
                      console.error('API test error:', error);
                      if (error.message?.includes('API key not valid')) {
                        showMessage('error', '❌ API key không hợp lệ. Vui lòng kiểm tra lại.');
                      } else if (error.message?.includes('quota')) {
                        showMessage('error', '⚠️ API key đã hết quota hoặc bị giới hạn.');
                      } else {
                        showMessage('error', `❌ Lỗi khi kiểm tra API: ${error.message || 'Unknown error'}`);
                      }
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving || !settings.geminiApiKey}
                  className="mt-3 flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  <Key className="w-4 h-4" />
                  <span>{saving ? 'Đang kiểm tra...' : 'Kiểm tra API key'}</span>
                </button>
              )}
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">Hướng dẫn lấy Gemini API Key:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Truy cập Google AI Studio</li>
                    <li>Đăng nhập với tài khoản Google</li>
                    <li>Tạo API key mới</li>
                    <li>Sao chép và dán vào ô trên</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
};

export default Settings;