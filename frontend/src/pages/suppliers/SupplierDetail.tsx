import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  MapPin,
  ArrowDownLeft,
  Boxes,
  AlertTriangle,
  Ban,
  Receipt,
  CreditCard,
  Lock,
  Trash2,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { supplierService } from '../../services/supplierService';
import { productService } from '../../services/productService';
import { inventoryService } from '../../services/inventoryService';
import { Supplier } from '../../types/Supplier';
import { Product } from '../../types/Product';
import { StockInReceipt } from '../../types/Inventory';
import { useToast } from '../../contexts/ToastContext';

export const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [suppliedProducts, setSuppliedProducts] = useState<Product[]>([]);
  const [importReceipts, setImportReceipts] = useState<StockInReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasReceipts, setHasReceipts] = useState(false);

  // Suspend modal
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);

  // Delete confirm
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const found = await supplierService.getById(id);
        if (found) {
          setSupplier(found);
          const [allProducts, allReceipts, receiptsCheck] = await Promise.all([
            productService.getAll(),
            inventoryService.getStockInReceipts(),
            supplierService.hasImportReceipts(found.id),
          ]);
          setHasReceipts(receiptsCheck);
          setSuppliedProducts(
            allProducts.filter((p) => p.supplierId === found.id || p.supplierName === found.name)
          );
          setImportReceipts(
            allReceipts.filter((r) => r.supplierId === found.id || r.supplierName === found.name)
          );
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  const handleSuspend = async () => {
    if (!supplier) return;
    if (!suspendReason.trim()) {
      showToast('Vui lòng nhập lý do ngừng giao dịch', 'warning');
      return;
    }
    setSuspendLoading(true);
    try {
      await supplierService.suspend(supplier.id, suspendReason);
      showToast(
        `Đã ngừng giao dịch với "${supplier.name}". Lý do: ${suspendReason}`,
        'success'
      );
      setSuspendOpen(false);
      setSuspendReason('');
      // Reload supplier info
      const updated = await supplierService.getById(supplier.id);
      if (updated) setSupplier(updated);
    } catch {
      showToast('Có lỗi xảy ra khi thực hiện ngừng giao dịch', 'error');
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!supplier) return;
    setDeleteLoading(true);
    try {
      await supplierService.delete(supplier.id);
      showToast(`Đã xóa nhà cung cấp "${supplier.name}" thành công`, 'success');
      navigate('/suppliers');
    } catch {
      showToast('Lỗi khi xóa nhà cung cấp', 'error');
    } finally {
      setDeleteLoading(false);
      setDeleteConfirmOpen(false);
    }
  };

  if (loading) return <Loading text="Đang tải dữ liệu nhà cung cấp..." />;
  if (!supplier) {
    return (
      <EmptyState
        title="Không tìm thấy nhà cung cấp"
        description="Mã nhà cung cấp không tồn tại."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/suppliers')}
      />
    );
  }

  return (
    <PageContainer
      title={supplier.name}
      subtitle={`Mã NCC: ${supplier.code} | Người liên hệ: ${supplier.contactPerson}`}
      actions={
        <div className="flex items-center gap-2">
          <Link to="/suppliers">
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Danh sách
            </Button>
          </Link>
          {hasReceipts ? (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Lock className="w-4 h-4 text-amber-500" />}
              className="text-slate-400 dark:text-slate-500 cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => {
                showToast(
                  `Không thể xóa đối tác "${supplier.name}": Đã phát sinh ${importReceipts.length} phiếu nhập kho trong hệ thống. Vui lòng chọn "Ngừng giao dịch" nếu muốn dừng hợp tác.`,
                  'warning'
                );
              }}
              title="Đã khóa xóa – NCC đã có phiếu nhập kho (Bấm để xem lý do)"
            >
              Đã khóa xóa
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Xóa NCC
            </Button>
          )}
          {hasReceipts && supplier.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              className="text-amber-600 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              leftIcon={<Ban className="w-4 h-4" />}
              onClick={() => setSuspendOpen(true)}
            >
              Ngừng giao dịch
            </Button>
          )}
          <Link to="/inventory/stock-in">
            <Button variant="primary" size="sm" leftIcon={<ArrowDownLeft className="w-4 h-4" />}>
              Tạo phiếu nhập từ NCC này
            </Button>
          </Link>
        </div>
      }
    >
      {/* Warning banner if supplier has import receipts */}
      {hasReceipts && (
        <div className="flex items-start gap-3 p-4 mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <p className="font-semibold mb-1">
              Nhà cung cấp đã phát sinh {importReceipts.length > 0 ? `${importReceipts.length} ` : ''}phiếu nhập hàng
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              Thao tác xóa đã bị <strong>vô hiệu hóa</strong> nhằm đảm bảo tính toàn vẹn dữ liệu
              kho bãi và chứng từ kế toán. Nếu không tiếp tục hợp tác, bạn có thể thực hiện thao
              tác <strong>Ngừng giao dịch</strong> kèm lý do cụ thể.
            </p>
          </div>
        </div>
      )}

      {/* Inactive banner with reason if suspended */}
      {supplier.status === 'inactive' && (
        <div className="flex items-start gap-3 p-4 mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
          <Ban className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-800 dark:text-rose-300">
            <p className="font-semibold mb-0.5">Đối tác đang ở trạng thái Ngừng giao dịch</p>
            {supplier.suspendReason ? (
              <p className="text-xs text-rose-700 dark:text-rose-400 mt-1 leading-relaxed">
                <strong>Lý do ghi nhận:</strong> {supplier.suspendReason}
              </p>
            ) : (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                Đã tạm ngưng mọi giao dịch nhập kho với nhà cung cấp này.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Supplier Info Card (1 col) */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card text-center">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4 border border-indigo-100 dark:border-indigo-900 shadow-inner">
              <Building2 className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{supplier.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{supplier.code}</p>

            <div className="mt-3 flex justify-center">
              <Badge variant={supplier.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
                {supplier.status === 'active' ? 'Đang hợp tác' : 'Tạm dừng'}
              </Badge>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-left space-y-3 text-xs">
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-400 min-w-[85px]">Đại diện:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {supplier.contactPerson}
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Receipt className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="font-semibold text-slate-400 min-w-[85px]">Mã số thuế:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {supplier.taxCode || 'Chưa cập nhật'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <CreditCard className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="font-semibold text-slate-400 min-w-[85px]">Điều khoản TT:</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {supplier.paymentTerms || 'Net 30'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Phone className="w-4 h-4 text-indigo-500 shrink-0" />
                <a href={`tel:${supplier.phone}`} className="hover:text-indigo-600 transition-colors">
                  {supplier.phone}
                </a>
              </div>
              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">{supplier.email || 'Chưa cập nhật'}</span>
              </div>
              <div className="flex items-start gap-3 text-slate-600 dark:text-slate-300">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <span>{supplier.address}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Lần Nhập Hàng</span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {supplier.totalImports}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
              <span className="text-xs text-slate-400 uppercase font-semibold">Tổng Tiền Đã Mua</span>
              <p className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {formatCurrency(supplier.totalSpent)}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Products Provided & Receipts (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Supplied products list */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center justify-between">
              <span>Sản Phẩm Đang Phân Phối ({suppliedProducts.length})</span>
              <Boxes className="w-5 h-5 text-indigo-500" />
            </h3>

            {suppliedProducts.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {suppliedProducts.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl px-2 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-10 h-10 rounded-lg object-cover bg-slate-100"
                      />
                      <div className="truncate">
                        <Link
                          to={`/products/${p.id}`}
                          className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 hover:text-indigo-600 block truncate"
                        >
                          {p.name}
                        </Link>
                        <span className="text-[11px] text-slate-400">SKU: {p.sku}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Giá nhập: {formatCurrency(p.costPrice)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Tồn: {p.stock} {p.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-6">
                Chưa có mặt hàng nào liên kết với nhà cung cấp này
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Suspend Modal */}
      {suspendOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setSuspendOpen(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Ngừng giao dịch
              </h3>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-1">Không thể xóa nhà cung cấp này</p>
                  <p className="text-xs leading-relaxed">
                    <strong>{supplier.name}</strong> đã có phiếu nhập trong hệ thống. Bạn chỉ có
                    thể <strong>ngừng giao dịch</strong> thay vì xóa.
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Lý do ngừng giao dịch <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="VD: Chấm dứt hợp đồng, không đáp ứng chất lượng..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="secondary" onClick={() => setSuspendOpen(false)}>
                  Hủy
                </Button>
                <Button
                  variant="danger"
                  isLoading={suspendLoading}
                  disabled={!suspendReason.trim()}
                  onClick={handleSuspend}
                  leftIcon={<Ban className="w-4 h-4" />}
                >
                  Xác nhận ngừng giao dịch
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Xác nhận xóa nhà cung cấp"
        message={`Hành động này sẽ xóa hoàn toàn nhà cung cấp "${supplier.name}" khỏi hệ thống. Thao tác không thể hoàn tác.`}
        confirmText="Xóa nhà cung cấp"
        variant="danger"
        isLoading={deleteLoading}
      />
    </PageContainer>
  );
};
