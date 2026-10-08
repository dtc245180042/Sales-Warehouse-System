from typing import Any
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import lay_nguoi_dung_hien_tai
from app.models.auth import User, UserRole
from app.services.product_import_service import ProductImportService
from app.schemas.import_schema import ImportPreviewResponse, ImportExecuteResponse

router = APIRouter(prefix="/product-imports", tags=["Product Imports (SCRUM-216)"])

# Kiểm tra quyền: Chỉ Quản lý kinh doanh (Sales Manager) hoặc Admin được import sản phẩm
def _kiem_tra_quyen_import_san_pham(current_user: User = Depends(lay_nguoi_dung_hien_tai)):
    user_role = (current_user.role or "").strip().lower()
    allowed_roles = [
        UserRole.ADMIN.value.lower(),
        UserRole.SALES_MANAGER.value.lower(),
        "admin",
        "sales manager",
        "sales_manager",
        "quản lý kinh doanh",
        "quan ly kinh doanh"
    ]
    if user_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền thực hiện nhập danh mục sản phẩm hàng loạt (Chỉ Quản lý kinh doanh và Admin)."
        )
    return current_user


@router.get("/template", summary="Tải tệp mẫu Excel danh mục sản phẩm (SCRUM-216 AC-1)")
def download_product_import_template(
    current_user: User = Depends(_kiem_tra_quyen_import_san_pham)
):
    """Cung cấp tệp Excel mẫu (.xlsx) chuẩn tiếng Việt có sẵn định dạng và dữ liệu mẫu."""
    excel_stream = ProductImportService.generate_template_excel()
    filename = "product_import_template.xlsx"
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.post("/preview", response_model=ImportPreviewResponse, summary="Xem trước & kiểm tra lỗi theo từng dòng từ Excel (SCRUM-216 AC-1)")
async def preview_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_kiem_tra_quyen_import_san_pham)
):
    """Phân tích tệp Excel, báo lỗi từng dòng, phân loại sản phẩm tạo mới (CREATE) vs cập nhật (UPDATE)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Vui lòng chọn tệp tin hợp lệ")
    
    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls') or filename_lower.endswith('.csv')):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ tệp định dạng Excel (.xlsx, .xls) hoặc CSV (.csv)")
    
    contents = await file.read()
    result = ProductImportService.preview_import(contents, db)
    return result


@router.post("/execute", response_model=ImportExecuteResponse, summary="Thực thi nhập một phần vào MySQL (SCRUM-216 AC-2)")
def execute_import(
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_kiem_tra_quyen_import_san_pham)
):
    """Lưu dữ liệu hợp lệ vào Database, cập nhật sản phẩm trùng SKU, bỏ qua dòng lỗi."""
    valid_data = payload.get("valid_data", payload) if isinstance(payload, dict) else payload
    if not isinstance(valid_data, list) or not valid_data:
        raise HTTPException(status_code=400, detail="Không có dữ liệu hợp lệ để nhập vào hệ thống")
    
    user_info = {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role
    }
    result = ProductImportService.execute_import(valid_data, db, user_info)
    return result