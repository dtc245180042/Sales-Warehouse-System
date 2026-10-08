import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PlusCircle,
  RefreshCw,
  Eye,
  Filter,
  Check,
  Package,
  Layers,
  ArrowRight
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { productImportApi } from '../../api/productImport';
import {
  ProductImportPreviewResponse,
  ProductImportExecuteResponse,
  ProductImportRow
} from '../../types/productImport';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/formatters';

type FilterTab = 'all' | 'create' | 'update' | 'error';

export const ProductImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { role } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<ProductImportPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  // Tab lọc trong preview
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Modal tổng kết
  const [summaryData, setSummaryData] = useState<ProductImportExecuteResponse | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  // Quyền xem giá vốn: Chỉ Quản lý kinh doanh và Admin
  const canViewCostPrice = role === 'Admin' || role === 'SalesManager' || role === 'Director';

  // 1. Tải tệp mẫu Excel
  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      await productImportApi.downloadTemplate();
      showToast('Đã tải xuống tệp mẫu Excel danh mục sản phẩm!', 'success', 'Tải tệp mẫu');
    } catch (err: any) {
      showToast(err.message || 'Không thể tải xuống tệp mẫu.', 'error', 'Lỗi');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // 2. Xử lý khi chọn file
  const handleFileProcess = async (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      showToast('Chỉ hỗ trợ tệp định dạng Excel (.xlsx, .xls) hoặc CSV (.csv)', 'warning');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showToast('Dung lượng tệp vượt quá 15MB. Vui lòng chọn tệp nhỏ hơn.', 'warning');
      return;
    }

    setSelectedFile(file);
    setIsLoadingPreview(true);
    try {
      const data = await productImportApi.previewFile(file);
      setPreviewData(data);
      setActiveTab('all');
      showToast(
        `Đã đọc ${data.total_rows} dòng. Hợp lệ: ${data.valid_count} (${data.to_create_count} tạo mới, ${data.to_update_count} cập nhật), Lỗi: ${data.invalid_rows_count}`,
        data.invalid_rows_count > 0 ? 'info' : 'success',
        'Kiểm tra tệp Excel'
      );
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi đọc và kiểm tra tệp Excel', 'error');
      setPreviewData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setPreviewData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 3. Thực thi nhập vào hệ thống MySQL
  const handleExecuteImport = async () => {
    if (!previewData || previewData.valid_count === 0) {
      showToast('Không có dòng dữ liệu hợp lệ nào để nhập vào hệ thống!', 'warning');
      return;
    }

    setIsImporting(true);
    try {
      const res = await productImportApi.executeImport(previewData.valid_data);
      // Xóa cache cũ để đồng bộ 100% 5000+ sản phẩm mới từ MySQL về danh sách
      localStorage.removeItem('kv_products');
      setSummaryData(res);
      setIsSummaryModalOpen(true);
      showToast(
        `Nhập dữ liệu thành công! ${res.created_count} tạo mới, ${res.updated_count} cập nhật.`,
        'success',
        'Hoàn tất nhập sản phẩm'
      );
    } catch (err: any) {
      showToast(err.message || 'Lỗi trong quá trình lưu dữ liệu vào hệ thống.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // Dữ liệu lọc cho bảng xem trước
  const getFilteredItems = () => {
    if (!previewData) return [];
    if (activeTab === 'create') {
      return previewData.valid_data.filter((r) => r.action === 'CREATE');
    }
    if (activeTab === 'update') {
      return previewData.valid_data.filter((r) => r.action === 'UPDATE');
    }
    if (activeTab === 'error') {
      return [];
    }
    return previewData.valid_data;
  };

  return (
    <PageContainer
      title="Nhập Danh Mục Sản Phẩm Từ Excel"
      subtitle="Hỗ trợ đưa hàng nghìn mã hàng SKU vào hệ thống nhanh chóng với cơ chế kiểm tra lỗi và cập nhật tự động (SCRUM-216)"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate('/products')}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Quay lại danh mục
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            isLoading={isDownloadingTemplate}
            icon={<Download className="w-4 h-4" />}
          >
            Tải tệp mẫu Excel
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KHUNG KÉO THẢ TỆP EXCEL */}
        {!previewData && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative rounded-xl border-2 border-dashed p-10 text-center transition-all bg-white dark:bg-slate-900 ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 scale-[1.01]'
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mb-4 shadow-sm">
              <FileSpreadsheet className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Kéo và thả tệp Excel danh mục sản phẩm vào đây
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Hỗ trợ tệp <strong>.xlsx</strong>, <strong>.xls</strong> hoặc <strong>.csv</strong>.
              Hệ thống sẽ tự động đối chiếu mã SKU để phân loại tạo mới hoặc cập nhật thông tin.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="primary"
                onClick={() => fileInputRef.current?.click()}
                isLoading={isLoadingPreview}
                icon={<Upload className="w-4 h-4" />}
              >
                Chọn tệp từ máy tính
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                isLoading={isDownloadingTemplate}
                icon={<Download className="w-4 h-4" />}
              >
                Tải tệp mẫu chuẩn (.xlsx)
              </Button>
            </div>
          </div>
        )}

        {/* THÔNG TIN TỆP VÀ BẢNG XEM TRƯỚC (KHI ĐÃ CHỌN TỆP) */}
        {previewData && (
          <div className="space-y-6">
            {/* Thanh tiêu đề tệp đang xử lý */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {selectedFile?.name}
                    <Badge variant="success">Đã phân tích</Badge>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Dung lượng: {(selectedFile?.size ? (selectedFile.size / 1024).toFixed(1) : 0)} KB • Tổng số dòng: {previewData.total_rows}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleClearFile} icon={<RefreshCw className="w-4 h-4" />}>
                  Chọn tệp khác
                </Button>
                <Button
                  variant="primary"
                  onClick={handleExecuteImport}
                  isLoading={isImporting}
                  disabled={previewData.valid_count === 0}
                  icon={<Check className="w-4 h-4" />}
                >
                  Thực hiện nhập {previewData.valid_count} dòng hợp lệ
                </Button>
              </div>
            </div>

            {/* THẺ THỐNG KÊ (METRICS CARDS) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tổng dòng</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{previewData.total_rows}</p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 shadow-sm">
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Hợp lệ
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{previewData.valid_count}</p>
              </div>
              <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 shadow-sm">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <PlusCircle className="w-3.5 h-3.5" /> Tạo mới (CREATE)
                </p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{previewData.to_create_count}</p>
              </div>
              <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/50 shadow-sm">
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> Cập nhật (UPDATE)
                </p>
                <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">{previewData.to_update_count}</p>
              </div>
              <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 shadow-sm">
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Lỗi (Bỏ qua)
                </p>
                <p className="text-2xl font-bold text-rose-700 dark:text-rose-300 mt-1">{previewData.invalid_rows_count}</p>
              </div>
            </div>

            {/* TABS LỌC BẢNG XEM TRƯỚC */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'all'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                Hợp lệ ({previewData.valid_count})
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'create'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                Tạo mới ({previewData.to_create_count})
              </button>
              <button
                onClick={() => setActiveTab('update')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'update'
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                Cập nhật SKU có sẵn ({previewData.to_update_count})
              </button>
              <button
                onClick={() => setActiveTab('error')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === 'error'
                    ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                Dòng lỗi ({previewData.invalid_rows_count})
              </button>
            </div>

            {/* BẢNG DỮ LIỆU XEM TRƯỚC */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm max-h-[500px]">
              {activeTab === 'error' ? (
                // BẢNG HIỂN THỊ DÒNG LỖI
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Dòng Excel</th>
                      <th className="px-4 py-3">Mã SKU</th>
                      <th className="px-4 py-3">Chi tiết lỗi cần chỉnh sửa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewData.errors.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                          Tuyệt vời! Không có dòng nào bị lỗi.
                        </td>
                      </tr>
                    ) : (
                      previewData.errors.map((err, idx) => (
                        <tr key={idx} className="bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50/50">
                          <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Dòng {err.row}</td>
                          <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-200">{err.sku || '—'}</td>
                          <td className="px-4 py-3">
                            <ul className="list-disc list-inside text-rose-600 dark:text-rose-400 text-xs space-y-1">
                              {err.errors.map((e, eIdx) => (
                                <li key={eIdx}>{e}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                // BẢNG HIỂN THỊ DỮ LIỆU HỢP LỆ
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-3">Hành động</th>
                      <th className="px-4 py-3">Mã SKU</th>
                      <th className="px-4 py-3">Tên sản phẩm</th>
                      <th className="px-4 py-3">Nhóm hàng</th>
                      <th className="px-4 py-3">Đơn vị</th>
                      <th className="px-4 py-3">Quy cách</th>
                      {canViewCostPrice && <th className="px-4 py-3 text-right">Giá vốn</th>}
                      <th className="px-4 py-3 text-right">Giá bán</th>
                      <th className="px-4 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {getFilteredItems().length === 0 ? (
                      <tr>
                        <td colSpan={canViewCostPrice ? 9 : 8} className="px-4 py-8 text-center text-slate-400">
                          Không có sản phẩm nào trong mục này.
                        </td>
                      </tr>
                    ) : (
                      getFilteredItems().map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            {item.action === 'CREATE' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                Tạo mới
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">
                                Cập nhật
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                            {item.name}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            {item.category || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                            {item.unit}
                          </td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                            {item.packaging_spec || '—'}
                          </td>
                          {canViewCostPrice && (
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 font-mono text-xs">
                              {formatCurrency(item.cost_price)}
                            </td>
                          )}
                          <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-slate-200 font-mono">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                                item.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {item.status === 'ACTIVE' ? 'Kinh doanh' : 'Ngừng KD'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* NÚT THỰC HIỆN DƯỚI BẢNG */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lưu ý: Các dòng lỗi sẽ tự động được bỏ qua để đảm bảo tiến độ import một phần (Partial Import).
              </p>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={handleClearFile}>
                  Hủy bỏ
                </Button>
                <Button
                  variant="primary"
                  onClick={handleExecuteImport}
                  isLoading={isImporting}
                  disabled={previewData.valid_count === 0}
                  icon={<Check className="w-4 h-4" />}
                >
                  Nhập {previewData.valid_count} sản phẩm vào Database
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL TỔNG KẾT SAU KHI NHẬP XONG */}
      {summaryData && (
        <Modal
          isOpen={isSummaryModalOpen}
          onClose={() => setIsSummaryModalOpen(false)}
          title="Kết Quả Nhập Danh Mục Sản Phẩm (SCRUM-216)"
        >
          <div className="space-y-6 py-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Đã nhập thành công {summaryData.success_count} sản phẩm!
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Dữ liệu danh mục đã được đồng bộ trực tiếp vào cơ sở dữ liệu MySQL.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-center">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Số mã tạo mới</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {summaryData.created_count}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Số mã cập nhật</p>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {summaryData.updated_count}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsSummaryModalOpen(false);
                  handleClearFile();
                }}
              >
                Nhập tệp khác
              </Button>
              <Button
                variant="primary"
                onClick={() => navigate('/products')}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Đi đến Danh mục sản phẩm
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageContainer>
  );
};
