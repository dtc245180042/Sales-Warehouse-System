import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types/User';
import { authService } from '../services/authService';
import { setStorageItem } from '../services/storage';

interface AuthContextType {
  user: User | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string, remember?: boolean) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (currentPass: string, newPass: string, revokeOthers?: boolean) => Promise<void>;
  updateUserAvatar: (newAvatarUrl: string) => void;
  updateUserProfile: (data: { name: string; phone: string }) => void;
  updateProfile: (data: { name: string; phone: string; avatar?: string }) => Promise<User>;
  switchRole: (role: UserRole) => void;
  canAccess: (allowedRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 mins

  const renewSession = () => {
    localStorage.setItem('kv_session_expires_at', String(Date.now() + SESSION_TIMEOUT_MS));
  };

  useEffect(() => {
    // Initialize currentUser from localStorage or initial user
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    if (currentUser) {
      renewSession();
    }
    setIsLoading(false);

    // Event listeners to automatically renew session on activity (SCRUM-199)
    const handleActivity = () => {
      if (localStorage.getItem('kv_current_user')) {
        renewSession();
      }
    };

    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    // Check expiration every 10 seconds
    const interval = setInterval(() => {
      const activeUser = localStorage.getItem('kv_current_user');
      const expiresAt = Number(localStorage.getItem('kv_session_expires_at') || '0');

      if (activeUser && expiresAt && Date.now() > expiresAt) {
        // Session expired
        authService.logout();
        setUser(null);
        window.location.href = '/login?expired=1';
      }
    }, 10000);

    return () => {
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(interval);
    };
  }, []);

  const login = async (email: string, pass: string, remember: boolean = true): Promise<User> => {
    setIsLoading(true);
    try {
      const loggedUser = await authService.login(email, pass, remember);
      setUser(loggedUser);
      renewSession();
      return loggedUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      // SCRUM-199: authService.logout() now clears all session data including kv_session_expires_at
      await authService.logout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (currentPass: string, newPass: string, revokeOthers: boolean = true): Promise<void> => {
    await authService.changePassword(currentPass, newPass, revokeOthers);
    const updatedUser = authService.getCurrentUser();
    setUser(updatedUser);
  };

  const updateUserAvatar = (newAvatarUrl: string) => {
    if (!user) return;
    const updated = { ...user, avatar: newAvatarUrl };
    setUser(updated);
    setStorageItem('kv_current_user', updated);
  };

  const updateUserProfile = (data: { name: string; phone: string }) => {
    if (!user) return;
    const updated = { ...user, name: data.name, phone: data.phone };
    setUser(updated);
    setStorageItem('kv_current_user', updated);
  };

  const updateProfile = async (data: { name: string; phone: string; avatar?: string }): Promise<User> => {
    setIsLoading(true);
    try {
      const updated = await authService.updateProfile(data);
      setUser(updated);
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  const switchRole = (newRole: UserRole) => {
    const switchedUser = authService.switchRole(newRole);
    setUser(switchedUser);
  };

  const role: UserRole = user?.role || 'Staff';
  const isAuthenticated = !!user;

  const canAccess = (allowedRoles: UserRole[]): boolean => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated,
        isLoading,
        login,
        logout,
        changePassword,
        updateUserAvatar,
        updateUserProfile,
        updateProfile,
        switchRole,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
