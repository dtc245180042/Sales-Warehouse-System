import React, { useState, useEffect } from 'react';
import {
  User,
  Phone,
  Mail,
  ShieldCheck,
  Building2,
  MapPin,
  Lock,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Info,
  Camera,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getRoleDisplayName } from '../../utils/roleUtils';
import { validateVNPhoneNumber, normalizeVNPhoneNumber } from '../../utils/phoneUtils';
import { AvatarUploadModal } from '../../components/common/AvatarUploadModal';

export const Profile: React.FC = () => {
  const { user, role, updateProfile, updateUserAvatar } = useAuth();
  const { showToast } = useToast();

  // Form editable state
  const [fullName, setFullName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  // Validation & status
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccessNotice, setIsSuccessNotice] = useState(false);

  // Sync state when user context changes
  useEffect(() => {
    if (user) {
      setFullName(user.name || '');
      setPhone(user.phone || '');
      setAvatarUrl(user.avatar || '');
    }
  }, [user]);

  // Realtime validation
  const validateForm = (): boolean => {
    let isValid = true;

    // Validate Name
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setNameError('Họ và tên không được để trống.');
      isValid = false;
    } else if (trimmedName.length < 2) {
      setNameError('Họ và tên phải có tối thiểu 2 ký tự.');
      isValid = false;
    } else {
      setNameError(null);
    }

    // Validate Vietnam Phone Number (SCRUM-210 / SCRUM-361)
    const phoneVal = validateVNPhoneNumber(phone);
    if (!phoneVal.valid) {
      setPhoneError(phoneVal.message || 'Số điện thoại không hợp lệ.');
      isValid = false;
    } else {
      setPhoneError(null);
    }

    return isValid;
  };

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    const check = validateVNPhoneNumber(val);
    if (!check.valid) {
      setPhoneError(check.message || 'Số điện thoại không hợp lệ.');
    } else {
      setPhoneError(null);
    }
  };

  const handleNameChange = (val: string) => {
    setFullName(val);
    if (!val.trim()) {
      setNameError('Họ và tên không được để trống.');
    } else if (val.trim().length < 2) {
      setNameError('Họ và tên phải có tối thiểu 2 ký tự.');
    } else {
      setNameError(null);
    }
  };

  const handleReset = () => {
    if (user) {
      setFullName(user.name || '');
      setPhone(user.phone || '');
      setAvatarUrl(user.avatar || '');
      setNameError(null);
      setPhoneError(null);
      showToast('Đã khôi phục thông tin ban đầu.', 'info');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast('Vui lòng kiểm tra lại thông tin biểu mẫu.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const normalizedPhone = normalizeVNPhoneNumber(phone);
      await updateProfile({
        name: fullName.trim(),
        phone: normalizedPhone,
        avatar: avatarUrl.trim() || undefined,
      });

      setPhone(normalizedPhone);
      setIsSuccessNotice(true);
      showToast('Cập nhật hồ sơ cá nhân thành công!', 'success');
      setTimeout(() => setIsSuccessNotice(false), 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ cá nhân.';
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const isChanged =
    fullName.trim() !== (user?.name || '') ||
    normalizeVNPhoneNumber(phone) !== normalizeVNPhoneNumber(user?.phone || '') ||
    avatarUrl.trim() !== (user?.avatar || '');

  return (
    <PageContainer
      title="Hồ Sơ Cá Nhân"
      subtitle="Xem và cập nhật thông tin liên hệ của bạn để phối hợp điều phối đơn hàng và liên lạc kho (SCRUM-210)"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Profile Card & Read-only System Identity */}
        <div className="lg:col-span-4 space-y-6">
          {/* Main User Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-20 dark:opacity-30" />

            <div className="relative pt-6">
              <div className="relative inline-block mx-auto mb-3">
                <img
                  src={
                    avatarUrl ||
                    user?.avatar ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
                  }
                  alt={user?.name || 'Avatar'}
                  onClick={() => setIsAvatarModalOpen(true)}
                  className="w-24 h-24 rounded-full object-cover ring-4 ring-white dark:ring-slate-900 shadow-xl mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                  title="Nhấp để tải ảnh đại diện lên"
                />
                <button
                  type="button"
                  onClick={() => setIsAvatarModalOpen(true)}
                  className="absolute bottom-0 right-0 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md cursor-pointer transition-colors border-2 border-white dark:border-slate-900"
                  title="Thay đổi ảnh đại diện (JPG/PNG <= 2MB)"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
                <span
                  className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"
                  title="Tài khoản đang hoạt động"
                />
              </div>

              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {user?.name || 'Người dùng'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {user?.email}
              </p>

              <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-800/80">
                  {getRoleDisplayName(role)}
                </span>
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/80">
                  Hoạt động
                </span>
              </div>
            </div>

            {/* Quick stats / metadata */}
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-left">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                  Mã tài khoản
                </div>
                <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 mt-1 truncate">
                  {user?.id || 'USR-001'}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Đăng nhập gần nhất
                </div>
                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 mt-1 truncate" title={user?.lastLogin}>
                  {user?.lastLogin ? user.lastLogin.split(' ')[0] : 'Vừa mới'}
                </div>
              </div>
            </div>
          </div>

          {/* Readonly Identity Notice (SCRUM-210: Không tự đổi tài khoản, vai trò, kho, địa bàn) */}
          <div className="p-5 rounded-3xl bg-slate-50/90 dark:bg-slate-850/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Phân quyền & Định danh (Cố định)
              </h3>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Theo quy định phân quyền hệ thống (SCRUM-210 / SCRUM-360), người dùng không thể tự ý thay đổi tài khoản, quyền hạn, kho và địa bàn phụ trách.
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Tài khoản đăng nhập:
                </span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]" title={user?.email}>
                  {user?.email}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  Vai trò hệ thống:
                </span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {getRoleDisplayName(role)}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Kho phụ trách:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]" title={user?.warehouse}>
                  {user?.warehouse || 'Toàn hệ thống'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Địa bàn phụ trách:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]" title={user?.territory}>
                  {user?.territory || 'Toàn quốc'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Edit Profile Form */}
        <div className="lg:col-span-8 space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Chỉnh Sửa Thông Tin Liên Hệ
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Cập nhật họ tên và số điện thoại Việt Nam để nhân viên kho dễ dàng liên lạc khi cần xác nhận đơn.
                </p>
              </div>

              {isChanged && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                  <Sparkles className="w-3.5 h-3.5" />
                  Có thay đổi chưa lưu
                </span>
              )}
            </div>

            {/* Success Banner */}
            {isSuccessNotice && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm animate-fade-in">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Hồ sơ cá nhân của bạn đã được cập nhật thành công và đồng bộ trên toàn bộ hệ thống!
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Field 1: Họ và tên */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Họ và tên <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
                      nameError
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100 focus:ring-rose-400'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-indigo-500'
                    }`}
                  />
                </div>
                {nameError ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {nameError}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tên hiển thị trên các đơn bán hàng và phiếu xuất nhập kho liên quan.
                  </p>
                )}
              </div>

              {/* Field 2: Số điện thoại Việt Nam (SCRUM-210 / SCRUM-361) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Số điện thoại Việt Nam <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="Ví dụ: 0912345678 hoặc 0388889999"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-mono transition-all focus:outline-none focus:ring-2 ${
                      phoneError
                        ? 'border-rose-400 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100 focus:ring-rose-400'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-indigo-500'
                    }`}
                  />
                </div>
                {phoneError ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {phoneError}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Định dạng hợp lệ: 10 chữ số, bắt đầu bằng <strong>03, 05, 07, 08, 09</strong> (hỗ trợ nhập <code>+84</code>).
                  </p>
                )}
              </div>

              {/* Field 3: Avatar URL (Tùy chọn) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Đường dẫn ảnh đại diện (Avatar URL)
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Chọn nhanh ảnh mẫu:</span>
                  {[
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
                    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
                    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
                    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAvatarUrl(preset)}
                      className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                        avatarUrl === preset ? 'border-indigo-600 scale-110' : 'border-slate-200 hover:border-indigo-400'
                      }`}
                    >
                      <img src={preset} alt="preset" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Readonly Fields in Form for full context */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Thông tin hệ thống chỉ xem (Không được phép tự đổi)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Email đăng nhập
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user?.email || ''}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Vai trò quản trị
                    </label>
                    <input
                      type="text"
                      disabled
                      value={getRoleDisplayName(role)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Kho phụ trách
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user?.warehouse || 'Toàn hệ thống (Không giới hạn)'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Địa bàn phụ trách
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user?.territory || 'Toàn quốc (Không giới hạn)'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-sm text-slate-500 dark:text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Info className="w-4 h-4 text-slate-400 shrink-0" />
                  Thông tin thay đổi sẽ có hiệu lực ngay lập tức.
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    disabled={!isChanged || isSaving}
                    className="gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Khôi phục
                  </Button>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSaving || !isChanged || !!phoneError || !!nameError}
                    className="gap-2 shadow-lg shadow-indigo-500/20"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
      <AvatarUploadModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatar={avatarUrl || user?.avatar}
        userId={user?.id}
        onAvatarUpdated={(newUrl) => {
          setAvatarUrl(newUrl);
          updateUserAvatar(newUrl);
          showToast('Ảnh đại diện đã được cập nhật thành công!', 'success');
        }}
      />
    </PageContainer>
  );
};

export default Profile;
