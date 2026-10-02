import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, RefreshCw, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { ImportDropzone } from '../../components/user-import/ImportDropzone';
import { ImportPreviewTable } from '../../components/user-import/ImportPreviewTable';
import { ImportSummaryModal } from '../../components/user-import/ImportSummaryModal';
import { userImportApi } from '../../api/userImport';
import { UserImportPreviewResponse, UserImportSummaryResponse } from '../../types/userImport';
import { useToast } from '../../contexts/ToastContext';

export const UserImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<UserImportPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Summary state
  const [summaryData, setSummaryData] = useState<UserImportSummaryResponse | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // 1. Tải tệp mẫu
  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      await userImportApi.downloadTemplate();
      showToast('Đã tải xuống tệp mẫu Excel thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Không thể tải xuống tệp mẫu.', 'error');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // 2. Chọn tệp và tự động phân tích / preview
  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setIsLoadingPreview(true);
    try {
      const data = await userImportApi.previewFile(file);
      setPreviewData(data);
      showToast(
        `Đã đọc ${data.total_rows} dòng. Hợp lệ: ${data.valid_count}, Lỗi: ${data.invalid_count}`,
        data.invalid_count > 0 ? 'info' : 'success',
        'Kiểm tra tệp Excel'
      );
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi đọc tệp Excel', 'error');
      setPreviewData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // 3. Xóa file đã chọn
  const handleClearFile = () => {
    setSelectedFile(null);
    setPreviewData(null);
  };

  // 4. Thực hiện nhập một phần
  const handleExecuteImport = async () => {
    if (!selectedFile) {
      showToast('Vui lòng chọn tệp Excel trước khi thực hiện!', 'warning');
      return;
    }

    if (!previewData || previewData.valid_count === 0) {
      showToast('Không có dòng hợp lệ nào để nhập vào hệ thống!', 'warning');
      return;
    }

    setIsImporting(true);
    try {
      const result = await userImportApi.executeImport(selectedFile);
      setSummaryData(result);
      setIsSummaryModalOpen(true);
      showToast(
        `Đã tạo thành công ${result.success_count} người dùng. Bỏ qua ${result.failed_count} dòng lỗi.`,
        'success',
        'Hoàn tất nhập dữ liệu'
      );
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi thực hiện nhập người dùng.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <PageContainer
      title="Nhập Danh Sách Người Dùng Từ Excel"
      subtitle="Tạo tài khoản hàng loạt cho đội ngũ kinh doanh và nhân sự trong vài phút"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/users')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Quay lại
          </Button>

          {previewData && previewData.valid_count > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleExecuteImport}
              isLoading={isImporting}
              leftIcon={<Play className="w-4 h-4 fill-current" />}
            >
              Nhập {previewData.valid_count} dòng hợp lệ
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Dropzone Upload */}
        <ImportDropzone
          onFileSelect={handleFileSelect}
          onDownloadTemplate={handleDownloadTemplate}
          isDownloading={isDownloadingTemplate}
          selectedFile={selectedFile}
          onClearFile={handleClearFile}
          isLoading={isLoadingPreview || isImporting}
        />

        {/* Loading Indicator */}
        {isLoadingPreview && (
          <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Đang phân tích và đối chiếu dữ liệu với CSDL...
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Kiểm tra định dạng email, username, vai trò và rà soát trùng lặp
            </p>
          </div>
        )}

        {/* Bảng Xem Trước (Preview Table) */}
        {!isLoadingPreview && previewData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  Kết Quả Xem Trước Tệp ({previewData.filename})
                </h3>
                <p className="text-xs text-slate-500">
                  Kiểm tra trước tính hợp lệ của từng dòng trước khi tiến hành lưu vào cơ sở dữ liệu.
                </p>
              </div>

              {previewData.valid_count > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExecuteImport}
                  isLoading={isImporting}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Xác nhận nhập ({previewData.valid_count} tài khoản)
                </Button>
              )}
            </div>

            <ImportPreviewTable
              rows={previewData.rows}
              totalRows={previewData.total_rows}
              validCount={previewData.valid_count}
              invalidCount={previewData.invalid_count}
            />
          </div>
        )}
      </div>

      {/* Modal Báo Cáo Tổng Kết */}
      <ImportSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        summary={summaryData}
        onGoToUsers={() => {
          setIsSummaryModalOpen(false);
          navigate('/users');
        }}
      />
    </PageContainer>
  );
};
