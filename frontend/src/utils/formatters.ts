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
 * Chuyển đổi an toàn chuỗi ngày giờ từ API thành Date object.
 * Tự động bù múi giờ UTC nếu chuỗi ISO từ SQLite thiếu hậu tố 'Z' hoặc offset.
 */
export const parseSafeDate = (val: string | Date | undefined | null): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  let str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str) && !str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) {
    str += 'Z';
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

export const parseIsoDate = (dateString?: string | null): Date | null => {
  return parseSafeDate(dateString);
};

export const formatDateTime = (dateString?: string | Date | null): string => {
  const d = parseSafeDate(dateString);
  if (!d) return '-';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDate = (dateString: string | Date | undefined | null): string => {
  if (!dateString) return '-';
  try {
    const d = parseSafeDate(dateString);
    if (!d) return String(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return String(dateString);
  }
};
};

export const formatDateOnly = (dateString: string | Date | undefined | null): string => {
  if (!dateString) return '-';
  try {
    let s = typeof dateString === 'string' ? dateString.trim() : new Date(dateString).toISOString();
    if (!s.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return String(dateString);
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

