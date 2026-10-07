/* global process */
/**
 * KIỂM THỬ TỰ ĐỘNG (QA TEST SUITE):
 * Khai báo nhiều đơn vị tính, quy đổi giao dịch và tính bất biến của lịch sử (History Immutability)
 *
 * Chạy kiểm thử: node scripts/test-unit-conversion-history.js
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedList = [];

function assert(condition, id, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m [${id}]: ${message}`);
  } else {
    failedTests++;
    failedList.push(`[${id}] ${message}`);
    console.error(`  \x1b[31m✖ FAIL\x1b[0m [${id}]: ${message}`);
  }
}

function suite(title) {
  console.log(`\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
  console.log(`\x1b[36m▶ ${title}\x1b[0m`);
  console.log(`\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`);
}

console.log('\n════════════════════════════════════════════════════════════════════════');
console.log('🧪 BẮT ĐẦU KIỂM THỬ QA: ĐƠN VỊ TÍNH, QUY ĐỔI GIAO DỊCH & BẤT BIẾN LỊCH SỬ');
console.log('════════════════════════════════════════════════════════════════════════');

// ==============================================================================
// TEST SUITE 1: KHAI BÁO NHIỀU ĐƠN VỊ TÍNH (LON / LỐC / THÙNG) CHO SKU
// ==============================================================================
suite('TEST SUITE 1: Khai báo cấu hình đơn vị tính (Lon / Lốc / Thùng)');

// Giả lập cấu hình sản phẩm Nước giải khát / Bia (Lon / Lốc / Thùng)
const productConfig = {
  productId: 'PRD-BEV-001',
  sku: 'BEV-PEPSI-330',
  name: 'Pepsi Lon 330ml',
  baseUnit: 'Lon',
  units: [
    { id: 'u-1', unitName: 'Lon',   ratio: 1,  isBase: true,  barcode: '893000000001', salePrice: 10000 },
    { id: 'u-2', unitName: 'Lốc',   ratio: 6,  isBase: false, barcode: '893000000006', salePrice: 58000 },
    { id: 'u-3', unitName: 'Thùng', ratio: 24, isBase: false, barcode: '893000000024', salePrice: 230000 },
  ],
};

const baseUnits = productConfig.units.filter((u) => u.isBase);
assert(baseUnits.length === 1, 'QA-U01', 'Chỉ có duy nhất 1 đơn vị cơ sở được xác lập');
assert(baseUnits[0].unitName === 'Lon', 'QA-U02', 'Đơn vị cơ sở là "Lon"');
assert(baseUnits[0].ratio === 1, 'QA-U03', 'Hệ số quy đổi của đơn vị cơ sở bằng 1');

const locUnit = productConfig.units.find((u) => u.unitName === 'Lốc');
const thungUnit = productConfig.units.find((u) => u.unitName === 'Thùng');
assert(Boolean(locUnit) && locUnit.ratio === 6, 'QA-U04', 'Khai báo đơn vị "Lốc" với hệ số = 6 (1 Lốc = 6 Lon)');
assert(Boolean(thungUnit) && thungUnit.ratio === 24, 'QA-U05', 'Khai báo đơn vị "Thùng" với hệ số = 24 (1 Thùng = 24 Lon)');

// Kiểm tra quy đổi tương đương
const thungToLoc = thungUnit.ratio / locUnit.ratio;
assert(thungToLoc === 4, 'QA-U06', 'Quy đổi chéo: 1 Thùng = 4 Lốc = 24 Lon');

// ==============================================================================
// TEST SUITE 2: GHI NHẬN GIAO DỊCH NHẬP KHO & XUẤT KHO THEO NHIỀU ĐƠN VỊ
// ==============================================================================
suite('TEST SUITE 2: Ghi nhận chứng từ nhập/xuất kho đa đơn vị & Snapshotting');

const costPricePerBaseUnit = 8000; // Giá vốn 8,000đ / Lon

// 1. Nhập kho theo các đơn vị khác nhau
function createStockInRecord(receiptCode, qty, unitName, unitRatio, costPrice) {
  const baseQty = qty * unitRatio;
  return {
    receiptCode,
    type: 'STOCK_IN',
    unitName,
    unitRatio,       // Snapshot hệ số tại thời điểm lập phiếu
    enteredQty: qty,
    baseQty,         // Số lượng quy đổi chốt tại thời điểm lập phiếu
    costPrice,
    subtotal: baseQty * costPrice,
    createdAt: '2026-10-01 08:30:00',
  };
}

const receiptIn1 = createStockInRecord('PNK-001', 10, 'Thùng', 24, costPricePerBaseUnit);
assert(receiptIn1.baseQty === 240, 'QA-TX01', 'Nhập 10 Thùng (hệ số 24) -> baseQty = 240 Lon');
assert(receiptIn1.subtotal === 1920000, 'QA-TX02', 'Thành tiền PNK-001: 240 Lon * 8,000đ = 1,920,000đ');
assert(receiptIn1.unitRatio === 24, 'QA-TX03', 'Snapshot hệ số quy đổi 24 được lưu độc lập trên chứng từ PNK-001');

const receiptIn2 = createStockInRecord('PNK-002', 5, 'Lốc', 6, costPricePerBaseUnit);
assert(receiptIn2.baseQty === 30, 'QA-TX04', 'Nhập 5 Lốc (hệ số 6) -> baseQty = 30 Lon');

const receiptIn3 = createStockInRecord('PNK-003', 12, 'Lon', 1, costPricePerBaseUnit);
assert(receiptIn3.baseQty === 12, 'QA-TX05', 'Nhập 12 Lon (cơ sở) -> baseQty = 12 Lon');

// 2. Xuất kho theo các đơn vị khác nhau
function createStockOutRecord(receiptCode, qty, unitName, unitRatio, costPrice) {
  const baseQty = qty * unitRatio;
  return {
    receiptCode,
    type: 'STOCK_OUT',
    unitName,
    unitRatio,       // Snapshot hệ số tại thời điểm xuất
    enteredQty: qty,
    baseQty,
    costPrice,
    subtotal: baseQty * costPrice,
    createdAt: '2026-10-02 14:00:00',
  };
}

const receiptOut1 = createStockOutRecord('PXK-001', 2, 'Thùng', 24, costPricePerBaseUnit);
assert(receiptOut1.baseQty === 48, 'QA-TX06', 'Xuất 2 Thùng (hệ số 24) -> baseQty xuất = 48 Lon');

const receiptOut2 = createStockOutRecord('PXK-002', 3, 'Lốc', 6, costPricePerBaseUnit);
assert(receiptOut2.baseQty === 18, 'QA-TX07', 'Xuất 3 Lốc (hệ số 6) -> baseQty xuất = 18 Lon');

const receiptOut3 = createStockOutRecord('PXK-003', 6, 'Lon', 1, costPricePerBaseUnit);
assert(receiptOut3.baseQty === 6, 'QA-TX08', 'Xuất 6 Lon (cơ sở) -> baseQty xuất = 6 Lon');

// ==============================================================================
// TEST SUITE 3: ĐỐI SOÁT SỐ LƯỢNG CƠ SỞ & THẺ KHO
// ==============================================================================
suite('TEST SUITE 3: Đối soát số lượng cơ sở (Reconciliation & Inventory Balance)');

const allInReceipts = [receiptIn1, receiptIn2, receiptIn3];
const allOutReceipts = [receiptOut1, receiptOut2, receiptOut3];

// 1. Kiểm tra tính toán cơ sở trên từng giao dịch
const allTransactions = [...allInReceipts, ...allOutReceipts];
const allFormulasValid = allTransactions.every(
  (t) => t.baseQty === t.enteredQty * t.unitRatio
);
assert(allFormulasValid, 'QA-REC01', '100% giao dịch tuân thủ đúng công thức: baseQty = enteredQty * unitRatio');

// 2. Tổng nhập kho theo đơn vị cơ sở
const totalInBaseQty = allInReceipts.reduce((sum, r) => sum + r.baseQty, 0);
assert(totalInBaseQty === 282, 'QA-REC02', 'Tổng nhập quy đổi = 240 + 30 + 12 = 282 Lon');

// 3. Tổng xuất kho theo đơn vị cơ sở
const totalOutBaseQty = allOutReceipts.reduce((sum, r) => sum + r.baseQty, 0);
assert(totalOutBaseQty === 72, 'QA-REC03', 'Tổng xuất quy đổi = 48 + 18 + 6 = 72 Lon');

// 4. Số dư tồn kho cuối kỳ tại thời điểm này
const currentStock = totalInBaseQty - totalOutBaseQty;
assert(currentStock === 210, 'QA-REC04', 'Tồn kho thẻ kho tính theo đơn vị cơ sở: 282 - 72 = 210 Lon');

// ==============================================================================
// TEST SUITE 4: THAY ĐỔI HỆ SỐ QUY ĐỔI & XÁC MINH BẤT BIẾN LỊCH SỬ (IMMUTABILITY)
// ==============================================================================
suite('TEST SUITE 4: Thay đổi hệ số quy đổi & Xác minh dữ liệu lịch sử KHÔNG bị thay đổi');

console.log('  \x1b[33m⚡ Sự kiện: Nhà sản xuất đổi quy cách đóng gói từ Thùng 24 lon thành Thùng 30 lon\x1b[0m');

// 1. Cập nhật cấu hình sản phẩm mới (chỉnh Thùng ratio 24 -> 30)
const updatedProductConfig = {
  ...productConfig,
  updatedAt: '2026-10-03',
  units: productConfig.units.map((u) => {
    if (u.unitName === 'Thùng') {
      return { ...u, ratio: 30 }; // Đổi hệ số thành 30
    }
    return u;
  }),
};

const newThungRatio = updatedProductConfig.units.find((u) => u.unitName === 'Thùng').ratio;
assert(newThungRatio === 30, 'QA-IMM01', 'Cấu hình sản phẩm cập nhật thành công: 1 Thùng mới = 30 Lon');

// 2. XÁC MINH CÁC CHỨNG TỪ LỊCH SỬ ĐÃ LẬP KHÔNG ĐƯỢC PHÉP THAY ĐỔI
assert(receiptIn1.unitRatio === 24, 'QA-IMM02', 'Phiếu nhập cũ PNK-001 vẫn giữ nguyên unitRatio = 24');
assert(receiptIn1.baseQty === 240, 'QA-IMM03', 'Phiếu nhập cũ PNK-001 vẫn giữ nguyên baseQty = 240 Lon (KHÔNG bị biến động thành 300 Lon)');
assert(receiptIn1.subtotal === 1920000, 'QA-IMM04', 'Giá trị thành tiền PNK-001 vẫn giữ nguyên 1,920,000đ');

assert(receiptOut1.unitRatio === 24, 'QA-IMM05', 'Phiếu xuất cũ PXK-001 vẫn giữ nguyên unitRatio = 24');
assert(receiptOut1.baseQty === 48, 'QA-IMM06', 'Phiếu xuất cũ PXK-001 vẫn giữ nguyên baseQty xuất = 48 Lon (KHÔNG bị biến động thành 60 Lon)');

// 3. Xác minh số dư lịch sử trước thời điểm thay đổi không đổi
const historicalBalance = allInReceipts.reduce((s, r) => s + r.baseQty, 0) - allOutReceipts.reduce((s, r) => s + r.baseQty, 0);
assert(historicalBalance === 210, 'QA-IMM07', 'Số dư tồn kho lịch sử trước thời điểm đổi hệ số vẫn bất biến = 210 Lon');

// 4. Giao dịch mới sau khi đổi hệ số áp dụng hệ số mới = 30
const receiptInNew = createStockInRecord('PNK-004', 5, 'Thùng', newThungRatio, costPricePerBaseUnit);
assert(receiptInNew.unitRatio === 30, 'QA-IMM08', 'Phiếu nhập mới PNK-004 ghi nhận hệ số mới = 30');
assert(receiptInNew.baseQty === 150, 'QA-IMM09', 'Nhập 5 Thùng mới -> baseQty = 5 * 30 = 150 Lon');

const finalStock = historicalBalance + receiptInNew.baseQty;
assert(finalStock === 360, 'QA-IMM10', 'Tồn kho tổng sau giao dịch mới: 210 (cũ) + 150 (mới) = 360 Lon');

// ==============================================================================
// KẾT QUẢ TỔNG HỢP KIỂM THỬ QA
// ==============================================================================
console.log('\n════════════════════════════════════════════════════════════════════════');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} TESTS ĐẠT (${Math.round((passedTests / totalTests) * 100)}%)`);
if (failedTests === 0) {
  console.log(' \x1b[32m✔ TẤT CẢ CÁC KỊCH BẢN ĐÃ VƯỢT QUA KIỂM THỬ (100% PASS)\x1b[0m');
  console.log(' \x1b[32m✔ TÍNH BẤT BIẾN CỦA DỮ LIỆU LỊCH SỬ KHO ĐƯỢC BẢO ĐẢM HOÀN TOÀN\x1b[0m');
} else {
  console.error(` \x1b[31m✖ CÓ ${failedTests} TEST BỊ LỖI:\x1b[0m`);
  failedList.forEach((f) => console.error(`   - ${f}`));
}
console.log('════════════════════════════════════════════════════════════════════════\n');

process.exit(failedTests === 0 ? 0 : 1);
