import { apiClient } from '../api/client';
import { ActivityLog, ActivityAction, ActivityModule, ActivityStatus } from '../types/ActivityLog';
import { mockActivityLogs } from '../mock/activityLogs';
import { exportToCSV } from '../utils/csvExporter';

export interface AuditLogFilterParams {
  page?: number;
  pageSize?: number;
  entityType?: string;
  userId?: number;
  username?: string;
  action?: string;
  entityId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortDesc?: boolean;
}

export interface AuditLogStatsData {
  total: number;
  success: number;
  failed: number;
  warning: number;
}

export interface AuditLogBackendItem {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
  action: string;
  old_values?: any;
  new_values?: any;
  change_summary?: string | null;
  reason?: string | null;
  user_id?: number | null;
  username?: string | null;
  user_fullname?: string | null;
  user_role?: string | null;
  ip_address?: string | null;
  device?: string | null;
  status?: string | null;
  created_at: string;
}

export interface AuditLogFetchResult {
  items: ActivityLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats?: AuditLogStatsData;
}

/**
 * Chuyển đổi dữ liệu chuẩn từ Backend sang format ActivityLog của Frontend
 */
export function mapBackendToActivityLog(item: AuditLogBackendItem): ActivityLog {
  const normStatus: ActivityStatus =
    item.status === 'failed' ? 'failed' : item.status === 'warning' ? 'warning' : 'success';

  // Chuẩn hóa module
  let normModule: ActivityModule = 'SETTINGS';
  const ent = (item.entity_type || '').toUpperCase();
  if (ent.includes('AUTH') || ent.includes('LOGIN')) normModule = 'AUTH';
  else if (ent.includes('USER')) normModule = 'USER_MANAGEMENT';
  else if (ent.includes('PRODUCT') || ent.includes('PRICE')) normModule = 'PRODUCT';
  else if (ent.includes('INVENTORY') || ent.includes('STOCK')) normModule = 'INVENTORY';
  else if (ent.includes('ORDER') || ent.includes('INVOICE')) normModule = 'ORDER';
  else if (ent.includes('CUSTOMER') || ent.includes('DEBT')) normModule = 'CUSTOMER';
  else if (ent.includes('SUPPLIER')) normModule = 'SUPPLIER';
  else if (ent.includes('REPORT')) normModule = 'REPORT';

  // Chuẩn hóa hành động
  let normAction: ActivityAction = 'UPDATE';
  const act = (item.action || '').toUpperCase();
  if (act.includes('LOGIN')) normAction = 'LOGIN';
  else if (act.includes('LOGOUT')) normAction = 'LOGOUT';
  else if (act.includes('CREATE')) normAction = 'CREATE';
  else if (act.includes('DELETE')) normAction = 'DELETE';
  else if (act.includes('VIEW')) normAction = 'VIEW';
  else if (act.includes('EXPORT')) normAction = 'EXPORT';
  else if (act.includes('IMPORT')) normAction = 'IMPORT';
  else if (act.includes('APPROVE')) normAction = 'APPROVE';
  else if (act.includes('REJECT')) normAction = 'REJECT';
  else if (act.includes('LOCK')) normAction = 'LOCK';
  else if (act.includes('UNLOCK')) normAction = 'UNLOCK';
  else if (act.includes('RESET')) normAction = 'RESET_PASSWORD';
  else if (act.includes('ROLE')) normAction = 'ASSIGN_ROLE';
  else if (act.includes('STATUS')) normAction = 'CHANGE_STATUS';
  else if (act.includes('STOCK') || act.includes('ADJUST')) normAction = 'UPDATE';

  const targetLabel = item.entity_name
    ? `${item.entity_name} (${item.entity_id})`
    : item.entity_id || 'Hệ thống';

  // Trích xuất thông tin thiết bị
  const deviceStr =
    item.device ||
    item.new_values?.device ||
    item.new_values?.device_summary ||
    (normModule === 'AUTH' ? 'Trình duyệt Web' : undefined);

  let meta: Record<string, any> | undefined = undefined;
  if (item.new_values || item.old_values) {
    meta = {
      ...(item.old_values ? { 'Dữ liệu cũ': JSON.stringify(item.old_values) } : {}),
      ...(item.new_values ? { 'Dữ liệu mới': JSON.stringify(item.new_values) } : {}),
      ...(item.reason ? { 'Lý do': item.reason } : {}),
    };
  } else if (item.reason) {
    meta = { 'Lý do': item.reason };
  }

  if (deviceStr) {
    meta = {
      ...(meta || {}),
      'Thiết bị thao tác': deviceStr,
    };
  }

  if (item.new_values?.login_time_formatted) {
    meta = {
      ...(meta || {}),
      'Thời điểm đăng nhập': item.new_values.login_time_formatted,
    };
  }

  if (item.new_values?.logout_time_formatted) {
    meta = {
      ...(meta || {}),
      'Thời điểm đăng xuất': item.new_values.logout_time_formatted,
    };
  }

  return {
    id: `LOG-${String(item.id).padStart(4, '0')}`,
    timestamp: item.created_at,
    userId: item.user_id ? `USR-${String(item.user_id).padStart(3, '0')}` : 'SYS-001',
    userName: item.user_fullname || item.username || 'Hệ thống',
    userRole: item.user_role || 'Admin',
    action: normAction,
    module: normModule,
    target: targetLabel,
    detail: item.change_summary || item.reason || `${item.action} trên ${item.entity_type}`,
    ipAddress: item.ip_address || '127.0.0.1',
    device: deviceStr,
    status: normStatus,
    metadata: meta,
  };
}

