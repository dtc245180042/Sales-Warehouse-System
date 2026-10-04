from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.product_import_service import ProductImportService
from app.schemas.import_schema import ImportPreviewResponse

router = APIRouter()

@router.post("/preview", response_model=ImportPreviewResponse, summary="SCRUM-215: Preview & Validate File Excel")
async def preview_import(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file Excel (.xlsx, .xls)")
    
    contents = await file.read()
    result = ProductImportService.preview_import(contents, db)
    return result

@router.post("/execute", summary="SCRUM-216: Thực thi Import các bản ghi hợp lệ vào DB")
def execute_import(valid_data: list, db: Session = Depends(get_db)):
    if not valid_data:
        raise HTTPException(status_code=400, detail="Không có dữ liệu hợp lệ để import")
    
    result = ProductImportService.execute_import(valid_data, db)
    return result