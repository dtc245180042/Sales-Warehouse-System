"""User model re-export for backward compatibility."""
from app.models.auth import User, UserRole

__all__ = ["User", "UserRole"]
