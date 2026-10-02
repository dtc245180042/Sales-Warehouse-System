import datetime

# ==========================================
# DANH MỤC ĐƠN VỊ TÍNH VÀ HỆ SỐ QUY ĐỔI (SCRUM-393)
# ==========================================
# Thêm trường effective_from và is_active để hỗ trợ Versioning hệ số quy đổi
PRODUCT_UNITS = [
    {
        "id": 1,
        "product_id": 101,
        "unit_name": "Thùng",
        "conversion_rate": 24.0,  # Hệ số cũ: 1 Thùng = 24 Lon
        "effective_from": "2026-01-01 00:00:00",
        "is_active": False  # Đã hủy kích hoạt khi có hệ số mới
    },
    {
        "id": 2,
        "product_id": 101,
        "unit_name": "Thùng",
        "conversion_rate": 30.0,  # Hệ số mới: 1 Thùng = 30 Lon (Áp dụng từ hiện tại)
        "effective_from": "2026-10-02 00:00:00",
        "is_active": True
    }
]

WAREHOUSE_LEDGER = []

def cap_nhat_he_so_quy_doi(product_id: int, unit_name: str, he_so_moi: float):
    """
    Ràng buộc SCRUM-393: Không sửa trực tiếp dòng cũ.
    Deactivate dòng cũ và thêm phiên bản (version) hệ số mới.
    """
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Khoá/Vô hiệu hoá hệ số cũ
    for unit in PRODUCT_UNITS:
        if unit["product_id"] == product_id and unit["unit_name"] == unit_name and unit["is_active"]:
            unit["is_active"] = False

    # Thêm bản ghi version mới
    new_version = {
        "id": len(PRODUCT_UNITS) + 1,
        "product_id": product_id,
        "unit_name": unit_name,
        "conversion_rate": he_so_moi,
        "effective_from": now_str,
        "is_active": True
    }
    PRODUCT_UNITS.append(new_version)
    print(f"🔄 Đã cập nhật hệ số quy đổi mới cho '{unit_name}': 1 {unit_name} = {he_so_moi} đơn vị cơ sở (Áp dụng từ {now_str})")

def ghi_so_kho(ma_giao_dich: str, loai_giao_dich: str, product_id: int, unit_name: str, so_luong_nhap: float):
    """
    Lấy hệ số quy đổi ĐANG KÍCH HOẠT (active) tại thời điểm ghi sổ.
    Ghi nhận snapshot hệ số quy đổi vào bản ghi giao dịch để bảo toàn lịch sử.
    """
    don_vi_hien_tai = None
    for unit in PRODUCT_UNITS:
        if unit["product_id"] == product_id and unit["unit_name"] == unit_name and unit["is_active"]:
            don_vi_hien_tai = unit
            break

    if not don_vi_hien_tai:
        print(f"❌ Lỗi: Không tìm thấy đơn vị tính '{unit_name}' đang kích hoạt!")
        return None

    he_so_quy_doi = don_vi_hien_tai["conversion_rate"]
    so_luong_co_so = so_luong_nhap * he_so_quy_doi

    ban_ghi = {
        "id": len(WAREHOUSE_LEDGER) + 1,
        "ma_giao_dich": ma_giao_dich,
        "loai_giao_dich": loai_giao_dich,
        "product_id": product_id,
        "don_vi_nhap": unit_name,
        "so_luong_nhap": so_luong_nhap,
        "he_so_quy_doi_luc_ghi_so": he_so_quy_doi,  # Snapshot bảo toàn lịch sử
        "so_luong_co_so": so_luong_co_so,
        "ngay_tao": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    WAREHOUSE_LEDGER.append(ban_ghi)
    print(f"✅ Ghi sổ {ma_giao_dich}: {so_luong_nhap} {unit_name} -> {so_luong_co_so} cơ sở (Hệ số áp dụng: {he_so_quy_doi})")
    return ban_ghi

if __name__ == "__main__":
    print("--- KIỂM THỬ RÀNG BUỘC THAY ĐỔI HỆ SỐ QUY ĐỔI (SCRUM-393) ---")
    
    # 1. Ghi sổ giao dịch cũ trước khi thay đổi hệ số
    print("\n1. Giao dịch Quá khứ (Khi hệ số 1 Thùng = 24 Lon):")
    ghi_so_kho("NK001", "NHAP_KHO", 101, "Thùng", 10) # 10 Thùng * 24 = 240 Lon

    # 2. Thay đổi quy cách hệ số quy đổi thành 30
    print("\n2. Cập nhật hệ số quy đổi mới...")
    cap_nhat_he_so_quy_doi(101, "Thùng", 30.0)

    # 3. Ghi sổ giao dịch mới sau khi thay đổi hệ số
    print("\n3. Giao dịch Phát sinh Mới (Khi hệ số 1 Thùng = 30 Lon):")
    ghi_so_kho("NK002", "NHAP_KHO", 101, "Thùng", 10) # 10 Thùng * 30 = 300 Lon

    # 4. Kiểm tra lại sổ kho để đảm bảo giao dịch NK001 không bị lệch
    print("\n4. Kiểm tra toàn bộ Sổ Kho (Đảm bảo dữ liệu cũ NK001 vẫn giữ nguyên 240 Lon):")
    for bg in WAREHOUSE_LEDGER:
        print(f"   - Mã GD: {bg['ma_giao_dich']} | Số lượng nhập: {bg['so_luong_nhap']} {bg['don_vi_nhap']} | Hệ số lúc ghi: {bg['he_so_quy_doi_luc_ghi_so']} | Số lượng cơ sở: {bg['so_luong_co_so']}")