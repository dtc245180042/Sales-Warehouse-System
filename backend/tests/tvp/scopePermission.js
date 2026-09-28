/**
 * Middleware / Hàm kiểm tra quyền thao tác dữ liệu theo phạm vi kho/địa bàn
 * 
 * @param {object} user - Thông tin người dùng đăng nhập { userId, roles, assignedWarehouses }
 * @param {string} targetWarehouseId - ID kho của dữ liệu/đơn hàng mà người dùng muốn thao tác
 * @param {string} action - Hành động thực hiện (ví dụ: 'READ', 'CREATE', 'UPDATE', 'DELETE')
 * @returns {object} { allowed: boolean, message: string }
 */
function checkWarehouseScopePermission(user, targetWarehouseId, action = 'READ') {
  if (!user || !user.roles) {
    return { allowed: false, message: 'Người dùng chưa được xác thực hoặc thiếu thông tin vai trò.' };
  }

  // 1. Quản trị viên (ADMIN) có toàn quyền truy cập/thao tác trên tất cả các kho
  if (user.roles.includes('ADMIN')) {
    return { allowed: true, message: `ADMIN được cấp quyền [${action}] trên toàn bộ hệ thống.` };
  }

  // 2. Kiểm tra vai trò Thủ kho (WAREHOUSE) hoặc Bán hàng (SALES)
  const isWarehouseStaff = user.roles.includes('WAREHOUSE');
  const isSalesStaff = user.roles.includes('SALES');

  if (isWarehouseStaff || isSalesStaff) {
    const assignedWarehouses = user.assignedWarehouses || [];

    // Kiểm tra xem kho đích có nằm trong danh sách kho người dùng được phân công không
    const hasScopeAccess = assignedWarehouses.includes(targetWarehouseId);

    if (hasScopeAccess) {
      return {
        allowed: true,
        message: `Cho phép [${action}] dữ liệu thuộc kho [${targetWarehouseId}].`
      };
    } else {
      return {
        allowed: false,
        message: `Từ chối truy cập: Bạn không được phân công quản lý kho [${targetWarehouseId}].`
      };
    }
  }

  return { allowed: false, message: 'Vai trò người dùng không có quyền thao tác trên dữ liệu kho.' };
}

/**
 * MÔ PHỎNG API THAO TÁC DỮ LIỆU TẠI KHO (Ví dụ: Nhập/Xuất kho, Cập nhật tồn kho)
 */
function performWarehouseOperation(user, warehouseId, operationData) {
  const permission = checkWarehouseScopePermission(user, warehouseId, 'UPDATE');

  if (!permission.allowed) {
    return {
      status: 403,
      success: false,
      error: permission.message
    };
  }

  return {
    status: 200,
    success: true,
    message: `Thao tác dữ liệu tại kho [${warehouseId}] thành công.`,
    data: operationData
  };
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
function runScopePermissionTests() {
  console.log('--- BẮT ĐẦU TEST PHÂN QUYỀN THEO PHẠM VI KHO / ĐỊA BÀN ---');

  // Khai báo dữ liệu user mẫu
  const adminUser = { userId: 'admin_1', roles: ['ADMIN'], assignedWarehouses: [] };
  const warehouseStaff = { userId: 'staff_1', roles: ['WAREHOUSE'], assignedWarehouses: ['KHO_HA_NOI', 'KHO_DA_NANG'] };

  // Test 1: Thủ kho thao tác trên kho mình phụ trách (KHO_HA_NOI) -> Được phép
  console.log('\n[Test 1] Thủ kho thao tác trên kho được phân công (KHO_HA_NOI):');
  const res1 = performWarehouseOperation(warehouseStaff, 'KHO_HA_NOI', { itemId: 'SP001', qty: 50 });
  console.log('- Status:', res1.status);
  console.log('- Thông báo:', res1.message || res1.error);

  // Test 2: Thủ kho thao tác trên kho KHÔNG thuộc thẩm quyền (KHO_HCM) -> Bị từ chối
  console.log('\n[Test 2] Thủ kho thao tác trên kho KHÔNG phụ trách (KHO_HCM):');
  const res2 = performWarehouseOperation(warehouseStaff, 'KHO_HCM', { itemId: 'SP002', qty: 100 });
  console.log('- Status:', res2.status);
  console.log('- Thông báo:', res2.error);

  // Test 3: Admin thao tác trên bất kỳ kho nào (KHO_HCM) -> Được phép
  console.log('\n[Test 3] ADMIN thao tác trên kho bất kỳ (KHO_HCM):');
  const res3 = performWarehouseOperation(adminUser, 'KHO_HCM', { itemId: 'SP003', qty: 200 });
  console.log('- Status:', res3.status);
  console.log('- Thông báo:', res3.message);
}

// Chạy test
runScopePermissionTests();

module.exports = {
  checkWarehouseScopePermission,
  performWarehouseOperation
};