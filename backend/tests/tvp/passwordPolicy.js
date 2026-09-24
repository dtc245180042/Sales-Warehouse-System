const bcrypt = require('bcryptjs');

/**
 * 1. Kiểm tra quy tắc độ mạnh của mật khẩu
 * - Tối thiểu 8 ký tự
 * - Phải chứa ít nhất 1 chữ cái
 * - Phải chứa ít nhất 1 chữ số
 * @param {string} password 
 * @returns {object} { isValid: boolean, message: string }
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: 'Mật khẩu không được để trống.' };
  }

  // Ràng buộc 1: Tối thiểu 8 ký tự
  if (password.length < 8) {
    return { isValid: false, message: 'Mật khẩu phải có độ dài tối thiểu 8 ký tự.' };
  }

  // Ràng buộc 2: Phải chứa ít nhất 1 chữ cái (a-z, A-Z)
  const hasLetter = /[a-zA-Z]/.test(password);
  if (!hasLetter) {
    return { isValid: false, message: 'Mật khẩu phải chứa ít nhất một chữ cái.' };
  }

  // Ràng buộc 3: Phải chứa ít nhất 1 chữ số (0-9)
  const hasNumber = /[0-9]/.test(password);
  if (!hasNumber) {
    return { isValid: false, message: 'Mật khẩu phải chứa ít nhất một chữ số.' };
  }

  return { isValid: true, message: 'Mật khẩu đạt yêu cầu độ mạnh.' };
}

/**
 * 2. Chuẩn hóa và Băm (Hash) mật khẩu bằng bcrypt trước khi lưu vào DB
 * @param {string} rawPassword 
 * @returns {Promise<string>} hashedPassword
 */
async function hashPassword(rawPassword) {
  // Kiểm tra quy tắc trước khi hash
  const validation = validatePasswordStrength(rawPassword);
  if (!validation.isValid) {
    throw new Error(validation.message);
  }

  // Tạo salt và băm mật khẩu
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);
  return hashedPassword;
}

/**
 * 3. So sánh mật khẩu người dùng nhập với mật khẩu đã hash trong DB
 * @param {string} plainPassword 
 * @param {string} hashedPassword 
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

// ==========================================
// Test Cases chạy thử nghiệm
// ==========================================
async function runPasswordPolicyTests() {
  console.log('--- BẮT ĐẦU TEST XÁC THỰC VÀ HASH MẬT KHẨU ---');

  const testCases = [
    '1234567',       // Lỗi: Ngắn hơn 8 ký tự
    'abcdefgh',      // Lỗi: Không có chữ số
    '12345678',      // Lỗi: Không có chữ cái
    'Password123'    // Hợp lệ: Đủ 8 ký tự, có cả chữ và số
  ];

  for (const pwd of testCases) {
    const result = validatePasswordStrength(pwd);
    console.log(`\nKiểm tra mật khẩu "${pwd}":`);
    console.log(`- Hợp lệ: ${result.isValid}`);
    console.log(`- Thông báo: ${result.message}`);
  }

  // Test Hash mật khẩu hợp lệ
  console.log('\n--- TEST HASH VÀ VERIFY MẬT KHẨU HỢP LỆ ---');
  try {
    const validPassword = 'UserSecurePass2026';
    const hashed = await hashPassword(validPassword);
    console.log('Mật khẩu gốc:', validPassword);
    console.log('Mật khẩu sau khi hash (lưu DB):', hashed);

    const isMatched = await verifyPassword(validPassword, hashed);
    console.log('Xác thực lại mật khẩu vừa hash:', isMatched ? 'Thành công (Khớp)' : 'Thất bại');
  } catch (error) {
    console.error('Lỗi:', error.message);
  }
}

// Chạy test
runPasswordPolicyTests();

module.exports = {
  validatePasswordStrength,
  hashPassword,
  verifyPassword
};