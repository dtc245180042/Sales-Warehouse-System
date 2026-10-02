import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { Logo } from '../components/common/Logo';

export const AuthLayout: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors p-4 sm:p-6 relative overflow-hidden">
      {/* Background glow and subtle patterns */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-500/10 dark:bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Theme Switcher absolute */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-all"
          title="Chuyển chế độ sáng/tối"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-md relative z-10 flex flex-col items-center my-auto py-8">
        {/* Centered Brand Logo matching user image */}
        <div className="mb-6">
          <Logo size="xl" layout="vertical" />
        </div>

        {/* Form Page (Login / ForgotPassword) */}
        <div className="w-full">
          <Outlet />
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          © 2026 Hệ Thống Kho Vận & Bán Hàng. Toàn quyền bảo lưu.
        </div>
      </div>
    </div>
  );
};

