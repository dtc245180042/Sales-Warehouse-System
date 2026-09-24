const crypto = require('crypto');

/**
 * 1. Tạo token và lưu thông tin reset password
 * @param {string} userId - ID của người dùng yêu cầu reset
 * @returns {object} { rawToken, tokenRecord }
 */
function createPasswordResetToken(userId) {
  // Tạo token ngẫu nhiên (dùng để gửi qua email cho user)
  const rawToken = crypto.randomBytes(32).toString('hex');

  // Hash token trước khi lưu vào DB (đảm bảo bảo mật)
  const hashedToken = crypto
    .createHash('sha256')
    .update(rawToken)
    .digest('hex');

  // Thời gian hết hạn: 30 phút kể từ hiện tại
  const EXPIRE_DURATION_MINUTES = 30;
  const expiresAt = new Date(Date.now() + EXPIRE_DURATION_MINUTES * 60 * 1000);

  // Đối tượng bản ghi chuẩn bị lưu vào Database
  const tokenRecord = {
    userId: userId,
    tokenHash: hashedToken,
    expiresAt: expiresAt,
    isUsed: false,
    createdAt: new Date()
  };

  return {
    rawToken,
    tokenRecord
  };
}

/**
 * 2. Kiểm tra tính hợp lệ của token và đánh dấu đã sử dụng (chỉ dùng 1 lần)
 * @param {string} inputToken - Token người dùng gửi lên từ email/form
 * @param {object} storedRecord - Bản ghi token lấy từ Database lên
 * @returns {object} { isValid: boolean, message: string }
 */
function verifyAndConsumeToken(inputToken, storedRecord) {
  if (!storedRecord) {
    return { isValid: false, message: 'Token không tồn tại.' };
  }

  // Hash token người dùng gửi lên để so sánh với DB
  const hashedInput = crypto
    .createHash('sha256')
    .update(inputToken)
    .digest('hex');

  if (hashedInput !== storedRecord.tokenHash) {
    return { isValid: false, message: 'Token không chính xác.' };
  }

  // Ràng buộc 1: Kiểm tra xem đã sử dụng chưa
  if (storedRecord.isUsed) {
    return { isValid: false, message: 'Token này đã được sử dụng trước đó.' };
  }

  // Ràng buộc 2: Kiểm tra thời hạn 30 phút
  if (new Date() > new Date(storedRecord.expiresAt)) {
    return { isValid: false, message: 'Token đã hết hạn (quá 30 phút).' };
  }

  // Đánh dấu token đã được sử dụng thành công (đảm bảo chỉ dùng 1 lần)
  storedRecord.isUsed = true;

  return { isValid: true, message: 'Token hợp lệ và đã được xác thực thành công.' };
}

// Unit tests / Ví dụ chạy thử
function runTests() {
  console.log('--- BẮT ĐẦU TEST RESET PASSWORD TOKEN ---');

  // Test Case 1: Tạo token thành công
  const userId = 'user_12345';
  const { rawToken, tokenRecord } = createPasswordResetToken(userId);
  console.log('\n[1] Tạo token thành công:');
  console.log('- Raw Token (gửi mail):', rawToken);
  console.log('- Record lưu DB:', tokenRecord);

  // Test Case 2: Verify đúng token (Lần 1 - Thành công)
  const result1 = verifyAndConsumeToken(rawToken, tokenRecord);
  console.log('\n[2] Xác nhận lần 1 (Đúng token):', result1.message);

  // Test Case 3: Re-use token (Lần 2 - Phải thất bại vì ràng buộc dùng 1 lần)
  const result2 = verifyAndConsumeToken(rawToken, tokenRecord);
  console.log('\n[3] Xác nhận lần 2 (Token đã dùng):', result2.message);

  // Test Case 4: Token sai
  const result3 = verifyAndConsumeToken('token_sai_123', tokenRecord);
  console.log('\n[4] Xác nhận token sai:', result3.message);
}

// Chạy test nếu gọi trực tiếp file này
runTests();

module.exports = {
  createPasswordResetToken,
  verifyAndConsumeToken
};