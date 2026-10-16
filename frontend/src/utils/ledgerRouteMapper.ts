/**
 * Utility to map inventory movement types and reference codes to app routes
 * SCRUM-650: Điều hướng chứng từ gốc từ thẻ kho
 */

export interface MovementRouteInfo {
  route: string;
  tooltip: string;
}

export function mapMovementTypeToRoute(
  movementType?: string,
  referenceCode?: string
): string | null {
  if (!referenceCode) return null;
  const mt = (movementType || '').toUpperCase();
  const code = referenceCode.trim();

  // 1. Nhập kho từ NCC / Hoàn kho
  if (mt === 'IN_PURCHASE' || mt === 'IN_RETURN' || mt.startsWith('IN_') || mt === 'IN') {
    return `/inventory/stock-in?search=${encodeURIComponent(code)}`;
  }

  // 2. Xuất bán hàng
  if (mt === 'OUT_SALE' || mt.startsWith('OUT_') || mt === 'OUT') {
    return `/orders/${encodeURIComponent(code)}`;
  }

  // 3. Chuyển kho nội bộ
  if (mt.startsWith('TRANSFER') || code.startsWith('PCK-') || code.startsWith('CK-') || code.startsWith('TRF-')) {
    return `/inventory/transfers/${encodeURIComponent(code)}`;
  }

  // 4. Điều chỉnh kiểm kê / cân đối
  if (
    mt.startsWith('ADJUST') ||
    code.startsWith('DC-') ||
    code.startsWith('DCXK-') ||
    code.startsWith('ADJ-')
  ) {
    return `/inventory/adjustments/${encodeURIComponent(code)}`;
  }

  // 5. Phiếu hoàn trả
  if (mt.startsWith('REVERSAL') || mt.includes('REVERSAL')) {
    if (code.startsWith('ORD') || code.startsWith('HDR') || code.startsWith('SO')) {
      return `/orders/${encodeURIComponent(code)}`;
    }
    return `/inventory/stock-in?search=${encodeURIComponent(code)}`;
  }

  // 6. Phiếu kiểm kê
  if (mt.startsWith('STOCKTAKE') || mt.startsWith('TAKE') || code.startsWith('KK-') || code.startsWith('ST-')) {
    return `/inventory/stock-takes?search=${encodeURIComponent(code)}`;
  }

  // Prefix fallback matching based on reference code if movement type wasn't clear
  if (code.startsWith('ORD-') || code.startsWith('SO-') || code.startsWith('POS-')) {
    return `/orders/${encodeURIComponent(code)}`;
  }
  if (code.startsWith('PNK-') || code.startsWith('GRN-')) {
    return `/inventory/stock-in?search=${encodeURIComponent(code)}`;
  }

  return null;
}

export function getMovementTypeTooltip(movementType?: string, referenceCode?: string): string {
  const mt = (movementType || '').toUpperCase();
  const code = (referenceCode || '').toUpperCase();

  if (mt === 'IN_PURCHASE') return 'Phiếu nhập kho từ nhà cung cấp';
  if (mt === 'IN_RETURN') return 'Phiếu nhập hoàn hàng';
  if (mt.startsWith('IN_') || mt === 'IN') return 'Phiếu nhập kho';
  if (mt === 'OUT_SALE' || code.startsWith('ORD-')) return 'Đơn bán hàng';
  if (mt.startsWith('OUT_') || mt === 'OUT') return 'Phiếu xuất kho';
  if (mt.startsWith('TRANSFER') || code.startsWith('PCK-')) return 'Phiếu chuyển kho nội bộ';
  if (mt.startsWith('ADJUST') || code.startsWith('DC-')) return 'Phiếu điều chỉnh tồn kho';
  if (mt.startsWith('REVERSAL')) return 'Phiếu hoàn trả/đảo bút toán';
  if (mt.startsWith('STOCKTAKE') || code.startsWith('KK-')) return 'Phiếu kiểm kê kho';

  return 'Chứng từ giao dịch kho';
}
