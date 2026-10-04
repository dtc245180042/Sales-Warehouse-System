"""Bộ quản lý và in báo cáo kết quả kiểm thử nghiệp vụ (Test Reporter)."""

import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

class BoBaoCaoKiemThu:
    def __init__(self, ten_goi: str = "TỔNG HỢP"):
        self.ten_goi = ten_goi
        self.danh_sach = []

    def ghi_nhan(self, ma_tc: str, ten_tc: str, pass_dk: bool, chi_tiet: str = ""):
        trang_thai = "PASS" if pass_dk else "FAIL"
        self.danh_sach.append({
            "ma": ma_tc,
            "ten": ten_tc,
            "trang_thai": trang_thai,
            "chi_tiet": chi_tiet
        })
        ky_hieu = "[PASS]" if pass_dk else "[FAIL]"
        print(f"  {ky_hieu} {ma_tc} - {ten_tc}")
        if not pass_dk and chi_tiet:
            print(f"         --> Chi tiết lỗi: {chi_tiet}")

    def in_bang_tong_hop(self):
        tong = len(self.danh_sach)
        so_pass = sum(1 for item in self.danh_sach if item["trang_thai"] == "PASS")
        so_fail = tong - so_pass

        print("\n" + "=" * 80)
        print(f"       KẾT QUẢ KIỂM THỬ: {self.ten_goi.upper()}")
        print("=" * 80)
        print(f"{'Mã TC':<10} | {'Tên Kịch Bản Kiểm Thử':<45} | {'Kết Quả':<8}")
        print("-" * 80)
        for item in self.danh_sach:
            print(f"{item['ma']:<10} | {item['ten']:<45} | {item['trang_thai']:<8}")
        print("=" * 80)
        print(f"TỔNG SỐ TEST: {tong} | PASS: {so_pass} | FAIL: {so_fail}")
        if so_fail == 0:
            print(f">>> ĐẠT CHUẨN 100% CHO PHÂN HỆ: [{self.ten_goi}] <<<")
        else:
            print(f">>> CẢNH BÁO: CÓ {so_fail} TEST CASE KHÔNG ĐẠT TRONG [{self.ten_goi}]! <<<")
        print("=" * 80 + "\n")
        return so_fail == 0
