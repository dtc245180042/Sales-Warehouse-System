import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('access_token'));
  const [loading, setLoading] = useState(true);
  const [sessionAlert, setSessionAlert] = useState(null);

  // Khôi phục phiên làm việc khi reload trang
  const fetchUserProfile = useCallback(async () => {
    const savedToken = localStorage.getItem('access_token');
    if (!savedToken) {
      setLoading(false);
      return;
    }
    try {
      const userData = await authApi.getMe();
      setUser(userData);
      setToken(savedToken);
    } catch (err) {
      console.warn('Phiên đăng nhập cũ không còn hợp lệ:', err.message);
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  // Bắt sự kiện khi backend trả về 401 Unauthorized (phiên hết hạn hoặc bị server thu hồi)
  useEffect(() => {
    const handleUnauthorized = (event) => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      setUser(null);
      setToken(null);
      setSessionAlert(event.detail || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  // Tự động gia hạn phiên làm việc định kỳ khi còn hoạt động (SCRUM-199)
  useEffect(() => {
    if (!token) return;
    // Cứ mỗi 10 phút gia hạn token một lần
    const refreshInterval = setInterval(async () => {
      try {
        const refreshRes = await authApi.refresh();
        if (refreshRes?.access_token) {
          localStorage.setItem('access_token', refreshRes.access_token);
          setToken(refreshRes.access_token);
        }
      } catch (err) {
        console.warn('Gia hạn phiên không thành công:', err.message);
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [token]);

  // Hàm Đăng nhập (SCRUM-198)
  const login = async (username, password) => {
    const res = await authApi.login({ username, password });
    if (res?.access_token) {
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('user_info', JSON.stringify(res.user));
      setToken(res.access_token);
      setUser(res.user);
      setSessionAlert(null);
      return res.user;
    }
    throw new Error('Đăng nhập thất bại: Không nhận được mã truy cập.');
  };

  // Hàm Đăng xuất an toàn (SCRUM-199)
  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.warn('Lỗi khi thu hồi phiên phía máy chủ:', err.message);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      setUser(null);
      setToken(null);
    }
  };

  // Hàm Đổi mật khẩu (SCRUM-201)
  const changePassword = async (oldPassword, newPassword) => {
    const res = await authApi.changePassword({
      old_password: oldPassword,
      new_password: newPassword,
    });
    // Cập nhật lại thông tin user
    await fetchUserProfile();
    return res;
  };

  const clearSessionAlert = () => setSessionAlert(null);

  const value = {
    user,
    token,
    isAuthenticated: !!user,
    loading,
    sessionAlert,
    clearSessionAlert,
    login,
    logout,
    changePassword,
    refreshUser: fetchUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
