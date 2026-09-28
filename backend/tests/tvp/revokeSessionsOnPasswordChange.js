/**
 * Mô phỏng bảng lưu trữ danh sách các phiên đăng nhập (Sessions)
 */
const mockSessions = [
  { sessionId: 'sess_current_123', userId: 'usr_101', device: 'Chrome - Windows', status: 'ACTIVE', createdAt: new Date('2026-09-28T08:00:00') },
  { sessionId: 'sess_other_456', userId: 'usr_101', device: 'Safari - iPhone', status: 'ACTIVE', createdAt: new Date('2026-09-27T10:00:00') },
  { sessionId: 'sess_other_789', userId: 'usr_101', device: 'Firefox - MacOS', status: 'ACTIVE', createdAt: new Date('2026-09-26T14:00:00') },
  { sessionId: 'sess_someone_else', userId: 'usr_102', device: 'Chrome - Android', status: 'ACTIVE', createdAt: new Date('2026-09-28T09:00:00') }
];

/**
 * Hàm thu hồi (vô hiệu hóa) các phiên đăng nhập khác sau khi người dùng đổi mật khẩu thành công
 * 
 * @param {string} userId - ID người dùng vừa đổi mật khẩu
 * @param {string} currentSessionId - ID của phiên làm việc hiện tại (đang thực hiện đổi mật khẩu)
 * @param {boolean} keepCurrentSession - Đặt true để giữ lại phiên hiện tại, false để đăng xuất tất cả
 * @returns {object} { revokedCount: number, message: string }
 */
function revokeOtherUserSessions(userId, currentSessionId, keepCurrentSession = true) {
  if (!userId) {
    return { revokedCount: 0, message: 'ID người dùng không hợp lệ.' };
  }

  let revokedCount = 0;

  // Duyệt qua danh sách các phiên để vô hiệu hóa
  mockSessions.forEach(session => {
    // Chỉ xử lý các phiên thuộc về người dùng vừa đổi mật khẩu và đang ACTIVE
    if (session.userId === userId && session.status === 'ACTIVE') {
      
      // Nếu chọn giữ phiên hiện tại
      if (keepCurrentSession && session.sessionId === currentSessionId) {
        // Giữ nguyên phiên hiện tại
        return;
      }

      // Vô hiệu hóa (thu hồi) phiên đăng nhập
      session.status = 'REVOKED';
      session.revokedAt = new Date();
      revokedCount++;
    }
  });

  return {
    revokedCount: revokedCount,
    message: keepCurrentSession
      ? `Đã thu hồi ${revokedCount} phiên đăng nhập trên các thiết bị khác. Giữ lại phiên hiện tại.`
      : `Đã thu hồi tất cả ${revokedCount} phiên đăng nhập.`
  };
}

/**
 * Mô phỏng API Đổi Mật Khẩu kèm Thu Hồi Phiên
 */
function changePasswordAPI(userId, currentSessionId, oldPassword, newPassword) {
  // 1. Giả định xác thực mật khẩu cũ thành công & cập nhật mật khẩu mới thành công...
  
  // 2. Thu hồi các phiên đăng nhập khác trên thiết bị khác
  const revocationResult = revokeOtherUserSessions(userId, currentSessionId, true);

  return {
    status: 200,
    success: true,
    message: 'Đổi mật khẩu thành công. ' + revocationResult.message,
    activeSessions: mockSessions.filter(s => s.userId === userId && s.status === 'ACTIVE')
  };
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
function runRevocationTests() {
  console.log('--- BẮT ĐẦU TEST THU HỒI PHIÊN ĐĂNG NHẬP SAU KHỔI ĐỔI MẬT KHẨU ---');

  console.log('\n[Trước khi đổi mật khẩu] Các phiên ACTIVE của usr_101:');
  console.log(mockSessions.filter(s => s.userId === 'usr_101' && s.status === 'ACTIVE'));

  // Thực hiện đổi mật khẩu từ phiên current_123
  console.log('\n[Thực hiện đổi mật khẩu] Từ phiên "sess_current_123":');
  const res = changePasswordAPI('usr_101', 'sess_current_123', 'OldPass123', 'NewPass2026');

  console.log('- Response status:', res.status);
  console.log('- Response message:', res.message);
  
  console.log('\n[Sau khi đổi mật khẩu] Các phiên ACTIVE còn lại của usr_101:');
  console.log(res.activeSessions);

  console.log('\n[Toàn bộ bảng Sessions của usr_101 trong DB]:');
  console.log(mockSessions.filter(s => s.userId === 'usr_101'));
}

// Chạy test
runRevocationTests();

module.exports = {
  revokeOtherUserSessions,
  changePasswordAPI
};