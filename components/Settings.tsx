import React, { useState, useEffect } from 'react';
import { Save, Upload, RefreshCw, Building, Key, AlertCircle, CheckCircle, X } from 'lucide-react';
import { AppSettings } from '../types';
import { SettingsService } from '../src/lib/firebaseServices';

const Settings: React.FC = () => {
  // Initialize with default settings so UI is always usable
  const defaultSettings: AppSettings = {
    companyName: 'PayReconcile Pro',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VNĐ',
    dateFormat: 'DD/MM/YYYY'
  };

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
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
      
      // Try to load from localStorage first (faster)
      try {
        const localSettings = localStorage.getItem('appSettings');
        if (localSettings) {
          const parsed = JSON.parse(localSettings);
          setSettings(parsed);
          console.log('✅ Loaded settings from localStorage');
        }
      } catch (e) {
        console.warn('Could not load from localStorage:', e);
      }
      
      // Then try to load from Firebase (with timeout)
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout: Settings load took too long')), 5000);
        });

        const settingsPromise = SettingsService.getSettings();
        const currentSettings = await Promise.race([settingsPromise, timeoutPromise]);
        
        setSettings(currentSettings);
        // Update localStorage with Firebase data
        try {
          localStorage.setItem('appSettings', JSON.stringify(currentSettings));
        } catch (e) {
          console.warn('Could not save to localStorage:', e);
        }
      } catch (error) {
        console.error('Error loading settings from Firebase:', error);
        // If Firebase fails but we have localStorage, that's fine
        // Only show error if we don't have localStorage either
        if (error instanceof Error && 
            !error.message.includes('Permission denied') && 
            !error.message.includes('Timeout')) {
          // Only show error if it's not a known issue
          console.warn('Using default or localStorage settings');
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      // Settings already initialized with defaults, so UI is usable
    } finally {
      // Always set loading to false, even on error
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Add timeout for save operation
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: Save operation took too long')), 10000);
      });

      await Promise.race([
        SettingsService.updateSettings(settings),
        timeoutPromise
      ]);
      
      // Also save to localStorage as backup
      try {
        localStorage.setItem('appSettings', JSON.stringify(settings));
        console.log('✅ Settings saved to localStorage as backup');
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
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
      
      // Try to save to localStorage as fallback
      try {
        localStorage.setItem('appSettings', JSON.stringify(settings));
        console.log('✅ Settings saved to localStorage as fallback');
        if (error instanceof Error && (error.message.includes('Permission denied') || error.message.includes('Timeout'))) {
          showMessage('error', 'Không thể lưu lên Firebase. Đã lưu vào bộ nhớ cục bộ. Vui lòng kiểm tra quyền truy cập Firebase.');
        } else {
          showMessage('error', 'Đã lưu vào bộ nhớ cục bộ. Có lỗi khi lưu lên Firebase.');
        }
      } catch (e) {
        if (error instanceof Error && error.message.includes('Permission denied')) {
          showMessage('error', 'Không có quyền lưu cấu hình. Vui lòng kiểm tra quyền truy cập Firebase.');
        } else if (error instanceof Error && error.message.includes('Timeout')) {
          showMessage('error', 'Thao tác lưu mất quá nhiều thời gian. Vui lòng thử lại.');
        } else {
          showMessage('error', 'Có lỗi khi lưu cấu hình');
        }
      }
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
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">Gemini API Key:</p>
                  <p>Mỗi người dùng có thể cấu hình Gemini API key riêng trên trang Upload Bill. API key được lưu trong trình duyệt và chỉ sử dụng cho OCR đọc ảnh VNPay.</p>
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