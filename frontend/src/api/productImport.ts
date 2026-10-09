import { apiClient } from './client';
import {
  ProductImportPreviewResponse,
  ProductImportExecuteResponse,
  ProductImportRow
} from '../types/productImport';

export const productImportApi = {
  // 1. Tải tệp Excel mẫu danh mục sản phẩm (SCRUM-216 AC-1)
  downloadTemplate: async (): Promise<void> => {
    const response = await apiClient.get('/product-imports/template', {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'product_import_template.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // 2. Tải file lên xem trước và kiểm tra lỗi từng dòng (SCRUM-216 AC-1)
  previewFile: async (file: File): Promise<ProductImportPreviewResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<ProductImportPreviewResponse>(
      '/product-imports/preview',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 phút cho file lớn 5000+ dòng
      }
    );
    return response.data;
  },

  // 3. Thực thi nhập các dòng hợp lệ vào CSDL MySQL (SCRUM-216 AC-2)
  executeImport: async (validData: ProductImportRow[]): Promise<ProductImportExecuteResponse> => {
    const response = await apiClient.post<ProductImportExecuteResponse>(
      '/product-imports/execute',
      validData,
      {
        timeout: 180000, // 3 phút cho lưu 5000+ sản phẩm
      }
    );
    return response.data;
  },
};
