import React, { useEffect, useRef, useState } from 'react';
import {
  Printer,
  Download,
  X,
  Loader2,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { paymentService } from '../../services/paymentService';
import { useToast } from '../../contexts/ToastContext';

interface PaymentPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentId: string | null;
}

export const PaymentPrintModal: React.FC<PaymentPrintModalProps> = ({
  isOpen,
  onClose,
  paymentId,
}) => {
  const { showToast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !paymentId) {
      setHtmlContent('');
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    paymentService
      .getPrintHtml(paymentId)
      .then((html) => {
        if (!isMounted) return;
        setHtmlContent(html);
        setLoading(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setLoading(false);
        const errMsg =
          err?.response?.data?.detail ||
          err?.message ||
          'Không thể tải tài liệu in phiếu thu. Vui lòng thử lại sau.';
        setError(errMsg);
        showToast(errMsg, 'error');
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, paymentId, showToast]);

  // Đóng modal khi nhấn phím Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Kích hoạt in / Lưu PDF
  const handlePrint = () => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) {
      showToast('Khung tài liệu in chưa sẵn sàng', 'warning');
      return;
    }
    try {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    } catch {
      showToast('Trình duyệt không hỗ trợ kích hoạt in tự động từ khung xem trước', 'error');
    }
  };

  // Tải file HTML offline
  const handleDownloadHtml = () => {
    if (!htmlContent) return;
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PhieuThu_${paymentId || 'S&W'}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Đã tải tài liệu Phiếu thu thành công', 'success');
    } catch {
      showToast('Lỗi khi tải file', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col w-full max-w-5xl h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Xem Trước & In Phiếu Thu Tiền
                </h3>
                {paymentId && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                    {paymentId}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chứng từ thu tiền hợp lệ giao đại lý ngay tại chỗ kèm Barcode đối soát (S7-09)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !!error}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md shadow-emerald-500/20 transition-all"
              title="Mở hộp thoại in / Lưu dưới dạng PDF"
            >
              <Printer className="w-4 h-4" />
              <span>In / Lưu PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              disabled={loading || !!error}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 transition-colors"
              title="Tải file HTML chứng từ lưu offline"
            >
              <Download className="w-4 h-4" />
              <span>Tải file</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: A4 Preview */}
        <div className="flex-1 bg-slate-100/80 dark:bg-slate-950 p-3 sm:p-6 overflow-y-auto flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-xs sm:text-sm font-medium">Đang tạo chứng từ in ấn phiếu thu và mã vạch...</p>
            </div>
          )}

          {!loading && error && (
            <div className="max-w-md p-6 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl shadow-lg text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Không Thể Tải Tài Liệu</h4>
              <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Đóng
              </button>
            </div>
          )}

          {!loading && !error && htmlContent && (
            <div className="w-full h-full max-w-4xl bg-white rounded-xl shadow-xl overflow-hidden border border-slate-300 dark:border-slate-700">
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                title={`Phiếu thu ${paymentId || ''}`}
                className="w-full h-full border-0 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
