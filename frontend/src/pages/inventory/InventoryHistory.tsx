import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Badge } from '../../components/common/Badge';
import { formatDate } from '../../utils/formatters';
import { inventoryService } from '../../services/inventoryService';
import { stockLedgerService } from '../../services/stockLedgerService';
import { InventoryHistoryRecord } from '../../types/Inventory';
import { mapMovementTypeToRoute, getMovementTypeTooltip } from '../../utils/ledgerRouteMapper';
import { Search, History, ArrowDownLeft, ArrowUpRight, RefreshCw, Repeat, Database, ExternalLink } from 'lucide-react';

export const InventoryHistory: React.FC = () => {
  const [records, setRecords] = useState<InventoryHistoryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [isLiveLedger, setIsLiveLedger] = useState<boolean>(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // 1. Ưu tiên lấy từ sổ cái bất biến (/stock-ledger/entries)
      const ledgerParams: any = { page: 1, size: 100 };
      if (typeof warehouseFilter === 'number') {
        ledgerParams.warehouse_id = warehouseFilter;
      }
      const ledgerRes = await stockLedgerService.getEntries(ledgerParams);
      if (ledgerRes && ledgerRes.items && ledgerRes.items.length > 0) {
        const mapped: InventoryHistoryRecord[] = ledgerRes.items.map((item) => {
          let recType: 'in' | 'out' | 'adjust' | 'transfer' = 'in';
          if (item.movement_type === 'OUT_SALE' || item.movement_type.startsWith('OUT')) {
            recType = 'out';
          } else if (item.movement_type.includes('REVERSAL') || item.movement_type.startsWith('ADJUST')) {
            recType = 'adjust';
          } else if (item.movement_type.startsWith('TRANSFER')) {
            recType = 'transfer';
          }

          return {
            id: String(item.id),
            code: item.reference_code,
            type: recType,
            movementType: item.movement_type,
            productId: item.product_id,
            productName: item.product_name || item.product_id,
            sku: item.sku || item.product_id,
            quantity: item.quantity_base,
            balanceAfter: item.new_physical,
            warehouse: item.warehouse_name,
            performer: item.performer_name || 'Hệ thống',
            date: item.created_at || new Date().toISOString(),
            note: item.note ? `${item.note} (${item.movement_type})` : item.movement_type,
          };
        });
        setRecords(mapped);
        setIsLiveLedger(true);
        return;
      }
    } catch (err) {
      console.warn('[InventoryHistory] stock-ledger API error, fallback legacy history:', err);
    }

    // 2. Fallback sang legacy history
    try {
      const fallbackList = await inventoryService.getHistory();
      setRecords(fallbackList);
      setIsLiveLedger(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [warehouseFilter]);

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
      header: 'Mã Chứng Từ',
      sortable: true,
      className: 'font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap',
      render: (r) => {
        const route = mapMovementTypeToRoute(r.movementType || r.type, r.code);
        const tooltip = getMovementTypeTooltip(r.movementType || r.type, r.code);
        if (!route) {
          return (
            <span
              className="font-mono font-semibold text-slate-700 dark:text-slate-300"
              title={tooltip}
            >
              {r.code}
            </span>
          );
        }
        return (
          <Link
            to={route}
            className="group inline-flex items-center gap-1.5 font-mono font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline underline-offset-2 transition-colors"
            title={`${tooltip} (${r.code}) - Click để mở chi tiết`}
          >
            <span>{r.code}</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity text-primary-500" />
          </Link>
        );
      },
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
      header: 'Ghi Chú / Loại Biến Động',
      render: (r) => <span className="text-xs text-slate-500 italic max-w-xs truncate block">{r.note || '-'}</span>,
    },
  ];

  return (
    <PageContainer
      title="Lịch Sử Giao Dịch & Sổ Cái Biến Động Kho"
      subtitle="Theo dõi vết bất biến các giao dịch nhập hàng NCC, xuất bán, hoàn trả và điều chỉnh tồn kho"
      actions={
        <div className="flex items-center gap-2">
          {isLiveLedger && (
            <Badge variant="success" size="sm">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" /> Sổ Cái Trực Tiếp (Live DB)
              </span>
            </Badge>
          )}
        </div>
      }
    >
      <DataTable
        data={filteredRecords}
        columns={columns}
        keyExtractor={(r) => r.id}
        filterComponent={
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 w-full">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã chứng từ, SKU, tên sản phẩm, người thực hiện..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Kho selector */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                {[
                  { id: 'all', label: 'Tất cả kho' },
                  { id: 1, label: 'Kho Hà Nội' },
                  { id: 2, label: 'Kho Đà Nẵng' },
                  { id: 3, label: 'Kho TP.HCM' },
                ].map((wh) => (
                  <button
                    key={wh.id}
                    onClick={() => setWarehouseFilter(wh.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                      warehouseFilter === wh.id
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {wh.label}
                  </button>
                ))}
              </div>

              {/* Loại giao dịch */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
                {[
                  { id: 'all', label: 'Tất cả loại' },
                  { id: 'in', label: 'Nhập kho' },
                  { id: 'out', label: 'Xuất kho' },
                  { id: 'adjust', label: 'Điều chỉnh' },
                  { id: 'transfer', label: 'Điều chuyển' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setTypeFilter(tab.id)}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
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
          </div>
        }
      />
    </PageContainer>
  );
};
