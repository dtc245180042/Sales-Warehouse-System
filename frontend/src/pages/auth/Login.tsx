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
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const handleQuickLogin = (username: string) => {
    setValue('email', username, { shouldValidate: true });
    setValue('password', '123456', { shouldValidate: true });
  };

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
          id="login-submit-button"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          leftIcon={<LogIn className="w-5 h-5" />}
          className="w-full text-base font-bold shadow-lg shadow-indigo-500/25"
        >
          Đăng nhập hệ thống
        </Button>

        {/* Quick Demo Accounts */}
        <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
            ⚡ Tài khoản kiểm thử nhanh (Mật khẩu: 123456):
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
            <button
              type="button"
              id="quick-admin"
              onClick={() => handleQuickLogin('admin')}
              className="px-2 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold hover:bg-purple-100 text-left border border-purple-200 dark:border-purple-800"
            >
              👑 Admin
            </button>
            <button
              type="button"
              id="quick-sales-mgr"
              onClick={() => handleQuickLogin('sales_mgr')}
              className="px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 text-left border border-blue-200 dark:border-blue-800"
            >
              💼 QL Bán Hàng
            </button>
            <button
              type="button"
              id="quick-sales-rep"
              onClick={() => handleQuickLogin('sales_rep')}
              className="px-2 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-semibold hover:bg-sky-100 text-left border border-sky-200 dark:border-sky-800"
            >
              🎯 Sales Rep
            </button>
            <button
              type="button"
              id="quick-wh-mgr"
              onClick={() => handleQuickLogin('wh_mgr')}
              className="px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-100 text-left border border-amber-200 dark:border-amber-800"
            >
              📦 QL Kho (HN)
            </button>
            <button
              type="button"
              id="quick-warehouse"
              onClick={() => handleQuickLogin('warehouse')}
              className="px-2 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-semibold hover:bg-orange-100 text-left border border-orange-200 dark:border-orange-800"
            >
              🏷️ Thủ Kho (ĐN)
            </button>
            <button
              type="button"
              id="quick-accountant"
              onClick={() => handleQuickLogin('accountant')}
              className="px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-100 text-left border border-emerald-200 dark:border-emerald-800"
            >
              💰 Kế Toán
            </button>
            <button
              type="button"
              id="quick-customer"
              onClick={() => handleQuickLogin('customer')}
              className="px-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold hover:bg-indigo-100 text-left border border-indigo-200 dark:border-indigo-800"
            >
              🤝 Đại Lý B2B
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
