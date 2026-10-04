import React, { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Phone, 
  Shield, 
  Calendar, 
  Camera, 
  Save, 
  CheckCircle2, 
  Store, 
  MapPin, 
  Briefcase,
  Lock,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { mockUserApi } from '../../services/api';
import { UserProfileData } from '../../data/mockData';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarUploadModal } from '../../components/common/AvatarUploadModal';

export const ProfilePage: React.FC = () => {
  const { user, updateUserAvatar } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  // Editable fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const res = await mockUserApi.getProfile();
        if (res.data.success && res.data.data) {
          const data = res.data.data;
          setProfile(data);
          setFullName(data.name);
          setEmail(data.email);
          setPhone(data.phone);
          setAvatarUrl(data.avatar);
        }
      } catch (err) {
        console.error('Failed to load profile', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      alert('Số điện thoại phải gồm đúng 10 chữ số (hiện có ' + cleanPhone.length + '/10).');
      return;
    }
    if (!cleanPhone.startsWith('0')) {
      alert('Số điện thoại phải bắt đầu bằng chữ số 0.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = {
        name: fullName,
        email,
        phone: cleanPhone,
        avatar: avatarUrl,
      };

      const res = await mockUserApi.updateProfile(updated);
      if (res.data.success && res.data.data) {
        setProfile(res.data.data);
        setToastMessage('Đã lưu thông tin hồ sơ người dùng thành công!');
        setTimeout(() => setToastMessage(null), 3500);
      }
    } catch (err) {
      console.error('Update profile error', err);
      alert('Không thể lưu thông tin hồ sơ.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarSelectPreset = (url: string) => {
    setAvatarUrl(url);
  };

  if (loading || !profile) {
    return (
      <div className="py-20 text-center space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
        <p className="text-slate-500 text-sm">Đang tải hồ sơ tài khoản...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Toast Alert - Bottom Right Corner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-left border border-emerald-400/30">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <User className="w-7 h-7 text-blue-600" />
          Hồ sơ cá nhân
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Quản lý thông tin tài khoản nhân viên bán hàng và thông tin chi nhánh công tác
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Card: Avatar & Fixed Identity */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center shadow-sm">
            <div className="relative inline-block mx-auto mb-4">
              <img
                src={avatarUrl || profile.avatar}
                alt={profile.name}
                className="w-28 h-28 rounded-full object-cover ring-4 ring-blue-500/20 shadow-md cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setIsAvatarModalOpen(true)}
                title="Nhấp để thay đổi ảnh đại diện"
              />
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(true)}
                className="absolute bottom-1 right-1 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md cursor-pointer transition-colors"
                title="Thay đổi ảnh đại diện (JPG/PNG <= 2MB)"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-3">
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-xs font-semibold transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                Tải lên ảnh mới
              </button>
            </div>

            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {profile.name}
            </h2>
            <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
              {profile.roleName}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-left text-xs">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Tên đăng nhập:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {profile.username}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Mã nhân viên:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {profile.employeeCode}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Ngày tham gia:</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {profile.joinedDate}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Vai trò hệ thống:</span>
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold rounded">
                  {profile.role}
                </span>
              </div>
            </div>

            {/* Quick avatar selector presets */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 block mb-2">
                Chọn nhanh ảnh đại diện mẫu:
              </span>
              <div className="flex justify-center gap-2">
                {[
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
                  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
                  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAvatarSelectPreset(preset)}
                    className="w-8 h-8 rounded-full overflow-hidden border-2 hover:border-blue-600 transition-all"
                  >
                    <img src={preset} alt="preset" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Store / Branch info (Read-only) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
              <Store className="w-4 h-4 text-blue-600" />
              Chi nhánh công tác
            </h3>
            <div className="text-xs space-y-2 text-slate-600 dark:text-slate-400">
              <div>
                <strong className="text-slate-800 dark:text-slate-200 block">
                  {profile.storeInfo.name}
                </strong>
                <p className="mt-0.5">{profile.storeInfo.address}</p>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Hotline chi nhánh: </span>
                <strong className="text-slate-800 dark:text-slate-200">{profile.storeInfo.phone}</strong>
              </div>
              <div>
                <span className="text-slate-400">Quản lý kho: </span>
                <span className="text-slate-700 dark:text-slate-300">{profile.storeInfo.manager}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Editable Profile Form */}
        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleSave}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6"
          >
            <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Chỉnh sửa thông tin cá nhân
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Các thông tin liên hệ được sử dụng khi lập hóa đơn cho khách hàng
              </p>
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Họ và tên <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex justify-between items-center">
                  <span>Số điện thoại <span className="text-rose-500">*</span></span>
                  <span className="text-xs font-mono text-slate-400">{phone.length}/10 số</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    placeholder="Ví dụ: 0901234567"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Địa chỉ Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Đường dẫn ảnh đại diện (Avatar URL)
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Readonly Section */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400 tracking-wider">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Thông tin quản trị viên chỉ định (Không thể chỉnh sửa)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <div className="text-[11px] text-slate-400">Mã định danh nhân viên (ID)</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {profile.employeeCode}
                  </div>
                </div>

                <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                  <div className="text-[11px] text-slate-400">Phân quyền tài khoản</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm mt-0.5">
                    {profile.roleName} ({profile.role})
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal Tải Lên & Xem Trước Ảnh Đại Diện (SCRUM-363, SCRUM-365, SCRUM-366) */}
      <AvatarUploadModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatar={avatarUrl || profile.avatar}
        userId={user?.id}
        onAvatarUpdated={(newAvatarUrl) => {
          setAvatarUrl(newAvatarUrl);
          if (profile) {
            setProfile({ ...profile, avatar: newAvatarUrl });
          }
          updateUserAvatar(newAvatarUrl);
        }}
      />
    </div>
  );
};

export default ProfilePage;
