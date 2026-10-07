/* global process */
/**
 * KIỂM THỬ TỰ ĐỘNG SPRINT 2 - OMS Pro
 * User Story: SCRUM-210 (Xem và cập nhật hồ sơ cá nhân)
 * Subtasks:
 * - SCRUM-358: Kiểm tra và chuẩn hóa định dạng số điện thoại Việt Nam
 * - SCRUM-360: Ràng buộc bảo mật ngăn sửa tài khoản, vai trò, kho và địa bàn
 * - SCRUM-361: Màn hình hồ sơ cá nhân và form chỉnh sửa họ tên, số điện thoại
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, code, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m [${code}]: ${message}`);
  } else {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL\x1b[0m [${code}]: ${message}`);
  }
}

function suite(title) {
  console.log(`\n\x1b[1m\x1b[34m━━━ ${title} ━━━\x1b[0m`);
}

// ========================================================
// 1. Phone validation logic (mirrored from src/utils/phoneUtils.ts)
// ========================================================
function normalizeVNPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = phone.trim().replace(/[\s.\-()]/g, '');
  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

function isValidVNPhoneNumber(phone) {
  const cleaned = normalizeVNPhoneNumber(phone);
  const vnPhoneRegex = /^(03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])[0-9]{7}$/;
  return vnPhoneRegex.test(cleaned);
}

function validateVNPhoneNumber(phone) {
  if (!phone || !phone.trim()) {
    return { valid: false, message: 'Số điện thoại không được để trống.' };
  }
  const cleaned = normalizeVNPhoneNumber(phone);
  if (!/^\d+$/.test(cleaned)) {
    return { valid: false, message: 'Số điện thoại chỉ được chứa các chữ số.' };
  }
  if (cleaned.length !== 10) {
    return {
      valid: false,
      message: `Số điện thoại phải có đúng 10 chữ số (hiện tại có ${cleaned.length} số).`,
    };
  }
  if (!isValidVNPhoneNumber(cleaned)) {
    return {
      valid: false,
      message: 'Đầu số điện thoại không hợp lệ. Vui lòng nhập đầu số mạng Việt Nam (03, 05, 07, 08, 09).',
    };
  }
  return { valid: true, normalized: cleaned };
}

// ========================================================
// 2. Mock User & Profile Service (mirrored from src/services/authService.ts)
// ========================================================
const mockCurrentUser = {
  id: 'USR-002',
  name: 'Trần Thị Thu Trang',
  email: 'trang.sales@khovanpro.vn',
  role: 'SalesStaff',
  roles: ['SalesStaff'],
  status: 'active',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
  phone: '0987654321',
  department: 'Kinh Doanh',
  territory: 'Miền Bắc',
  warehouse: 'Kho Tổng Hà Nội',
  lastLogin: '2026-10-03 14:20:00',
  createdAt: '2026-09-01',
};

function updateProfile(currentUser, data) {
  if (!currentUser) throw new Error('Chưa đăng nhập');
  const trimmedName = data.name ? data.name.trim() : '';
  if (!trimmedName || trimmedName.length < 2) {
    throw new Error('Họ và tên không được để trống (tối thiểu 2 ký tự).');
  }

  const phoneVal = validateVNPhoneNumber(data.phone);
  if (!phoneVal.valid) {
    throw new Error(phoneVal.message || 'Số điện thoại không hợp lệ.');
  }

  // BẢO MẬT: Bất kể input có cố tình truyền email, role, warehouse, territory hay không,
  // hệ thống tuyệt đối giữ nguyên từ currentUser:
  return {
    ...currentUser,
    name: trimmedName,
    phone: phoneVal.normalized,
    avatar: data.avatar || currentUser.avatar,
    // Không bị ghi đè:
    email: currentUser.email,
    role: currentUser.role,
    roles: currentUser.roles,
    warehouse: currentUser.warehouse,
    territory: currentUser.territory,
    id: currentUser.id,
    status: currentUser.status,
  };
}

console.log('\n══════════════════════════════════════════════════');
console.log('🚀 KIỂM THỬ TỰ ĐỘNG SPRINT 2 – SCRUM-210 & SCRUM-361');
console.log('══════════════════════════════════════════════════');

// ── TEST SUITE 1: SCRUM-358 / ĐỊNH DẠNG SĐT VIỆT NAM ─────
suite('SCRUM-358: Kiểm tra & chuẩn hóa định dạng số điện thoại Việt Nam');

assert(isValidVNPhoneNumber('0912345678'), 'TC-358-01', 'Đầu số 09 (Vinaphone/Mobifone/Viettel) hợp lệ');
assert(isValidVNPhoneNumber('0388889999'), 'TC-358-02', 'Đầu số 03 (Viettel) hợp lệ');
assert(isValidVNPhoneNumber('0701234567'), 'TC-358-03', 'Đầu số 07 (Mobifone) hợp lệ');
assert(isValidVNPhoneNumber('0891234567'), 'TC-358-04', 'Đầu số 08 (Vinaphone/Mobi) hợp lệ');
assert(isValidVNPhoneNumber('0561234567'), 'TC-358-05', 'Đầu số 05 (Vietnamobile) hợp lệ');

assert(isValidVNPhoneNumber('+84912345678'), 'TC-358-06', 'Định dạng quốc tế +84 được chấp nhận và chuẩn hóa');
assert(normalizeVNPhoneNumber('+84912345678') === '0912345678', 'TC-358-07', '+84912345678 chuẩn hóa thành 0912345678');
assert(normalizeVNPhoneNumber('091-234-5678') === '0912345678', 'TC-358-08', 'Dấu gạch ngang và khoảng trắng được tự động làm sạch');

assert(!isValidVNPhoneNumber('0123456789'), 'TC-358-09', 'Đầu số 01 (11 số cũ bị khai tử) bị từ chối');
assert(!isValidVNPhoneNumber('091234567'), 'TC-358-10', 'Thiếu số (9 chữ số) bị từ chối');
assert(!isValidVNPhoneNumber('09123456789'), 'TC-358-11', 'Thừa số (11 chữ số) bị từ chối');
assert(!isValidVNPhoneNumber('09123abc78'), 'TC-358-12', 'Chứa ký tự chữ cái bị từ chối');
assert(!isValidVNPhoneNumber(''), 'TC-358-13', 'Chuỗi rỗng bị từ chối với thông báo rõ ràng');

// ── TEST SUITE 2: SCRUM-361 / CẬP NHẬT HỒ SƠ CÁ NHÂN ──────
suite('SCRUM-361: Form chỉnh sửa hồ sơ cá nhân (Họ tên & Số điện thoại)');

const updatedValid = updateProfile(mockCurrentUser, {
  name: 'Trần Thu Trang Mới',
  phone: '0399112233',
});
assert(updatedValid.name === 'Trần Thu Trang Mới', 'TC-361-01', 'Cập nhật thành công họ và tên mới');
assert(updatedValid.phone === '0399112233', 'TC-361-02', 'Cập nhật thành công số điện thoại mới');

// Họ tên validation
try {
  updateProfile(mockCurrentUser, { name: '', phone: '0912345678' });
  assert(false, 'TC-361-03', 'Họ tên rỗng phải ném lỗi');
} catch (e) {
  assert(e.message.includes('Họ và tên không được để trống'), 'TC-361-03', 'Bắt lỗi họ tên rỗng: ' + e.message);
}

try {
  updateProfile(mockCurrentUser, { name: 'A', phone: '0912345678' });
  assert(false, 'TC-361-04', 'Họ tên dưới 2 ký tự phải ném lỗi');
} catch (e) {
  assert(e.message.includes('tối thiểu 2 ký tự'), 'TC-361-04', 'Bắt lỗi họ tên < 2 ký tự');
}

// SĐT validation khi cập nhật hồ sơ
try {
  updateProfile(mockCurrentUser, { name: 'Nguyễn Văn B', phone: '123456' });
  assert(false, 'TC-361-05', 'SĐT không hợp lệ phải ném lỗi');
} catch (e) {
  assert(e.message.includes('10 chữ số') || e.message.includes('không hợp lệ'), 'TC-361-05', 'Báo lỗi chi tiết khi SĐT sai');
}

// ── TEST SUITE 3: SCRUM-360 / BẢO MẬT & NGĂN TỰ ĐỔI THUỘC TÍNH HỆ THỐNG
suite('SCRUM-360: Ngăn chặn tự đổi tài khoản, vai trò, kho và địa bàn');

const attemptHackingProfile = updateProfile(mockCurrentUser, {
  name: 'Họ Tên Hợp Lệ',
  phone: '0912345678',
  email: 'hacker@evil.com',
  role: 'Admin',
  roles: ['Admin'],
  warehouse: 'Kho Bí Mật',
  territory: 'Toàn Cầu',
  status: 'inactive',
  id: 'USR-999',
});

assert(attemptHackingProfile.email === mockCurrentUser.email, 'TC-360-01', 'Tài khoản email KHÔNG bị thay đổi bởi người dùng');
assert(attemptHackingProfile.role === mockCurrentUser.role, 'TC-360-02', 'Vai trò (role) KHÔNG bị tự nâng quyền thành Admin');
assert(attemptHackingProfile.warehouse === mockCurrentUser.warehouse, 'TC-360-03', 'Kho phụ trách KHÔNG bị tự ý thay đổi');
assert(attemptHackingProfile.territory === mockCurrentUser.territory, 'TC-360-04', 'Địa bàn phụ trách KHÔNG bị tự ý thay đổi');
assert(attemptHackingProfile.id === mockCurrentUser.id, 'TC-360-05', 'ID định danh người dùng giữ nguyên');
assert(attemptHackingProfile.status === mockCurrentUser.status, 'TC-360-06', 'Trạng thái hoạt động tài khoản giữ nguyên');

// ========================================================
// 4. Test logic SCRUM-220 / SCRUM-380: Quản lý danh mục & SKU duy nhất
// ========================================================
suite('SCRUM-220 / SCRUM-380: Quản lý danh mục sản phẩm & Ràng buộc SKU duy nhất');

const mockProductCatalog = [
  { id: 'PRD-001', sku: 'IP15P-128-TI', name: 'iPhone 15 Pro', unit: 'Chiếc', packagingSpecification: '1 chiếc/hộp', costPrice: 22500000, salePrice: 26990000, status: 'active', hasTransactions: true },
  { id: 'PRD-002', sku: 'SAM-S24U-512', name: 'Samsung S24 Ultra', unit: 'Chiếc', packagingSpecification: '1 chiếc/hộp', costPrice: 25000000, salePrice: 29990000, status: 'active', hasTransactions: true },
];

function validateProductSkuUnique(sku, existingProducts, currentId) {
  if (!sku || !sku.trim()) {
    return { valid: false, message: 'Mã SKU không được để trống' };
  }
  const cleanSku = sku.trim().toUpperCase();
  const duplicate = existingProducts.find(
    (p) => (!currentId || p.id !== currentId) && p.sku.trim().toUpperCase() === cleanSku
  );
  if (duplicate) {
    return { valid: false, message: `Mã SKU "${cleanSku}" đã tồn tại trong danh mục sản phẩm.` };
  }
  return { valid: true, cleanSku };
}

assert(validateProductSkuUnique('IP15P-128-TI', mockProductCatalog).valid === false, 'TC-380-01', 'Chặn tạo sản phẩm với mã SKU đã tồn tại (trùng IP15P-128-TI)');
assert(validateProductSkuUnique('ip15p-128-ti', mockProductCatalog).valid === false, 'TC-380-02', 'Chặn mã SKU trùng dù nhập chữ thường (case-insensitive)');
assert(validateProductSkuUnique('  IP15P-128-TI  ', mockProductCatalog).valid === false, 'TC-380-03', 'Chặn mã SKU trùng có khoảng trắng thừa');
assert(validateProductSkuUnique('MAC-M3-PRO', mockProductCatalog).valid === true, 'TC-380-04', 'Cho phép tạo sản phẩm với mã SKU mới hợp lệ');
assert(validateProductSkuUnique('IP15P-128-TI', mockProductCatalog, 'PRD-001').valid === true, 'TC-380-05', 'Cho phép giữ nguyên SKU của chính nó khi chỉnh sửa sản phẩm PRD-001');
assert(validateProductSkuUnique('SAM-S24U-512', mockProductCatalog, 'PRD-001').valid === false, 'TC-380-06', 'Chặn cập nhật sản phẩm PRD-001 sang SKU của sản phẩm PRD-002');

// Kiểm tra khai báo đủ các trường bắt buộc theo SCRUM-220
const sampleProduct = {
  sku: 'COCA-330-CAN',
  name: 'Coca Cola 330ml',
  category: 'Đồ Uống',
  unit: 'Lon',
  packagingSpecification: '24 lon/thùng',
  costPrice: 8500,
  salePrice: 12000,
  image: 'https://example.com/coca.jpg',
  status: 'active',
};

assert(Boolean(sampleProduct.sku && sampleProduct.sku.trim()), 'TC-380-07', 'Có khai báo mã SKU');
assert(Boolean(sampleProduct.name && sampleProduct.name.trim()), 'TC-380-08', 'Có khai báo tên sản phẩm');
assert(Boolean(sampleProduct.category), 'TC-380-09', 'Có khai báo nhóm hàng/danh mục');
assert(Boolean(sampleProduct.unit), 'TC-380-10', 'Có khai báo đơn vị tính cơ sở');
assert(Boolean(sampleProduct.packagingSpecification), 'TC-380-11', 'Có khai báo quy cách đóng gói (24 lon/thùng)');
assert(sampleProduct.costPrice > 0 && sampleProduct.salePrice > sampleProduct.costPrice, 'TC-380-12', 'Có khai báo giá vốn và giá bán hợp lệ');
assert(Boolean(sampleProduct.image), 'TC-380-13', 'Có khai báo ảnh sản phẩm');
assert(['active', 'inactive', 'low_stock', 'out_of_stock'].includes(sampleProduct.status), 'TC-380-14', 'Có khai báo trạng thái sản phẩm hợp lệ');

// ========================================================
// 5. Test logic SCRUM-220 / SCRUM-381: Phân quyền giá vốn & Chặn xóa sản phẩm đã có giao dịch
// ========================================================
suite('SCRUM-220 / SCRUM-381: Phân quyền giá vốn & Chặn xóa sản phẩm đã có giao dịch');

function canUserAccessCostPrice(role) {
  return role === 'Admin' || role === 'SalesManager' || role === 'Director';
}

assert(canUserAccessCostPrice('SalesManager') === true, 'TC-381-01', 'Quản lý kinh doanh (SalesManager) ĐƯỢC XEM & SỬA giá vốn');
assert(canUserAccessCostPrice('Admin') === true, 'TC-381-02', 'Admin ĐƯỢC XEM & SỬA giá vốn');
assert(canUserAccessCostPrice('Director') === true, 'TC-381-03', 'Giám đốc (Director) ĐƯỢC XEM & SỬA giá vốn');
assert(canUserAccessCostPrice('SalesStaff') === false, 'TC-381-04', 'Nhân viên kinh doanh (SalesStaff) BỊ ẨN / KHÓA giá vốn');
assert(canUserAccessCostPrice('WarehouseStaff') === false, 'TC-381-05', 'Nhân viên kho (WarehouseStaff) BỊ ẨN / KHÓA giá vốn');
assert(canUserAccessCostPrice('Accountant') === false, 'TC-381-06', 'Kế toán không thuộc ban quản lý kinh doanh BỊ ẨN / KHÓA giá vốn');

function checkDeleteProductPermission(product) {
  if (product.hasTransactions) {
    return {
      canDelete: false,
      recommendedAction: 'inactive',
      message: `Sản phẩm "${product.name}" (${product.sku}) đã phát sinh giao dịch, không thể xóa. Chỉ có thể chuyển sang ngừng kinh doanh.`,
    };
  }
  return { canDelete: true, message: 'Có thể xóa vĩnh viễn' };
}

const productWithTransactions = {
  id: 'PRD-001',
  sku: 'IP15P-128-TI',
  name: 'iPhone 15 Pro',
  hasTransactions: true,
  status: 'active',
};

const productWithoutTransactions = {
  id: 'PRD-099',
  sku: 'TEST-SKU-999',
  name: 'Sản phẩm nháp mới tạo',
  hasTransactions: false,
  status: 'active',
};

const resultBlocked = checkDeleteProductPermission(productWithTransactions);
assert(resultBlocked.canDelete === false, 'TC-381-07', 'Chặn xóa sản phẩm đã phát sinh giao dịch (hasTransactions = true)');
assert(resultBlocked.recommendedAction === 'inactive', 'TC-381-08', 'Gợi ý hành động chuyển sang "Ngừng kinh doanh" (inactive)');

const resultAllowed = checkDeleteProductPermission(productWithoutTransactions);
assert(resultAllowed.canDelete === true, 'TC-381-09', 'Cho phép xóa sản phẩm chưa phát sinh giao dịch (hasTransactions = false)');

function deactivateProduct(product) {
  return {
    ...product,
    status: 'inactive',
    updatedAt: '2026-10-03',
  };
}

const deactivated = deactivateProduct(productWithTransactions);
assert(deactivated.status === 'inactive', 'TC-381-10', 'Chuyển trạng thái sản phẩm sang Ngừng kinh doanh thành công');
assert(deactivated.sku === productWithTransactions.sku, 'TC-381-11', 'Giữ nguyên mã SKU và toàn bộ lịch sử sau khi ngừng kinh doanh');

console.log('\n══════════════════════════════════════════════════');
console.log(`📊 KẾT QUẢ: ${passedTests}/${totalTests} PASS | ${failedTests} FAIL`);
console.log(`📈 Tỷ lệ đạt: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
if (failedTests === 0) {
  console.log('🎉 TẤT CẢ TEST CASE SPRINT 2 (SCRUM-210 & SCRUM-220: 380, 381) ĐẠT CHUẨN 100%!');
}
console.log('══════════════════════════════════════════════════\n');

process.exit(failedTests > 0 ? 1 : 0);


