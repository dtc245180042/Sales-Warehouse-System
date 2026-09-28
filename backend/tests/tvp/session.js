const jwt = require('jsonwebtoken');

// Cấu hình thời gian
const SECRET_KEY = 'your_super_secret_key'; // Khóa bí mật dùng cho JWT
const SESSION_DURATION_MINUTES = 30; // Thời gian sống của 1 phiên (30 phút)
const SLIDING_WINDOW_MINUTES = 10;   // Chỉ gia hạn nếu token còn dưới 10 phút hiệu lực

/**
 * 1. Khởi tạo một Session Token mới cho người dùng
 * @param {object} payload - Thông tin user (ví dụ: { userId, role })
 * @returns {string} token
 */
function createSessionToken(payload) {
  return jwt.sign(payload, SECRET_KEY, {
    expiresIn: `${SESSION_DURATION_MINUTES}m`
  });
}

/**
 * 2. Middleware / Function kiểm tra hoạt động và gia hạn phiên (Sliding Expiration)
 * @param {string} token - Token gửi từ Client
 * @returns {object} { isValid: boolean, newToken: string|null, user: object|null, message: string }
 */
function verifyAndRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const timeRemainingSeconds = decoded.exp - nowInSeconds;
    const slidingWindowSeconds = SLIDING_WINDOW_MINUTES * 60;

    let newToken = null;

    if (timeRemainingSeconds < slidingWindowSeconds) {
      const { iat, exp, ...userPayload } = decoded;
      newToken = createSessionToken(userPayload);
    }

    return {
      isValid: true,
      user: decoded,
      newToken: newToken,
      message: newToken ? 'Phiên hoạt động đã được gia hạn tự động.' : 'Phiên vẫn còn hiệu lực.'
    };

  } catch (error) {
    return {
      isValid: false,
      user: null,
      newToken: null,
      message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.'
    };
  }
}

// Chạy test mô phỏng
function runSessionTests() {
  console.log('--- BẮT ĐẦU TEST CƠ CHẾ GIA HẠN PHIÊN TỰ ĐỘNG ---');
  const mockUser = { userId: 'user_456', role: 'admin' };
  const token = createSessionToken(mockUser);
  console.log('\n[1] Khởi tạo Token phiên làm việc mới:', token.substring(0, 30) + '...');

  const check1 = verifyAndRefreshToken(token);
  console.log('[2] Kiểm tra ngay sau đó:', check1.message);
}

runSessionTests();

module.exports = {
  createSessionToken,
  verifyAndRefreshToken
};