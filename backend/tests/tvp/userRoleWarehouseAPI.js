/**
 * Mô phỏng Cơ sở dữ liệu lưu trữ mô hình người dùng, vai trò và kho/địa bàn
 */
const mockDatabase = {
  // Danh sách người dùng hệ thống
  users: [
    {
      userId: 'USR_001',
      fullName: 'Nguyen Van A',
      email: 'nguyenvana@example.com',
      roles: ['SALES'],
      assignedWarehouses: [], // Không thuộc vai trò KHO nên danh sách rỗng
      createdAt: new Date('2026-01-01')
    },
    {
      userId: 'USR_002',
      fullName: 'Tran Van B',
      email: 'tranvanb@example.com',
      roles: ['WAREHOUSE'],
      assignedWarehouses: ['KHO_HN_01'], // Bắt buộc gắn ít nhất 1 kho khi là WAREHOUSE
      createdAt: new Date('2026-01-02')
    }
  ]
};
const { VALID_WAREHOUSE_IDS } = require('./warehouseData');
const VALID_ROLES = ['ADMIN', 'MANAGER', 'WAREHOUSE', 'SALES', 'ACCOUNTANT', 'CUSTOMER', 'GUEST'];

/**
 * 1. API TRUY VẤN (READ): Lấy danh sách gán vai trò và kho/địa bàn phụ trách của người dùng
 * @param {string} userId - ID của người dùng cần tra cứu (Nếu null sẽ trả về tất cả)
 * @returns {object} { status: number, data: Array|object, message: string }
 */
function getUserRoleAssignmentAPI(userId = null) {
  if (userId) {
    const user = mockDatabase.users.find(u => u.userId === userId);
    if (!user) {
      return { status: 404, data: null, message: 'Không tìm thấy người dùng.' };
    }
    return { status: 200, data: user, message: 'Truy vấn thông tin gán vai trò thành công.' };
  }

  // Trả về toàn bộ danh sách gán vai trò
  return {
    status: 200,
    data: mockDatabase.users,
    message: 'Truy vấn danh sách gán vai trò thành công.'
  };
}

/**
 * 2. API TẠO / CẬP NHẬT (CREATE/UPDATE): Gán vai trò và đơn vị/kho phụ trách cho người dùng
 * @param {string} userId - ID người dùng được gán
 * @param {Array<string>} roles - Danh sách các vai trò (1 user có thể giữ nhiều vai trò)
 * @param {Array<string>} assignedWarehouses - Danh sách ID kho/địa bàn được phân công
 * @returns {object} { status: number, data: object|null, message: string }
 */
function assignUserRoleAndWarehouseAPI(userId, roles, assignedWarehouses = []) {
  // Kiểm tra đầu vào cơ bản
  if (!userId || !Array.isArray(roles) || roles.length === 0 ||
      roles.some(role => !VALID_ROLES.includes(role))) {
    return { status: 400, data: null, message: 'Thông tin userId hoặc danh sách vai trò không hợp lệ.' };
  }

  // Ràng buộc: Nếu có vai trò 'WAREHOUSE' thì phải gắn với ít nhất 1 kho/địa bàn
  const isWarehouseRole = roles.includes('WAREHOUSE');
  if (isWarehouseRole) {
    if (!Array.isArray(assignedWarehouses) || assignedWarehouses.length === 0) {
      return {
        status: 400,
        data: null,
        message: 'Lỗi ràng buộc: Người dùng thuộc vai trò KHO phải được gắn với ít nhất một kho/địa bàn phụ trách.'
      };
    }
    const invalidWarehouses = assignedWarehouses.filter(
      warehouseId => !VALID_WAREHOUSE_IDS.includes(warehouseId)
    );
    if (invalidWarehouses.length > 0) {
      return {
        status: 400,
        data: null,
        message: `Mã kho không hợp lệ: ${invalidWarehouses.join(', ')}.`
      };
    }
  }

  // Tìm người dùng trong DB
  let user = mockDatabase.users.find(u => u.userId === userId);

  if (user) {
    // Cập nhật người dùng hiện có
    user.roles = Array.from(new Set(roles)); // Đảm bảo tính duy nhất của các vai trò
    user.assignedWarehouses = isWarehouseRole ? Array.from(new Set(assignedWarehouses)) : [];
    user.updatedAt = new Date();

    return {
      status: 200,
      data: user,
      message: 'Cập nhật gán vai trò và kho/địa bàn thành công.'
    };
  } else {
    // Tạo mới bản ghi gán vai trò người dùng nếu chưa có
    const newUser = {
      userId: userId,
      roles: Array.from(new Set(roles)),
      assignedWarehouses: isWarehouseRole ? Array.from(new Set(assignedWarehouses)) : [],
      createdAt: new Date()
    };
    mockDatabase.users.push(newUser);

    return {
      status: 201,
      data: newUser,
      message: 'Tạo mới gán vai trò và kho/địa bàn thành công.'
    };
  }
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
function runAPITests() {
  console.log('--- BẮT ĐẦU TEST API GÁN VAI TRÒ THEO KHO / ĐỊA BÀN (SCRUM-334) ---');

  // Test 1: Truy vấn danh sách ban đầu
  console.log('\n[Test 1] Truy vấn toàn bộ danh sách người dùng & vai trò:');
  const listRes = getUserRoleAssignmentAPI();
  console.log('- Status:', listRes.status);
  console.log('- Số lượng record:', listRes.data.length);

  // Test 2: Cập nhật người dùng USR_001 thêm vai trò WAREHOUSE nhưng QUÊN gắn kho (Phải thất bại)
  console.log('\n[Test 2] Cập nhật vai trò WAREHOUSE nhưng không gắn kho phụ trách:');
  const errRes = assignUserRoleAndWarehouseAPI('USR_001', ['SALES', 'WAREHOUSE'], []);
  console.log('- Status:', errRes.status);
  console.log('- Thông báo lỗi:', errRes.message);

  // Test 3: Cập nhật hợp lệ cho USR_001 giữ nhiều vai trò (SALES + WAREHOUSE) kèm 2 kho phụ trách
  console.log('\n[Test 3] Cập nhật hợp lệ cho USR_001 (Nhiều vai trò + Gắn kho Hà Nội & Đà Nẵng):');
  const successRes = assignUserRoleAndWarehouseAPI('USR_001', ['SALES', 'WAREHOUSE'], ['KHO_HN_01', 'KHO_DN_01']);
  console.log('- Status:', successRes.status);
  console.log('- Dữ liệu cập nhật:', successRes.data);

  // Test 4: Truy vấn lại thông tin USR_001 sau khi cập nhật
  console.log('\n[Test 4] Truy vấn chi tiết thông tin USR_001 vừa cập nhật:');
  const singleUserRes = getUserRoleAssignmentAPI('USR_001');
  console.log('- Result:', singleUserRes.data);
}

// Chạy test
if (require.main === module) {
  runAPITests();
}

module.exports = {
  getUserRoleAssignmentAPI,
  assignUserRoleAndWarehouseAPI
};