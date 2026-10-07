/**
 * Dịch vụ tải ảnh lên Cloud miễn phí qua ImgBB API (https://api.imgbb.com/)
 * Kết hợp cơ chế đa tầng (ImgBB Cloud -> Local Backend Storage -> Base64 DataURL)
 * Đảm bảo 100% thời gian người dùng bấm tải ảnh từ máy tính đều thành công!
 */

import { apiClient } from '../api/client';

const STORAGE_KEY_IMGBB = 'kv_imgbb_api_key';
const DEFAULT_IMGBB_API_KEY = '72616b04aea05913a73b620a9f8c1566';

export const getImgBBApiKey = (): string => {
  const fromStorage = localStorage.getItem(STORAGE_KEY_IMGBB);
  if (fromStorage && fromStorage.trim()) {
    return fromStorage.trim();
  }
  const fromEnv = (import.meta.env.VITE_IMGBB_API_KEY || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_IMGBB_API_KEY;
};

export const setImgBBApiKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY_IMGBB, key.trim());
};

export interface ImgBBUploadResponse {
  url: string;
  displayUrl: string;
  deleteUrl?: string;
  width?: number;
  height?: number;
  size?: number;
  source?: 'imgbb' | 'backend' | 'local';
}

/**
 * Upload tệp ảnh nhị phân từ máy tính
 * 1. Ưu tiên tải lên ImgBB Cloud
 * 2. Tự động chuyển tiếp Backend Local Storage nếu ImgBB bị chặn mạng
 * 3. Fallback DataURL Base64 nếu hoàn toàn mất kết nối
 */
export const uploadImageToImgBB = async (
  file: File,
  customApiKey?: string
): Promise<ImgBBUploadResponse> => {
  const apiKey = (customApiKey || getImgBBApiKey()).trim();

  // Kiểm tra định dạng file
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
  if (!validTypes.includes(file.type.toLowerCase())) {
    throw new Error('Chỉ chấp nhận các tệp hình ảnh định dạng JPG, PNG, WEBP, GIF hoặc BMP.');
  }

  // Giới hạn dung lượng tối đa 32MB theo chính sách ImgBB
  const maxSize = 32 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('Dung lượng tệp ảnh không được vượt quá 32MB.');
  }

  // 1. Thử tải lên ImgBB Cloud
  if (apiKey) {
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, ''));

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        const data = result.data;
        return {
          url: data.url || data.display_url,
          displayUrl: data.display_url || data.url,
          deleteUrl: data.delete_url,
          width: data.width,
          height: data.height,
          size: data.size,
          source: 'imgbb',
        };
      }
      console.warn('[imageUploadService] ImgBB phản hồi không thành công, chuyển sang lưu trữ nội bộ:', result);
    } catch (imgbbErr) {
      console.warn('[imageUploadService] Không thể kết nối ImgBB, chuyển sang lưu trữ nội bộ:', imgbbErr);
    }
  }

  // 2. Fallback sang Backend Local Storage
  try {
    const backendFormData = new FormData();
    backendFormData.append('file', file);
    const backendRes = await apiClient.post('/products/upload-image', backendFormData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const url = backendRes.data?.url || backendRes.data?.image_url;
    if (url) {
      return {
        url,
        displayUrl: url,
        source: 'backend',
      };
    }
  } catch (backendErr) {
    console.warn('[imageUploadService] Lưu trữ Backend không thành công:', backendErr);
  }

  // 3. Fallback cuối cùng: Data URL
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Url = reader.result as string;
      resolve({
        url: base64Url,
        displayUrl: base64Url,
        source: 'local',
      });
    };
    reader.readAsDataURL(file);
  });
};
