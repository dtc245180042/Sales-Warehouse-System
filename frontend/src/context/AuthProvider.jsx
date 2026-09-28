import { useState, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import { AVAILABLE_WAREHOUSES, DEFAULT_USER } from '../utils/constants';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEFAULT_USER);
  const [loading, setLoading] = useState(false);

  // Mô phỏng tải dữ liệu người dùng lần đầu
  useEffect(() => {
    // Có thể kết nối API thực tế tại đây trong tương lai
  }, []);

  // Hàm chọn/cập nhật kho/địa bàn đang làm việc
  const selectWarehouse = (warehouseName) => {
    if (!user) return;
    setUser((prev) => ({
      ...prev,
      warehouse: warehouseName || null,
    }));
  };

  // Hàm đăng xuất / xóa phiên
  const logout = () => {
    setUser(null);
  };

  // Hàm đăng nhập / đặt lại user
  const login = (userData = DEFAULT_USER) => {
    setUser(userData);
  };

  // Hàm cập nhật vai trò người dùng (phục vụ test các vai trò khác nhau)
  const updateRole = (newRole) => {
    if (!user) return;
    setUser((prev) => ({
      ...prev,
      role: newRole,
    }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        setLoading,
        setUser,
        selectWarehouse,
        updateRole,
        login,
        logout,
        availableWarehouses: AVAILABLE_WAREHOUSES,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
