import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Layers,
  Edit2,
  Trash2,
  Users2,
  Phone,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Warehouse } from '../../types/Warehouse';
import { Agent } from '../../types/Agent';
import { warehouseService } from '../../services/warehouseService';
import { agentService } from '../../services/agentService';
import { useToast } from '../../contexts/ToastContext';
import { WarehouseFormModal } from './WarehouseFormModal';
import { WarehouseLocationModal } from './WarehouseLocationModal';

export const WarehouseListPage: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'warehouses' | 'agent_assignment'>('warehouses');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedWarehouseForEdit, setSelectedWarehouseForEdit] = useState<Warehouse | null>(null);

  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [selectedWarehouseForLocation, setSelectedWarehouseForLocation] = useState<Warehouse | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [whList, agList] = await Promise.all([
        warehouseService.getAll(),
        agentService.getAll(),
      ]);
      setWarehouses(whList);
      setAgents(agList);
    } catch {
      showToast('Lỗi khi tải dữ liệu kho và đại lý', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered warehouses
  const filteredWarehouses = useMemo(() => {
    return warehouses.filter((wh) => {
      const matchSearch =
        wh.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wh.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wh.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wh.manager.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'all' || wh.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [warehouses, searchTerm, statusFilter]);

  // Handle warehouse deletion
  const handleDeleteWarehouse = async (wh: Warehouse) => {
    if (!window.confirm(`Bạn có chắc muốn xóa kho "${wh.name}" (${wh.code})?`)) return;
    try {
      await warehouseService.delete(wh.id);
      showToast(`Đã xóa kho ${wh.code}`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xóa kho', 'error');
    }
  };

  // Handle default warehouse assignment for agent (SCRUM-538)
  const handleAssignAgentWarehouse = async (agentId: string, warehouseId: string) => {
    try {
      const targetWh = warehouses.find((w) => w.id === warehouseId);
      const whName = targetWh ? targetWh.name : '';
      await warehouseService.assignDefaultWarehouseToAgent(agentId, warehouseId, whName);
      setAgents((prev) =>
        prev.map((ag) =>
          ag.id === agentId
            ? { ...ag, defaultWarehouseId: warehouseId, defaultWarehouseName: whName }
            : ag
        )
      );
      showToast('Đã cập nhật kho mặc định cho đại lý', 'success');
    } catch {
      showToast('Lỗi khi cập nhật kho mặc định', 'error');
    }
  };

  // Warehouse Columns
  const warehouseColumns: Column<Warehouse>[] = [
    {
      key: 'code',
      header: 'Mã & Tên Kho',
      render: (row) => (
        <div className="space-y-0.5">
          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
            {row.name}
          </div>
          <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
            {row.code}
          </div>
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Địa chỉ / Khu vực',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="text-slate-700 dark:text-slate-300 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {row.address}
          </div>
          <div className="text-slate-400">
            {row.district ? `${row.district}, ` : ''}{row.province}
          </div>
        </div>
      ),
    },
    {
      key: 'manager',
      header: 'Người phụ trách',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="font-medium text-slate-800 dark:text-slate-200">
            {row.manager}
          </div>
          {row.phone && (
            <div className="text-slate-400 flex items-center gap-1">
              <Phone className="w-3 h-3 text-slate-400" />
              {row.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'locations',
      header: 'Vị trí lưu kho (SCRUM-538)',
      render: (row) => {
        const count = row.locations?.length || 0;
        return (
          <div className="flex items-center gap-2">
            <Badge variant={count > 0 ? 'primary' : 'neutral'} size="sm">
              {count} vị trí
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="!py-1 !px-2 !text-xs"
              leftIcon={<Layers className="w-3.5 h-3.5 text-indigo-500" />}
              onClick={() => {
                setSelectedWarehouseForLocation(row);
                setIsLocationModalOpen(true);
              }}
            >
              Sơ đồ kệ
            </Button>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <Badge variant={row.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
          {row.status === 'active' ? 'Đang hoạt động' : 'Tạm ngưng'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      className: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSelectedWarehouseForEdit(row);
              setIsFormModalOpen(true);
            }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition-colors"
            title="Chỉnh sửa kho"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDeleteWarehouse(row)}
            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 transition-colors"
            title="Xóa kho"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  // Agent Assignment Columns (SCRUM-538)
  const agentColumns: Column<Agent>[] = [
    {
      key: 'code',
      header: 'Đại lý',
      render: (row) => (
        <div className="space-y-0.5">
          <div className="font-semibold text-slate-900 dark:text-white">
            {row.name}
          </div>
          <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
            {row.code}
          </div>
        </div>
      ),
    },
    {
      key: 'region',
      header: 'Địa bàn / Khu vực',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="text-slate-800 dark:text-slate-200 font-medium">{row.province}</div>
          <div className="text-slate-400">{row.region}</div>
        </div>
      ),
    },
    {
      key: 'customerGroup',
      header: 'Hạng đại lý',
      render: (row) => (
        <Badge variant={row.customerGroup === 'platinum' ? 'warning' : 'primary'} size="sm">
          {row.customerGroup.toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'defaultWarehouse',
      header: 'Kho phục vụ mặc định (SCRUM-538)',
      render: (row) => (
        <div className="max-w-xs">
          <select
            value={row.defaultWarehouseId || ''}
            onChange={(e) => handleAssignAgentWarehouse(row.id, e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
          >
            <option value="">-- Chưa gán kho --</option>
            {warehouses
              .filter((w) => w.status === 'active')
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
          </select>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      render: (row) => (
        <Badge variant={row.status === 'active' ? 'success' : 'neutral'} size="sm" dot>
          {row.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}
        </Badge>
      ),
    },
  ];

  return (
    <PageContainer
      title="Quản lý Kho vận & Vị trí lưu trữ"
      subtitle="Thiết lập danh mục kho, sơ đồ phân khu kệ và gán kho phục vụ cho đại lý (SCRUM-537, SCRUM-538)"
      actions={
        activeTab === 'warehouses' && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setSelectedWarehouseForEdit(null);
              setIsFormModalOpen(true);
            }}
          >
            Thêm kho mới
          </Button>
        )
      }
    >
      <div className="space-y-6">
        {/* KPI / Stats Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Tổng số kho hàng</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {warehouses.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Kho đang vận hành</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {warehouses.filter((w) => w.status === 'active').length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Đại lý đã gán kho</div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                {agents.filter((a) => a.defaultWarehouseId).length} / {agents.length}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('warehouses')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'warehouses'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Danh sách Kho hàng (SCRUM-537)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agent_assignment')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'agent_assignment'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users2 className="w-4 h-4" />
            Phân công Kho cho Đại lý (SCRUM-538)
          </button>
        </div>

        {/* Tab 1: Warehouses */}
        {activeTab === 'warehouses' && (
          <div className="space-y-4">
            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm theo mã, tên kho, địa chỉ, người phụ trách..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="active">Đang hoạt động</option>
                  <option value="inactive">Tạm ngưng</option>
                </select>
              </div>
            </div>

            {/* Warehouse Table */}
            <DataTable
              data={filteredWarehouses}
              columns={warehouseColumns}
              keyExtractor={(item) => item.id}
              emptyTitle="Chưa có kho hàng nào"
              emptyDescription="Nhấn 'Thêm kho mới' để khai báo kho lưu trữ đầu tiên"
            />
          </div>
        )}

        {/* Tab 2: Agent Assignment */}
        {activeTab === 'agent_assignment' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Kho mặc định sẽ được tự động điền khi đại lý đặt đơn hoặc khi nhân viên kinh doanh tạo đơn xuất cho đại lý.
              </span>
            </div>

            <DataTable
              data={agents}
              columns={agentColumns}
              keyExtractor={(item) => item.id}
              emptyTitle="Không có danh sách đại lý"
              emptyDescription="Vui lòng kiểm tra lại cấu hình đại lý trong hệ thống"
            />
          </div>
        )}
      </div>

      {/* Warehouse Form Modal (Create/Edit) */}
      <WarehouseFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        warehouse={selectedWarehouseForEdit}
        onSuccess={loadData}
      />

      {/* Warehouse Location Modal (SCRUM-538) */}
      <WarehouseLocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        warehouse={selectedWarehouseForLocation}
        onSuccess={loadData}
      />
    </PageContainer>
  );
};
