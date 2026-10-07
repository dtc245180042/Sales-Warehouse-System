import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { Product } from '../../types/Product';
import { productCategories } from '../../mock/products';
import { initialSuppliers } from '../../mock/suppliers';

import { productService } from '../../services/productService';
import { categoryService } from '../../services/categoryService';
import { CategoryTree } from '../../types/Category';
import { useAuth } from '../../contexts/AuthContext';

const productSchema = z.object({
  name: z.string().min(2, 'Tên sản phẩm tối thiểu 2 ký tự'),
  sku: z.string().min(2, 'Mã SKU tối thiểu 2 ký tự'),
  barcode: z.string().min(6, 'Mã vạch tối thiểu 6 ký tự'),
  category: z.string().min(1, 'Vui lòng chọn danh mục'),
  categoryId: z.number().optional(),
  supplierId: z.string().min(1, 'Vui lòng chọn nhà cung cấp'),
  costPrice: z.number().min(0, 'Giá nhập phải >= 0').optional().default(0),
  salePrice: z.number().min(0, 'Giá bán phải >= 0'),
  stock: z.number().min(0, 'Số lượng tồn kho phải >= 0'),
  minStock: z.number().min(0, 'Mức cảnh báo tồn phải >= 0'),
  unit: z.string().min(1, 'Vui lòng nhập đơn vị tính cơ sở'),
  packagingSpecification: z.string().min(1, 'Vui lòng nhập quy cách đóng gói'),
  image: z.string().url('Đường dẫn ảnh phải là URL hợp lệ').or(z.string().min(1, 'Vui lòng nhập link ảnh')),
  description: z.string().optional(),
  status: z.enum(['active', 'low_stock', 'out_of_stock', 'inactive']),
});

