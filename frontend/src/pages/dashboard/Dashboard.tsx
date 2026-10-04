import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  MapPin,
  Clock,
  KeyRound,
  CheckCircle2,
  Users2,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/formatters';
import { getRoleDisplayName } from '../../utils/roleUtils';
import { ChangePasswordModal } from '../../components/common/ChangePasswordModal';

export const Dashboard: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  return (
    <PageContainer
      title="Bảng điều khiển tổng quan"
      subtitle={`Chào mừng ${user?.name || 'bạn'} quay trở lại hệ thống OMS Pro`}
      actions={
        <div className="flex items-center gap-2.5">
          {role === 'Admin' && (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Users2 className="w-4 h-4" />}
              onClick={() => navigate('/users')}
            >
              Quản lý người dùng & phân quyền
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            leftIcon={<KeyRound className="w-4 h-4 text-indigo-500" />}
            onClick={() => setIsChangePassModalOpen(true)}
          >
            Đổi mật khẩu
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Thông tin phiên đăng nhập & Người dùng (SCRUM-198, SCRUM-199, SCRUM-203) */}
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-5">
              <img
                src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                alt={user?.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-4 ring-indigo-500/10 shadow-sm shrink-0"
              />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                    {user?.name || 'Người dùng'}
                  </h3>
                  <Badge variant="primary" size="md">
                    {getRoleDisplayName(role)}
                  </Badge>
                  <Badge variant="success" size="sm" dot>
                    Phiên hoạt động an toàn
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {user?.email}
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-2 flex-wrap">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    Kho phụ trách: {user?.warehouse || 'Toàn hệ thống'}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-emerald-500" />
                    Địa bàn: {user?.territory || 'Toàn quốc'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Đăng nhập lần cuối: {user?.lastLogin ? formatDate(user.lastLogin) : 'Hôm nay'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1 md:text-right">
                <div className="text-slate-400 font-medium">Bảo mật phiên làm việc</div>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center md:justify-end gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Tự động gia hạn khi có thao tác
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Đổi mật khẩu (SCRUM-201) */}
      <ChangePasswordModal
        isOpen={isChangePassModalOpen}
        onClose={() => setIsChangePassModalOpen(false)}
      />
    </PageContainer>
  );
};
