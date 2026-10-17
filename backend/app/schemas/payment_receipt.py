from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class PaymentReceiptAllocationItem(BaseModel):
    """Chi tiết một hóa đơn được gạch nợ trong phiếu thu."""
    model_config = ConfigDict(from_attributes=True)

    invoice_id: str
    allocated_amount: int
    allocated_amount_formatted: str


class PaymentReceiptPrintData(BaseModel):
    """
    Dữ liệu in ấn phiếu thu tiền chuẩn hóa (SCRUM-270 / S7-09).
    Bao gồm mã duy nhất, thông tin đại lý, số tiền, hình thức, người thu, mã vạch và chi tiết đối trừ.
    """
    model_config = ConfigDict(from_attributes=True)

    payment_id: str
    created_at_str: str
    payment_date_str: str
    
    # Doanh nghiệp phát hành
    company_name: str
    company_address: str
    company_hotline: str
    company_tax_code: str

    # Đại lý / Khách hàng
    customer_id: str
    customer_code: str
    customer_name: str
    customer_phone: str
    customer_address: str
    customer_tax_code: str

    # Thông tin thanh toán
    amount: int
    amount_formatted: str
    amount_in_words: str
    payment_method: str
    payment_method_display: str
    reference_code: str
    notes: str

    # Người thực hiện thu / Kế toán
    collector_id: int
    collector_name: str

    # Mã vạch Vector SVG chuẩn Code128
    barcode_svg: str

    # Danh sách hóa đơn gạch nợ
    allocations: List[PaymentReceiptAllocationItem] = []
