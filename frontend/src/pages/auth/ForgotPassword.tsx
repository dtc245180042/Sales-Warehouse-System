import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { authService } from '../../services/authService';

const schema = z.object({
  email: z.string().min(1, 'Vui lòng nhập Email hoặc Tên đăng nhập của tài khoản'),
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
      await authService.forgotPassword(data.email);
      setSentEmail(data.email);
      setIsSubmitted(true);
    } catch (err: any) {
      // Chỉ chấp nhận tài khoản tồn tại: nếu không tồn tại sẽ hiện thông báo lỗi
      setErrorMessage(err.message || 'Tài khoản hoặc email không tồn tại trong hệ thống.');
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
          Nhập địa chỉ email liên kết với tài khoản của bạn để nhận liên kết khôi phục.
        </p>
      </div>

      {isSubmitted ? (
        <div className="text-center py-6 space-y-4">
          <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-950/50 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Email đã được gửi!</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Nếu email <span className="font-semibold text-slate-900 dark:text-slate-200">{sentEmail}</span> tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hộp thư. Liên kết có hiệu lực tối đa <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">30 phút</strong> và chỉ sử dụng được <strong className="text-indigo-600 dark:text-indigo-400 font-semibold">một lần duy nhất</strong> vì mục đích an toàn.
          </p>
          <div className="pt-4">
            <Link to="/login">
              <Button variant="primary" className="w-full">
                Quay lại Đăng nhập
              </Button>
            </Link>
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
              Địa chỉ Email
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                {...register('email')}
                placeholder="admin@warehouse.local"
                className={`w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${errors.email
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
            Gửi yêu cầu khôi phục
          </Button>
        </form>
      )}
    </div>
  );
};
