from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import lay_phien_db
from app.core.dependencies import yeu_cau_vai_tro
from app.models.auth import User, UserRole
from app.schemas.user_import import (
    UserImportPreviewResponse,
    UserImportSummaryResponse,
)
from app.services.user_import_service import UserImportService

router = APIRouter(prefix="/user-imports", tags=["User Imports"])

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.get(
    "/template",
    summary="Tải tệp mẫu Excel nhập danh sách người dùng hàng loạt (SC-209)",
    response_description="Tệp Excel mẫu (.xlsx) định dạng chuẩn có hướng dẫn và dữ liệu mẫu",
)
def download_user_import_template(
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
):
    """Cung cấp tệp Excel mẫu để quản trị viên tải về và nhập thông tin người dùng."""
    excel_stream = UserImportService.generate_template_excel()
    filename = "user_import_template.xlsx"

    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post(
    "/preview",
    response_model=UserImportPreviewResponse,
    summary="Xem trước dữ liệu và kiểm tra lỗi theo từng dòng từ tệp Excel (SC-209)",
)
async def preview_user_import(
    file: UploadFile = File(..., description="Tệp Excel danh sách người dùng (.xlsx)"),
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    db: Session = Depends(lay_phien_db),
):
    """Đọc dữ liệu người dùng từ file Excel, kiểm tra hợp lệ, trùng lặp và trả về kết quả xem trước."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên tệp không hợp lệ.",
        )

    lower_filename = file.filename.lower()
    if not (lower_filename.endswith(".xlsx") or lower_filename.endswith(".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Định dạng tệp không được hỗ trợ. Vui lòng tải lên tệp Excel (.xlsx).",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dung lượng tệp vượt quá giới hạn tối đa cho phép ({MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB).",
        )

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp rỗng, không chứa dữ liệu.",
        )

    try:
        preview_result = UserImportService.parse_and_validate_excel(
            file_bytes=file_bytes,
            filename=file.filename,
            db=db,
        )
        return preview_result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as ex:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi xử lý tệp Excel: {str(ex)}",
        )


@router.post(
    "/execute",
    response_model=UserImportSummaryResponse,
    summary="Thực hiện nhập người dùng một phần: Bỏ qua dòng lỗi, lưu dòng hợp lệ (SC-209)",
)
async def execute_user_import(
    file: UploadFile = File(..., description="Tệp Excel danh sách người dùng (.xlsx)"),
    current_user: User = Depends(yeu_cau_vai_tro(UserRole.ADMIN)),
    db: Session = Depends(lay_phien_db),
):
    """Lưu các dòng hợp lệ vào cơ sở dữ liệu và trả về báo cáo kết quả chi tiết."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên tệp không hợp lệ.",
        )

    lower_filename = file.filename.lower()
    if not (lower_filename.endswith(".xlsx") or lower_filename.endswith(".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Định dạng tệp không được hỗ trợ. Vui lòng tải lên tệp Excel (.xlsx).",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tệp rỗng, không chứa dữ liệu.",
        )

    try:
        summary_result = UserImportService.execute_partial_import(
            file_bytes=file_bytes,
            filename=file.filename,
            db=db,
        )
        return summary_result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as ex:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi thực hiện lưu dữ liệu người dùng: {str(ex)}",
        )
