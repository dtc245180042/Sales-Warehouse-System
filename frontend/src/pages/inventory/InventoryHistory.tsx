import React, { useState, useEffect, useMemo } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { formatDate } from '../../utils/formatters';
import { inventoryService } from '../../services/inventoryService';
import { InventoryHistoryRecord, InventoryTransactionType } from '../../types/Inventory';
import { Search, History, ArrowDownLeft, ArrowUpRight, RefreshCw, Repeat } from 'lucide-react';

export const InventoryHistory: React.FC = () => {
  const [records, setRecords] = useState<InventoryHistoryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    inventoryService.getHistory().then(setRecords);
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchSearch =
        r.productName.toLowerCase().includes(search.toLowerCase()) ||
        r.sku.toLowerCase().includes(search.toLowerCase()) ||
        r.code.toLowerCase().includes(search.toLowerCase()) ||
        r.performer.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === 'all' || r.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [records, search, typeFilter]);

  const columns: Column<InventoryHistoryRecord>[] = [
    {
      key: 'date',
      header: 'Thời Gian',
      sortable: true,
      className: 'whitespace-nowrap text-xs text-slate-500',
      render: (r) => <span>{formatDate(r.date)}</span>,
    },
    {
      key: 'code',
      header: 'Mã Phiếu',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
    },
    {
      key: 'type',
      header: 'Loại Giao Dịch',
      sortable: true,
      render: (r) => {
        const typeMap = {
          in: { label: 'Nhập kho', variant: 'success' as const, icon: <ArrowDownLeft className="w-3 h-3 mr-1" /> },
          out: { label: 'Xuất kho', variant: 'danger' as const, icon: <ArrowUpRight className="w-3 h-3 mr-1" /> },
          adjust: { label: 'Điều chỉnh', variant: 'warning' as const, icon: <RefreshCw className="w-3 h-3 mr-1" /> },
          transfer: { label: 'Điều chuyển', variant: 'info' as const, icon: <Repeat className="w-3 h-3 mr-1" /> },
        };
        const config = typeMap[r.type] || typeMap.in;
        return (
          <Badge variant={config.variant} size="sm">
            <span className="flex items-center">
              {config.icon}
              {config.label}
            </span>
          </Badge>
        );
      },
    },
    {
      key: 'productName',
      header: 'Sản Phẩm',
      sortable: true,
      className: 'min-w-[180px]',
      render: (r) => (
        <div>
          <div className="font-bold text-slate-900 dark:text-slate-100">{r.productName}</div>
          <span className="text-[11px] text-slate-400 font-mono">SKU: {r.sku}</span>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Biến Động',
      sortable: true,
      render: (r) => (
        <span
          className={`font-black text-sm ${
            r.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {r.quantity > 0 ? `+${r.quantity}` : r.quantity}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      header: 'Tồn Sau GD',
      sortable: true,
      render: (r) => <span className="font-bold text-slate-700 dark:text-slate-300">{r.balanceAfter}</span>,
    },
    {
      key: 'warehouse',
      header: 'Kho',
      sortable: true,
      render: (r) => <span className="text-xs text-slate-500">{r.warehouse}</span>,
    },
    {
      key: 'performer',
      header: 'Người Thực Hiện',
      sortable: true,
      render: (r) => <span className="font-medium text-slate-700 dark:text-slate-300">{r.performer}</span>,
    },
    {
      key: 'note',
      header: 'Ghi Chú',
      render: (r) => <span className="text-xs text-slate-500 italic max-w-xs truncate block">{r.note || '-'}</span>,
    },
  ];

  return (
    <PageContainer
      title="Lịch Sử Giao Dịch Kho"
      subtitle="Theo dõi vết tất cả các thao tác nhập hàng, xuất bán, điều chuyển và điều chỉnh tồn kho"
    >
      <DataTable
        data={filteredRecords}
        columns={columns}
        keyExtractor={(r) => r.id}
        filterComponent={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã phiếu, tên sản phẩm, người thực hiện..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'in', label: 'Nhập kho' },
                { id: 'out', label: 'Xuất kho' },
                { id: 'adjust', label: 'Điều chỉnh' },
                { id: 'transfer', label: 'Điều chuyển' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    typeFilter === tab.id
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        }
      />
    </PageContainer>
  );
};
