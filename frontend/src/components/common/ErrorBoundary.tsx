import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mb-4 shadow-lg shadow-rose-500/10">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Đã có lỗi xảy ra khi hiển thị trang
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6">
            Hệ thống gặp sự cố không mong muốn. Vui lòng thử tải lại trang hoặc quay về trang chủ.
          </p>

          {this.state.error && (
            <div className="w-full max-w-lg mb-6 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-left font-mono text-xs text-rose-600 dark:text-rose-400 overflow-x-auto border border-slate-200 dark:border-slate-700">
              {this.state.error.toString()}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={this.handleReset}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Tải lại trang
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              leftIcon={<Home className="w-4 h-4" />}
            >
              Về Trang chủ
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