/**
 * Tra cứu danh sách nhật ký kiểm toán từ Backend với phân trang và lọc Server-side
 */
export async function fetchAuditLogs(params: AuditLogFilterParams): Promise<AuditLogFetchResult> {
  try {
    const queryParams: Record<string, any> = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
      sort_desc: params.sortDesc !== false,
    };

    if (params.search?.trim()) queryParams.search = params.search.trim();
    if (params.action) queryParams.action = params.action;
    if (params.entityType) queryParams.entity_type = params.entityType;
    if (params.status) queryParams.status = params.status;
    if (params.username?.trim()) queryParams.username = params.username.trim();
    if (params.startDate) queryParams.start_date = params.startDate;
    if (params.endDate) queryParams.end_date = params.endDate + 'T23:59:59';

    const response = await apiClient.get('/audit-logs', { params: queryParams });
    const data = response.data;

    const mappedItems: ActivityLog[] = (data.items || []).map(mapBackendToActivityLog);

    return {
      items: mappedItems,
      total: data.total ?? mappedItems.length,
      page: data.page ?? (params.page || 1),
      pageSize: data.page_size ?? (params.pageSize || 20),
      totalPages: data.total_pages ?? Math.max(1, Math.ceil((data.total || 0) / (params.pageSize || 20))),
      stats: data.stats,
    };
  } catch (err) {
    console.warn('[auditLogService] Không thể kết nối API /audit-logs, sử dụng bộ nhớ giả lập dự phòng:', err);
    // Fallback sang dữ liệu mẫu khi mất kết nối mạng
    let filtered = [...mockActivityLogs];
    if (params.action) filtered = filtered.filter((l) => l.action === params.action);
    if (params.entityType) filtered = filtered.filter((l) => l.module === params.entityType);
    if (params.status) filtered = filtered.filter((l) => l.status === params.status);
    if (params.username) filtered = filtered.filter((l) => l.userName.toLowerCase().includes(params.username!.toLowerCase()));
    if (params.startDate) filtered = filtered.filter((l) => l.timestamp >= params.startDate!);
    if (params.endDate) filtered = filtered.filter((l) => l.timestamp <= params.endDate! + 'T23:59:59');
    if (params.search?.trim()) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.detail.toLowerCase().includes(q) ||
          l.target.toLowerCase().includes(q) ||
          l.userName.toLowerCase().includes(q) ||
          l.ipAddress.includes(q) ||
          l.id.toLowerCase().includes(q)
      );
    }
    const pSize = params.pageSize || 20;
    const pCurrent = params.page || 1;
    const totalP = Math.max(1, Math.ceil(filtered.length / pSize));
    const paginated = filtered.slice((pCurrent - 1) * pSize, pCurrent * pSize);

    return {
      items: paginated,
      total: filtered.length,
      page: pCurrent,
      pageSize: pSize,
      totalPages: totalP,
      stats: {
        total: filtered.length,
        success: filtered.filter((l) => l.status === 'success').length,
        failed: filtered.filter((l) => l.status === 'failed').length,
        warning: filtered.filter((l) => l.status === 'warning').length,
      },
    };
  }
}

