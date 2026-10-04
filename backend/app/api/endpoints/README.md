# THƯ MỤC CÁC ENDPOINT TÍNH NĂNG MỚI (PLUG-AND-PLAY ENDPOINTS)

### DÀNH CHO TẤT CẢ DEVELOPER VÀ AI AGENT:
Thư mục này được thiết kế để **CHỐNG XUNG ĐỘT TUYỆT ĐỐI (ZERO-CONFLICT)** khi nhiều Agent cùng làm việc trên các nhiệm vụ khác nhau.

### NGUYÊN TẮC:
1. **KHÔNG BAO GIỜ** sửa đổi `backend/main.py` hay `backend/app/api/__init__.py`.
2. Mỗi tính năng mới (hoặc User Story) **CHỈ ĐƯỢC TẠO FILE MỚI** trong thư mục này. Ví dụ:
   - `backend/app/api/endpoints/products.py`
   - `backend/app/api/endpoints/orders.py`
   - `backend/app/api/endpoints/inventory.py`
3. Trong mỗi file chỉ cần khai báo một biến `router = APIRouter(...)`. Hệ thống sẽ **TỰ ĐỘNG NẠP (AUTO-LOAD)** router vào cả `/api` và `/api/v1`.

### TEMPLATE MẪU CHO AI AGENT:
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import lay_phien_db
from app.core.dependencies import lay_nguoi_dung_hien_tai, yeu_cau_vai_tro

# Đặt prefix tương ứng cho module của bạn
router = APIRouter(prefix="/products", tags=["Products"])

@router.get("/")
def get_products(db: Session = Depends(lay_phien_db)):
    return {"message": "Danh sách sản phẩm"}
```
