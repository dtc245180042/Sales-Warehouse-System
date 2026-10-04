import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Crop,
  ShieldAlert,
} from 'lucide-react';
import { Button } from './Button';
import { avatarService } from '../../services/avatarService';
import { useToast } from '../../contexts/ToastContext';

interface AvatarUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar?: string;
  userId?: string | number;
  onAvatarUpdated: (newAvatarUrl: string) => void;
}

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB (SCRUM-365)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

export const AvatarUploadModal: React.FC<AvatarUploadModalProps> = ({
  isOpen,
  onClose,
  currentAvatar,
  userId,
  onAvatarUpdated,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dọn dẹp object URL khi unmount hoặc đổi file
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Reset state khi mở/đóng modal
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setPreviewUrl(null);
      setErrorMessage(null);
      setIsUploading(false);
      setIsDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validateAndProcessFile = (file: File) => {
    setErrorMessage(null);

    // 1. Kiểm tra file rỗng (0 bytes)
    if (file.size === 0) {
      const msg = 'File ảnh không có dữ liệu (0 bytes). Vui lòng chọn file khác.';
      setErrorMessage(msg);
      showToast(msg, 'error', 'Tệp ảnh rỗng');
      setSelectedFile(null);
      setPreviewUrl(null);
      return false;
    }

    // 2. Kiểm tra định dạng (Chỉ chấp nhận JPG, PNG)
    const fileExt = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const isValidExt = ALLOWED_EXTENSIONS.includes(fileExt);
    const isValidMime = file.type ? ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) : true;

    if (!isValidExt || !isValidMime) {
      const msg = `Định dạng tệp "${file.name}" không hợp lệ. Chỉ chấp nhận file JPG, PNG (Dung lượng tối đa 2MB).`;
      setErrorMessage(msg);
      showToast(msg, 'error', 'Định dạng không hợp lệ');
      setSelectedFile(null);
      setPreviewUrl(null);
      return false;
    }

    // 3. Kiểm tra dung lượng tối đa 2MB (2,097,152 bytes)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const msg = `Dung lượng ảnh (${sizeMB}MB) vượt quá giới hạn 2MB. Chỉ chấp nhận file JPG, PNG (Dung lượng tối đa 2MB).`;
      setErrorMessage(msg);
      showToast(msg, 'error', 'Vượt quá dung lượng 2MB');
      setSelectedFile(null);
      setPreviewUrl(null);
      return false;
    }

    // 4. Tạo live preview
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
    // Reset input value để có thể chọn lại cùng 1 file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Vui lòng chọn một file ảnh trước khi lưu.');
      showToast('Vui lòng chọn một file ảnh trước khi lưu.', 'warning', 'Chưa chọn ảnh');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const res = await avatarService.uploadAvatar(selectedFile);
      if (res.success && res.data) {
        showToast('Tải lên và cập nhật ảnh đại diện thành công!', 'success', 'Thành công');
        onAvatarUpdated(res.data.avatar_url);
        onClose();
      } else {
        throw new Error(res.message || 'Tải ảnh thất bại.');
      }
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      const msg =
        err.response?.data?.detail ||
        err.data?.detail ||
        err.message ||
        'Có lỗi xảy ra khi tải ảnh đại diện lên.';
      setErrorMessage(msg);
      showToast(msg, 'error', 'Lỗi tải ảnh');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa ảnh đại diện và quay về ảnh mặc định không?')) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await avatarService.deleteMyAvatar();
      if (res.success) {
        showToast('Đã xóa ảnh đại diện thành công.', 'info');
        const defaultAvatar = `https://ui-avatars.com/api/?name=User&background=6366f1&color=fff`;
        onAvatarUpdated(defaultAvatar);
        onClose();
      }
    } catch (err: any) {
      const msg = err.data?.detail || err.message || 'Không thể xóa ảnh đại diện.';
      setErrorMessage(msg);
      showToast(msg, 'error', 'Lỗi xóa ảnh');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Thay Đổi Ảnh Đại Diện
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ảnh sẽ được cắt vuông tự động (1:1) và tạo thumbnail
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung chính */}
        <div className="p-6 space-y-5">
          {/* Thông báo lỗi (SCRUM-366) */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start justify-between gap-3 text-rose-700 dark:text-rose-200 text-xs animate-shake shadow-sm">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                <div>
                  <span className="font-bold text-rose-900 dark:text-rose-100">Lỗi kiểm tra ảnh: </span>
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors"
                title="Đóng thông báo lỗi"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Vùng chọn file & kéo thả */}
          {!previewUrl ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 scale-[0.99]'
                  : 'border-indigo-300 dark:border-indigo-500/50 bg-indigo-50/15 dark:bg-indigo-950/10 hover:border-indigo-400 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center ring-8 ring-indigo-500/10">
                <UploadCloud className="w-7 h-7" />
              </div>

              <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
                Nhấp để tải lên hoặc kéo thả ảnh vào đây
              </h4>
              <p className="text-xs text-slate-400 dark:text-slate-400 mb-4">
                Chỉ chấp nhận file <strong className="text-indigo-600 dark:text-indigo-400 font-bold">JPG, PNG</strong> (Dung lượng tối đa{' '}
                <strong className="text-indigo-600 dark:text-indigo-400 font-bold">2MB</strong>)
              </p>

              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors shadow-2xs">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                Chọn từ máy tính
              </div>
            </div>
          ) : (
            /* Khối Xem Trước (Preview Mode - SCRUM-363) */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Xem trước bản cắt vuông & Thumbnail (SCRUM-362)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px]"
                  >
                    Chọn ảnh khác
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                  {/* Cắt vuông 1:1 xem trước */}
                  <div className="sm:col-span-2 flex flex-col items-center justify-center p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="relative w-40 h-40 rounded-2xl overflow-hidden shadow-inner ring-4 ring-indigo-500/20">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 border border-dashed border-white/60 pointer-events-none rounded-2xl" />
                    </div>
                    <span className="text-[11px] text-slate-400 mt-2 font-medium">
                      Bản cắt vuông chuẩn (500x500)
                    </span>
                  </div>

                  {/* Bản thu nhỏ Thumbnail */}
                  <div className="flex flex-col items-center justify-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-indigo-500/40 shadow-sm">
                      <img
                        src={previewUrl}
                        alt="Thumb"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-center">
                      <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Thumbnail (128x128)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Hiển thị tại Header & Lịch sử đơn
                      </span>
                    </div>
                  </div>
                </div>

                {/* Thông tin tệp */}
                {selectedFile && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="truncate max-w-[200px]" title={selectedFile.name}>
                      📄 {selectedFile.name}
                    </span>
                    <span className="font-mono">
                      {(selectedFile.size / 1024).toFixed(1)} KB / 2MB
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800">
          <div>
            {currentAvatar && !currentAvatar.includes('ui-avatars.com') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isUploading || isDeleting}
                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs gap-1.5"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Xóa ảnh đại diện
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isUploading || isDeleting}
              className="text-xs"
            >
              Hủy
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleUpload}
              disabled={!selectedFile || isUploading || isDeleting}
              className="text-xs gap-1.5"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Đang xử lý & lưu...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Lưu ảnh đại diện
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
