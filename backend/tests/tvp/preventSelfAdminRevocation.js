/**
 * Hàm kiểm tra và ngăn chặn người dùng tự thu hồi vai trò ADMIN của chính mình
 * 
 * @param {string} currentUserId - ID của người dùng đang thực hiện thao tác (User đăng nhập)
 * @param {string} targetUserId - ID của người dùng bị thay đổi vai trò
 * @param {Array<string>} currentRoles - Danh sách vai trò hiện tại của targetUser
 * @param {Array<string>} newRoles - Danh sách vai trò mới định cập nhật
 * @returns {object} { allowed: boolean, message: string }
 */
function validateRoleUpdatePermission(currentUserId, targetUserId, currentRoles = [], newRoles = []) {
  // 1. Kiểm tra thao tác có phải do chính user thực hiện trên tài khoản của mình không
  const isSelfUpdate = (currentUserId === targetUserId);

  // 2. Kiểm tra xem user có đang sở hữu vai trò ADMIN không
  const isCurrentlyAdmin = currentRoles.includes('ADMIN');

  // 3. Kiểm tra xem danh sách vai trò mới có chứa ADMIN nữa không
  const remainsAdmin = newRoles.includes('ADMIN');

  // RÀNG BUỘC: Nếu tự sửa chính mình + hiện tại là ADMIN + danh sách mới KHÔNG còn ADMIN
  if (isSelfUpdate && isCurrentlyAdmin && !remainsAdmin) {
    return {
      allowed: false,
      message: 'Lỗi bảo mật: Bạn không thể tự xóa hoặc thu hồi vai trò Quản trị viên (ADMIN) của chính mình.'
    };
  }

  return {
    allowed: true,
    message: 'Xác thực quyền cập nhật vai trò hợp lệ.'
  };
}

/**
 * Mô phỏng API cập nhật vai trò người dùng
 */
function updateUserRolesAPI(operatorId, targetUserId, currentRoles, newRoles) {
  const permissionCheck = validateRoleUpdatePermission(operatorId, targetUserId, currentRoles, newRoles);

  if (!permissionCheck.allowed) {
    return {
      status: 403,
      success: false,
      error: permissionCheck.message
    };
  }

  return {
    status: 200,
    success: true,
    message: 'Cập nhật vai trò thành công.',
    updatedUser: {
      userId: targetUserId,
      roles: newRoles,
      updatedAt: new Date()
    }
  };
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
function runSelfRevocationTests() {
  console.log('--- BẮT ĐẦU TEST NGĂN TỰ THU HỒI VAI TRÒ ADMIN ---');

  // Test 1: Admin tự hạ quyền của chính mình xuống SALES (Phải bị chặn)
  console.log('\n[Test 1] ADMIN tự gỡ vai trò ADMIN của chính mình:');
  const res1 = updateUserRolesAPI('admin_1', 'admin_1', ['ADMIN', 'SALES'], ['SALES']);
  console.log('- Status:', res1.status);
  console.log('- Thông báo:', res1.error);

  // Test 2: Admin gỡ vai trò ADMIN của một Admin khác (Được phép)
  console.log('\n[Test 2] ADMIN gỡ vai trò ADMIN của tài khoản Admin khác (admin_2):');
  const res2 = updateUserRolesAPI('admin_1', 'admin_2', ['ADMIN', 'WAREHOUSE'], ['WAREHOUSE']);
  console.log('- Status:', res2.status);
  console.log('- Thông báo:', res2.message);

  // Test 3: Admin tự cập nhật thêm vai trò khác cho mình nhưng VẪN GIỮ ADMIN (Được phép)
  console.log('\n[Test 3] ADMIN tự thêm vai trò WAREHOUSE cho mình (vẫn giữ ADMIN):');
  const res3 = updateUserRolesAPI('admin_1', 'admin_1', ['ADMIN'], ['ADMIN', 'WAREHOUSE']);
  console.log('- Status:', res3.status);
  console.log('- Thông báo:', res3.message);
}

// Chạy test
runSelfRevocationTests();

module.exports = {
  validateRoleUpdatePermission,
  updateUserRolesAPI
};