import pandas as pd
import io
from typing import List, Dict, Any

EXISTING_PRODUCTS_DB = {
    "SKU001": {"name": "Sản phẩm A", "category": "Thực phẩm", "unit": "Hộp", "cost_price": 10000.0, "status": "ACTIVE"}
}

REQUIRED_COLUMNS = ["SKU", "Tên sản phẩm", "Nhóm hàng", "Đơn vị tính", "Giá vốn"]

class ProductImportService:

    @staticmethod
    def generate_template_excel() -> bytes:
        df = pd.DataFrame(columns=REQUIRED_COLUMNS)
        df.loc[0] = ["SKU002", "Nước giải khát Sting", "Đồ uống", "Lon", 8000.0]
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='SampleTemplate')
        return output.getvalue()

    @staticmethod
    def parse_and_validate_excel(file_bytes: bytes) -> Dict[str, Any]:
        try:
            df = pd.read_excel(io.BytesIO(file_bytes))
        except Exception as e:
            raise ValueError(f"Không thể đọc file Excel: {str(e)}")

        missing_cols = [col for col in REQUIRED_COLUMNS if col not in df.columns]
        if missing_cols:
            raise ValueError(f"File Excel thiếu các cột bắt buộc: {', '.join(missing_cols)}")

        seen_skus_in_file = set()
        valid_data = []
        errors = []
        
        to_create_count = 0
        to_update_count = 0

        for idx, row in df.iterrows():
            row_num = idx + 2
            row_errors = []

            sku = str(row.get("SKU", "")).strip() if pd.notna(row.get("SKU")) else ""
            name = str(row.get("Tên sản phẩm", "")).strip() if pd.notna(row.get("Tên sản phẩm")) else ""
            category = str(row.get("Nhóm hàng", "")).strip() if pd.notna(row.get("Nhóm hàng")) else ""
            unit = str(row.get("Đơn vị tính", "")).strip() if pd.notna(row.get("Đơn vị tính")) else ""
            cost_price_raw = row.get("Giá vốn")

            # Validate field bắt buộc
            if not sku:
                row_errors.append("Mã SKU không được để trống")
            if not name:
                row_errors.append("Tên sản phẩm không được để trống")
            if not category:
                row_errors.append("Nhóm hàng không được để trống")
            if not unit:
                row_errors.append("Đơn vị tính không được để trống")

            # Validate Giá vốn
            cost_price = 0.0
            try:
                if pd.isna(cost_price_raw):
                    row_errors.append("Giá vốn không được để trống")
                else:
                    cost_price = float(cost_price_raw)
                    if cost_price < 0:
                        row_errors.append("Giá vốn phải lớn hơn hoặc bằng 0")
            except Exception:
                row_errors.append("Giá vốn phải là số hợp lệ")

            # Kiểm tra trùng lặp SKU trong file (chỉ check khi SKU không rỗng)
            if sku:
                if sku in seen_skus_in_file:
                    row_errors.append(f"Mã SKU '{sku}' bị trùng lặp trong file Excel")
                else:
                    seen_skus_in_file.add(sku)

            if row_errors:
                errors.append({"row_number": row_num, "sku": sku, "errors": row_errors})
            else:
                # Phân loại CREATE hoặc UPDATE
                action = "UPDATE" if sku in EXISTING_PRODUCTS_DB else "CREATE"
                if action == "CREATE":
                    to_create_count += 1
                else:
                    to_update_count += 1

                valid_data.append({
                    "row_number": row_num,
                    "sku": sku,
                    "name": name,
                    "category": category,
                    "unit": unit,
                    "cost_price": cost_price,
                    "action": action
                })

        return {
            "total_rows": len(df),
            "valid_rows_count": len(valid_data),
            "invalid_rows_count": len(errors),
            "to_create_count": to_create_count,
            "to_update_count": to_update_count,
            "valid_data": valid_data,
            "errors": errors
        }

    @staticmethod
    def execute_import(valid_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        created_skus = []
        updated_skus = []
        errors = []

        for item in valid_data:
            sku = item["sku"]
            try:
                EXISTING_PRODUCTS_DB[sku] = {
                    "name": item["name"],
                    "category": item["category"],
                    "unit": item["unit"],
                    "cost_price": item["cost_price"],
                    "status": "ACTIVE"
                }
                if item["action"] == "CREATE":
                    created_skus.append(sku)
                else:
                    updated_skus.append(sku)
            except Exception as e:
                errors.append({"row_number": item["row_number"], "sku": sku, "errors": [str(e)]})

        return {
            "success_count": len(created_skus) + len(updated_skus),
            "failed_count": len(errors),
            "created_skus": created_skus,
            "updated_skus": updated_skus,
            "errors": errors
        }