import React, { useState } from 'react';
import {
  User,
  Palette,
  ShieldCheck,
  Save,
  Sun,
  Moon,
  Building2,
  MapPin,
  Lock,
  Camera,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { getRoleDisplayName } from '../../utils/roleUtils';

export const Settings: React.FC = () => {
  const { user, role, changePassword } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'appearance'>('profile');

  // Profile local state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');

  // Security state (SCRUM-201)
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [isChangingPass, setIsChangingPass] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    showToast('Đã lưu thông tin hồ sơ người dùng thành công!', 'success');
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      showToast('Vui lòng nhập mật khẩu hiện tại.', 'warning');
      return;
    }
    if (newPassword.length < 8) {
      showToast('Mật khẩu mới phải có tối thiểu 8 ký tự.', 'warning');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      showToast('Mật khẩu mới phải chứa cả chữ cái và chữ số.', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu xác nhận không trùng khớp.', 'warning');
      return;
    }

    setIsChangingPass(true);
    try {
      await changePassword(oldPassword, newPassword, revokeOthers);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast(
        revokeOthers
          ? 'Đã đổi mật khẩu thành công! Các phiên đăng nhập khác đã được thu hồi.'
          : 'Đã cập nhật mật khẩu thành công!',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Đổi mật khẩu thất bại.', 'error');
    } finally {
      setIsChangingPass(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Hồ sơ cá nhân', icon: User },
    { id: 'security', label: 'Bảo mật & Đổi mật khẩu', icon: ShieldCheck },
    { id: 'appearance', label: 'Giao diện & Hiển thị', icon: Palette },
  ];

  return (
    <PageContainer
      title="Cài Đặt Tài Khoản & Bảo Mật"
      subtitle="Quản lý thông tin tài khoản cá nhân, cơ chế bảo mật và giao diện"
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Tabs */}
        <div className="lg:col-span-1 space-y-1 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-soft h-fit">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all text-left ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div className="lg:col-span-3">
          {/* TAB 1: Hồ sơ cá nhân */}
          {activeTab === 'profile' && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-6">
                Thông Tin Tài Khoản
              </h3>
              <form onSubmit={handleSaveProfile} className="space-y-5">
                {/* Ảnh đại diện: Trạng thái chờ */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
                  <div className="relative shrink-0 w-fit">
                    <img
                      src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                      alt="Avatar"
                      className="w-16 h-16 rounded-2xl object-cover ring-2 ring-indigo-500/20 shadow-sm opacity-90"
                    />
                    <span className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px]" title="Tính năng đang ở trạng thái chờ">
                      <Camera className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">{user?.name}</h4>
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                        Ảnh đại diện: Đang ở trạng thái chờ
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled
                        className="opacity-50 cursor-not-allowed text-xs"
                      >
                        Thay đổi ảnh đại diện
                      </Button>
                      <span className="text-[11px] text-slate-400">
                        (Tính năng tải ảnh đại diện sẽ được hỗ trợ trong phiên bản tiếp theo)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Họ và tên
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Email đăng nhập (cố định)
                    </label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-sm text-slate-500 cursor-not-allowed font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Số điện thoại
                    </label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Vai trò được cấp quyền
                    </label>
                    <input
                      type="text"
                      value={getRoleDisplayName(role)}
                      disabled
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-sm text-slate-700 dark:text-slate-300 font-semibold cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                      Kho phụ trách
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {user?.warehouse || 'Toàn hệ thống'}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                      Địa bàn phụ trách
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {user?.territory || 'Toàn quốc'}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button variant="primary" type="submit" leftIcon={<Save className="w-4 h-4" />}>
                    Lưu thông tin hồ sơ
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Đổi mật khẩu (SCRUM-201) */}
          {activeTab === 'security' && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                Đổi Mật Khẩu Tài Khoản
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Chủ động đổi mật khẩu định kỳ để bảo vệ tài khoản sau khi được cấp mật khẩu tạm.
              </p>

              <form onSubmit={handleSaveSecurity} className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Mật khẩu hiện tại <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại đang dùng"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Mật khẩu mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Tối thiểu 8 ký tự, bao gồm cả chữ và số"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Yêu cầu tối thiểu 8 ký tự, có cả chữ cái và chữ số</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Xác nhận mật khẩu mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại chính xác mật khẩu mới"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={revokeOthers}
                      onChange={(e) => setRevokeOthers(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      Đăng xuất và thu hồi các phiên đăng nhập khác trên các thiết bị khác sau khi đổi mật khẩu
                    </span>
                  </label>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="primary"
                    type="submit"
                    isLoading={isChangingPass}
                    leftIcon={<Lock className="w-4 h-4" />}
                  >
                    Cập nhật mật khẩu mới
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: Giao diện Sáng / Tối */}
          {activeTab === 'appearance' && (
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                Tùy Chọn Giao Diện
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Lựa chọn chế độ hiển thị màu sắc phù hợp với môi trường làm việc của bạn.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`p-5 rounded-2xl border-2 text-left flex items-start gap-4 transition-all ${
                    theme === 'light'
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Sun className={`w-6 h-6 mt-0.5 ${theme === 'light' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Chế độ Sáng</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Giao diện sáng tiêu chuẩn, dễ đọc</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-5 rounded-2xl border-2 text-left flex items-start gap-4 transition-all ${
                    theme === 'dark'
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Moon className={`w-6 h-6 mt-0.5 ${theme === 'dark' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Chế độ Tối</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Dịu mắt khi làm việc ban đêm</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};
