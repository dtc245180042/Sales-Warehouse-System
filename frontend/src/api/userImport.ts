import { apiClient } from './client';
import { UserImportPreviewResponse, UserImportSummaryResponse } from '../types/userImport';

export const userImportApi = {
  // 1. Tải tệp Excel mẫu
  downloadTemplate: async (): Promise<void> => {
    const response = await apiClient.get('/user-imports/template', {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'user_import_template.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // 2. Tải lên xem trước và kiểm tra lỗi từng dòng
  previewFile: async (file: File): Promise<UserImportPreviewResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<UserImportPreviewResponse>('/user-imports/preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 3. Thực hiện nhập một phần (Lưu dòng hợp lệ, bỏ qua dòng lỗi)
  executeImport: async (file: File): Promise<UserImportSummaryResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<UserImportSummaryResponse>('/user-imports/execute', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
