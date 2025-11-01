# app/routers/su_kien.py
from typing import Optional, Literal, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..db import get_db
from ..models import SuKien
from ..schemas import SuKienIn, SuKienOut, SuKienUpdate
from .auth import get_current_user

router = APIRouter(prefix="/su-kien", tags=["Sự kiện"])

def require_admin(user=Depends(get_current_user)):
    if not user or getattr(user, "role", None) != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ================== Public ==================

@router.get("", response_model=List[SuKienOut])
def list_events(
    db: Session = Depends(get_db),
    status: Optional[Literal["OPEN", "CLOSED"]] = Query(None, alias="trang_thai"),
    q: Optional[str] = Query(None, description="Tìm theo tên/mô tả"),
):
    """
    Danh sách sự kiện:
    - Có thể lọc theo trạng thái (?trang_thai=OPEN|CLOSED)
    - Có thể search q trong tên/mô tả
    - Sắp xếp mới nhất trước
    """
    query = db.query(SuKien)

    if status:
        query = query.filter(SuKien.trang_thai == status)

    if q:
        like = f"%{q.strip()}%"
        query = query.filter((SuKien.ten.ilike(like)) | (SuKien.mo_ta.ilike(like)))

    rows = query.order_by(desc(SuKien.thoi_gian)).all()
    return rows


@router.get("/{sk_id}", response_model=SuKienOut)
def get_event(sk_id: int, db: Session = Depends(get_db)):
    ev = db.get(SuKien, sk_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")
    return ev


# ================== Admin ===================

@router.post("", response_model=SuKienOut, dependencies=[Depends(require_admin)])
def create_event(body: SuKienIn, db: Session = Depends(get_db)):
    ev = SuKien(
        ten=body.ten,
        mo_ta=body.mo_ta,
        thoi_gian=body.thoi_gian,              # đúng cột thoi_gian
        gia_ve=body.gia_ve or 0,
        trang_thai=body.trang_thai or "OPEN",
        anh_bia=getattr(body, "anh_bia", None),  # ✅ hỗ trợ ảnh bìa (optional)
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.put("/{sk_id}", response_model=SuKienOut, dependencies=[Depends(require_admin)])
def update_event(sk_id: int, body: SuKienUpdate, db: Session = Depends(get_db)):
    ev = db.get(SuKien, sk_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")

    if body.ten is not None:
        ev.ten = body.ten
    if body.mo_ta is not None:
        ev.mo_ta = body.mo_ta
    if body.thoi_gian is not None:
        ev.thoi_gian = body.thoi_gian
    if body.gia_ve is not None:
        ev.gia_ve = body.gia_ve
    if body.trang_thai is not None:
        ev.trang_thai = body.trang_thai
    if getattr(body, "anh_bia", None) is not None:        # ✅ cập nhật ảnh bìa
        ev.anh_bia = body.anh_bia

    db.commit()
    db.refresh(ev)
    return ev


@router.delete("/{sk_id}", dependencies=[Depends(require_admin)])
def delete_event(sk_id: int, db: Session = Depends(get_db)):
    ev = db.get(SuKien, sk_id)
    if not ev:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")
    db.delete(ev)
    db.commit()
    return {"ok": True}
