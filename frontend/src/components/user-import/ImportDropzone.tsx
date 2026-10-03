import React, { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Download, AlertCircle, FileCheck } from 'lucide-react';
import { Button } from '../common/Button';

interface ImportDropzoneProps {
  onFileSelect: (file: File) => void;
  onDownloadTemplate: () => void;
  isDownloading: boolean;
  selectedFile: File | null;
  onClearFile: () => void;
  isLoading: boolean;
}

export const ImportDropzone: React.FC<ImportDropzoneProps> = ({
  onFileSelect,
  onDownloadTemplate,
  isDownloading,
  selectedFile,
  onClearFile,
  isLoading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSelect(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSelect(files[0]);
    }
  };

  const validateAndSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      alert('Vui lòng chọn tệp định dạng Excel (.xlsx hoặc .xls)');
      return;
    }
    onFileSelect(file);
  };

  return (
    <div className="space-y-4">
      {/* Hướng dẫn & Tải mẫu */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800/80 dark:to-indigo-950/40 p-4 rounded-2xl border border-blue-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Nhập danh sách người dùng hàng loạt từ Excel
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tải file mẫu chuẩn, điền thông tin nhân sự và tải lên để hệ thống kiểm tra tự động.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onDownloadTemplate}
          isLoading={isDownloading}
          leftIcon={<Download className="w-4 h-4 text-blue-600" />}
        >
          Tải tệp mẫu Excel
        </Button>
      </div>

      {/* Khu vực Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 scale-[1.01]'
            : selectedFile
            ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10'
            : 'border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading}
        />

        {selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
              <FileCheck className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {(selectedFile.size / 1024).toFixed(1)} KB - Nhấp hoặc kéo thả để chọn tệp khác
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFile}
                className="text-xs text-slate-500 hover:text-rose-600"
              >
                Hủy chọn
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <UploadCloud className="w-7 h-7" />
            </div>
            <div className="mt-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Kéo & thả tệp Excel vào đây, hoặc <span className="text-blue-600 dark:text-blue-400 font-semibold underline">Duyệt tệp</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Hỗ trợ tệp định dạng .xlsx, .xls (Tối đa 5MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Chú ý quan trọng */}
      <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">Cơ chế Import Một Phần:</span> Các dòng hợp lệ sẽ được lưu trực tiếp vào hệ thống. Các dòng có lỗi (như trùng tài khoản, sai email, thiếu kho) sẽ được thống kê chi tiết để bạn điều chỉnh mà không làm gián đoạn các tài khoản khác.
        </div>
      </div>
    </div>
  );
};
