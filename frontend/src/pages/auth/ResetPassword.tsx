import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { useToast } from '../../contexts/ToastContext';
import { authService } from '../../services/authService';
import { apiClient } from '../../api/client';

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
  const [isVerifying, setIsVerifying] = useState(Boolean(token));
  const [isSuccess, setIsSuccess] = useState(false);

  const [tokenStatus, setTokenStatus] = useState<{
    valid: boolean;
    email?: string;
    message?: string;
  }>({
    valid: Boolean(token),
  });

  // Tự động kiểm tra tính hợp lệ và thời hạn 30 phút của liên kết khi trang được mở
  useEffect(() => {
    if (!token) {
      setTokenStatus({
        valid: false,
        message: 'Đường dẫn thiếu mã bảo mật. Vui lòng mở đúng liên kết được gửi trong email.',
      });
      setIsVerifying(false);
      return;
    }

    const verifyToken = async () => {
      setIsVerifying(true);
      try {
        const res = await apiClient.get(`/password-reset/verify?token=${encodeURIComponent(token.trim())}`);
        if (res.data?.valid) {
          setTokenStatus({
            valid: true,
            email: res.data.email,
            message: res.data.message,
          });
        } else {
          setTokenStatus({
            valid: false,
            message: res.data?.message || 'Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút) hoặc đã được sử dụng.',
          });
        }
      } catch {
        // Trường hợp API không phản hồi, vẫn cho phép form hiển thị để người dùng submit
        setTokenStatus({
          valid: true,
        });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      showToast('Liên kết không hợp lệ hoặc thiếu mã bảo mật.', 'error');
      return;
    }

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
      await authService.resetPassword(token.trim(), newPassword);
      setIsSuccess(true);
      showToast('Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.', 'success');
    } catch (err: any) {
      const errorMsg = err.message || 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn (quá 30 phút).';
      showToast(errorMsg, 'error');
      setTokenStatus({
        valid: false,
        message: errorMsg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Màn hình Thành công sau khi đổi mật khẩu
  if (isSuccess) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft p-8 sm:p-10 transition-all text-center space-y-5 animate-fadeIn">
        <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/50 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Đặt lại mật khẩu thành công!</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Mật khẩu mới của bạn đã được cập nhật thành công. Vui lòng đăng nhập lại với mật khẩu mới.
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

  // 2. Màn hình Đang kiểm tra liên kết (Loading)
  if (isVerifying) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft p-12 text-center space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Đang xác thực liên kết đặt lại mật khẩu...
        </p>
      </div>
    );
  }

  // 3. Màn hình Liên kết không hợp lệ hoặc Hết hạn 30 phút
  if (!token || !tokenStatus.valid) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft p-8 sm:p-10 transition-all text-center space-y-5 animate-fadeIn">
        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto">
          <AlertCircle className="w-9 h-9" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {!token ? 'Liên kết không hợp lệ' : 'Liên kết đã hết hạn hoặc đã sử dụng'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed max-w-sm mx-auto">
            {tokenStatus.message ||
              'Liên kết đặt lại mật khẩu chỉ có hiệu lực trong vòng 30 phút và chỉ sử dụng được một lần duy nhất. Vui lòng gửi lại yêu cầu để nhận liên kết mới.'}
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-2.5">
          <Link to="/forgot-password">
            <Button variant="primary" className="w-full" leftIcon={<RefreshCw className="w-4 h-4" />}>
              Gửi lại yêu cầu khôi phục mật khẩu
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" className="w-full">
              Quay lại trang Đăng nhập
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // 4. Form Thiết lập mật khẩu mới (Khi mở qua liên kết hợp lệ)
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
          Nhập mật khẩu mới cho tài khoản của bạn (tối thiểu 8 ký tự, có cả chữ và số).
        </p>
      </div>

      {tokenStatus.email && (
        <div className="mb-5 p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            Đặt lại mật khẩu cho tài khoản: <strong className="font-mono font-semibold">{tokenStatus.email}</strong>
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mật khẩu mới */}
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
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowNewPass(!showNewPass)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Checklist độ mạnh */}
          <div className="mt-2 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 space-y-1 text-[11px]">
            <div
              className={`flex items-center gap-1.5 ${
                hasMinLength ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${hasMinLength ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`}
              />
              <span>Độ dài tối thiểu 8 ký tự</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${
                hasLetter && hasDigit ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  hasLetter && hasDigit ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'
                }`}
              />
              <span>Bao gồm cả chữ cái và chữ số</span>
            </div>
          </div>
        </div>

        {/* Xác nhận mật khẩu mới */}
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
            <p
              className={`text-[11px] mt-1 font-medium ${
                isMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
              }`}
            >
              {isMatch ? '✓ Mật khẩu xác nhận trùng khớp' : '✕ Mật khẩu xác nhận chưa khớp'}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          className="w-full text-base font-bold shadow-lg shadow-indigo-500/25 mt-2"
        >
          Xác nhận đặt lại mật khẩu
        </Button>
      </form>
    </div>
  );
};
