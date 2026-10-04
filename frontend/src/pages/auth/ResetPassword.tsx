import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2, ArrowLeft, AlertCircle, RefreshCw, KeyRound } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useToast } from '../../contexts/ToastContext';
import { authService } from '../../services/authService';

export const ResetPassword: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<'valid' | 'expired' | 'invalid'>('valid');

  // Check token validity on mount (Simulate Backend 30-min validity & one-time use check)
  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      return;
    }

    // If token has query parameter expired=true or specific invalid tokens
    if (token.includes('expired') || token === 'expired_token') {
      setTokenStatus('expired');
      return;
    }

    // Check if token was already used
    const usedTokens = JSON.parse(localStorage.getItem('kv_used_reset_tokens') || '[]');
    if (usedTokens.includes(token)) {
      setTokenStatus('expired'); // Already used
      return;
    }

    setTokenStatus('valid');
  }, [token]);

  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasMinLength || !hasLetter || !hasDigit) {
      showToast('Mật khẩu mới phải tối thiểu 8 ký tự, bao gồm cả chữ và số.', 'warning');
      return;
    }

    if (!isMatch) {
      showToast('Mật khẩu xác nhận không khớp.', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      if (!token) throw new Error('Thiếu mã token đặt lại mật khẩu.');
      await authService.resetPassword(token, newPassword);
      setIsSuccess(true);
      showToast('Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Mã xác nhận không hợp lệ hoặc đã hết hạn.', 'error');
      setTokenStatus('expired');
    } finally {
      setIsLoading(false);
    }
  };

  // Render Expired or Invalid Token Error UI
  if (tokenStatus === 'expired' || tokenStatus === 'invalid') {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft p-8 sm:p-10 transition-all text-center space-y-5">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto">
          <AlertCircle className="w-9 h-9" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {tokenStatus === 'expired'
              ? 'Liên kết đã hết hạn hoặc đã sử dụng'
              : 'Liên kết không hợp lệ'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed max-w-sm mx-auto">
            {tokenStatus === 'expired'
              ? 'Liên kết đặt lại mật khẩu chỉ có hiệu lực trong 30 phút và chỉ dùng được một lần. Vui lòng gửi lại yêu cầu mới để nhận liên kết mới.'
              : 'Đường dẫn liên kết đặt lại mật khẩu không chính xác hoặc thiếu mã bảo mật.'}
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2">
          <Link to="/forgot-password">
            <Button variant="primary" className="w-full" leftIcon={<RefreshCw className="w-4 h-4" />}>
              Gửi lại yêu cầu khôi phục mật khẩu
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" className="w-full">
              Quay lại đăng nhập
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Render Success Screen
  if (isSuccess) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft p-8 sm:p-10 transition-all text-center space-y-5">
        <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/50 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Đặt lại mật khẩu thành công!</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2">
            Mật khẩu mới của bạn đã được cập nhật thành công. Bạn có thể sử dụng mật khẩu này để đăng nhập ngay bây giờ.
          </p>
        </div>
        <div className="pt-4">
          <Button variant="primary" className="w-full" onClick={() => navigate('/login')}>
            Chuyển đến trang Đăng nhập
          </Button>
        </div>
      </div>
    );
  }

  // Form Reset Password
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft p-8 sm:p-10 transition-all">
      <div className="mb-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại trang đăng nhập</span>
        </Link>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Thiết lập mật khẩu mới
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Nhập mật khẩu mới cho tài khoản của bạn. Mật khẩu phải có tối thiểu 8 ký tự, bao gồm cả chữ và số.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* New Password */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Mật khẩu mới
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showNewPass ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự (chữ và số)"
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <button
              type="button"
              onClick={() => setShowNewPass(!showNewPass)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Checklist */}
          <div className="mt-2 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 space-y-1 text-[11px]">
            <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
              <span>Độ dài tối thiểu 8 ký tự</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasLetter && hasDigit ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 ${hasLetter && hasDigit ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
              <span>Bao gồm cả chữ cái và chữ số</span>
            </div>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
            Xác nhận mật khẩu mới
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showConfirmPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPass(!showConfirmPass)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && (
            <p className={`text-[11px] mt-1 font-medium ${isMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {isMatch ? '✓ Mật khẩu xác nhận trùng khớp' : '✕ Mật khẩu xác nhận chưa khớp'}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          leftIcon={<KeyRound className="w-4 h-4" />}
          className="w-full text-base font-bold shadow-lg shadow-indigo-500/25 mt-2"
        >
          Xác nhận đặt lại mật khẩu
        </Button>
      </form>
    </div>
  );
};
