export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('vi-VN').format(num);
};

/**
 * Chuyển đổi an toàn chuỗi ngày/giờ ISO từ API sang Date object.
 * Nếu chuỗi thiếu hậu tố timezone (ví dụ từ SQLite naive datetime), tự động gắn 'Z' (UTC).
 */
export const parseIsoDate = (dateString?: string | null): Date | null => {
  if (!dateString) return null;
  let s = String(dateString).trim();
  if (!s) return null;
  if (!s.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
    s += 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

export const formatDateTime = (dateString?: string | null): string => {
  const d = parseIsoDate(dateString);
  if (!d) return '-';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  try {
    const d = parseIsoDate(dateString);
    if (!d) return dateString;
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
};

export const formatDateOnly = (dateString: string): string => {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
};

export const generateId = (prefix: string = 'ID'): string => {
  return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
};

/**
 * Định dạng số thành chuỗi phân cách hàng nghìn bằng dấu chấm khi nhập tiền (VD: 1000000 -> "1.000.000")
 */
export const formatCurrencyInput = (value: number | string | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '';
  const clean = value.toString().replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/**
 * Chuyển chuỗi tiền có dấu chấm phân cách hàng nghìn thành số nguyên (VD: "1.000.000" -> 1000000)
 */
export const parseCurrencyInput = (formattedValue: string | undefined | null): number => {
  if (!formattedValue) return 0;
  const clean = formattedValue.toString().replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return clean ? parseInt(clean, 10) : 0;
};

