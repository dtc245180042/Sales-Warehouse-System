import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RefreshCw, MapPin, CheckCircle, History } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../contexts/AuthContext';
import {
  pickingApi, readPickingCache, loadPickingCache, PickingDetail, PickingItem, PickingHistory, PickingPage,
} from '../../api/pickingLists';
import { PickingPagination, pickingStatus } from './PickingListsPage';

const inputClass = 'w-full min-h-12 rounded-lg border border-slate-300 bg-white p-3 text-slate-900 dark:bg-slate-900 dark:text-white dark:border-slate-600';

export function PickingDetailPage() {
  const { id = '' } = useParams();
  return <PickingDetailContent key={id} id={id} />;
}

function PickingDetailContent({ id }: { id: string }) {
  const { user } = useAuth();
  const key = `picking-detail:${user?.id}:${id}`;
  const [sheet, setSheet] = useState<PickingDetail | undefined>(() => readPickingCache(key));
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    let active = true;
    loadPickingCache(key, () => pickingApi.detail(id)).then(value => {
      if (active) { setSheet(value); setError(''); }
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id, key, refresh]);
  const cancel = async (event: React.FormEvent) => {
    event.preventDefault(); setCancelling(true); setError('');
    try { setSheet(await pickingApi.cancel(id, cancelReason)); setShowCancel(false); }
    catch (err) { setError((err as Error).message); } finally { setCancelling(false); }
  };
  const saveItem = async (item: PickingItem, quantity: number, reason: string) => {
    setUpdating(true);
    try {
      const result = await pickingApi.update(id, item, quantity, reason);
      setSheet(result);
      setRefresh(v => v + 1);
    } finally { setUpdating(false); }
  };
  const codes = new Map(sheet?.orders.map(o => [o.id, o.code]));
  return <PageContainer title="Chi tiết phiếu soạn" subtitle={sheet ? `${sheet.id} · ${sheet.warehouse_name}` : id}
    actions={<><Link to="/inventory/picking-lists" className="min-h-11 flex items-center text-blue-700">← Danh sách</Link>
      <Button variant="outline" disabled={updating || cancelling} leftIcon={<RefreshCw size={16} />} onClick={() => setRefresh(v => v + 1)}>Làm mới</Button></>}>
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {!sheet && !error && <p role="status">Đang tải phiếu soạn…</p>}
      {sheet && <>
        <section className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-700">
          <p className="font-bold">{pickingStatus[sheet.status]} · {sheet.completed_lines}/{sheet.total_lines} dòng đã xử lý</p>
          <progress className="w-full" aria-label="Tiến độ soạn hàng" value={sheet.completed_lines} max={sheet.total_lines || 1} />
          <p>Đã soạn {sheet.picked_quantity}/{sheet.total_quantity} · Thiếu {sheet.shortfall_quantity}</p>
          <p className="text-sm break-words">Đơn nguồn: {sheet.orders.map(o => o.code).join(', ')}</p>
          {sheet.notes && <p className="text-sm whitespace-pre-wrap">Ghi chú: {sheet.notes}</p>}
          <p className="text-sm text-slate-500">Hàng đã soạn tiếp tục được giữ chỗ. Số lượng thiếu vẫn giữ chỗ cho đơn; tồn vật lý được trừ khi xuất kho.</p>
        </section>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <label className="flex min-h-11 items-center gap-2"><input className="h-5 w-5" type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />Chỉ hiện dòng chưa soạn</label>
          <Button variant="outline" leftIcon={<History size={16} />} onClick={() => setShowHistory(!showHistory)}>Lịch sử thay đổi</Button>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {sheet.items.filter(i => !onlyPending || i.status === 'pending').map((item, index) => <PickingItemCard
            key={`${item.id}:${item.version}`} item={item} position={index + 1} orderCode={codes.get(item.order_id) || item.order_id}
            disabled={sheet.status === 'cancelled' || updating || cancelling} onSave={saveItem} />)}
        </div>
        {onlyPending && sheet.items.every(i => i.status !== 'pending') && <p role="status" className="rounded-lg bg-green-50 p-4 text-green-800">Tất cả dòng hàng đã được xử lý.</p>}
        {showHistory && <PickingHistoryPanel id={id} refresh={refresh} items={sheet.items} />}
        {sheet.status !== 'completed' && sheet.status !== 'cancelled' && <section className="border-t pt-5">
          <Button variant="outline" disabled={updating || cancelling} onClick={() => setShowCancel(!showCancel)}>Hủy phiếu soạn</Button>
          {showCancel && <form onSubmit={cancel} className="mt-3 space-y-3">
            <p className="text-sm">Hãy trả hàng đã lấy về đúng vị trí trước khi hủy. Đơn nguồn sẽ được phép lập phiếu mới; giữ chỗ của đơn vẫn được giữ nguyên.</p>
            <label className="block">Lý do hủy<textarea className={inputClass} required maxLength={2000} value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></label>
            <Button type="submit" isLoading={cancelling} disabled={!cancelReason.trim() || updating}>Xác nhận hủy phiếu</Button>
          </form>}
        </section>}
      </>}
    </div>
  </PageContainer>;
}

