from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ResetTokenVerifyResponse(BaseModel):
    valid: bool = Field(..., description="Trạng thái hợp lệ của token")
    email: Optional[str] = Field(None, description="Email được che bớt (masked) của tài khoản")
    expires_at: Optional[datetime] = Field(None, description="Thời điểm hết hạn (UTC)")
    expires_in_minutes: Optional[int] = Field(None, description="Số phút còn hiệu lực")
    message: Optional[str] = Field(None, description="Thông điệp thông báo")


class MockEmailItem(BaseModel):
    to_email: str
    subject: str
    reset_link: str
    token: str
    sent_at: datetime
    expires_at: datetime


class MockOutboxResponse(BaseModel):
    total: int
    emails: List[MockEmailItem]
