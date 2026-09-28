/**
 * Mô phỏng dữ liệu và logic gán vai trò / gán kho cho người dùng
 */

// Danh sách vai trò mẫu
const ROLES = {
  ADMIN: 'ADMIN',
  WAREHOUSE_STAFF: 'WAREHOUSE',
  SALES_STAFF: 'SALES'
};
const { VALID_WAREHOUSE_IDS } = require('./warehouseData');

/**
 * Hàm gán vai trò và danh sách kho phụ trách cho người dùng
 * 
 * @param {string} currentAdminId - ID của Admin đang thực hiện thao tác
 * @param {string} targetUserId - ID của người dùng được phân quyền
 * @param {Array<string>} newRoles - Danh sách vai trò mới (cho phép giữ nhiều vai trò)
 * @param {Array<string>} assignedWarehouseIds - Danh sách ID kho gắn cho user
 * @param {object} currentUserRecord - Bản ghi hiện tại của targetUser từ DB
 * @returns {object} { success: boolean, updatedUser: object|null, message: string }
 */
function assignRolesAndWarehouses(currentAdminId, targetUserId, newRoles, assignedWarehouseIds = [], currentUserRecord) {
  // 1. Kiểm tra mảng vai trò hợp lệ
  if (!Array.isArray(newRoles) || newRoles.length === 0) {
    return { success: false, updatedUser: null, message: 'Người dùng phải có ít nhất một vai trò.' };
  }
  if (newRoles.some(role => !Object.values(ROLES).includes(role))) {
    return { success: false, updatedUser: null, message: 'Danh sách vai trò chứa giá trị không hợp lệ.' };
  }

  // 2. RÀNG BUỘC: Không thể tự thu hồi vai trò Quản trị (ADMIN) của chính mình
  const isSelfAssignment = (currentAdminId === targetUserId);
  const currentlyIsAdmin = currentUserRecord?.roles?.includes(ROLES.ADMIN);
  const newHasAdmin = newRoles.includes(ROLES.ADMIN);

  if (isSelfAssignment && currentlyIsAdmin && !newHasAdmin) {
    return { 
      success: false, 
      updatedUser: null, 
      message: 'Không thể tự thu hồi vai trò Quản trị viên (ADMIN) của chính mình.' 
    };
  }

  // 3. RÀNG BUỘC: Người dùng thuộc vai trò thủ kho (WAREHOUSE) phải gắn với ít nhất 1 kho cụ thể
  const isWarehouseStaff = newRoles.includes(ROLES.WAREHOUSE_STAFF);
  if (isWarehouseStaff) {
    if (!Array.isArray(assignedWarehouseIds) || assignedWarehouseIds.length === 0) {
      return { 
        success: false, 
        updatedUser: null, 
        message: 'Thủ kho phải được gắn với ít nhất một kho cụ thể.' 
      };
    }
    const invalidWarehouses = assignedWarehouseIds.filter(
      warehouseId => !VALID_WAREHOUSE_IDS.includes(warehouseId)
    );
    if (invalidWarehouses.length > 0) {
      return {
        success: false,
        updatedUser: null,
        message: `Mã kho không hợp lệ: ${invalidWarehouses.join(', ')}.`
      };
    }
  }

  // 4. Cập nhật dữ liệu người dùng
  const updatedUser = {
    userId: targetUserId,
    roles: Array.from(new Set(newRoles)), // Một người dùng giữ nhiều vai trò cùng lúc (đã loại bỏ trùng)
    assignedWarehouses: isWarehouseStaff ? assignedWarehouseIds : [], // Gán kho nếu là thủ kho
    updatedAt: new Date()
  };

  return {
    success: true,
    updatedUser: updatedUser,
    message: 'Gán vai trò và kho cho người dùng thành công.'
  };
}

/**
 * Hàm kiểm tra thủ kho có quyền thao tác trên một kho cụ thể hay không
 * @param {object} user - Thông tin người dùng
 * @param {string} warehouseId - ID kho cần kiểm tra
 * @returns {boolean}
 */
function canAccessWarehouse(user, warehouseId) {
  if (!user || !Array.isArray(user.roles) || typeof warehouseId !== 'string') return false;

  // Admin có quyền xem tất cả kho
  if (user.roles.includes(ROLES.ADMIN)) return true;

  // Thủ kho chỉ thao tác được trên kho mình phụ trách
  if (user.roles.includes(ROLES.WAREHOUSE_STAFF) || user.roles.includes(ROLES.SALES_STAFF)) {
    return Array.isArray(user.assignedWarehouses) && user.assignedWarehouses.includes(warehouseId);
  }

  return false;
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
function runAssignmentTests() {
  console.log('--- BẮT ĐẦU TEST GÁN VAI TRÒ VÀ GÁN KHO (SCRUM-206) ---');

  const adminUser = { userId: 'admin_01', roles: [ROLES.ADMIN], assignedWarehouses: [] };
  const targetUser = { userId: 'user_02', roles: [ROLES.SALES_STAFF], assignedWarehouses: [] };

  // Test Case 1: Gán nhiều vai trò cùng lúc cho 1 user (Thành công)
  console.log('\n[Test 1] Gán nhiều vai trò cùng lúc (Bán hàng + Thủ kho kho KHO_A):');
  const res1 = assignRolesAndWarehouses('admin_01', 'user_02', [ROLES.SALES_STAFF, ROLES.WAREHOUSE_STAFF], ['KHO_HN_01', 'KHO_DN_01'], targetUser);
  console.log('- Kết quả:', res1.message);
  console.log('- User Record:', res1.updatedUser);

  // Test Case 2: Gán vai trò Thủ kho nhưng KHÔNG truyền kho (Phải báo lỗi)
  console.log('\n[Test 2] Gán vai trò Thủ kho nhưng KHÔNG chọn kho:');
  const res2 = assignRolesAndWarehouses('admin_01', 'user_02', [ROLES.WAREHOUSE_STAFF], [], targetUser);
  console.log('- Kết quả:', res2.message);

  // Test Case 3: Admin tự gỡ vai trò ADMIN của chính mình (Phải báo lỗi)
  console.log('\n[Test 3] Admin tự gỡ vai trò ADMIN của chính mình:');
  const res3 = assignRolesAndWarehouses('admin_01', 'admin_01', [ROLES.SALES_STAFF], [], adminUser);
  console.log('- Kết quả:', res3.message);

  // Test Case 4: Kiểm tra quyền truy cập kho của thủ kho
  console.log('\n[Test 4] Kiểm tra thủ kho truy cập đúng/sai kho phụ trách:');
  const staff = res1.updatedUser;
  console.log('- Thao tác trên KHO_HN_01 (đã gán):', canAccessWarehouse(staff, 'KHO_HN_01') ? 'CHO PHÉP' : 'TỪ CHỐI');
  console.log('- Thao tác trên KHO_HCM_01 (chưa gán):', canAccessWarehouse(staff, 'KHO_HCM_01') ? 'CHO PHÉP' : 'TỪ CHỐI');
}

// Chạy test
if (require.main === module) {
  runAssignmentTests();
}

module.exports = {
  assignRolesAndWarehouses,
  canAccessWarehouse
};