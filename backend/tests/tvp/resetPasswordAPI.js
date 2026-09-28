const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Mô phỏng Cơ sở dữ liệu tạm thời
const mockDatabase = {
  users: [
    { id: 'user_101', email: 'user@example.com', passwordHash: bcrypt.hashSync('OldPass123', 10) }
  ],
  resetTokens: []
};

function createResetToken(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new TypeError('userId phải là chuỗi không rỗng.');
  }
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenRecord = {
    userId,
    tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    isUsed: false
  };
  mockDatabase.resetTokens.push(tokenRecord);
  return { rawToken, tokenRecord };
}

/**
 * Hàm kiểm tra độ mạnh mật khẩu cơ bản (tối thiểu 8 ký tự, có chữ và số)
 */
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

/**
 * API Handler: Xác nhận token và đổi mật khẩu mới (SCRUM-298)
 * 
 * @param {string} rawToken - Token nhận từ URL người dùng gửi lên
 * @param {string} newPassword - Mật khẩu mới người dùng nhập
 * @returns {Promise<object>} { status: number, message: string }
 */
async function handleResetPasswordAPI(rawToken, newPassword) {
  // 1. Kiểm tra đầu vào
  if (typeof rawToken !== 'string' || typeof newPassword !== 'string' || !rawToken || !newPassword) {
    return { status: 400, message: 'Thiếu token hoặc mật khẩu mới.' };
  }

  // 2. Validate độ mạnh mật khẩu
  if (!validatePassword(newPassword)) {
    return { status: 400, message: 'Mật khẩu mới phải có tối thiểu 8 ký tự, bao gồm cả chữ và số.' };
  }

  // Hash token gửi lên để tìm kiếm trong DB
  const hashedInputToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Tìm bản ghi token trong Database
  const hashedBuffer = Buffer.from(hashedInputToken, 'hex');
  const tokenRecord = mockDatabase.resetTokens.find(t => {
    const expectedBuffer = Buffer.from(t.tokenHash, 'hex');
    return expectedBuffer.length === hashedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, hashedBuffer);
  });

  // 3. Kiểm tra token có tồn tại không
  if (!tokenRecord) {
    return { status: 404, message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc không tồn tại.' };
  }

  // 4. Kiểm tra token đã được sử dụng chưa
  if (tokenRecord.isUsed) {
    return { status: 400, message: 'Liên kết này đã được sử dụng trước đó. Vui lòng gửi yêu cầu mới.' };
  }

  // 5. Kiểm tra thời hạn token
  if (new Date() >= new Date(tokenRecord.expiresAt)) {
    return { status: 400, message: 'Liên kết đặt lại mật khẩu đã hết hạn (quá 30 phút).' };
  }

  // 6. Tìm thông tin người dùng tương ứng
  const user = mockDatabase.users.find(u => u.id === tokenRecord.userId);
  if (!user) {
    return { status: 404, message: 'Không tìm thấy tài khoản người dùng.' };
  }

  // 7. Băm (hash) mật khẩu mới bằng bcrypt
  tokenRecord.isUsed = true;
  let newHashedPassword;
  try {
    newHashedPassword = await bcrypt.hash(newPassword, 10);
  } catch (error) {
    tokenRecord.isUsed = false;
    throw error;
  }

  user.passwordHash = newHashedPassword;
  return { 
    status: 200, 
    message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' 
  };
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
async function runAPITests() {
  console.log('--- BẮT ĐẦU TEST API XÁC NHẬN TOKEN VÀ CẬP NHẬT MẬT KHẨU (SCRUM-298) ---');

  // Test 1: Đổi mật khẩu thành công bằng token hợp lệ
  console.log('\n[Test 1] Đổi mật khẩu thành công:');
  const { rawToken, tokenRecord } = createResetToken('user_101');
  const res1 = await handleResetPasswordAPI(rawToken, 'NewPass2026');
  console.log('- Status Code:', res1.status);
  console.log('- Response Message:', res1.message);

  // Test 2: Tái sử dụng lại đúng token đó lần thứ 2 (Phải thất bại)
  console.log('\n[Test 2] Thử dùng lại token đã xài rồi:');
  const res2 = await handleResetPasswordAPI(rawToken, 'AnotherPass2026');
  console.log('- Status Code:', res2.status);
  console.log('- Response Message:', res2.message);

  // Test 3: Truyền token sai/không tồn tại
  console.log('\n[Test 3] Truyền token không tồn tại:');
  const res3 = await handleResetPasswordAPI('wrong_token_999', 'NewPass2026');
  console.log('- Status Code:', res3.status);
  console.log('- Response Message:', res3.message);
}

// Chạy test
if (require.main === module) {
  runAPITests();
}

module.exports = {
  handleResetPasswordAPI,
  createResetToken
};