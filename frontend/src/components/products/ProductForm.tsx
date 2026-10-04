import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { Product } from '../../types/Product';
import { productCategories } from '../../mock/products';
import { initialSuppliers } from '../../mock/suppliers';

const productSchema = z.object({
  name: z.string().min(2, 'Tên sản phẩm tối thiểu 2 ký tự'),
  sku: z.string().min(2, 'Mã SKU tối thiểu 2 ký tự'),
  barcode: z.string().min(6, 'Mã vạch tối thiểu 6 ký tự'),
  category: z.string().min(1, 'Vui lòng chọn danh mục'),
  supplierId: z.string().min(1, 'Vui lòng chọn nhà cung cấp'),
  costPrice: z.number().min(0, 'Giá nhập phải >= 0'),
  salePrice: z.number().min(0, 'Giá bán phải >= 0'),
  stock: z.number().min(0, 'Số lượng tồn kho phải >= 0'),
  minStock: z.number().min(0, 'Mức cảnh báo tồn phải >= 0'),
  unit: z.string().min(1, 'Vui lòng nhập đơn vị tính'),
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

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: initialValues?.name || '',
      sku: initialValues?.sku || '',
      barcode: initialValues?.barcode || `893850${Math.floor(100000 + Math.random() * 900000)}`,
      category: initialValues?.category || productCategories[0].name,
      supplierId: initialValues?.supplierId || initialSuppliers[0].id,
      costPrice: initialValues?.costPrice ?? 1000000,
      salePrice: initialValues?.salePrice ?? 1500000,
      stock: initialValues?.stock ?? 10,
      minStock: initialValues?.minStock ?? 5,
      unit: initialValues?.unit || 'Chiếc',
      image: initialValues?.image || 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=300',
      description: initialValues?.description || '',
      status: initialValues?.status || 'active',
    },
  });

  const previewImage = watch('image');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mã SKU *
                </label>
                <input
                  type="text"
                  {...register('sku')}
                  placeholder="VD: IP15P-128"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.sku && <p className="text-xs text-rose-500 mt-1">{errors.sku.message}</p>}
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Giá nhập (VNĐ) *
                </label>
                <input
                  type="number"
                  {...register('costPrice', { valueAsNumber: true })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Đơn vị tính *
                </label>
                <input
                  type="text"
                  {...register('unit')}
                  placeholder="Chiếc, Hộp, Bộ..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {errors.unit && <p className="text-xs text-rose-500 mt-1">{errors.unit.message}</p>}
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
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Ngành hàng / Danh mục *
              </label>
              <select
                {...register('category')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {productCategories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
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
