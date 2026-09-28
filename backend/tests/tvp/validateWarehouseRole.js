/**
 * Mô phỏng danh sách kho/địa bàn hợp lệ trong hệ thống
 */
const { VALID_WAREHOUSE_IDS } = require('./warehouseData');

/**
 * Hàm validation kiểm tra ràng buộc vai trò kho
 * @param {object} userData - Thông tin người dùng cần kiểm tra { roles, assignedWarehouses }
 * @returns {object} { isValid: boolean, message: string }
 */
function validateWarehouseRoleConstraint(userData) {
  if (!userData) {
    return { isValid: false, message: 'Dữ liệu người dùng không hợp lệ.' };
  }

  const { roles = [], assignedWarehouses = [] } = userData;
  if (!Array.isArray(roles) || !Array.isArray(assignedWarehouses)) {
    return { isValid: false, message: 'Vai trò và danh sách kho phải có định dạng mảng.' };
  }

  // Kiểm tra xem người dùng có giữ vai trò KHO (WAREHOUSE) hay không
  const isWarehouseRole = roles.includes('WAREHOUSE');

  if (isWarehouseRole) {
    // 1. Kiểm tra danh sách kho không được rỗng
    if (!Array.isArray(assignedWarehouses) || assignedWarehouses.length === 0) {
      return {
        isValid: false,
        message: 'Lỗi validation: Tài khoản thuộc vai trò kho phải được gắn tối thiểu một kho hoặc địa bàn.'
      };
    }

    // 2. Kiểm tra xem các kho được gắn có nằm trong danh sách kho hợp lệ của hệ thống hay không
    const invalidWarehouses = assignedWarehouses.filter(
      warehouseId => !VALID_WAREHOUSE_IDS.includes(warehouseId)
    );

    if (invalidWarehouses.length > 0) {
      return {
        isValid: false,
        message: `Lỗi validation: Kho/địa bàn [${invalidWarehouses.join(', ')}] không tồn tại hoặc không hợp lệ.`
      };
    }
  }

  return {
    isValid: true,
    message: 'Xác thực ràng buộc vai trò thành công.'
  };
}

/**
 * Hàm mô phỏng lưu người dùng vào Database sau khi validate
 * @param {object} userData 
 * @returns {object}
 */
function saveUser(userData) {
  const validation = validateWarehouseRoleConstraint(userData);

  if (!validation.isValid) {
    return {
      success: false,
      error: validation.message
    };
  }

  return {
    success: true,
    message: 'Lưu thông tin người dùng thành công.',
    data: userData
  };
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
function runValidationTests() {
  console.log('--- BẮT ĐẦU TEST RÀNG BUỘC VAI TRÒ KHO ---');

  // Test 1: Vai trò Bán hàng (Không cần kho) -> Thành công
  console.log('\n[Test 1] User vai trò SALES (không gắn kho):');
  const res1 = saveUser({ roles: ['SALES'], assignedWarehouses: [] });
  console.log('- Kết quả:', res1.success ? 'PASSED' : 'FAILED');
  console.log('- Thông báo:', res1.message || res1.error);

  // Test 2: Vai trò KHO nhưng danh sách kho rỗng -> Phải thất bại
  console.log('\n[Test 2] User vai trò WAREHOUSE nhưng không truyền kho:');
  const res2 = saveUser({ roles: ['WAREHOUSE'], assignedWarehouses: [] });
  console.log('- Kết quả:', res2.success ? 'PASSED' : 'FAILED (Đúng thiết kế)');
  console.log('- Thông báo:', res2.error);

  // Test 3: Vai trò KHO kèm kho không hợp lệ -> Phải thất bại
  console.log('\n[Test 3] User vai trò WAREHOUSE kèm kho không tồn tại (KHO_KHONG_TON_TAI):');
  const res3 = saveUser({ roles: ['WAREHOUSE'], assignedWarehouses: ['KHO_KHONG_TON_TAI'] });
  console.log('- Kết quả:', res3.success ? 'PASSED' : 'FAILED (Đúng thiết kế)');
  console.log('- Thông báo:', res3.error);

  // Test 4: Vai trò KHO kèm kho hợp lệ -> Thành công
  console.log('\n[Test 4] User vai trò WAREHOUSE kèm kho hợp lệ (KHO_HN_01):');
  const res4 = saveUser({ roles: ['WAREHOUSE'], assignedWarehouses: ['KHO_HN_01'] });
  console.log('- Kết quả:', res4.success ? 'PASSED' : 'FAILED');
  console.log('- Thông báo:', res4.message);
}

// Chạy test
if (require.main === module) {
  runValidationTests();
}

module.exports = {
  validateWarehouseRoleConstraint,
  saveUser
};