function PickingItemCard({ item, position, orderCode, disabled, onSave }: {
  item: PickingItem; position: number; orderCode: string; disabled: boolean;
  onSave: (item: PickingItem, quantity: number, reason: string) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(item.status === 'pending' ? String(item.requested_quantity) : String(item.picked_quantity));
  const [reason, setReason] = useState(item.shortfall_reason || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const actual = quantity === '' ? NaN : Number(quantity);
  const isShort = actual < item.requested_quantity;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!Number.isInteger(actual) || actual < 0 || actual > item.requested_quantity) {
      setError('Số lượng phải là số nguyên từ 0 đến số lượng yêu cầu.'); return;
    }
    if (isShort && !reason.trim()) { setError('Bắt buộc nhập lý do soạn thiếu.'); return; }
    setBusy(true);
    try { await onSave(item, actual, reason.trim()); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <article className={`rounded-xl border p-4 sm:p-5 space-y-4 bg-white dark:bg-slate-900 ${item.status === 'short' ? 'border-amber-400' : 'border-slate-200 dark:border-slate-700'}`}>
    <div className="flex flex-wrap justify-between gap-2"><span className="flex items-center gap-2 text-lg font-bold text-blue-700"><MapPin size={20} />{position}. {item.location_code}</span>
      <span className="text-sm">{pickingStatus[item.status] || item.status}</span></div>
    <div><h2 className="font-bold break-words">{item.product_name}</h2><p className="text-sm text-slate-500 break-words">{item.sku} · Đơn {orderCode} · Thứ tự vị trí {item.route_sequence}</p></div>
    <p className="text-lg">Cần lấy: <strong>{item.requested_quantity} {item.unit}</strong></p>
    <form onSubmit={save} className="space-y-3">
      <label className="block font-semibold" htmlFor={`quantity-${item.id}`}>Số lượng thực soạn</label>
      <input id={`quantity-${item.id}`} className={inputClass} type="number" inputMode="numeric" min={0} max={item.requested_quantity} step={1} required
        disabled={disabled || busy} value={quantity} onChange={e => setQuantity(e.target.value)} />
      {isShort && <label className="block">Lý do soạn thiếu <span className="text-red-600">*</span>
        <textarea aria-label={`Lý do soạn thiếu ${item.sku}`} className={inputClass} required maxLength={2000} disabled={disabled || busy}
          value={reason} onChange={e => setReason(e.target.value)} placeholder="Ví dụ: Không tìm thấy hàng ở vị trí lưu" />
        <span className="text-sm text-amber-700">Thiếu {item.requested_quantity - actual} {item.unit}</span>
      </label>}
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <Button type="submit" className="w-full min-h-12" leftIcon={<CheckCircle size={18} />} isLoading={busy} disabled={disabled}>
        {item.status === 'pending' ? 'Xác nhận đã soạn dòng này' : 'Lưu điều chỉnh số thực soạn'}
      </Button>
    </form>
  </article>;
}

function PickingHistoryPanel({ id, refresh, items }: { id: string; refresh: number; items: PickingItem[] }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PickingPage<PickingHistory> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    pickingApi.history(id, page).then(value => { if (active) { setData(value); setError(''); } })
      .catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id, page, refresh]);
  const skuMap = new Map(items.map(i => [i.id, i.sku]));
  return <section className="rounded-xl border p-4 space-y-3 dark:border-slate-700">
    <h2 className="font-bold text-lg">Lịch sử thay đổi từng dòng</h2>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data?.items.length === 0 && <p>Chưa có thay đổi.</p>}
    {data?.items.map(row => <div key={row.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
      <p className="font-semibold">{skuMap.get(row.item_id)} · {new Date(row.changed_at).toLocaleString('vi-VN')} · Người dùng #{row.changed_by}</p>
      <p>Thực soạn: {row.old_quantity} → {row.new_quantity} · Thiếu: {row.old_shortfall} → {row.new_shortfall}</p>
      <p>{pickingStatus[row.old_status]} → {pickingStatus[row.new_status]}</p>
      {(row.old_reason || row.new_reason) && <p className="whitespace-pre-wrap break-words">Lý do: {row.old_reason || '(trống)'} → {row.new_reason || '(trống)'}</p>}
    </div>)}
    {data && <PickingPagination page={page} pages={data.total_pages} onChange={setPage} />}
  </section>;
}