/**
 * Lấy số liệu thống kê nhật ký
 */
export async function fetchAuditStats(): Promise<AuditLogStatsData> {
  try {
    const res = await apiClient.get('/audit-logs/stats');
    return res.data;
  } catch (err) {
    console.warn('[auditLogService] Không thể lấy stats từ backend:', err);
    return {
      total: mockActivityLogs.length,
      success: mockActivityLogs.filter((l) => l.status === 'success').length,
      failed: mockActivityLogs.filter((l) => l.status === 'failed').length,
      warning: mockActivityLogs.filter((l) => l.status === 'warning').length,
    };
  }
}

/**
 * Xuất dữ liệu nhật ký ra file Excel/CSV chuẩn UTF-8 BOM
 * 1. Gọi trực tiếp endpoint streaming từ Backend (hỗ trợ hàng triệu bản ghi không tràn RAM).
 * 2. Fallback sang tiện ích csvExporter của frontend nếu API không khả dụng.
 */
export async function exportAuditLogsExcel(params: AuditLogFilterParams): Promise<void> {
  const queryParams: Record<string, any> = {
    limit: 20000,
  };
  if (params.search?.trim()) queryParams.search = params.search.trim();
  if (params.action) queryParams.action = params.action;
  if (params.entityType) queryParams.entity_type = params.entityType;
  if (params.status) queryParams.status = params.status;
  if (params.username?.trim()) queryParams.username = params.username.trim();
  if (params.startDate) queryParams.start_date = params.startDate;
  if (params.endDate) queryParams.end_date = params.endDate + 'T23:59:59';

  try {
    const response = await apiClient.get('/audit-logs/export', {
      params: queryParams,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nowStr = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
    a.download = `nhat_ky_thao_tac_${nowStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 1500);
  } catch (apiErr) {
    console.warn('[auditLogService] Xuất từ Backend thất bại, fallback sang trình xuất CSV trình duyệt:', apiErr);
    // Client-side fallback export
    const fallbackData = await fetchAuditLogs({ ...params, page: 1, pageSize: 5000 });
    const rows = fallbackData.items.map((log) => [
      log.id,
      log.timestamp,
      log.userName,
      log.userRole,
      log.action,
      log.module,
      log.target,
      log.detail,
      log.status === 'success' ? 'Thành công' : log.status === 'failed' ? 'Thất bại' : 'Cảnh báo',
      log.ipAddress,
    ]);

    exportToCSV({
      filename: `nhat_ky_thao_tac_${new Date().toISOString().slice(0, 10)}.csv`,
      headers: [
        'Mã nhật ký',
        'Thời gian',
        'Người thực hiện',
        'Vai trò',
        'Hành động',
        'Module',
        'Đối tượng tác động',
        'Chi tiết mô tả',
        'Trạng thái',
        'Địa chỉ IP',
      ],
      rows,
    });
  }
}
