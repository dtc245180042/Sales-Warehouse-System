import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectChange?: (selectedIds: string[]) => void;
  bulkActions?: React.ReactNode;
  filterComponent?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  defaultPageSize?: number;
  loading?: boolean;
  emptyMessage?: string;

  // Hỗ trợ phân trang Server-side & Controlled
  serverSidePagination?: boolean;
  totalRecords?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  selectable = false,
  selectedIds = [],
  onSelectChange,
  bulkActions,
  filterComponent,
  emptyTitle = 'Không tìm thấy dữ liệu',
  emptyDescription = 'Thử thay đổi bộ lọc hoặc thêm bản ghi mới',
  defaultPageSize = 10,
  loading = false,
  emptyMessage,
  serverSidePagination = false,
  totalRecords,
  currentPage: controlledPage,
  pageSize: controlledPageSize,
  onPageChange,
  onPageSizeChange,
}: DataTableProps<T>) {
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(defaultPageSize);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const isServerSide = serverSidePagination || totalRecords !== undefined;
  const activePage = isServerSide ? (controlledPage ?? 1) : internalPage;
  const activePageSize = isServerSide ? (controlledPageSize ?? defaultPageSize) : internalPageSize;

  // Sorting
  const sortedData = React.useMemo(() => {
    if (!sortKey || isServerSide) return data;
    return [...data].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [data, sortKey, sortDirection, isServerSide]);

  // Pagination
  const totalCount = isServerSide ? (totalRecords ?? data.length) : sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / activePageSize));
  const validPage = Math.min(Math.max(1, activePage), totalPages);
  const paginatedData = isServerSide
    ? data
    : sortedData.slice((validPage - 1) * activePageSize, validPage * activePageSize);

  const handlePageChange = (newPage: number) => {
    const page = Math.min(Math.max(1, newPage), totalPages);
    if (isServerSide) {
      onPageChange?.(page);
    } else {
      setInternalPage(page);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (isServerSide) {
      onPageSizeChange?.(newSize);
      onPageChange?.(1);
    } else {
      setInternalPageSize(newSize);
      setInternalPage(1);
    }
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  // Selection
  const allCurrentIds = paginatedData.map(keyExtractor);
  const isAllSelected =
    allCurrentIds.length > 0 && allCurrentIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (!onSelectChange) return;
    if (isAllSelected) {
      onSelectChange(selectedIds.filter((id) => !allCurrentIds.includes(id)));
    } else {
      const newIds = Array.from(new Set([...selectedIds, ...allCurrentIds]));
      onSelectChange(newIds);
    }
  };

  const toggleSelectRow = (id: string) => {
    if (!onSelectChange) return;
    if (selectedIds.includes(id)) {
      onSelectChange(selectedIds.filter((item) => item !== id));
    } else {
      onSelectChange([...selectedIds, id]);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
      {/* Top Filter and Bulk Actions Bar */}
      {(filterComponent || (selectable && selectedIds.length > 0)) && (
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
          {selectable && selectedIds.length > 0 ? (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                Đã chọn {selectedIds.length} mục
              </span>
              {bulkActions}
            </div>
          ) : (
            <div className="w-full">{filterComponent}</div>
          )}
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {selectable && (
                <th className="px-4 py-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3.5 whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200' : ''
                  } ${col.className || ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-slate-400">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-14 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2.5">
                    <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Đang nạp dữ liệu...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length > 0 ? (
              paginatedData.map((row) => {
                const id = keyExtractor(row);
                const isSelected = selectedIds.includes(id);
                return (
                  <tr
                    key={id}
                    className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${
                      isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    {selectable && (
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(id)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3.5 ${col.className || ''}`}>
                        {col.render ? col.render(row) : (row[col.key] ?? '-')}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-8">
                  <EmptyState title={emptyMessage || emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalCount > 0 && (
        <div className="px-4 py-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>Hiển thị</span>
            <select
              value={activePageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-medium cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>trong tổng số {totalCount.toLocaleString('vi-VN')} bản ghi</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handlePageChange(validPage - 1)}
              disabled={validPage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Các nút bấm trực tiếp số trang */}
            <div className="flex items-center gap-1">
              {totalPages <= 7 ? (
                Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                  const isActive = p === validPage;
                  return (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      data-page={p}
                      data-active={isActive ? 'true' : 'false'}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-700'
                          : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })
              ) : (
                <>
                  <button
                    onClick={() => handlePageChange(1)}
                    data-page={1}
                    data-active={1 === validPage ? 'true' : 'false'}
                    aria-current={1 === validPage ? 'page' : undefined}
                    className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                      1 === validPage
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-700'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    1
                  </button>
                  {validPage > 3 && <span className="text-slate-400 px-0.5">...</span>}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p !== 1 && p !== totalPages && Math.abs(p - validPage) <= 1)
                    .map((p) => {
                      const isActive = p === validPage;
                      return (
                        <button
                          key={p}
                          onClick={() => handlePageChange(p)}
                          data-page={p}
                          data-active={isActive ? 'true' : 'false'}
                          aria-current={isActive ? 'page' : undefined}
                          className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-700'
                              : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  {validPage < totalPages - 2 && <span className="text-slate-400 px-0.5">...</span>}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    data-page={totalPages}
                    data-active={totalPages === validPage ? 'true' : 'false'}
                    aria-current={totalPages === validPage ? 'page' : undefined}
                    className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                      totalPages === validPage
                        ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-700'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => handlePageChange(validPage + 1)}
              disabled={validPage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Trang sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
