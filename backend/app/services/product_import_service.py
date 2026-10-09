import io
import re
from typing import List, Dict, Any, Optional
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from app.models.product import Product, ProductStatus
from app.models.category import Category
from app.models.audit_log import AuditLog

class ProductImportService:

    @staticmethod
    def generate_template_excel() -> io.BytesIO:
        """Tạo file mẫu Excel (.xlsx) chuẩn tiếng Việt cho việc nhập danh mục sản phẩm (SCRUM-216)."""
        wb = openpyxl.Workbook()

        # Sheet 1: Danh sách sản phẩm mẫu
        ws1 = wb.active
        ws1.title = "Danh_Sach_San_Pham"

        headers = [
            ("Mã SKU (*)", 18),
            ("Tên sản phẩm (*)", 32),
            ("Nhóm hàng", 22),
            ("Đơn vị tính (*)", 16),
            ("Quy cách đóng gói", 22),
            ("Giá vốn (VNĐ)", 16),
            ("Giá bán (VNĐ) (*)", 18),
            ("Mô tả sản phẩm", 30),
            ("Trạng thái", 16),
        ]

        # Style header
        header_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        thin_border = Border(
            left=Side(style='thin', color='CBD5E1'),
            right=Side(style='thin', color='CBD5E1'),
            top=Side(style='thin', color='CBD5E1'),
            bottom=Side(style='thin', color='CBD5E1')
        )

        ws1.row_dimensions[1].height = 28
        for col_idx, (header_text, width) in enumerate(headers, 1):
            cell = ws1.cell(row=1, column=col_idx, value=header_text)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
            cell.border = thin_border
            col_letter = get_column_letter(col_idx)
            ws1.column_dimensions[col_letter].width = width

        # Dữ liệu mẫu minh họa theo Cách 1: Mã thông minh phân cấp [NHÓM]-[HÃNG]-[MODEL]-[THUỘC TÍNH]
        sample_rows = [
            ["NGK-COCA-330-LON", "Nước ngọt Coca Cola lon 330ml", "Nước giải khát", "Lon", "24 lon/thùng", 7500, 10000, "Nước ngọt có gas hương cola", "ACTIVE"],
            ["NGK-PEPSI-330-LON", "Nước ngọt Pepsi lon 330ml", "Nước giải khát", "Lon", "24 lon/thùng", 7200, 9500, "Nước giải khát có gas vị chanh", "ACTIVE"],
            ["BR-BIHN-330-LON", "Bia Hà Nội lon 330ml", "Bia & Rượu", "Lon", "24 lon/thùng", 9500, 13000, "Bia lon vàng truyền thống", "ACTIVE"],
            ["DT-APL-IP15-128", "Điện thoại Apple iPhone 15 128GB", "Điện thoại & Tablet", "Chiếc", "1 chiếc/hộp", 18500000, 21990000, "Hàng chính hãng VN/A", "ACTIVE"],
            ["GD-SUN-SHD-CHAO", "Chảo chống dính Sunhouse 26cm", "Đồ gia dụng", "Chiếc", "10 chiếc/thùng", 120000, 185000, "Chảo nhôm đúc phủ chống dính", "ACTIVE"],
            ["NK-AQUA-500-CHAI", "Nước khoáng Aquafina 500ml", "Nước khoáng", "Chai", "24 chai/thùng", 4000, 6000, "Nước khoáng tinh khiết đóng chai", "ACTIVE"]
        ]

        data_font = Font(name="Calibri", size=10)
        data_align_left = Alignment(horizontal="left", vertical="center")
        data_align_right = Alignment(horizontal="right", vertical="center")
        data_align_center = Alignment(horizontal="center", vertical="center")

        for row_idx, row_data in enumerate(sample_rows, 2):
            ws1.row_dimensions[row_idx].height = 20
            for col_idx, val in enumerate(row_data, 1):
                cell = ws1.cell(row=row_idx, column=col_idx, value=val)
                cell.font = data_font
                cell.border = thin_border
                if col_idx in [6, 7]:  # Giá
                    cell.alignment = data_align_right
                    cell.number_format = '#,##0'
                elif col_idx in [1, 4, 9]:
                    cell.alignment = data_align_center
                else:
                    cell.alignment = data_align_left

        # Sheet 2: Hướng dẫn
        ws2 = wb.create_sheet(title="Huong_Dan")
        ws2.column_dimensions["A"].width = 28
        ws2.column_dimensions["B"].width = 65

        guide_header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
        ws2.cell(row=1, column=1, value="Quy tắc nghiệp vụ").fill = guide_header_fill
        ws2.cell(row=1, column=1).font = header_font
        ws2.cell(row=1, column=2, value="Chi tiết hướng dẫn nhập dữ liệu").fill = guide_header_fill
        ws2.cell(row=1, column=2).font = header_font

        guides = [
            ("Quy chuẩn Mã SKU (*)", "ÁP DỤNG CÁCH 1: MÃ THÔNG MINH PHÂN CẤP:\n• Cấu trúc: [MÃ_NHÓM]-[THƯƠNG_HIỆU]-[MODEL/TÊN]-[THUỘC_TÍNH]\n• Ví dụ: DT-APL-IP15-128 (Điện thoại - Apple - iPhone 15 - 128GB)\n• Định dạng: CHỮ IN HOA, không dấu tiếng Việt, không chứa khoảng trắng, các thành phần nối bằng dấu gạch ngang (-)."),
            ("Tên sản phẩm (*)", "Bắt buộc. Tên đầy đủ, rõ ràng của sản phẩm."),
            ("Nhóm hàng", "Tùy chọn. Nhập tên nhóm hàng (ví dụ: Nước giải khát, Điện thoại & Tablet, Đồ gia dụng,...)."),
            ("Đơn vị tính (*)", "Bắt buộc. Đơn vị tính cơ sở (ví dụ: Lon, Chai, Cái, Chiếc, Thùng, Hộp, Kg,...). Mặc định là 'Cái' nếu bỏ trống."),
            ("Quy cách đóng gói", "Tùy chọn. Mô tả đóng gói (ví dụ: 24 lon/thùng, 1 chiếc/hộp,...)."),
            ("Giá vốn (VNĐ)", "Tùy chọn. Chỉ Quản lý kinh doanh và Admin xem được. Nhập số >= 0."),
            ("Giá bán (VNĐ) (*)", "Bắt buộc. Giá bán niêm yết của sản phẩm. Nhập số >= 0."),
            ("Mô tả sản phẩm", "Tùy chọn. Mô tả chi tiết hoặc thông số sản phẩm."),
            ("Trạng thái", "Nhập 'ACTIVE' (đang kinh doanh) hoặc 'INACTIVE' (ngừng kinh doanh)."),
            ("Quy tắc Tạo/Cập nhật", "Nếu mã SKU chưa có trong hệ thống -> TẠO MỚI (CREATE).\nNếu mã SKU đã có trong hệ thống -> CẬP NHẬT (UPDATE) thông tin theo file Excel."),
            ("Quy mô dữ liệu lớn", "Hệ thống hỗ trợ nhập đến 5.000 - 10.000 sản phẩm trong một lần nhập. Vui lòng giữ đúng cấu trúc cột."),
        ]

        for r_idx, (rule, detail) in enumerate(guides, 2):
            c1 = ws2.cell(row=r_idx, column=1, value=rule)
            c2 = ws2.cell(row=r_idx, column=2, value=detail)
            c1.font = Font(name="Calibri", size=10, bold=True)
            c2.font = data_font
            c1.border = thin_border
            c2.border = thin_border
            c1.alignment = Alignment(vertical="top")
            c2.alignment = Alignment(vertical="top", wrap_text=True)
            ws2.row_dimensions[r_idx].height = 24

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output

    @staticmethod
    def _normalize_header(col_name: str) -> str:
        c = str(col_name).strip().lower()
        c = re.sub(r'[\(\*\)]', '', c).strip()
        
        mapping = {
            'mã sku': 'sku',
            'sku': 'sku',
            'mã sp': 'sku',
            'mã sản phẩm': 'sku',
            'tên sản phẩm': 'name',
            'tên sp': 'name',
            'tên': 'name',
            'name': 'name',
            'nhóm hàng': 'category',
            'danh mục': 'category',
            'category': 'category',
            'category_id': 'category_id',
            'đơn vị tính': 'unit',
            'đơn vị': 'unit',
            'dvt': 'unit',
            'unit': 'unit',
            'quy cách đóng gói': 'packaging_spec',
            'quy cách': 'packaging_spec',
            'packaging_spec': 'packaging_spec',
            'giá vốn': 'cost_price',
            'giá vốn vnđ': 'cost_price',
            'cost_price': 'cost_price',
            'giá bán': 'price',
            'giá bán vnđ': 'price',
            'giá bán niêm yết': 'price',
            'giá bán niêm yết vnđ': 'price',
            'price': 'price',
            'số lượng': 'quantity',
            'tồn kho': 'quantity',
            'quantity': 'quantity',
            'mô tả': 'description',
            'mô tả sản phẩm': 'description',
            'description': 'description',
            'trạng thái': 'status',
            'status': 'status',
        }
        return mapping.get(c, c)

    @staticmethod
    def preview_import(file_bytes: bytes, db: Session) -> dict:
        """SCRUM-216: Đọc file Excel/CSV, kiểm tra hợp lệ từng dòng, phân loại CREATE/UPDATE."""
        try:
            df = pd.read_excel(io.BytesIO(file_bytes))
        except Exception:
            try:
                df = pd.read_csv(io.BytesIO(file_bytes))
            except Exception as e:
                return {
                    "total_rows": 0,
                    "valid_count": 0,
                    "invalid_rows_count": 1,
                    "to_create_count": 0,
                    "to_update_count": 0,
                    "valid_data": [],
                    "errors": [{"row": 0, "sku": "", "errors": [f"Không thể đọc file: {str(e)}"]}]
                }

        # Đổi tên cột chuẩn hóa
        new_cols = {}
        for col in df.columns:
            new_cols[col] = ProductImportService._normalize_header(col)
        df.rename(columns=new_cols, inplace=True)

        valid_data = []
        errors = []
        to_create_count = 0
        to_update_count = 0

        # Lấy danh sách SKU hiện có trong DB
        existing_products = {p.sku: p for p in db.query(Product).all()}
        # Cache nhóm hàng
        category_map = {c.name.strip().lower(): c.id for c in db.query(Category).all()}

        seen_skus_in_file = set()

        for index, row in df.iterrows():
            row_num = index + 2
            raw_sku = str(row.get("sku", "")).strip()
            # Chuẩn hóa theo Cách 1: IN HOA, thay khoảng trắng thành dấu gạch ngang
            sku = re.sub(r'\s+', '-', raw_sku).upper() if raw_sku and raw_sku.lower() != "nan" else ""
            name = str(row.get("name", "")).strip()
            category = str(row.get("category", "")).strip() if pd.notna(row.get("category")) else ""
            category_id = row.get("category_id")
            unit = str(row.get("unit", "")).strip() if pd.notna(row.get("unit")) else "cái"
            packaging_spec = str(row.get("packaging_spec", "")).strip() if pd.notna(row.get("packaging_spec")) else ""
            cost_price = row.get("cost_price", 0.0)
            price = row.get("price")
            quantity = row.get("quantity", 0)
            description = str(row.get("description", "")).strip() if pd.notna(row.get("description")) else ""
            status_val = str(row.get("status", "")).strip().upper() if pd.notna(row.get("status")) else "ACTIVE"

            # Validate từng trường
            row_errors = []
            if not sku or sku.lower() == "nan":
                row_errors.append("Mã SKU không được để trống")
            elif len(sku) > 50:
                row_errors.append("Mã SKU tối đa 50 ký tự")
            elif sku in seen_skus_in_file:
                row_errors.append(f"Mã SKU '{sku}' bị trùng lặp trong tệp Excel")
            else:
                seen_skus_in_file.add(sku)

            if not name or name.lower() == "nan":
                row_errors.append("Tên sản phẩm không được để trống")
            elif len(name) > 255:
                row_errors.append("Tên sản phẩm tối đa 255 ký tự")

            # Parse giá bán
            parsed_price = 0.0
            if pd.isna(price) or price is None or str(price).strip().lower() == "nan":
                row_errors.append("Giá bán niêm yết không được để trống")
            else:
                try:
                    cleaned_price = str(price).replace(",", "").replace(".", "").replace("đ", "").replace("VND", "").strip()
                    # Trường hợp số thực thông thường
                    if isinstance(price, (int, float)):
                        parsed_price = float(price)
                    else:
                        parsed_price = float(cleaned_price)
                    if parsed_price < 0:
                        row_errors.append("Giá bán phải lớn hơn hoặc bằng 0")
                except Exception:
                    row_errors.append(f"Giá bán không hợp lệ: '{price}'")

            # Parse giá vốn
            parsed_cost_price = 0.0
            if pd.notna(cost_price) and str(cost_price).strip().lower() != "nan":
                try:
                    if isinstance(cost_price, (int, float)):
                        parsed_cost_price = float(cost_price)
                    else:
                        cleaned_cost = str(cost_price).replace(",", "").replace(".", "").replace("đ", "").replace("VND", "").strip()
                        parsed_cost_price = float(cleaned_cost)
                    if parsed_cost_price < 0:
                        row_errors.append("Giá vốn phải lớn hơn hoặc bằng 0")
                except Exception:
                    row_errors.append(f"Giá vốn không hợp lệ: '{cost_price}'")

            # Parse category_id nếu có
            resolved_category_id = None
            if pd.notna(category_id) and str(category_id).strip().isdigit():
                resolved_category_id = int(category_id)
            elif category and category.lower() in category_map:
                resolved_category_id = category_map[category.lower()]

            # Trạng thái
            resolved_status = ProductStatus.ACTIVE
            if status_val in ["INACTIVE", "NGỪNG KINH DOANH", "NGUNG KINH DOANH"]:
                resolved_status = ProductStatus.INACTIVE

            if row_errors:
                errors.append({
                    "row": row_num,
                    "sku": sku if sku and sku.lower() != "nan" else f"Dòng {row_num}",
                    "errors": row_errors
                })
            else:
                is_update = sku in existing_products
                if is_update:
                    to_update_count += 1
                else:
                    to_create_count += 1

                valid_data.append({
                    "sku": sku,
                    "name": name,
                    "category": category if category and category.lower() != "nan" else None,
                    "category_id": resolved_category_id,
                    "unit": unit if unit and unit.lower() != "nan" else "cái",
                    "packaging_spec": packaging_spec if packaging_spec and packaging_spec.lower() != "nan" else None,
                    "cost_price": parsed_cost_price,
                    "price": parsed_price,
                    "quantity": int(quantity) if (pd.notna(quantity) and str(quantity).isdigit()) else 0,
                    "description": description if description and description.lower() != "nan" else None,
                    "status": resolved_status,
                    "action": "UPDATE" if is_update else "CREATE"
                })

        return {
            "total_rows": len(df),
            "valid_count": len(valid_data),
            "invalid_rows_count": len(errors),
            "to_create_count": to_create_count,
            "to_update_count": to_update_count,
            "valid_data": valid_data,
            "errors": errors
        }

    @staticmethod
    def execute_import(valid_data: list, db: Session, user_info: dict = None) -> dict:
        """SCRUM-216: Thực hiện lưu các bản ghi hợp lệ vào Database tối ưu tốc độ cho 5.000 - 10.000 sản phẩm."""
        created_skus = []
        updated_skus = []

        user_name = user_info.get("username", "admin") if user_info else "system"
        user_id = user_info.get("id") if user_info else None
        user_role = user_info.get("role", "SalesManager") if user_info else "SalesManager"

        # Tối ưu hóa N+1 query: Lấy toàn bộ sản phẩm hiện có theo danh sách SKU bằng 1 câu query duy nhất
        skus_in_data = [str(item["sku"]).strip().upper() for item in valid_data if item.get("sku")]
        existing_products_map = {
            p.sku.upper(): p
            for p in db.query(Product).filter(Product.sku.in_(skus_in_data)).all()
        }

        for item in valid_data:
            sku = str(item["sku"]).strip().upper()
            existing = existing_products_map.get(sku)

            if existing:
                existing.name = item["name"]
                if item.get("category"):
                    existing.category = item["category"]
                if item.get("category_id"):
                    existing.category_id = item["category_id"]
                if item.get("unit"):
                    existing.unit = item["unit"]
                if item.get("packaging_spec"):
                    existing.packaging_spec = item["packaging_spec"]
                if "cost_price" in item and item["cost_price"] is not None:
                    existing.cost_price = float(item["cost_price"])
                if "price" in item and item["price"] is not None:
                    existing.price = float(item["price"])
                if item.get("description"):
                    existing.description = item["description"]
                if item.get("status"):
                    existing.status = item["status"]

                updated_skus.append(sku)
            else:
                new_product = Product(
                    sku=sku,
                    name=item["name"],
                    category=item.get("category"),
                    category_id=item.get("category_id"),
                    unit=item.get("unit") or "cái",
                    packaging_spec=item.get("packaging_spec"),
                    cost_price=float(item.get("cost_price", 0.0)),
                    price=float(item.get("price", 0.0)),
                    description=item.get("description"),
                    status=item.get("status") or ProductStatus.ACTIVE,
                    is_active=True,
                    has_transactions=False
                )
                db.add(new_product)
                existing_products_map[sku] = new_product
                created_skus.append(sku)

        # Ghi 1 AuditLog tổng hợp cho toàn bộ phiên import hàng loạt (tránh làm nghẽn DB với 5000 audit log đơn lẻ)
        try:
            audit = AuditLog(
                entity_type="PRODUCT_IMPORT",
                entity_id=f"BATCH-{len(created_skus) + len(updated_skus)}",
                entity_name="Nhập danh mục sản phẩm từ Excel",
                action="IMPORT_EXCEL_BATCH",
                old_values={"total_items": len(valid_data)},
                new_values={"created": len(created_skus), "updated": len(updated_skus)},
                change_summary=f"Nhập hàng loạt thành công {len(created_skus) + len(updated_skus)} sản phẩm ({len(created_skus)} tạo mới, {len(updated_skus)} cập nhật)",
                user_id=user_id,
                username=user_name,
                user_role=user_role,
                status="success"
            )
            db.add(audit)
        except Exception:
            pass

        db.commit()

        return {
            "success_count": len(created_skus) + len(updated_skus),
            "created_count": len(created_skus),
            "updated_count": len(updated_skus),
            "created_skus": created_skus,
            "updated_skus": updated_skus,
            "failed_count": 0
        }