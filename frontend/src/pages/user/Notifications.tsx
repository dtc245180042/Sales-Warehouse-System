import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  Package, 
  AlertTriangle, 
  Tag, 
  Info, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { mockUserApi } from '../../services/api';
import { UserNotification } from '../../data/mockData';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterUnreadOnly, setFilterUnreadOnly] = useState<boolean>(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await mockUserApi.getNotifications();
      if (res.data.success && res.data.data) {
        setNotifications(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await mockUserApi.markNotificationAsRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await mockUserApi.markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await mockUserApi.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter(item => {
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesUnread = !filterUnreadOnly || !item.isRead;
      return matchesType && matchesUnread;
    });
  }, [notifications, filterType, filterUnreadOnly]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getIcon = (type: UserNotification['type']) => {
    switch (type) {
      case 'order':
        return <Package className="w-5 h-5 text-blue-600" />;
      case 'stock':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'promo':
        return <Tag className="w-5 h-5 text-emerald-600" />;
      case 'system':
      default:
        return <Info className="w-5 h-5 text-purple-600" />;
    }
  };

  const getBgColor = (type: UserNotification['type']) => {
    switch (type) {
      case 'order':
        return 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50';
      case 'stock':
        return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/50';
      case 'promo':
        return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50';
      case 'system':
      default:
        return 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/50';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-7 h-7 text-blue-600" />
            Trung tâm thông báo
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cập nhật trạng thái đơn hàng, cảnh báo tồn kho và tin tức hệ thống
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchNotifications}
            className="p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl text-sm font-semibold transition-colors border border-blue-200 dark:border-blue-900/50"
            >
              <CheckCheck className="w-4 h-4" />
              Đánh dấu tất cả đã đọc
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'order', label: 'Đơn hàng' },
            { id: 'stock', label: 'Tồn kho' },
            { id: 'promo', label: 'Khuyến mãi' },
            { id: 'system', label: 'Hệ thống' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === f.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={filterUnreadOnly}
            onChange={(e) => setFilterUnreadOnly(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
          />
          <span>Chỉ hiện tin chưa đọc ({unreadCount})</span>
        </label>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="text-sm">Đang tải thông báo...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-16 text-center border border-slate-200 dark:border-slate-800 shadow-sm">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 text-base">
              Không có thông báo nào
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Bạn đã cập nhật hết tất cả các thông báo mới nhất.
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 sm:p-5 rounded-2xl border transition-all flex items-start gap-4 ${
                notif.isRead
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-80 hover:opacity-100'
                  : 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 shadow-sm'
              }`}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${getBgColor(notif.type)}`}>
                {getIcon(notif.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                    {notif.title}
                  </h4>
                  {!notif.isRead && (
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                  {notif.message}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {notif.createdAt}
                  </span>
                  {notif.link && (
                    <a
                      href={notif.link}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      Xem chi tiết →
                    </a>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {!notif.isRead && (
                  <button
                    onClick={() => handleMarkAsRead(notif.id)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    title="Đánh dấu đã đọc"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(notif.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                  title="Xóa thông báo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
