# app/routers/khach_hang.py
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..db import get_db
from ..models import KhachHang, User
from ..schemas import (
    KhachHangIn,
    KhachHangUpdate,
    KhachHangOut,
    PageKhachHangOut,
)
from .auth import require_roles, get_current_user

router = APIRouter(prefix="/khach-hang", tags=["Khách hàng"])


# =========================
# ADMIN: Danh sách / CRUD
# =========================
@router.get(
    "",
    response_model=PageKhachHangOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def list_customers(
    q: Optional[str] = Query(None, description="Từ khoá tên/sđt/email"),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(KhachHang)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                KhachHang.ten.ilike(like),
                KhachHang.sdt.ilike(like),
                KhachHang.email.ilike(like),
            )
        )
    total = query.count()
    rows = (
        query.order_by(KhachHang.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {"total": total, "page": page, "page_size": page_size, "items": rows}


@router.get(
    "/{kh_id}",
    response_model=KhachHangOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def get_customer(kh_id: int, db: Session = Depends(get_db)):
    row = db.get(KhachHang, kh_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy khách hàng")
    return row


@router.post(
    "",
    response_model=KhachHangOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def create_customer(payload: KhachHangIn, db: Session = Depends(get_db)):
    # Nếu có user_id, đảm bảo chưa ai gắn user_id này
    if getattr(payload, "user_id", None) is not None:
        exists = db.query(KhachHang).filter(KhachHang.user_id == payload.user_id).first()
        if exists:
            raise HTTPException(400, "user_id đã gắn với một khách hàng khác")

    row = KhachHang(**payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put(
    "/{kh_id}",
    response_model=KhachHangOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def update_customer(kh_id: int, payload: KhachHangUpdate, db: Session = Depends(get_db)):
    row = db.get(KhachHang, kh_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy khách hàng")

    # Nếu ADMIN muốn cập nhật user_id, cũng cần đảm bảo không trùng
    if "user_id" in payload.dict(exclude_unset=True):
        new_uid = payload.user_id
        if new_uid is not None:
            clash = (
                db.query(KhachHang)
                .filter(KhachHang.user_id == new_uid, KhachHang.id != kh_id)
                .first()
            )
            if clash:
                raise HTTPException(400, "user_id đã gắn với một khách hàng khác")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/{kh_id}",
    dependencies=[Depends(require_roles("ADMIN"))],
)
def delete_customer(kh_id: int, db: Session = Depends(get_db)):
    row = db.get(KhachHang, kh_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy khách hàng")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ==========================================
# CUSTOMER: Tự quản lý hồ sơ của chính mình
# ==========================================
@router.get("/me", response_model=KhachHangOut)
def my_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Trả về (và nếu cần thì tự tạo) hồ sơ khách hàng gắn với user hiện tại.
    Không cần tạo thủ công trong Swagger nữa.
    """
    row = db.query(KhachHang).filter(KhachHang.user_id == user.id).first()
    if not row:
        # Lazy-create: tạo mới khi lần đầu gọi /me
        row = KhachHang(
            ten=user.username,
            sdt=None,
            email=None,
            hang_thanh_vien="STANDARD",
            diem_tich_luy=0,
            user_id=user.id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("/me", response_model=KhachHangOut)
def update_my_profile(
    payload: KhachHangUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cho phép user cập nhật hồ sơ của chính họ.
    """
    row = db.query(KhachHang).filter(KhachHang.user_id == user.id).first()
    if not row:
        raise HTTPException(404, "Chưa có hồ sơ khách hàng, hãy gọi GET /khach-hang/me trước")

    # Không cho cập nhật user_id ở endpoint này
    data = payload.dict(exclude_unset=True)
    data.pop("user_id", None)

    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row
