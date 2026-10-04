from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from app.services.product_import_service import ProductImportService
from app.schemas.import_schema import ImportExecuteRequest

router = APIRouter(prefix="/api/v1/import", tags=["Product Import"])

@router.get("/template")
def download_template():
    """SCRUM-402: Tải file Excel mẫu"""
    content = ProductImportService.generate_template_excel()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=product_import_template.xlsx"}
    )

@router.post("/preview")
async def preview_import(file: UploadFile = File(...)):
    """SCRUM-399, SCRUM-400, SCRUM-401, SCRUM-403: Upload & Validate File Excel"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Vui lòng tải lên định dạng file Excel (.xlsx hoặc .xls)")
    
    contents = await file.read()
    try:
        result = ProductImportService.parse_and_validate_excel(contents)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/execute")
def execute_import(body: ImportExecuteRequest):
    """SCRUM-404: Thực thi import danh sách dòng hợp lệ"""
    result = ProductImportService.execute_import(body.valid_data)
    return result