import datetime

# Danh mục quy đổi đơn vị tính
PRODUCT_UNITS = [
    {"product_id": 101, "unit_name": "Thùng", "conversion_rate": 24.0, "is_active": True},
    {"product_id": 101, "unit_name": "Lốc", "conversion_rate": 6.0, "is_active": True},
    {"product_id": 101, "unit_name": "Lon", "conversion_rate": 1.0, "is_active": True}
]

# Sổ kho lưu trữ giao dịch
WAREHOUSE_LEDGER = []

def ghi_so_kho(ma_giao_dich: str, loai_giao_dich: str, product_id: int, unit_name: str, so_luong_nhap: float):
    """Ghi sổ giao dịch và lưu snapshot hệ số quy đổi."""
    don_vi = next((u for u in PRODUCT_UNITS if u["product_id"] == product_id and u["unit_name"] == unit_name and u["is_active"]), None)
    if not don_vi:
        return None

    he_so = don_vi["conversion_rate"]
    so_luong_co_so = so_luong_nhap * he_so

    ban_ghi = {
        "id": len(WAREHOUSE_LEDGER) + 1,
        "ma_giao_dich": ma_giao_dich,
        "loai_giao_dich": loai_giao_dich,
        "product_id": product_id,
        "don_vi_nhap": unit_name,
        "so_luong_nhap": so_luong_nhap,
        "he_so_quy_doi": he_so,
        "so_luong_co_so": so_luong_co_so,
        "ngay_tao": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    WAREHOUSE_LEDGER.append(ban_ghi)
    return ban_ghi

def lay_bao_cao_lich_su_giao_dich(product_id: int = None):
    """
    HÀM THỰC HIỆN YÊU CẦU SCRUM-392:
    Trả về dữ liệu báo cáo gồm song song cả số lượng theo đơn vị nhập
    và số lượng quy đổi về đơn vị cơ sở phục vụ hiển thị chứng từ, báo cáo.
    """
    ket_qua_bao_cao = []
    
    for bg in WAREHOUSE_LEDGER:
        if product_id is None or bg["product_id"] == product_id:
            bao_cao_item = {
                "ma_giao_dich": bg["ma_giao_dich"],
                "loai_giao_dich": bg["loai_giao_dich"],
                "hien_thi_don_hang": f"{bg['so_luong_nhap']} {bg['don_vi_nhap']}", # Hiển thị trên chứng từ nhập
                "hien_thi_quy_doi": f"{bg['so_luong_co_so']} Lon (Đơn vị cơ sở)",  # Hiển thị trên báo cáo tồn kho
                "chi_tiet": {
                    "so_luong_nhap": bg["so_luong_nhap"],
                    "don_vi_nhap": bg["don_vi_nhap"],
                    "he_so_quy_doi": bg["he_so_quy_doi"],
                    "so_luong_co_so": bg["so_luong_co_so"]
                },
                "ngay_tao": bg["ngay_tao"]
            }
            ket_qua_bao_cao.append(bao_cao_item)
            
    return ket_qua_bao_cao

if __name__ == "__main__":
    print("--- KIỂM THỬ TÍNH TOÁN VÀ HIỂN THỊ BÁO CÁO QUA SCRUM-392 ---")
    
    # 1. Phát sinh các giao dịch
    ghi_so_kho("NK001", "NHAP_KHO", 101, "Thùng", 10) # 10 Thùng = 240 Lon
    ghi_so_kho("XK001", "XUAT_KHO", 101, "Lốc", 5)    # 5 Lốc = 30 Lon
    ghi_so_kho("NK002", "NHAP_KHO", 101, "Lon", 50)   # 50 Lon = 50 Lon

    # 2. Lấy dữ liệu báo cáo lịch sử giao dịch (SCRUM-392)
    danh_sach_bao_cao = lay_bao_cao_lich_su_giao_dich(product_id=101)

    # 3. Hiển thị dạng bảng dữ liệu trả về cho Frontend/Báo cáo
    print("\n📋 KẾT QUẢ TRẢ VỀ DỮ LIỆU HIỂN THỊ CHỨNG TỪ & BÁO CÁO:")
    print("-" * 75)
    print(f"{'MÃ GD':<10} | {'LOẠI GD':<10} | {'ĐƠN VỊ NHẬP':<15} | {'QUY ĐỔI CƠ SỞ':<25}")
    print("-" * 75)
    for item in danh_sach_bao_cao:
        print(f"{item['ma_giao_dich']:<10} | {item['loai_giao_dich']:<10} | {item['hien_thi_don_hang']:<15} | {item['hien_thi_quy_doi']:<25}")
    print("-" * 75)