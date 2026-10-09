/**
 * Tiện ích kiểm tra và chuẩn hóa số điện thoại Việt Nam
 * Đáp ứng SCRUM-210 / SCRUM-358 / SCRUM-361
 */

/**
 * Chuẩn hóa số điện thoại: loại bỏ khoảng trắng, dấu gạch ngang, dấu chấm
 * và chuyển đổi đầu số quốc tế (+84 / 84) về dạng đầu 0 chuẩn.
 */
export const normalizeVNPhoneNumber = (phone: string): string => {
  if (!phone) return '';
  let cleaned = phone.trim().replace(/[\s.\-()]/g, '');
  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
};

/**
 * Kiểm tra tính hợp lệ của số điện thoại di động Việt Nam.
 * - Độ dài: đúng 10 chữ số
 * - Bắt đầu bằng các đầu số nhà mạng VN: 03, 05, 07, 08, 09
 */
export const isValidVNPhoneNumber = (phone: string): boolean => {
  const cleaned = normalizeVNPhoneNumber(phone);
  // Đầu số di động Việt Nam gồm 10 số: 03x, 05x, 07x, 08x, 09x
  const vnPhoneRegex = /^(03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])[0-9]{7}$/;
  return vnPhoneRegex.test(cleaned);
};

/**
 * Kiểm tra và trả về thông báo lỗi chi tiết nếu không hợp lệ
 */
export const validateVNPhoneNumber = (
  phone: string
): { valid: boolean; message?: string; normalized?: string } => {
  if (!phone || !phone.trim()) {
    return { valid: false, message: 'Số điện thoại không được để trống.' };
  }

  const cleaned = normalizeVNPhoneNumber(phone);

  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, message: 'Số điện thoại chỉ được chứa các chữ số.' };
  }

  if (cleaned.length !== 10) {
    return {
      valid: false,
      message: `Số điện thoại phải có đúng 10 chữ số (hiện tại có ${cleaned.length} số).`,
    };
  }

  if (!isValidVNPhoneNumber(cleaned)) {
    return {
      valid: false,
      message: 'Đầu số điện thoại không hợp lệ. Vui lòng nhập đầu số mạng Việt Nam (03, 05, 07, 08, 09).',
    };
  }

  return { valid: true, normalized: cleaned };
};
