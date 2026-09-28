from fastapi import APIRouter
from app.api.permissions import router as permissions_router
from app.api.roles import router as roles_router
from app.api.auth import router as auth_router

api_router = APIRouter(prefix="/api")
api_router.include_router(permissions_router)
api_router.include_router(roles_router)
api_router.include_router(auth_router)
