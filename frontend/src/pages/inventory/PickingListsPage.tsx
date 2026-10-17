import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, MapPin, ClipboardList } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import {
  pickingApi, readPickingCache, loadPickingCache,
  PickingWarehouse, PickingPage, PickingSummary, PickingPreview, EligiblePickingOrder, PickingLocation,
} from '../../api/pickingLists';

const inputClass = 'w-full min-h-11 rounded-lg border border-slate-300 bg-white p-3 text-slate-900 dark:bg-slate-900 dark:text-white dark:border-slate-600';
export const pickingStatus: Record<string, string> = {
  pending: 'Chờ soạn', in_progress: 'Đang soạn', completed: 'Hoàn tất', cancelled: 'Đã hủy',
  picked: 'Đã soạn đủ', short: 'Đã ghi nhận thiếu',
};
export function PickingPagination({ page, pages, onChange }: { page: number; pages: number; onChange: (value: number) => void }) {
  return <div className="flex flex-wrap items-center justify-end gap-3 mt-4">
    <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trước</Button>
    <span className="text-sm">Trang {page} / {Math.max(1, pages)}</span>
    <Button variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Sau</Button>
  </div>;
}

export function PickingListsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<PickingWarehouse[]>([]);
  const [warehouse, setWarehouse] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const key = `picking:${user?.id}:${warehouse}:${page}:${status}:${search}`;
  const [data, setData] = useState<{ key: string; value: PickingPage<PickingSummary> } | null>(null);
  const cached = data?.key === key ? data.value : readPickingCache<PickingPage<PickingSummary>>(key);
  useEffect(() => {
    let active = true;
    pickingApi.warehouses().then((rows) => {
      if (active) { setWarehouses(rows); setWarehouse(rows[0]?.id || 0); }
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [user?.id]);
  useEffect(() => {
    if (!warehouse) return;
    let active = true;
    setError('');
    loadPickingCache(key, () => pickingApi.list(warehouse, page, status, search)).then((value) => {
      if (active) setData({ key, value });
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [key, warehouse, page, status, search, refresh]);
  return <PageContainer title="Phiếu soạn hàng" subtitle="Gộp đơn đã duyệt và soạn theo thứ tự vị trí trong kho"
    actions={<><Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => setRefresh(v => v + 1)}>Làm mới</Button>
      <Button disabled={!warehouse} leftIcon={<Plus size={16} />} onClick={() => { setCreating(!creating); setConfiguring(false); }}>Tạo phiếu soạn</Button></>}>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Kho làm việc<select aria-label="Kho làm việc" className={inputClass} value={warehouse}
          onChange={e => { setWarehouse(Number(e.target.value)); setPage(1); setCreating(false); setConfiguring(false); }}>
          {!warehouses.length && <option value={0}>Không có kho được phân công</option>}
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label className="text-sm">Trạng thái<select className={inputClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tất cả trạng thái</option>{['pending', 'in_progress', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{pickingStatus[s]}</option>)}
        </select></label>
        <label className="text-sm">Tìm mã phiếu<input className={inputClass} value={search} maxLength={100} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {['Admin', 'WarehouseManager'].includes(role) && <Button variant="outline" disabled={!warehouse} leftIcon={<MapPin size={16} />}
        onClick={() => { setConfiguring(!configuring); setCreating(false); }}>Cấu hình vị trí lấy hàng</Button>}
      {configuring && <PickingLocationForm key={warehouse} warehouse={warehouse} />}
      {creating && <PickingCreateForm key={warehouse} warehouse={warehouse} onCreated={id => navigate(`/inventory/picking-lists/${id}`)} />}
      {!cached && warehouse > 0 && !error && <p role="status">Đang tải phiếu soạn…</p>}
      {cached?.items.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">Chưa có phiếu soạn phù hợp. Chọn “Tạo phiếu soạn” để bắt đầu.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {cached?.items.map(sheet => <Link key={sheet.id} to={`/inventory/picking-lists/${sheet.id}`}
          className="block rounded-xl border border-slate-200 p-5 bg-white dark:bg-slate-900 dark:border-slate-700 hover:border-blue-500 focus-visible:ring-2">
          <div className="flex flex-wrap justify-between gap-2"><strong className="break-all flex items-center gap-2"><ClipboardList size={18} />{sheet.id}</strong>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-800">{pickingStatus[sheet.status]}</span></div>
          <p className="mt-3 text-sm break-words">Đơn nguồn: {sheet.orders.map(o => o.code).join(', ')}</p>
          <p className="mt-2 text-sm">{sheet.completed_lines}/{sheet.total_lines} dòng · Đã soạn {sheet.picked_quantity}/{sheet.total_quantity} · Thiếu {sheet.shortfall_quantity}</p>
          <progress aria-label="Tiến độ soạn" className="mt-3 w-full" value={sheet.completed_lines} max={sheet.total_lines || 1} />
        </Link>)}
      </div>
      {cached && <PickingPagination page={page} pages={cached.total_pages} onChange={setPage} />}
    </div>
  </PageContainer>;
}

function PickingLocationForm({ warehouse }: { warehouse: number }) {
  const [locations, setLocations] = useState<PickingLocation[]>([]);
  const [product, setProduct] = useState('');
  const [code, setCode] = useState('');
  const [sequence, setSequence] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    pickingApi.locations(warehouse).then(rows => { if (active) setLocations(rows); }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [warehouse]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await pickingApi.saveLocation(warehouse, product.trim(), code.trim(), Number(sequence));
      setLocations(await pickingApi.locations(warehouse));
      setMessage('Đã lưu vị trí. Phiếu mới sẽ sử dụng vị trí này; phiếu đã tạo giữ nguyên lộ trình.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-700">
    <h2 className="font-bold">Vị trí lấy hàng chính</h2>
    <p className="text-sm text-slate-500">Đặt số thứ tự theo đường đi thực tế qua các kệ. Dòng hàng sẽ được sắp xếp theo số này từ nhỏ đến lớn.</p>
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
      <label>SKU hoặc ID sản phẩm<input className={inputClass} required maxLength={100} value={product} onChange={e => setProduct(e.target.value)} /></label>
      <label>Vị trí kệ<input className={inputClass} required maxLength={100} placeholder="Ví dụ: A-01-02" value={code} onChange={e => setCode(e.target.value)} /></label>
      <label>Thứ tự đi qua<input className={inputClass} type="number" min={0} max={1000000} step={1} required value={sequence} onChange={e => setSequence(e.target.value)} /></label>
      <Button type="submit" isLoading={busy}>Lưu vị trí</Button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-green-700">{message}</p>}
    <div className="max-h-64 overflow-auto space-y-2">{locations.map(l => <div key={l.product_id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <span>{l.sku} · {l.product_name}</span><strong>{l.location_code} · Thứ tự {l.route_sequence}</strong>
    </div>)}</div>
  </section>;
}

function PickingCreateForm({ warehouse, onCreated }: { warehouse: number; onCreated: (id: string) => void }) {
  const [orders, setOrders] = useState<PickingPage<EligiblePickingOrder> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, EligiblePickingOrder>>(new Map());
  const [preview, setPreview] = useState<PickingPreview | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    pickingApi.eligible(warehouse, page, search).then(data => { if (active) setOrders(data); }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [warehouse, page, search]);
  const toggle = (order: EligiblePickingOrder) => {
    setSelected(previous => { const next = new Map(previous); if (next.has(order.id)) next.delete(order.id); else next.set(order.id, order); return next; });
    setPreview(null); setRequestId(crypto.randomUUID());
  };
  const inspect = async () => {
    setBusy(true); setError(''); setPreview(null);
    try { setPreview(await pickingApi.preview(warehouse, [...selected.keys()])); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true); setError('');
    try { onCreated((await pickingApi.create(warehouse, [...selected.keys()], requestId, notes)).id); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-blue-200 bg-white p-4 space-y-4 dark:bg-slate-900 dark:border-slate-700">
    <h2 className="font-bold text-lg">Chọn đơn đã duyệt để gộp soạn</h2>
    <label className="block">Tìm đơn hoặc khách hàng<input className={inputClass} value={search} maxLength={100} disabled={busy} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
    {!orders && <p role="status">Đang tải đơn…</p>}
    {orders?.items.length === 0 && <p>Không có đơn đủ điều kiện. Đơn phải đã duyệt, cùng kho và chưa có phiếu soạn chưa hủy.</p>}
    <div className="space-y-2">{orders?.items.map(order => <label key={order.id} className="flex items-start gap-3 rounded-lg border p-3 min-h-14 cursor-pointer">
      <input type="checkbox" className="mt-1 h-5 w-5" checked={selected.has(order.id)} disabled={busy || (!selected.has(order.id) && selected.size >= 100)} onChange={() => toggle(order)} />
      <span><strong>{order.code}</strong> · {order.customer_name}<span className="block text-sm text-slate-500">{order.total_lines} dòng · Số lượng đặt {order.total_quantity}</span></span>
    </label>)}</div>
    {orders && !busy && <PickingPagination page={page} pages={orders.total_pages} onChange={setPage} />}
    <p className="text-sm break-words">Đã chọn {selected.size} đơn: {[...selected.values()].map(o => o.code).join(', ') || 'Chưa chọn đơn'}</p>
    <Button variant="outline" disabled={!selected.size || busy} onClick={inspect}>Xem trước / Kiểm tra lại</Button>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {preview && <div className="space-y-3">
      <p className="font-semibold">{preview.orders.length} đơn · {preview.total_lines} dòng cần soạn · Tổng số lượng {preview.total_quantity}</p>
      {preview.warnings.map(w => <p key={w} role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{w}</p>)}
      {!preview.can_create && <p className="text-sm">Cần xử lý cảnh báo rồi bấm “Kiểm tra lại”. Quản lý kho có thể cấu hình vị trí lấy hàng ở phía trên.</p>}
      <ol className="max-h-72 overflow-auto space-y-2">{preview.items.map((line, index) => <li key={line.order_item_id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
        {index + 1}. <strong>{line.location_code || 'Chưa có vị trí'}</strong> · {line.sku} · {line.product_name} · {line.requested_quantity} {line.unit}
      </li>)}</ol>
      <label className="block">Ghi chú<textarea className={inputClass} value={notes} maxLength={2000} disabled={busy} onChange={e => setNotes(e.target.value)} /></label>
      <Button isLoading={busy} disabled={!preview.can_create} onClick={create}>Xác nhận tạo phiếu soạn</Button>
    </div>}
  </section>;
}
