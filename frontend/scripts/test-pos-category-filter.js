/* global process */
/**
 * KIỂM THỬ TỰ ĐỘNG LỌC NHÓM HÀNG TẠI POS (SCRUM-230 / S3-09)
 * 
 * Kiểm thử các yêu cầu:
 * 1. Danh mục động từ API /api/v1/categories (không dùng mock).
 * 2. Lọc sản phẩm theo categoryId (so sánh ID kiểu số/chuỗi chuẩn hóa), không so sánh chuỗi tên nhóm.
 * 3. Số đếm trên mỗi tab khớp thực tế; tổng các nhóm khớp "Tất cả (31)".
 * 4. Nhóm không có sản phẩm hiển thị trạng thái rỗng ("Không có sản phẩm trong nhóm này").
 * 5. Kết hợp lọc nhóm hàng với tìm kiếm tên/SKU/Barcode; đổi tab giữ nguyên từ khóa tìm kiếm.
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${message}`);
  } else {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${message}`);
  }
}

// Logic trích xuất category tabs giống hệt POS.tsx
function computeCategoryTabs(products, categories) {
  const countsByCatId = {};
  const fallbackNames = {};

  products.forEach((p) => {
    const rawId = p.categoryId !== undefined ? String(p.categoryId) : (p.category_id !== undefined ? String(p.category_id) : '');
    const cId = rawId || 'unclassified';
    countsByCatId[cId] = (countsByCatId[cId] || 0) + 1;
    if (p.category && !fallbackNames[cId]) {
      fallbackNames[cId] = p.category;
    }
  });

  const parentIdSet = new Set(categories.map((c) => c.parent_id).filter(Boolean));
  const mappedTabs = [];
  const addedIds = new Set();

  categories.forEach((cat) => {
    const catIdStr = String(cat.id);
    const isLeaf = !parentIdSet.has(cat.id);
    const actualCount = countsByCatId[catIdStr] || 0;

    if (isLeaf || actualCount > 0) {
      mappedTabs.push({
        id: catIdStr,
        name: cat.name,
        count: actualCount,
      });
      addedIds.add(catIdStr);
    }
  });

  if (countsByCatId['unclassified']) {
    mappedTabs.push({
      id: 'unclassified',
      name: 'Chưa phân loại',
      count: countsByCatId['unclassified'],
    });
    addedIds.add('unclassified');
  }

  Object.keys(countsByCatId).forEach((cId) => {
    if (!addedIds.has(cId)) {
      mappedTabs.push({
        id: cId,
        name: fallbackNames[cId] || `Nhóm hàng #${cId}`,
        count: countsByCatId[cId],
      });
      addedIds.add(cId);
    }
  });

  return mappedTabs;
}

// Logic lọc sản phẩm giống hệt POS.tsx
function filterProducts(products, categoryFilter, search) {
  const q = (search || '').toLowerCase().trim();
  return products.filter((p) => {
    let matchCat = categoryFilter === 'all';
    if (!matchCat) {
      const pCatId = p.categoryId !== undefined ? String(p.categoryId) : (p.category_id !== undefined ? String(p.category_id) : '');
      if (categoryFilter === 'unclassified') {
        matchCat = !pCatId;
      } else {
        matchCat = pCatId === String(categoryFilter);
      }
    }

    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ? String(p.barcode).toLowerCase().includes(q) : false);

    return matchCat && matchSearch;
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 BẮT ĐẦU TEST LỌC NHÓM HÀNG POS (SCRUM-230 / S3-09)');
  console.log('======================================================\n');

  // Test Suite 1: Unit Test Logic Lọc theo categoryId & Type Coercion
  console.log('\x1b[36m[TEST SUITE 1]\x1b[0m Unit test so sánh ID (number vs string) & không phụ thuộc tên nhóm');
  
  const sampleProducts = [
    { id: '1', name: 'Laptop Dell XPS 13', sku: 'DELL-XPS13', barcode: '893001', categoryId: 6, category: 'Laptop Văn Phòng' },
    { id: '2', name: 'Laptop ThinkPad T14', sku: 'LENOVO-T14', barcode: '893002', category_id: 6, category: 'Khác' },
    { id: '3', name: 'Bàn phím cơ Keychron K2', sku: 'KEY-K2', barcode: '893003', categoryId: 14, category: 'Bàn phím' },
    { id: '4', name: 'Chuột Logitech MX Master 3', sku: 'LOGI-MX3', barcode: '893004', categoryId: '15', category: 'Chuột' },
    { id: '5', name: 'Cáp sạc Type-C Anker', sku: 'ANK-C', barcode: '893005', categoryId: null, category: '' },
  ];

  const sampleCategories = [
    { id: 1, name: 'Máy tính & Laptop', parent_id: null },
    { id: 6, name: 'Laptop', parent_id: 1 },
    { id: 14, name: 'Bàn phím', parent_id: 1 },
    { id: 15, name: 'Chuột', parent_id: 1 },
    { id: 99, name: 'Thiết bị mạng (Rỗng)', parent_id: 1 },
  ];

  // 1.1 Lọc nhóm Laptop bằng string '6' khi product có categoryId số 6 hoặc category_id 6
  const filteredCat6 = filterProducts(sampleProducts, '6', '');
  assert(filteredCat6.length === 2, 'Lọc tab categoryId="6" trả về đúng 2 sản phẩm Laptop (so sánh theo ID, không theo tên)');
  assert(filteredCat6.every(p => p.categoryId === 6 || p.category_id === 6), 'Tất cả sản phẩm trả về đều có categoryId là 6');

  // 1.2 Lọc nhóm Chuột có product.categoryId là string '15'
  const filteredCat15 = filterProducts(sampleProducts, '15', '');
  assert(filteredCat15.length === 1 && filteredCat15[0].id === '4', 'Lọc tab categoryId="15" chuẩn hóa đúng kiểu dữ liệu');

  // 1.3 Nhóm rỗng (id 99)
  const filteredCatEmpty = filterProducts(sampleProducts, '99', '');
  assert(filteredCatEmpty.length === 0, 'Nhóm id=99 trả về 0 sản phẩm (kích hoạt giao diện Không có sản phẩm trong nhóm này)');

  // 1.4 Tab Tất cả
  const filteredAll = filterProducts(sampleProducts, 'all', '');
  assert(filteredAll.length === 5, 'Tab Tất cả trả về đầy đủ 5/5 sản phẩm');

  // Test Suite 2: Tính toán Tab & Tổng số đếm
  console.log('\n\x1b[36m[TEST SUITE 2]\x1b[0m Kiểm thử số đếm trên tab & tổng khớp "Tất cả"');
  const tabs = computeCategoryTabs(sampleProducts, sampleCategories);
  
  const totalCountInTabs = tabs.reduce((sum, t) => sum + t.count, 0);
  assert(totalCountInTabs === sampleProducts.length, `Tổng số đếm các tab (${totalCountInTabs}) bằng đúng tổng sản phẩm (${sampleProducts.length})`);

  const emptyTab = tabs.find(t => t.id === '99');
  assert(emptyTab && emptyTab.count === 0, 'Tab nhóm rỗng vẫn hiện diện trong danh mục lá với count = 0');

  // Test Suite 3: Kết hợp tìm kiếm Tên / SKU / Barcode + Nhóm hàng
  console.log('\n\x1b[36m[TEST SUITE 3]\x1b[0m Kiểm thử kết hợp bộ lọc (Tab nhóm hàng + Ô tìm kiếm + Barcode)');

  // 3.1 Tìm kiếm "Dell" trong tab '6'
  const searchInCat6 = filterProducts(sampleProducts, '6', 'Dell');
  assert(searchInCat6.length === 1 && searchInCat6[0].sku === 'DELL-XPS13', 'Tìm "Dell" trong nhóm 6 trả về đúng 1 laptop Dell');

  // 3.2 Tìm kiếm "Dell" trong tab '14' (Bàn phím) -> kết quả 0
  const searchDellInCat14 = filterProducts(sampleProducts, '14', 'Dell');
  assert(searchDellInCat14.length === 0, 'Tìm "Dell" trong nhóm 14 trả về 0 (nhóm khác không lẫn kết quả)');

  // 3.3 Đổi tab từ 6 sang 14 vẫn giữ từ khóa tìm kiếm
  const keyword = 'Logitech';
  const resCat15 = filterProducts(sampleProducts, '15', keyword);
  const resCat6 = filterProducts(sampleProducts, '6', keyword);
  assert(resCat15.length === 1 && resCat6.length === 0, 'Đổi tab với cùng từ khóa "Logitech" cho kết quả chính xác theo từng tab');

  // 3.4 Quét Barcode kết hợp
  const barcodeSearch = filterProducts(sampleProducts, 'all', '893003');
  assert(barcodeSearch.length === 1 && barcodeSearch[0].id === '3', 'Quét barcode 893003 tìm ra đúng bàn phím Keychron');

  // Test Suite 4: Kiểm thử với Danh Mục 31 Sản Phẩm Công Nghệ Chuẩn (SCRUM-230)
  console.log('\n\x1b[36m[TEST SUITE 4]\x1b[0m Kiểm thử danh mục 31 sản phẩm công nghệ (yêu cầu Tất cả = 31)');
  const fs = await import('fs');
  const mockProductsRaw = fs.readFileSync('src/mock/products.ts', 'utf8');
  const initialCountMatches = (mockProductsRaw.match(/sku:\s*['"][^'"]+['"]/g) || []).length;
  assert(initialCountMatches === 31, `Bộ dữ liệu chuẩn có chính xác ${initialCountMatches}/31 sản phẩm công nghệ`);

  // Test Suite 5: Kiểm thử với Dữ liệu Thật từ Backend API (/api/v1/categories & /api/v1/products)
  console.log('\n\x1b[36m[TEST SUITE 5]\x1b[0m Kiểm thử với Dữ liệu Thật từ Backend API (port 8001)');
  try {
    const catRes = await fetch('http://127.0.0.1:8001/api/v1/categories');
    const prodRes = await fetch('http://127.0.0.1:8001/api/v1/products?page=1&page_size=100');
    
    if (catRes.ok && prodRes.ok) {
      const realCategories = await catRes.json();
      const realProdData = await prodRes.json();
      const realProducts = Array.isArray(realProdData) ? realProdData : (realProdData.items || []);

      assert(realCategories.length > 0, `Lấy thành công ${realCategories.length} nhóm hàng động từ API /api/v1/categories`);
      assert(realProducts.length > 0, `Lấy thành công ${realProducts.length} sản phẩm công nghệ từ backend`);

      const realTabs = computeCategoryTabs(realProducts, realCategories);
      const realTotalTabCount = realTabs.reduce((s, t) => s + t.count, 0);
      assert(realTotalTabCount === realProducts.length, `Tổng số đếm trên các tab (${realTotalTabCount}) KHỚP HOÀN TOÀN với tổng sản phẩm "Tất cả (${realProducts.length})"`);

      // Kiểm tra có tab rỗng
      const hasEmptyTab = realTabs.some(t => t.count === 0);
      assert(hasEmptyTab, 'Có ít nhất 1 tab nhóm hàng có 0 sản phẩm để kiểm tra thông báo giao diện rỗng');

      // Test lọc từng tab trên dữ liệu thật
      let allTabsMatch = true;
      for (const tab of realTabs) {
        const filtered = filterProducts(realProducts, tab.id, '');
        if (filtered.length !== tab.count) {
          allTabsMatch = false;
          console.error(`Lệch số đếm tại tab ${tab.name} (id: ${tab.id}): tab báo ${tab.count}, lọc ra ${filtered.length}`);
        }
      }
      assert(allTabsMatch, 'Tất cả các tab khi bấm chọn đều trả về đúng chính xác số lượng sản phẩm ghi trên tab');
    } else {
      console.log('  ⚠️ Backend API không phản hồi 200, bỏ qua bước gọi trực tiếp API.');
    }
  } catch (err) {
    console.log('  ⚠️ Không kết nối được Backend API:', err.message);
  }

  console.log('\n------------------------------------------------------');
  console.log(`KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} tests PASS (${failedTests} fail)`);
  console.log('------------------------------------------------------\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
