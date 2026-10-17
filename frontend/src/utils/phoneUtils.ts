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
 * Kiểm tra tính hợp lệ của số điện thoại di động hoặc cố định Việt Nam.
 * - Di động: đúng 10 chữ số, bắt đầu bằng các đầu số nhà mạng VN: 03, 05, 07, 08, 09
 * - Cố định: đúng 11 chữ số, bắt đầu bằng mã vùng 02 (Hà Nội 024, TP.HCM 028, v.v.)
 */
export const isValidVNPhoneNumber = (phone: string): boolean => {
  const cleaned = normalizeVNPhoneNumber(phone);
  // Đầu số di động Việt Nam (10 số) hoặc cố định (11 số đầu 02)
  const vnPhoneRegex = /^((03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])[0-9]{7}|02[0-9]{9})$/;
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

  const isLandline = cleaned.startsWith('02');
  const expectedLen = isLandline ? 11 : 10;

  if (cleaned.length !== expectedLen) {
    return {
      valid: false,
      message: isLandline
        ? `Số điện thoại cố định phải có đúng 11 chữ số (hiện tại có ${cleaned.length} số).`
        : `Số điện thoại phải có đúng 10 chữ số (hiện tại có ${cleaned.length} số).`,
    };
  }

  if (!isValidVNPhoneNumber(cleaned)) {
    return {
      valid: false,
      message: 'Đầu số điện thoại không hợp lệ. Vui lòng nhập đầu số mạng Việt Nam (03x, 05x, 07x, 08x, 09x hoặc cố định 02x).',
    };
  }

  return { valid: true, normalized: cleaned };
};

/**
 * Kiểm tra xem các ký tự đầu tiên có khớp với tiền tố hợp lệ của Việt Nam hay không (dùng khi người dùng đang gõ)
 */
export const isVNPrefixUnderConstruction = (input: string): { valid: boolean; message?: string } => {
  if (!input) return { valid: true };
  const cleaned = normalizeVNPhoneNumber(input);
  if (!cleaned) return { valid: true };
  if (!cleaned.startsWith('0')) {
    return { valid: false, message: 'Số điện thoại phải bắt đầu bằng số 0 (hoặc +84).' };
  }
  if (cleaned.length >= 2) {
    const p2 = cleaned.slice(0, 2);
    if (!['02', '03', '05', '07', '08', '09'].includes(p2)) {
      return {
        valid: false,
        message: 'Đầu số không thuộc mã vùng Việt Nam (hợp lệ: 03x, 05x, 07x, 08x, 09x hoặc 02x).',
      };
    }
  }
  if (cleaned.length >= 3 && !cleaned.startsWith('02')) {
    const p3 = cleaned.slice(0, 3);
    const validP3 = /^(03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])$/;
    if (!validP3.test(p3)) {
      return {
        valid: false,
        message: `Đầu số ${p3} không thuộc dải số được cấp phép tại Việt Nam.`,
      };
    }
  }
  return { valid: true };
};

/**
 * Lọc ký tự nhập vào ô số điện thoại, chỉ giữ lại chữ số (hoặc dấu + ở đầu)
 */
export const filterPhoneInput = (input: string): string => {
  return input.replace(/[^\d+]/g, '');
};

