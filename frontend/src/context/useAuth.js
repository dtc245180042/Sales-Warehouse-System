import { useContext } from 'react';
import { AuthContext } from './AuthContext';

// Custom Hook useAuth tách riêng file để tuân thủ ESLint Fast Refresh
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong <AuthProvider>');
  }
  return context;
}

export default useAuth;
