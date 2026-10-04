"""
Core Package: Chứa các động cơ cốt lõi phục vụ kiểm thử tự động.
- context: Thiết lập môi trường test, mock database in-memory, TestClient
- reporter: Thu thập và tổng hợp kết quả kiểm thử (BoBaoCaoKiemThu)
- excel_sync: Động cơ đồng bộ kết quả vào file Excel chuẩn doanh nghiệp
- template_generator: Công cụ khởi tạo file Excel template chuẩn công thức động
"""

from .reporter import BoBaoCaoKiemThu
from .excel_sync import dong_bo_ket_qua_excel
from .context import lay_client_va_db, khoi_tao_db_moi
