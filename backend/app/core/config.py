from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Cấu hình ứng dụng được load từ biến môi trường hoặc file .env."""

    PROJECT_NAME: str = "Sales and Warehouse Management System"
    API_V1_STR: str = "/api/v1"

    # JWT Security Configuration
    SECRET_KEY: str = "dev-super-secret-key-change-this-in-production-1234567890!@#"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 giờ

    # Database Configuration
    DATABASE_URL: str = "sqlite:///./sales_warehouse.db"

    # Security Policies (SCRUM-287)
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    ACCOUNT_LOCK_MINUTES: int = 15

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
