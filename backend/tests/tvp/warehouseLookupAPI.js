/**
 * Dữ liệu mẫu danh sách kho và địa bàn trong hệ thống
 */
const mockWarehouses = [
  { id: 'KHO_HN_01', name: 'Kho Trung Tâm Hà Nội', region: 'MIEN_BAC', status: 'ACTIVE' },
  { id: 'KHO_HN_02', name: 'Kho Từ Liêm - Hà Nội', region: 'MIEN_BAC', status: 'ACTIVE' },
  { id: 'KHO_DN_01', name: 'Kho Hải Châu - Đà Nẵng', region: 'MIEN_TRUNG', status: 'ACTIVE' },
  { id: 'KHO_HCM_01', name: 'Kho Tân Bình - TP.HCM', region: 'MIEN_NAM', status: 'ACTIVE' },
  { id: 'KHO_HCM_02', name: 'Kho Bình Thạnh - TP.HCM', region: 'MIEN_NAM', status: 'INACTIVE' }
];

/**
 * API Handler: Tra cứu danh sách kho và địa bàn có hỗ trợ Tìm kiếm & Lọc
 * 
 * @param {object} queryParams - Tham số tìm kiếm/lọc { keyword, region, status }
 * @returns {object} { status: number, total: number, data: Array, message: string }
 */
function getWarehouseLookupAPI(queryParams = {}) {
  const { keyword = '', region = '', status = 'ACTIVE' } = queryParams;

  let filteredList = [...mockWarehouses];

  // 1. Lọc theo trạng thái hoạt động (Mặc định chỉ lấy kho ACTIVE để gán)
  if (status) {
    filteredList = filteredList.filter(wh => wh.status === status);
  }

  // 2. Lọc theo khu vực/địa bàn (MIEN_BAC, MIEN_TRUNG, MIEN_NAM)
  if (region) {
    filteredList = filteredList.filter(wh => wh.region === region);
  }

  // 3. Tìm kiếm theo tên hoặc mã kho
  if (keyword.trim() !== '') {
    const searchTerm = keyword.toLowerCase().trim();
    filteredList = filteredList.filter(wh => 
      wh.name.toLowerCase().includes(searchTerm) || 
      wh.id.toLowerCase().includes(searchTerm)
    );
  }

  return {
    status: 200,
    total: filteredList.length,
    data: filteredList,
    message: 'Tra cứu danh sách kho và địa bàn thành công.'
  };
}

// ==========================================
// TEST CASES CHẠY THỬ NGHIỆM
// ==========================================
function runLookupTests() {
  console.log('--- BẮT ĐẦU TEST API TRA CỨU DANH SÁCH KHO VÀ ĐỊA BÀN ---');

  // Test 1: Lấy toàn bộ danh sách kho đang hoạt động (ACTIVE)
  console.log('\n[Test 1] Lấy tất cả kho ACTIVE phục vụ dropdown màn hình quản trị:');
  const res1 = getWarehouseLookupAPI();
  console.log('- Total:', res1.total);
  console.log('- Data:', res1.data);

  // Test 2: Tìm kiếm theo từ khóa "Hà Nội"
  console.log('\n[Test 2] Tìm kiếm kho với từ khóa "Hà Nội":');
  const res2 = getWarehouseLookupAPI({ keyword: 'Hà Nội' });
  console.log('- Total tìm thấy:', res2.total);
  console.log('- Data:', res2.data);

  // Test 3: Lọc kho theo địa bàn "MIEN_NAM"
  console.log('\n[Test 3] Lọc danh sách kho thuộc địa bàn Miền Nam (MIEN_NAM):');
  const res3 = getWarehouseLookupAPI({ region: 'MIEN_NAM' });
  console.log('- Total tìm thấy:', res3.total);
  console.log('- Data:', res3.data);
}

// Chạy test
runLookupTests();

module.exports = {
  getWarehouseLookupAPI
};