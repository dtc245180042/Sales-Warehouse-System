/**
 * 1. Định nghĩa 7 vai trò nghiệp vụ trong hệ thống (Roles)
 */
const ROLES = {
  ADMIN: 'ADMIN',               // Quản trị viên hệ thống
  MANAGER: 'MANAGER',           // Quản lý chung
  WAREHOUSE_STAFF: 'WAREHOUSE', // Nhân viên kho
  SALES_STAFF: 'SALES',         // Nhân viên bán hàng
  ACCOUNTANT: 'ACCOUNTANT',     // Kế toán
  CUSTOMER: 'CUSTOMER',         // Khách hàng
  GUEST: 'GUEST'                // Khách vãng lai
};

/**
 * 2. Định nghĩa danh mục các quyền (Permissions)
 */
const PERMISSIONS = {
  // Quản lý người dùng
  USER_CREATE: 'user:create',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  // Quản lý kho
  INVENTORY_READ: 'inventory:read',
  INVENTORY_IMPORT: 'inventory:import',
  INVENTORY_EXPORT: 'inventory:export',

  // Quản lý đơn hàng & bán hàng
  ORDER_CREATE: 'order:create',
  ORDER_READ: 'order:read',
  ORDER_UPDATE: 'order:update',
  ORDER_CANCEL: 'order:cancel',

  // Báo cáo & Tài chính
  REPORT_VIEW: 'report:view'
};

/**
 * 3. Ma trận ánh xạ Vai trò - Quyền hạn (Role-Permission Matrix)
 */
const ROLE_PERMISSIONS_MATRIX = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS), // Admin có tất cả các quyền

  [ROLES.MANAGER]: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_IMPORT,
    PERMISSIONS.INVENTORY_EXPORT,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.REPORT_VIEW
  ],

  [ROLES.WAREHOUSE_STAFF]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_IMPORT,
    PERMISSIONS.INVENTORY_EXPORT,
    PERMISSIONS.ORDER_READ
  ],

  [ROLES.SALES_STAFF]: [
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE
  ],

  [ROLES.ACCOUNTANT]: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.REPORT_VIEW
  ],

  [ROLES.CUSTOMER]: [
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_CANCEL
  ],

  [ROLES.GUEST]: [
    PERMISSIONS.INVENTORY_READ
  ]
};

/**
 * 4. Hàm kiểm tra quyền theo nguyên tắc Default Deny (Từ chối nếu không được cấp)
 * @param {string} userRole - Vai trò của người dùng
 * @param {string} requiredPermission - Quyền cần có để thực hiện thao tác
 * @returns {boolean} true nếu có quyền, false nếu bị từ chối
 */
function hasPermission(userRole, requiredPermission) {
  // Nguyên tắc từ chối mặc định
  if (!userRole || !requiredPermission) {
    return false;
  }

  const allowedPermissions = ROLE_PERMISSIONS_MATRIX[userRole];

  if (!allowedPermissions || !Array.isArray(allowedPermissions)) {
    return false; // Vai trò không tồn tại trong ma trận -> Deny
  }

  return allowedPermissions.includes(requiredPermission);
}

// ==========================================
// Test Cases chạy thử nghiệm
// ==========================================
function runRoleMatrixTests() {
  console.log('--- BẮT ĐẦU TEST MA TRẬN VAI TRÒ & QUYỀN (RBAC) ---');

  const tests = [
    { role: ROLES.ADMIN, perm: PERMISSIONS.USER_DELETE, expected: true },
    { role: ROLES.SALES_STAFF, perm: PERMISSIONS.ORDER_CREATE, expected: true },
    { role: ROLES.SALES_STAFF, perm: PERMISSIONS.INVENTORY_IMPORT, expected: false }, // Từ chối
    { role: ROLES.WAREHOUSE_STAFF, perm: PERMISSIONS.INVENTORY_IMPORT, expected: true },
    { role: ROLES.GUEST, perm: PERMISSIONS.ORDER_CREATE, expected: false },           // Từ chối
    { role: 'UNKNOWN_ROLE', perm: PERMISSIONS.INVENTORY_READ, expected: false }        // Default Deny
  ];

  tests.forEach(({ role, perm, expected }, index) => {
    const result = hasPermission(role, perm);
    const passed = result === expected;
    console.log(`\n[Test ${index + 1}] Role: "${role}" | Permission: "${perm}"`);
    console.log(`- Kết quả: ${result ? 'CHO PHÉP' : 'TỪ CHỐI'} (Kỳ vọng: ${expected ? 'CHO PHÉP' : 'TỪ CHỐI'})`);
    console.log(`- Đánh giá: ${passed ? 'PASSED' : 'FAILED'}`);
  });
}

// Chạy test
runRoleMatrixTests();

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS_MATRIX,
  hasPermission
};