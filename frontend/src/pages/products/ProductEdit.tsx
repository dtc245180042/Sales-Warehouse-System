import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { ProductForm, ProductFormValues } from '../../components/products/ProductForm';
import { productService } from '../../services/productService';
import { initialSuppliers } from '../../mock/suppliers';
import { Product } from '../../types/Product';
import { Loading } from '../../components/common/Loading';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../contexts/ToastContext';

export const ProductEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      try {
        const found = await productService.getById(id);
        if (found) setProduct(found);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  const handleUpdate = async (values: ProductFormValues) => {
    if (!id) return;
    try {
      const supplier = initialSuppliers.find((s) => s.id === values.supplierId);
      const supplierName = supplier ? supplier.name : product?.supplierName || 'Nhà cung cấp';

      await productService.update(id, {
        ...values,
        supplierName,
      });

      showToast('Cập nhật sản phẩm thành công!', 'success');
      navigate('/products');
    } catch (err: any) {
      showToast(err?.message || 'Có lỗi xảy ra khi cập nhật', 'error');
    }
  };

  if (loading) return <Loading text="Đang tải thông tin sản phẩm..." />;
  if (!product) {
    return (
      <EmptyState
        title="Không tìm thấy sản phẩm"
        description="Mã sản phẩm không tồn tại hoặc đã bị xóa."
        actionText="Quay lại danh sách"
        onAction={() => navigate('/products')}
      />
    );
  }

  return (
    <PageContainer
      title={`Chỉnh Sửa: ${product.name}`}
      subtitle={`Cập nhật thông tin chi tiết mã SKU: ${product.sku}`}
    >
      <ProductForm initialValues={product} onSubmit={handleUpdate} isEdit />
    </PageContainer>
  );
};
