"""Hợp đồng API phiếu soạn hàng S6-03."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class PickingCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    warehouse_id: int = Field(gt=0)
    order_ids: list[str] = Field(min_length=1, max_length=100)
    client_request_id: str = Field(min_length=1, max_length=100)
    notes: str | None = Field(None, max_length=2000)


class PickingPreviewRequest(BaseModel):
    warehouse_id: int = Field(gt=0)
    order_ids: list[str] = Field(min_length=1, max_length=100)


class PickingLocationWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    location_code: str = Field(min_length=1, max_length=100)
    route_sequence: int = Field(ge=0, le=1000000)


class PickingItemUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    picked_quantity: int = Field(ge=0, strict=True)
    shortfall_reason: str | None = Field(None, max_length=2000)
    expected_version: int = Field(ge=1)


class PickingStatusUpdate(BaseModel):
    status: Literal["cancelled"]
    reason: str = Field(min_length=1, max_length=2000)


class PickingItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_id: str
    order_item_id: int
    product_id: str
    sku: str
    product_name: str
    unit: str
    location_code: str
    route_sequence: int
    requested_quantity: int
    picked_quantity: int
    shortfall_quantity: int
    shortfall_reason: str | None
    status: str
    version: int
    updated_by: int | None
    updated_at: datetime
