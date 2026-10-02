import datetime

# ==========================================
# LOGIC QUY ĐỔI ĐƠN VỊ KHO (SCRUM-391 / SCRUM-215)
# ==========================================

# Danh mục Đơn vị tính của sản phẩm (Ví dụ SKU Coca)
PRODUCT_UNITS = [
    {"id": 1, "product_id": 101, "unit_name": "Lon", "conversion_rate": 1.0, "is_base_unit": True},
    {"id": 2, "product_id": 101, "unit_name": "Lốc", "conversion_rate": 6.0, "is_base_unit": False},
    {"id": 3, "product_id": 101, "unit_name": "Thùng", "conversion_rate": 24.0, "is_base_unit": False},
]

# Sổ kho lưu trữ giao dịch
WAREHOUSE_LEDGER = []

def ghi_so_kho(ma_giao_dich: str, loai_giao_dich: str, product_id: int, unit_id_nhap: int, so_luong_nhap: float):
    don_vi_chon = None
    for unit in PRODUCT_UNITS:
        if unit["id"] == unit_id_nhap and unit["product_id"] == product_id:
            don_vi_chon = unit
            break

    if not don_vi_chon:
        print("❌ Lỗi: Không tìm thấy đơn vị tính hợp lệ!")
        return None

    # Quy đổi về đơn vị cơ sở
    he_so_quy_doi = don_vi_chon["conversion_rate"]
    so_luong_co_so = so_luong_nhap * he_so_quy_doi

    # Lưu snapshot hệ số quy đổi
    ban_ghi = {
        "id": len(WAREHOUSE_LEDGER) + 1,
        "ma_giao_dich": ma_giao_dich,
        "loai_giao_dich": loai_giao_dich,
        "product_id": product_id,
        "don_vi_nhap": don_vi_chon["unit_name"],
        "so_luong_nhap": so_luong_nhap,
        "he_so_quy_doi_luc_ghi_so": he_so_quy_doi,
        "so_luong_co_so": so_luong_co_so,
        "ngay_tao": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    WAREHOUSE_LEDGER.append(ban_ghi)
    print(f"✅ Ghi sổ thành công {ma_giao_dich}: {so_luong_nhap} {don_vi_chon['unit_name']} -> {so_luong_co_so} (Đơn vị cơ sở)")
    return ban_ghi

if __name__ == "__main__":
    print("--- CHẠY THỬ NGHIỆM TẠI backend/tests/tvp_sprint2 ---")
    ghi_so_kho("NK001", "NHAP_KHO", 101, 3, 10)  # 10 Thùng = 240 Lon
    ghi_so_kho("XK001", "XUAT_KHO", 101, 2, 5)   # 5 Lốc = 30 Lon