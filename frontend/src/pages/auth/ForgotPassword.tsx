import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { authService } from '../../services/authService';

const schema = z.object({
  email: z
    .string()
    .min(1, 'Vui lòng nhập Email tài khoản')
    .email('Địa chỉ email không đúng định dạng'),
});

type FormData = z.infer<typeof schema>;

export const ForgotPassword: React.FC = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      await authService.forgotPassword(data.email.trim());
      setSentEmail(data.email.trim());
      setIsSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Có lỗi xảy ra khi gửi yêu cầu. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };

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
          Quên mật khẩu?
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Nhập địa chỉ email liên kết với tài khoản của bạn để nhận liên kết đặt lại mật khẩu.
        </p>
      </div>

      {isSubmitted ? (
        <div className="text-center py-4 space-y-5 animate-fadeIn">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/50 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Kiểm tra hộp thư của bạn</h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
              Nếu địa chỉ email <span className="font-semibold text-slate-900 dark:text-slate-200">{sentEmail}</span> tồn tại trong hệ thống, chúng tôi đã gửi một email chứa liên kết đặt lại mật khẩu đến hộp thư của bạn.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 text-left border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Hướng dẫn tiếp theo:</p>
            <p>1. Mở email từ <strong>KhoVận Pro</strong> trong hộp thư của bạn.</p>
            <p>2. Nhấn vào nút <strong>"Đặt Lại Mật Khẩu"</strong> trong email để tạo mật khẩu mới.</p>
            <p>3. Liên kết này có hiệu lực trong vòng <strong className="text-indigo-600 dark:text-indigo-400">30 phút</strong> và chỉ sử dụng được <strong className="text-indigo-600 dark:text-indigo-400">một lần duy nhất</strong>.</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              * Nếu không thấy email trong Hộp thư đến, vui lòng kiểm tra thư mục Thư rác (Spam).
            </p>
          </div>

          <div className="pt-2">
            <Link to="/login">
              <Button variant="primary" className="w-full">
                Quay lại trang Đăng nhập
              </Button>
            </Link>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setIsSubmitted(false)}
              className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium hover:underline"
            >
              Chưa nhận được email? Gửi lại yêu cầu
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Địa chỉ Email tài khoản
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                {...register('email')}
                placeholder="admin@warehouse.local"
                className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                  errors.email
                    ? 'border-rose-300 dark:border-rose-700 focus:border-rose-500'
                    : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500'
                }`}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-rose-500 mt-1.5 font-medium">{errors.email.message}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            leftIcon={<Send className="w-4 h-4" />}
            className="w-full text-base font-bold shadow-lg shadow-indigo-500/25"
          >
            Gửi liên kết đặt lại mật khẩu
          </Button>
        </form>
      )}
    </div>
  );
};
