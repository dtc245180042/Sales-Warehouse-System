from sqlalchemy.orm import Session
from datetime import datetime
from app.models.warehouse import UnitConversion, StockTransaction

class ConversionService:
    @staticmethod
    def get_effective_rate(db: Session, product_id: str, input_unit: str, target_date: datetime = None):
        """SCRUM-393: Lấy đúng tỷ lệ quy đổi theo thời điểm giao dịch"""
        if not target_date:
            target_date = datetime.now()

        conversion = db.query(UnitConversion).filter(
            UnitConversion.product_id == product_id,
            UnitConversion.input_unit == input_unit,
            UnitConversion.is_active == True,
            UnitConversion.effective_from <= target_date,
            (UnitConversion.effective_to == None) | (UnitConversion.effective_to > target_date)
        ).first()

        if not conversion:
            return {"rate": 1.0, "version": 1, "base_unit": input_unit}

        return {
            "rate": conversion.conversion_rate,
            "version": conversion.version,
            "base_unit": conversion.base_unit
        }

    @staticmethod
    def convert_to_base(quantity: float, rate: float) -> float:
        """SCRUM-391: Quy đổi số lượng về đơn vị cơ sở"""
        if quantity <= 0:
            raise ValueError("Số lượng phải lớn hơn 0")
        return quantity * rate

    @staticmethod
    def update_conversion_rate(db: Session, product_id: str, input_unit: str, new_rate: float):
        """SCRUM-393: Cập nhật hệ số quy đổi tạo phiên bản mới mà không sửa dữ liệu cũ"""
        now = datetime.now()
        
        # 1. Khóa phiên bản cũ lại
        old_conv = db.query(UnitConversion).filter(
            UnitConversion.product_id == product_id,
            UnitConversion.input_unit == input_unit,
            UnitConversion.is_active == True
        ).first()

        old_version = 0
        base_unit = "Đơn vị cơ sở"

        if old_conv:
            old_conv.effective_to = now
            old_conv.is_active = False
            old_version = old_conv.version
            base_unit = old_conv.base_unit

        # 2. Tạo phiên bản mới (version + 1)
        new_conv = UnitConversion(
            product_id=product_id,
            input_unit=input_unit,
            base_unit=base_unit,
            conversion_rate=new_rate,
            version=old_version + 1,
            effective_from=now,
            effective_to=None,
            is_active=True
        )
        db.add(new_conv)
        db.commit()
        db.refresh(new_conv)
        return new_conv