# app/routers/common_deps.py
from fastapi import Depends, HTTPException
from ..models import User
from .auth import get_current_user

def require_admin(user: User = Depends(get_current_user)):
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Chỉ ADMIN được phép thao tác")
    return user
