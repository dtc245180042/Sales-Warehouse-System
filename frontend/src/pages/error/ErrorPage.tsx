import React from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ShieldAlert, FileQuestion, ArrowLeft, Home, LogOut, ServerCrash } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getHomePathForRole, getHomeTitleForRole } from '../../utils/roleUtils';

interface ErrorPageProps {
  code?: '403' | '404' | '500';
  title?: string;
  message?: string;
}

export const ErrorPage: React.FC<ErrorPageProps> = ({
  code = '403',
  title,
  message,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, user, logout } = useAuth();

  const is403 = code === '403';
  const is500 = code === '500';

  // Determine home path based on user role
  const getHomePath = () => getHomePathForRole(role);
  const getHomeTitle = () => getHomeTitleForRole(role);

  const defaultTitle = is403
    ? 'Không có quyền truy cập'
    : is500
    ? 'Lỗi hệ thống nội bộ'
    : 'Không tìm thấy trang yêu cầu';

  const defaultMessage = is403
    ? `Tài khoản "${user?.name || 'Hiện tại'}" với vai trò ${role} không được phân quyền truy cập trang "${location.pathname}".`
    : is500
    ? 'Máy chủ gặp lỗi không mong muốn. Đội kỹ thuật đã được thông báo. Vui lòng thử lại sau vài phút.'
    : `Đường dẫn "${location.pathname}" không tồn tại hoặc đã bị di dời sang địa chỉ khác.`;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-md w-full text-center space-y-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-soft">
        {/* Status Icon */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div
            className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg ${
              is403
                ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shadow-rose-500/20'
                : is500
                ? 'bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 shadow-orange-500/20'
                : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 shadow-indigo-500/20'
            }`}
          >
            {is403 ? <ShieldAlert className="w-10 h-10" /> : is500 ? <ServerCrash className="w-10 h-10" /> : <FileQuestion className="w-10 h-10" />}
          </div>
        </div>

        {/* Code & Title */}
        <div>
          <span className={`text-4xl font-black tracking-wider font-mono ${
            is403 ? 'text-rose-600 dark:text-rose-400'
            : is500 ? 'text-orange-600 dark:text-orange-400'
            : 'text-indigo-600 dark:text-indigo-400'
          }`}>
            {code}
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
            {title || defaultTitle}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            {message || defaultMessage}
          </p>
        </div>

        {/* Suggested Actions to return to workflow */}
        <div className="pt-2 flex flex-col gap-2.5">
          <Link
            to={getHomePath()}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all"
          >
            <Home className="w-4 h-4" />
            <span>{getHomeTitle()}</span>
          </Link>

          <button
            onClick={() => navigate(-1)}
            className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại trang trước đó</span>
          </button>

          <button
            onClick={() => logout()}
            className="text-xs text-slate-400 hover:text-rose-500 transition-colors pt-2 flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng nhập bằng tài khoản khác</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
