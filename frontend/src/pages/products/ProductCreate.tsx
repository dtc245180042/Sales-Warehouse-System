import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { ProductForm, ProductFormValues } from '../../components/products/ProductForm';
import { productService } from '../../services/productService';
import { initialSuppliers } from '../../mock/suppliers';
import { useToast } from '../../contexts/ToastContext';

export const ProductCreate: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleCreate = async (values: ProductFormValues) => {
    try {
      const supplier = initialSuppliers.find((s) => s.id === values.supplierId);
      const supplierName = supplier ? supplier.name : 'Nhà cung cấp';

      await productService.create({
        ...values,
        description: values.description || '',
        supplierName,
      });

      showToast('Thêm mới sản phẩm thành công!', 'success');
      navigate('/products');
    } catch {
      showToast('Có lỗi xảy ra khi lưu sản phẩm', 'error');
    }
  };

  return (
    <PageContainer
      title="Thêm Mới Sản Phẩm"
      subtitle="Khai báo sản phẩm mới vào hệ thống quản lý kho và bán hàng"
    >
      <ProductForm onSubmit={handleCreate} />
    </PageContainer>
  );
};
