import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, LogIn, Warehouse, Shield, CheckCircle, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/common/Button';
import { getHomePathForRole } from '../../utils/roleUtils';

const loginSchema = z.object({
  email: z.string().min(1, 'Tên đăng nhập hoặc Email không được để trống'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const isExpired = new URLSearchParams(location.search).get('expired') === '1';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const user = await login(data.email, data.password, data.rememberMe);
      showToast(`Chào mừng ${user.name} đã quay trở lại hệ thống!`, 'success', 'Đăng nhập thành công');
      const targetPath = getHomePathForRole(user.role);
      navigate(targetPath);
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.detail ||
        error.message ||
        'Tên đăng nhập hoặc mật khẩu không chính xác';
      setLoginError(errorMsg);
      showToast(errorMsg, 'error', 'Đăng nhập thất bại');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft p-8 sm:p-10 transition-all">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Đăng nhập
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
          Đăng nhập để quản lý kho và bán hàng
        </p>
      </div>

      {isExpired && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <span className="font-semibold block mb-0.5">Phiên làm việc đã hết hạn</span>
            Phiên đăng nhập đã tự động kết thúc do không có tương tác để bảo đảm an toàn. Vui lòng đăng nhập lại.
          </div>
        </div>
      )}

      {loginError && (
        <div
          className={`mb-6 p-4 rounded-2xl border flex items-start gap-3 transition-all animate-shake ${
            loginError.toLowerCase().includes('khóa')
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
          }`}
        >
          {loginError.toLowerCase().includes('khóa') ? (
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
          )}
          <div className="text-xs sm:text-sm">
            <span className="font-semibold block mb-0.5">
              {loginError.toLowerCase().includes('khóa')
                ? 'Tài khoản hoặc thiết bị bị tạm khóa 15 phút'
                : 'Thông báo đăng nhập'}
            </span>
            {loginError}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Email field */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Email / Tên đăng nhập
          </label>
          <div className="relative">
            <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              {...register('email')}
              placeholder="admin@warehouse.local hoặc admin"
              className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                errors.email
                  ? 'border-rose-300 dark:border-rose-700 focus:border-rose-500'
                  : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500'
              }`}
            />
          </div>
          {errors.email && (
            <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1 font-medium">
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password field */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
            Mật khẩu
          </label>
          <div className="relative">
            <Lock className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              {...register('password')}
              placeholder="••••••••"
              className={`w-full pl-11 pr-11 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                errors.password
                  ? 'border-rose-300 dark:border-rose-700 focus:border-rose-500'
                  : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1 font-medium">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Remember me & Forgot Password */}
        <div className="flex items-center justify-between text-xs sm:text-sm">
          <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              {...register('rememberMe')}
              className="w-4 h-4 rounded text-indigo-600 border-slate-300 dark:border-slate-700 focus:ring-indigo-500"
            />
            <span>Ghi nhớ đăng nhập</span>
          </label>
          <Link
            to="/forgot-password"
            className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>

        {/* Submit button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          leftIcon={<LogIn className="w-5 h-5" />}
          className="w-full text-base font-bold shadow-lg shadow-indigo-500/25"
        >
          Đăng nhập hệ thống
        </Button>
      </form>
    </div>
  );
};