export type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormProps {
  initialValues?: Partial<Product>;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  isEdit?: boolean;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  initialValues,
  onSubmit,
  isEdit = false,
}) => {
  const navigate = useNavigate();
  const { role } = useAuth();
  // SCRUM-220 & SCRUM-381: Giá vốn chỉ Quản lý kinh doanh (Admin/SalesManager/Director) xem và sửa được
  const canManageCostPrice = role === 'Admin' || role === 'SalesManager' || role === 'Director';

  const [existingSkus, setExistingSkus] = React.useState<string[]>([]);
  const [skuError, setSkuError] = React.useState<string>('');

  // Phân cấp nhóm hàng / ngành hàng 3 cấp (SCRUM-214)
  interface CategoryOption {
    id: number;
    name: string;
    level: number;
    isLeaf: boolean;
    displayLabel: string;
  }
  const [categoryOptions, setCategoryOptions] = React.useState<CategoryOption[]>([]);
  const [selectedCatId, setSelectedCatId] = React.useState<number | undefined>(initialValues?.categoryId);
  const [isLeafSelected, setIsLeafSelected] = React.useState<boolean>(true);

  React.useEffect(() => {
    productService.getAll().then((products) => {
      const currentId = initialValues?.id !== undefined ? String(initialValues.id).trim() : undefined;
      const currentSku = initialValues?.sku ? initialValues.sku.trim().toUpperCase() : undefined;
      const skus = products
        .filter((p) => {
          if (!isEdit) return true;
          if (currentId && String(p.id).trim() === currentId) return false;
          if (currentSku && p.sku.trim().toUpperCase() === currentSku) return false;
          return true;
        })
        .map((p) => p.sku.trim().toUpperCase());
      setExistingSkus(skus);
    });

    // Tải cấu trúc Cây nhóm hàng từ Backend
    categoryService.getTree().then((tree) => {
      if (tree && tree.length > 0) {
        const flat: CategoryOption[] = [];
        const traverse = (nodes: CategoryTree[], depth: number = 0) => {
          nodes.forEach((node) => {
            const hasChildren = node.children && node.children.length > 0;
            const prefix = '  '.repeat(depth);
            const levelIcon = node.level === 1 ? '📁 [Ngành]' : node.level === 2 ? '📁 [Nhóm]' : '📄 [Tiểu nhóm]';
            const suffix = !hasChildren ? ' ★ (Khuyên dùng)' : ' (Nhóm cha)';
            flat.push({
              id: node.id,
              name: node.name,
              level: node.level,
              isLeaf: !hasChildren,
              displayLabel: `${prefix}${levelIcon} ${node.name}${suffix}`,
            });
            if (hasChildren) {
              traverse(node.children, depth + 1);
            }
          });
        };
        traverse(tree);
        setCategoryOptions(flat);

        // Khớp giá trị khởi tạo
        if (initialValues?.categoryId) {
          const match = flat.find((o) => o.id === initialValues.categoryId);
          if (match) {
            setSelectedCatId(match.id);
            setIsLeafSelected(match.isLeaf);
            setValue('categoryId', match.id);
            setValue('category', match.name);
          }
        } else if (initialValues?.category) {
          const match = flat.find((o) => o.name.toLowerCase() === initialValues.category?.toLowerCase());
          if (match) {
            setSelectedCatId(match.id);
            setIsLeafSelected(match.isLeaf);
            setValue('categoryId', match.id);
          }
        } else if (flat.length > 0 && !isEdit) {
          const firstOption = flat.find((o) => o.isLeaf) || flat[0];
          if (firstOption) {
            setSelectedCatId(firstOption.id);
            setIsLeafSelected(firstOption.isLeaf);
            setValue('categoryId', firstOption.id);
            setValue('category', firstOption.name);
          }
        }
      }
    }).catch((err) => {
      console.warn('Không thể tải cây nhóm hàng, sử dụng fallback:', err);
    });
  }, [isEdit, initialValues?.id, initialValues?.sku]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: initialValues?.name || '',
      sku: initialValues?.sku || '',
      barcode: initialValues?.barcode || `893850${Math.floor(100000 + Math.random() * 900000)}`,
      category: initialValues?.category || productCategories[0].name,
      categoryId: initialValues?.categoryId,
      supplierId: initialValues?.supplierId || initialSuppliers[0].id,
      costPrice: initialValues?.costPrice ?? 1000000,
      salePrice: initialValues?.salePrice ?? 1500000,
      stock: initialValues?.stock ?? 10,
      minStock: initialValues?.minStock ?? 5,
      unit: initialValues?.unit || 'Chiếc',
      packagingSpecification: initialValues?.packagingSpecification || '1 chiếc/hộp',
      image: (initialValues?.image && initialValues.image !== '/images/products/placeholder.jpg' ? initialValues.image : (initialValues as any)?.image_url) || initialValues?.image || 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300',
      description: initialValues?.description || '',
      status: initialValues?.status || 'active',
    },
  });

  // Tự động đồng bộ lại form khi initialValues được nạp sau
  React.useEffect(() => {
    if (initialValues && isEdit) {
      reset({
        name: initialValues.name || '',
        sku: initialValues.sku || '',
        barcode: initialValues.barcode || '',
        category: initialValues.category || productCategories[0].name,
        categoryId: initialValues.categoryId,
        supplierId: initialValues.supplierId || initialSuppliers[0].id,
        costPrice: initialValues.costPrice ?? 0,
        salePrice: initialValues.salePrice ?? 0,
        stock: initialValues.stock ?? 0,
        minStock: initialValues.minStock ?? 5,
        unit: initialValues.unit || 'Chiếc',
        packagingSpecification: initialValues.packagingSpecification || '1 chiếc/hộp',
        image: (initialValues.image && initialValues.image !== '/images/products/placeholder.jpg' ? initialValues.image : (initialValues as any)?.image_url) || initialValues.image || 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300',
        description: initialValues.description || '',
        status: (initialValues.status as any) || 'active',
      });
      if (initialValues.categoryId) {
        setSelectedCatId(initialValues.categoryId);
      }
    }
  }, [initialValues, isEdit, reset]);

  const previewImage = watch('image');
  const watchedSku = watch('sku');

  // Kiểm tra trùng SKU realtime khi giá trị thay đổi
  React.useEffect(() => {
    if (!watchedSku) {
      setSkuError('');
      return;
    }
    const cleanSku = watchedSku.trim().toUpperCase();
    const currentSku = initialValues?.sku ? initialValues.sku.trim().toUpperCase() : undefined;
    const isSkuUnchanged = isEdit && currentSku && cleanSku === currentSku;

    if (!isSkuUnchanged && existingSkus.includes(cleanSku)) {
      setSkuError(`Mã SKU "${cleanSku}" đã tồn tại trong danh mục sản phẩm (Mã SKU phải là duy nhất).`);
      setError('sku', {
        type: 'manual',
        message: `Mã SKU "${cleanSku}" đã tồn tại trong hệ thống.`,
      });
    } else {
      setSkuError('');
      clearErrors('sku');
    }
  }, [watchedSku, existingSkus, isEdit, initialValues?.sku, setError, clearErrors]);

  const handleFormSubmit = async (values: ProductFormValues) => {
    const cleanSku = values.sku.trim().toUpperCase();
    const currentSku = initialValues?.sku ? initialValues.sku.trim().toUpperCase() : undefined;
    const isSkuUnchanged = isEdit && currentSku && cleanSku === currentSku;

    if (!isSkuUnchanged && existingSkus.includes(cleanSku)) {
      setSkuError(`Mã SKU "${cleanSku}" đã tồn tại trong hệ thống.`);
      return;
    }
    // SCRUM-381: Nếu người dùng không có quyền quản lý giá vốn, giữ nguyên giá vốn ban đầu
    const finalCostPrice = Number(canManageCostPrice
      ? (values.costPrice ?? 0)
      : (initialValues?.costPrice ?? 0)) || 0;

    await onSubmit({
      ...values,
      sku: cleanSku,
      costPrice: finalCostPrice,
      categoryId: selectedCatId,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Essential details (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* General Info Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Thông Tin Chung</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Tên sản phẩm *
              </label>
              <input
                type="text"
                {...register('name')}
                placeholder="VD: iPhone 15 Pro 128GB Titan"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Mã SKU *</span>
                  <span className="text-[10px] text-indigo-500 font-normal">Duy nhất toàn công ty</span>
                </label>
                <input
                  type="text"
                  {...register('sku')}
                  placeholder="VD: IP15P-128"
                  onChange={(e) => setValue('sku', e.target.value.toUpperCase())}
                  className={`w-full px-3.5 py-2.5 rounded-xl border ${
                    skuError || errors.sku
                      ? 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/20'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800'
                  } text-sm text-slate-900 dark:text-slate-100 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                />
                {(skuError || errors.sku) && (
                  <p className="text-xs text-rose-500 mt-1 font-medium flex items-center gap-1">
                    <span>⚠️</span> {skuError || errors.sku?.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mã vạch (Barcode) *
                </label>
                <input
                  type="text"
                  {...register('barcode')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.barcode && <p className="text-xs text-rose-500 mt-1">{errors.barcode.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Mô tả chi tiết
              </label>
              <textarea
                rows={4}
                {...register('description')}
                placeholder="Mô tả thông số kỹ thuật, bảo hành, ghi chú..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Pricing & Stock Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Giá & Tồn Kho</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Giá nhập (VNĐ) *</span>
                  {!canManageCostPrice && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      🔒 Chỉ Quản lý xem & sửa
                    </span>
                  )}
                </label>
                {canManageCostPrice ? (
                  <input
                    type="number"
                    {...register('costPrice', { valueAsNumber: true })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <>
                    <input
                      type="hidden"
                      {...register('costPrice', { valueAsNumber: true })}
                      value={initialValues?.costPrice ?? 0}
                    />
                    <input
                      type="password"
                      disabled
                      value="******"
                      readOnly
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-400 text-sm cursor-not-allowed select-none font-mono"
                      title="Bạn không có quyền xem hoặc chỉnh sửa giá vốn sản phẩm"
                    />
                  </>
                )}
                {errors.costPrice && <p className="text-xs text-rose-500 mt-1">{errors.costPrice.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Giá bán lẻ (VNĐ) *
                </label>
                <input
                  type="number"
                  {...register('salePrice', { valueAsNumber: true })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                />
                {errors.salePrice && <p className="text-xs text-rose-500 mt-1">{errors.salePrice.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Số lượng tồn *
                </label>
                <input
                  type="number"
                  {...register('stock', { valueAsNumber: true })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.stock && <p className="text-xs text-rose-500 mt-1">{errors.stock.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tồn tối thiểu *
                </label>
                <input
                  type="number"
                  {...register('minStock', { valueAsNumber: true })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.minStock && <p className="text-xs text-rose-500 mt-1">{errors.minStock.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Đơn vị tính cơ sở *
                </label>
                <input
                  type="text"
                  {...register('unit')}
                  placeholder="Chiếc, Hộp, Lon, Gói..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.unit && <p className="text-xs text-rose-500 mt-1">{errors.unit.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Quy cách đóng gói *
                </label>
                <input
                  type="text"
                  {...register('packagingSpecification')}
                  placeholder="VD: 1 chiếc/hộp, 24 lon/thùng, 12 hộp/thùng..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.packagingSpecification && (
                  <p className="text-xs text-rose-500 mt-1">{errors.packagingSpecification.message}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Classification & Image (1 col) */}
        <div className="space-y-6">
          {/* Classification Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Phân Loại & Đối Tác</h3>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Cây Phân Cấp Ngành Hàng / Nhóm Hàng *
                </label>
                <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                  3 Cấp ERP (SCRUM-214)
                </span>
              </div>
              <select
                value={selectedCatId ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setSelectedCatId(val);
                  setValue('categoryId', val);
                  if (val) {
                    const opt = categoryOptions.find((c) => c.id === val);
                    if (opt) {
                      setValue('category', opt.name);
                      setIsLeafSelected(opt.isLeaf);
                    }
                  } else {
                    setValue('category', '');
                    setIsLeafSelected(true);
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
              >
                <option value="">-- Chọn ngành hàng / nhóm hàng --</option>
                {categoryOptions.length > 0 ? (
                  categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayLabel}
                    </option>
                  ))
                ) : (
                  productCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
              {errors.category && <p className="text-xs text-rose-500 mt-1">{errors.category.message}</p>}

              {/* Hướng dẫn nghiệp vụ thực tế */}
              {!isLeafSelected && selectedCatId && (
                <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5 leading-relaxed">
                  <span className="font-bold shrink-0">⚠️ Lưu ý nghiệp vụ:</span>
                  <span>
                    Bạn đang chọn nhóm hàng cấp cha. Theo chuẩn ERP bán lẻ & kho, bạn nên chọn <strong>Tiểu nhóm con (Cấp lá ★)</strong> để thống kê doanh số và tồn kho chính xác nhất.
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Nhà cung cấp *
              </label>
              <select
                {...register('supplierId')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {initialSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Trạng thái kinh doanh
              </label>
              <select
                {...register('status')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="active">Còn hàng (Đang kinh doanh)</option>
                <option value="low_stock">Sắp hết hàng</option>
                <option value="out_of_stock">Hết hàng</option>
                <option value="inactive">Ngừng kinh doanh</option>
              </select>
            </div>
          </div>

          {/* Product Image Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Hình Ảnh Sản Phẩm</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                URL hình ảnh
              </label>
              <input
                type="text"
                {...register('image')}
                placeholder="https://..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {errors.image && <p className="text-xs text-rose-500 mt-1">{errors.image.message}</p>}
            </div>

            {previewImage && (
              <div className="mt-2 text-center">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="w-full h-44 object-cover rounded-xl border border-slate-200 dark:border-slate-700 mx-auto bg-slate-100 dark:bg-slate-800"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <Button variant="secondary" type="button" onClick={() => navigate('/products')}>
          Hủy bỏ
        </Button>
        <Button variant="primary" type="submit" isLoading={isSubmitting}>
          {isEdit ? 'Lưu cập nhật' : 'Tạo mới sản phẩm'}
        </Button>
      </div>
    </form>
  );
};
