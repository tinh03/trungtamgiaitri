# app/routers/goi_y.py
from datetime import datetime, timedelta
from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from ..db import get_db
from ..models import GameClick, TroChoi, KhachHang, User, Ve
from .auth import get_current_user

router = APIRouter(prefix="/goi-y", tags=["Gợi ý"])

# -----------------------------
# 1) Ghi nhận click 1 trò chơi
# -----------------------------
@router.post("/click")
def click_game(
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tro_choi_id = int(payload.get("tro_choi_id", 0) or 0)
    if not tro_choi_id:
        raise HTTPException(status_code=422, detail="tro_choi_id is required")

    kh = db.query(KhachHang).filter(KhachHang.user_id == user.id).first()
    if not kh:
        return {"ok": True, "skipped": True}

    game = db.get(TroChoi, tro_choi_id)
    if not game:
        raise HTTPException(status_code=404, detail="Trò chơi không tồn tại")

    rec = (
        db.query(GameClick)
        .filter(GameClick.khach_hang_id == kh.id, GameClick.tro_choi_id == tro_choi_id)
        .first()
    )
    if rec:
        rec.so_lan = (rec.so_lan or 0) + 1
        rec.last_click = datetime.utcnow()
    else:
        rec = GameClick(
            khach_hang_id=kh.id,
            tro_choi_id=tro_choi_id,
            so_lan=1,
            last_click=datetime.utcnow(),
        )
        db.add(rec)

    db.commit()
    return {"ok": True}

# ---------------------------------------------------------
# 2) Gợi ý toàn cục (không theo user)
#    Ưu tiên: lượt chơi đã thanh toán (PAID) -> lượt click
# ---------------------------------------------------------
@router.get("/global")
def global_suggestions(db: Session = Depends(get_db)) -> List[Dict]:
    sub_paid = (
        db.query(
            Ve.tro_choi_id,
            func.coalesce(func.sum(Ve.so_luong), 0).label("plays"),
        )
        .filter(Ve.trang_thai == "PAID", Ve.tro_choi_id.isnot(None))
        .group_by(Ve.tro_choi_id)
        .subquery()
    )

    sub_click = (
        db.query(
            GameClick.tro_choi_id,
            func.coalesce(func.sum(GameClick.so_lan), 0).label("clicks"),
        )
        .group_by(GameClick.tro_choi_id)
        .subquery()
    )

    q = (
        db.query(
            TroChoi.id,
            TroChoi.ten,
            TroChoi.the_loai,
            TroChoi.khu_vuc_id,
            TroChoi.gia_mac_dinh,
            TroChoi.anh_cover,              # <<< lấy ảnh
            func.coalesce(sub_paid.c.plays, 0).label("plays"),
            func.coalesce(sub_click.c.clicks, 0).label("clicks"),
            (
                func.coalesce(sub_paid.c.plays, 0) * 100
                + func.coalesce(sub_click.c.clicks, 0)
            ).label("score"),
        )
        .outerjoin(sub_paid, sub_paid.c.tro_choi_id == TroChoi.id)
        .outerjoin(sub_click, sub_click.c.tro_choi_id == TroChoi.id)
        .filter(TroChoi.trang_thai == "OPEN")
        .order_by(desc("plays"), desc("clicks"), TroChoi.id.desc())
        .limit(24)
    )

    items = []
    for r in q:
        items.append(
            {
                "id": r.id,
                "ten": r.ten,
                "the_loai": r.the_loai,
                "khu_vuc_id": r.khu_vuc_id,
                "gia_mac_dinh": float(r.gia_mac_dinh or 0),
                "so_luot_choi": int(r.plays or 0),
                "so_click": int(r.clicks or 0),
                "score": int(r.score or 0),
                "anh_cover": r.anh_cover,     # <<< trả ảnh ra FE
            }
        )
    return items

# ---------------------------------------------------------
# 3) Gợi ý theo từng khách hàng (cá nhân hoá)
# ---------------------------------------------------------
@router.get("/user")
def user_suggestions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kh = db.query(KhachHang).filter(KhachHang.user_id == user.id).first()
    if not kh:
        return global_suggestions(db)

    sub_click = (
        db.query(
            GameClick.tro_choi_id,
            func.sum(GameClick.so_lan).label("so_lan"),
        )
        .filter(GameClick.khach_hang_id == kh.id)
        .group_by(GameClick.tro_choi_id)
        .subquery()
    )

    q = (
        db.query(
            TroChoi.id,
            TroChoi.ten,
            TroChoi.khu_vuc_id,
            TroChoi.gia_mac_dinh,
            TroChoi.anh_cover,               # <<< lấy ảnh
            func.coalesce(sub_click.c.so_lan, 0).label("score"),
        )
        .outerjoin(sub_click, sub_click.c.tro_choi_id == TroChoi.id)
        .filter(TroChoi.trang_thai == "OPEN")
        .order_by(desc("score"), TroChoi.id.desc())
        .limit(12)
    )

    items = [
        {
            "id": r.id,
            "ten": r.ten,
            "khu_vuc_id": r.khu_vuc_id,
            "gia_mac_dinh": float(r.gia_mac_dinh or 0),
            "score": int(r.score or 0),
            "anh_cover": r.anh_cover,        # <<< trả ảnh
        }
        for r in q
    ]

    if not items:
        return global_suggestions(db)

    return items
