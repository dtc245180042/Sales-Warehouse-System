import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  Warehouse,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { UserImportRow } from '../../types/userImport';
import { Badge } from '../common/Badge';

interface ImportPreviewTableProps {
  rows: UserImportRow[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
}

export const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  rows,
  totalRows,
  validCount,
  invalidCount,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Filter status
      if (filterStatus === 'valid' && !r.is_valid) return false;
      if (filterStatus === 'invalid' && r.is_valid) return false;

      // Filter search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchUsername = r.username?.toLowerCase().includes(q);
      const matchEmail = r.email?.toLowerCase().includes(q);
      const matchFullName = r.full_name?.toLowerCase().includes(q);
      const matchRole = r.role?.toLowerCase().includes(q);
      const matchWarehouse = r.assigned_warehouse?.toLowerCase().includes(q);

      return matchUsername || matchEmail || matchFullName || matchRole || matchWarehouse;
    });
  }, [rows, filterStatus, searchQuery]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const handleFilterChange = (status: 'all' | 'valid' | 'invalid') => {
    setFilterStatus(status);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Thanh thống kê nhanh & Bộ lọc */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        {/* Bộ đếm tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              filterStatus === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
            }`}
          >
            <span>Tất cả</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200/50 dark:bg-slate-700">
              {totalRows}
            </span>
          </button>

          <button
            onClick={() => handleFilterChange('valid')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              filterStatus === 'valid'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hợp lệ</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
              {validCount}
            </span>
          </button>

          <button
            onClick={() => handleFilterChange('invalid')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              filterStatus === 'invalid'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Có lỗi</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
              {invalidCount}
            </span>
          </button>
        </div>

        {/* Ô tìm kiếm */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm dòng theo tên, email, vai trò..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Bảng dữ liệu preview */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
              <th className="py-3 px-3 w-16 text-center">Dòng</th>
              <th className="py-3 px-3">Tài khoản & Email</th>
              <th className="py-3 px-3">Họ và tên</th>
              <th className="py-3 px-3">Vai trò</th>
              <th className="py-3 px-3">Kho / Địa bàn phụ trách</th>
              <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
              <th className="py-3 px-3 min-w-[220px]">Chi tiết kiểm tra & Lỗi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  <Filter className="w-6 h-6 mx-auto mb-1 text-slate-300 dark:text-slate-600" />
                  Không tìm thấy dòng nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              paginatedRows.map((r) => (
                <tr
                  key={r.row_index}
                  className={`transition-colors ${
                    !r.is_valid
                      ? 'bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50/50 dark:hover:bg-rose-950/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-750'
                  }`}
                >
                  <td className="py-3 px-3 text-center font-mono font-semibold text-slate-500 dark:text-slate-400">
                    #{r.row_index}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 font-mono">
                      {r.username || <span className="text-slate-300 italic">Trống</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {r.email || <span className="text-slate-300 italic">Trống</span>}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                    {r.full_name || <span className="text-slate-300 italic">Chưa nhập</span>}
                    {r.phone_number && (
                      <div className="text-[11px] text-slate-400 font-mono">{r.phone_number}</div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {r.role ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                        <ShieldCheck className="w-3 h-3 text-indigo-500" />
                        {r.role}
                      </span>
                    ) : (
                      <span className="text-slate-300 italic">Chưa có</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {r.assigned_warehouse ? (
                      <div className="inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300">
                        <Warehouse className="w-3 h-3 text-slate-400" />
                        {r.assigned_warehouse}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50">
                        Chưa có
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {r.is_valid ? (
                      <Badge variant="success" size="sm">
                        Hợp lệ
                      </Badge>
                    ) : (
                      <Badge variant="danger" size="sm">
                        Có lỗi
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {r.is_valid ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Sẵn sàng để nhập
                      </span>
                    ) : (
                      <div className="space-y-1">
                        {r.errors.map((err, errIdx) => (
                          <div
                            key={errIdx}
                            className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-start gap-1"
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phân trang */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-1 text-xs text-slate-500">
          <div>
            Hiển thị {paginatedRows.length} trên tổng số {filteredRows.length} dòng
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
