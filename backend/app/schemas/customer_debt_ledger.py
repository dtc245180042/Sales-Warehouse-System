"""
Schemas cho Sổ chi tiết công nợ đại lý (Story S8-10, SCRUM-843 -> SCRUM-849).
Tuân thủ chuẩn Pydantic v2 và quy tắc đặt tên snake_case.
"""

from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class DebtLedgerItem(BaseModel):
    """Một dòng chứng từ phát sinh trên Sổ chi tiết công nợ."""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="ID định danh duy nhất của giao dịch (mã chứng từ)")
    date: datetime = Field(..., description="Thời điểm phát sinh chứng từ")
    document_type: str = Field(..., description="Mã loại chứng từ: INVOICE, PAYMENT, CREDIT_NOTE")
    document_type_label: str = Field(..., description="Tên tiếng Việt: Hóa đơn bán hàng, Phiếu thu tiền, Chứng từ giảm nợ")
    document_code: str = Field(..., description="Số hiệu chứng từ (HD-..., PT-..., CN-...)")
    reference_code: Optional[str] = Field(None, description="Mã tham chiếu: Số đơn hàng, số phiếu trả hàng hoặc mã giao dịch ngân hàng")
    description: Optional[str] = Field(None, description="Diễn giải nghiệp vụ kinh tế phát sinh")
    increase_amount: int = Field(0, description="Số tiền phát sinh TĂNG nợ (Nợ / Debit) - VNĐ")
    decrease_amount: int = Field(0, description="Số tiền phát sinh GIẢM nợ (Có / Credit) - VNĐ")
    running_balance: int = Field(0, description="Số dư nợ luỹ kế sau giao dịch này - VNĐ")
    due_date: Optional[datetime] = Field(None, description="Hạn thanh toán hóa đơn (nếu có)")
    status: Optional[str] = Field(None, description="Trạng thái chứng từ (PAID, PARTIALLY_PAID, UNPAID, v.v.)")


class CustomerDebtSummary(BaseModel):
    """Thông tin tóm tắt hồ sơ công nợ của đại lý."""
    model_config = ConfigDict(from_attributes=True)

    customer_id: str = Field(..., description="Mã ID khách hàng trong CSDL")
    customer_code: Optional[str] = Field(None, description="Mã đại lý hiển thị (VD: CUST-001)")
    customer_name: str = Field(..., description="Tên công ty / đại lý")
    phone: Optional[str] = Field(None, description="Số điện thoại liên hệ")
    email: Optional[str] = Field(None, description="Email đại lý")
    address: Optional[str] = Field(None, description="Địa chỉ đăng ký kinh doanh")
    tax_code: Optional[str] = Field(None, description="Mã số thuế")
    credit_limit: int = Field(0, description="Hạn mức công nợ được cấp (VNĐ)")
    max_debt_days: int = Field(0, description="Số ngày nợ tối đa cho phép (ngày)")
    current_debt: int = Field(0, description="Dư nợ thực tế hiện tại (VNĐ)")
    available_credit: int = Field(0, description="Hạn mức tín dụng còn khả dụng (VNĐ)")


class CustomerDebtLedgerResponse(BaseModel):
    """Dữ liệu trả về đầy đủ của Sổ chi tiết công nợ cho 1 đại lý trong khoảng thời gian."""
    model_config = ConfigDict(from_attributes=True)

    customer: CustomerDebtSummary = Field(..., description="Thông tin đại lý đối chiếu")
    from_date: Optional[str] = Field(None, description="Ngày bắt đầu kỳ đối chiếu (YYYY-MM-DD)")
    to_date: Optional[str] = Field(None, description="Ngày kết thúc kỳ đối chiếu (YYYY-MM-DD)")
    
    # 4 chỉ tiêu cốt lõi của sổ cái kế toán
    opening_balance: int = Field(0, description="Số dư nợ đầu kỳ (VNĐ)")
    total_increase: int = Field(0, description="Tổng phát sinh tăng nợ trong kỳ (Nợ) (VNĐ)")
    total_decrease: int = Field(0, description="Tổng phát sinh giảm nợ trong kỳ (Có) (VNĐ)")
    closing_balance: int = Field(0, description="Số dư nợ cuối kỳ (VNĐ) = opening + increase - decrease")
    
    items: List[DebtLedgerItem] = Field(default_factory=list, description="Danh sách các dòng phát sinh sắp xếp theo thứ tự thời gian tăng dần")
    total_items: int = Field(0, description="Tổng số chứng từ phát sinh trong kỳ")


class CustomerDebtLedgerOverviewItem(BaseModel):
    """Dòng tóm tắt công nợ trong danh sách tổng quan các đại lý."""
    model_config = ConfigDict(from_attributes=True)

    customer_id: str
    customer_code: Optional[str] = None
    customer_name: str
    phone: Optional[str] = None
    credit_limit: int = 0
    max_debt_days: int = 0
    opening_balance: int = 0
    total_increase: int = 0
    total_decrease: int = 0
    closing_balance: int = 0
    transactions_count: int = 0


class CustomerDebtLedgerOverviewResponse(BaseModel):
    """Danh sách tổng quan công nợ các đại lý."""
    model_config = ConfigDict(from_attributes=True)

    items: List[CustomerDebtLedgerOverviewItem] = Field(default_factory=list)
    total: int = 0
    total_closing_debt: int = 0
