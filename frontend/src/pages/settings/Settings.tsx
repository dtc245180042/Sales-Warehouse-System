import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  ShieldCheck,
  Save,
  Sun,
  Moon,
  Building2,
  MapPin,
  Lock,
  Camera,
  Edit3,
  AlertCircle,
  X,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { userService } from '../../services/userService';
import { getRoleDisplayName } from '../../utils/roleUtils';
import { AvatarUploadModal } from '../../components/common/AvatarUploadModal';

export const Settings: React.FC = () => {
  const { user, role, changePassword, updateUserAvatar, updateUserProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Profile local state
  const [isEditing, setIsEditing] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [phoneError, setPhoneError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

  // Security state (SCRUM-201)
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [isChangingPass, setIsChangingPass] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Ràng buộc nghiêm ngặt: chỉ cho phép ký tự số và tối đa đúng 10 số
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    setProfilePhone(digits);

    if (digits.length > 0 && digits.length < 10) {
      setPhoneError(`Số điện thoại phải có đúng 10 số (hiện có ${digits.length}/10 số)`);
    } else if (digits.length === 10 && !digits.startsWith('0')) {
      setPhoneError('Số điện thoại phải bắt đầu bằng chữ số 0');
    } else {
      setPhoneError('');
    }
  };

  const handleStartEditProfile = () => {
    setIsEditing(true);
    setPhoneError('');
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 100);
    showToast('Đang ở chế độ chỉnh sửa. Bạn có thể cập nhật họ tên và số điện thoại.', 'info');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setPhoneError('');
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEditing) {
      showToast('Vui lòng bấm "Sửa hồ sơ" trước khi chỉnh sửa và lưu.', 'warning');
      return;
    }

    if (!profileName.trim()) {
      showToast('Vui lòng nhập họ và tên.', 'warning');
      nameInputRef.current?.focus();
      return;
    }

    const cleanPhone = profilePhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setPhoneError('Số điện thoại phải gồm đúng 10 chữ số.');
      showToast(`Số điện thoại phải gồm đúng 10 chữ số (hiện có ${cleanPhone.length}/10 số).`, 'error');
      phoneInputRef.current?.focus();
      return;
    }

    if (!cleanPhone.startsWith('0')) {
      setPhoneError('Số điện thoại phải bắt đầu bằng chữ số 0.');
      showToast('Số điện thoại phải bắt đầu bằng chữ số 0.', 'error');
      phoneInputRef.current?.focus();
      return;
    }

    setPhoneError('');

    // 1. Cập nhật vào AuthContext & localStorage
    updateUserProfile({
      name: profileName.trim(),
      phone: cleanPhone,
    });

    // 2. Đồng bộ lên Backend Users API nếu có
    if (user?.id) {
      try {
        await userService.update(user.id, {
          full_name: profileName.trim(),
          phone_number: cleanPhone,
        });
      } catch (err) {
        console.warn('Backend user profile update error:', err);
      }
    }

    // 3. Đóng chế độ sửa và hiển thị thông báo lưu hồ sơ thành công ở góc bên phải
    setIsEditing(false);
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
      setIsSecurityModalOpen(false);
      showToast(
        revokeOthers
          ? 'Đổi mật khẩu thành công! Các phiên khác đã được thu hồi.'
          : 'Đã cập nhật mật khẩu mới thành công!',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Đổi mật khẩu thất bại.', 'error');
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <PageContainer
      title="Hồ Sơ Cá Nhân & Bảo Mật"
      subtitle="Quản lý thông tin hồ sơ người dùng và thiết lập bảo mật mật khẩu"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* KHỐI HỒ SƠ CÁ NHÂN (Thay thế cho Thông Tin Tài Khoản) */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft">
          {/* Header hàng ngang: Bên trái là 'Hồ sơ cá nhân', góc nhỏ bên phải là 'Bảo mật & Đổi mật khẩu' */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-5 mb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Hồ sơ cá nhân
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Thông tin tài khoản cá nhân và phân quyền hệ thống
              </p>
            </div>

            {/* GÓC NHỎ BÊN PHẢI: Chức năng Bảo mật & Đổi mật khẩu */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Đổi giao diện Sáng / Tối"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
              </button>

              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsSecurityModalOpen(true)}
                className="text-xs gap-1.5 shadow-sm border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 text-slate-700 dark:text-slate-200"
                leftIcon={<ShieldCheck className="w-4 h-4 text-emerald-600" />}
              >
                Bảo mật & Đổi mật khẩu
              </Button>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Ảnh đại diện: SCRUM-362, SCRUM-363, SCRUM-364 */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800">
              <div
                onClick={() => setIsAvatarModalOpen(true)}
                className="relative shrink-0 w-fit cursor-pointer group"
                title="Nhấp để thay đổi ảnh đại diện"
              >
                <img
                  src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                  alt="Avatar"
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-indigo-500/20 shadow-sm group-hover:ring-indigo-500 group-hover:scale-105 transition-all duration-200"
                />
                <span className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-indigo-600 text-white shadow-md group-hover:bg-indigo-700 transition-colors text-[10px]">
                  <Camera className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{user?.name}</h4>
                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    {user?.avatar && !user.avatar.includes('ui-avatars.com') ? 'Đã cài ảnh đại diện' : 'Ảnh đại diện mặc định'}
                  </span>
                </div>
                <div className="pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    type="button"
                    onClick={() => setIsAvatarModalOpen(true)}
                    className="text-xs gap-1.5 shadow-sm"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Thay đổi ảnh đại diện
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Họ và tên <span className="text-rose-500">*</span></span>
                  {!isEditing && (
                    <span className="text-[11px] text-slate-400 font-normal italic">
                      (Chế độ chỉ xem)
                    </span>
                  )}
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={profileName}
                  disabled={!isEditing}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Nhập họ và tên"
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                    !isEditing
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 cursor-not-allowed select-none'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Số điện thoại <span className="text-rose-500">*</span></span>
                  <span className={`text-[11px] font-mono ${phoneError ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
                    {profilePhone.length}/10 số
                  </span>
                </label>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  disabled={!isEditing}
                  placeholder="Nhập đúng 10 chữ số (ví dụ: 0901234567)"
                  value={profilePhone}
                  onChange={handlePhoneChange}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                    !isEditing
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 cursor-not-allowed select-none'
                      : phoneError
                      ? 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100 focus:ring-2 focus:ring-rose-500 focus:border-rose-500'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                />
                {phoneError ? (
                  <p className="text-[11px] text-rose-500 mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {phoneError}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Ràng buộc chỉ được nhập đúng 10 chữ số di động (bắt đầu bằng 0)
                  </p>
                )}
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

            {/* THAO TÁC HỒ SƠ (Đã xóa banner thừa, tích hợp nút Sửa hồ sơ / Lưu hồ sơ chuẩn mực) */}
            <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {!isEditing ? (
                  <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    Hồ sơ đang ở chế độ xem. Bấm <strong>Sửa hồ sơ</strong> để mở khóa chỉnh sửa.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
                    <Edit3 className="w-3.5 h-3.5 shrink-0" />
                    Đang ở chế độ chỉnh sửa. Nhập thông tin xong vui lòng bấm <strong>Lưu thông tin hồ sơ</strong>.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                {!isEditing ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleStartEditProfile}
                    leftIcon={<Edit3 className="w-4 h-4" />}
                    className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/50 shadow-sm"
                  >
                    Sửa hồ sơ
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleCancelEdit}
                      leftIcon={<X className="w-4 h-4 text-slate-500" />}
                    >
                      Hủy
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      leftIcon={<Save className="w-4 h-4" />}
                      className="shadow-md shadow-indigo-600/25"
                    >
                      Lưu thông tin hồ sơ
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* MODAL BẢO MẬT & ĐỔI MẬT KHẨU (Được kích hoạt từ góc nhỏ bên phải của Hồ sơ cá nhân) */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Bảo Mật & Đổi Mật Khẩu
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Chủ động đổi mật khẩu định kỳ để bảo vệ tài khoản
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSecurityModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSecurity} className="p-5 sm:p-6 space-y-4">
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

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsSecurityModalOpen(false)}
                >
                  Hủy
                </Button>
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
        </div>
      )}

      {/* Modal Tải Lên & Xem Trước Ảnh Đại Diện (SCRUM-363) */}
      <AvatarUploadModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatar={user?.avatar}
        userId={user?.id}
        onAvatarUpdated={(newAvatarUrl) => {
          updateUserAvatar(newAvatarUrl);
        }}
      />
    </PageContainer>
  );
};
