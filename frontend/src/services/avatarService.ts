import { apiClient } from '../api/client';

export interface AvatarInfo {
  user_id: number;
  original_filename?: string;
  avatar_url: string;
  thumbnail_url: string;
  content_type: string;
  file_size: number;
  width?: number;
  height?: number;
  updated_at?: string;
}

export interface AvatarUploadResponse {
  success: boolean;
  message: string;
  data: AvatarInfo;
}

export interface AvatarDeleteResponse {
  success: boolean;
  message: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api/v1';

export const avatarService = {
  /**
   * Tải lên ảnh đại diện và lưu trữ theo người dùng (SCRUM-364)
   * Kiểm tra định dạng JPG/PNG và giới hạn 2MB (SCRUM-365)
   */
  uploadAvatar: async (file: File): Promise<AvatarUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<AvatarUploadResponse>('/user-avatars/upload', formData);
    return response.data;
  },

  /**
   * Lưu đường dẫn ảnh đại diện (như ImgBB Cloud URL)
   */
  setAvatarUrl: async (avatarUrl: string): Promise<AvatarUploadResponse> => {
    const response = await apiClient.post<AvatarUploadResponse>('/user-avatars/set-url', {
      avatar_url: avatarUrl,
    });
    return response.data;
  },

  /**
   * Lấy thông tin metadata ảnh đại diện của người dùng hiện tại
   */
  getMyAvatar: async (): Promise<AvatarInfo> => {
    const response = await apiClient.get<AvatarInfo>('/user-avatars/me');
    return response.data;
  },

  /**
   * Lấy thông tin metadata ảnh đại diện theo user_id
   */
  getUserAvatar: async (userId: number | string): Promise<AvatarInfo> => {
    const response = await apiClient.get<AvatarInfo>(`/user-avatars/${userId}`);
    return response.data;
  },

  /**
   * Xóa ảnh đại diện của người dùng hiện tại
   */
  deleteMyAvatar: async (): Promise<AvatarDeleteResponse> => {
    const response = await apiClient.delete<AvatarDeleteResponse>('/user-avatars/me');
    return response.data;
  },

  /**
   * Trả về URL đầy đủ truy xuất ảnh đại diện chuẩn (500x500)
   */
  getAvatarUrl: (userId: number | string, timestamp?: number): string => {
    const t = timestamp || Date.now();
    return `${API_BASE}/user-avatars/${userId}/avatar?t=${t}`;
  },

  /**
   * Trả về URL đầy đủ truy xuất thumbnail (128x128) phục vụ danh sách & lịch sử (SCRUM-362)
   */
  getThumbnailUrl: (userId: number | string, timestamp?: number): string => {
    const t = timestamp || Date.now();
    return `${API_BASE}/user-avatars/${userId}/thumbnail?t=${t}`;
  },
};
