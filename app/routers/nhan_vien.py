from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..db import get_db
from ..models import NhanVien, User, TroChoi, SuKien, KhuyenMai, Ve
from ..schemas import (
    NhanVienIn,
    NhanVienUpdate,
    NhanVienOut,
    PageNhanVienOut,
)
from .auth import require_roles, get_current_user

router = APIRouter(prefix="/nhan-vien", tags=["Nhân viên"])

# =========================
# ADMIN: Danh sách / CRUD
# =========================
@router.get(
    "",
    response_model=PageNhanVienOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def list_staff(
    q: Optional[str] = Query(None, description="Tìm theo tên/sđt/email"),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(NhanVien)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                NhanVien.ten.ilike(like),
                NhanVien.sdt.ilike(like),
                NhanVien.email.ilike(like),
            )
        )
    total = query.count()
    rows = (
        query.order_by(NhanVien.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {"total": total, "page": page, "page_size": page_size, "items": rows}


@router.get(
    "/{nv_id}",
    response_model=NhanVienOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def get_staff(nv_id: int, db: Session = Depends(get_db)):
    row = db.get(NhanVien, nv_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy nhân viên")
    return row


@router.post(
    "",
    response_model=NhanVienOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def create_staff(payload: NhanVienIn, db: Session = Depends(get_db)):
    row = NhanVien(**payload.dict())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put(
    "/{nv_id}",
    response_model=NhanVienOut,
    dependencies=[Depends(require_roles("ADMIN"))],
)
def update_staff(nv_id: int, payload: NhanVienUpdate, db: Session = Depends(get_db)):
    row = db.get(NhanVien, nv_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy nhân viên")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete(
    "/{nv_id}",
    dependencies=[Depends(require_roles("ADMIN"))],
)
def delete_staff(nv_id: int, db: Session = Depends(get_db)):
    row = db.get(NhanVien, nv_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy nhân viên")
    db.delete(row)
    db.commit()
    return {"ok": True}


# =========================
# STAFF/ADMIN: Hồ sơ của chính mình
# =========================
@router.get("/me", response_model=NhanVienOut)
def my_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(NhanVien).filter(NhanVien.user_id == user.id).first()
    if not row:
        raise HTTPException(404, "Chưa có hồ sơ nhân viên cho tài khoản này")
    return row


@router.put("/me", response_model=NhanVienOut)
def update_my_profile(
    payload: NhanVienUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(NhanVien).filter(NhanVien.user_id == user.id).first()
    if not row:
        raise HTTPException(404, "Chưa có hồ sơ nhân viên cho tài khoản này")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


# ============================================================
# STAFF/ADMIN: Thao tác vận hành (prefix: /nhan-vien/ops/...)
# ============================================================
def _now() -> datetime:
    return datetime.utcnow()

# ---- Trò chơi: đổi trạng thái ----
@router.patch("/ops/tro-choi/{game_id}/status", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def ops_set_game_status(
    game_id: int,
    value: str = Query(..., regex="^(OPEN|MAINTENANCE|CLOSED)$"),
    db: Session = Depends(get_db),
):
    row = db.get(TroChoi, game_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy trò chơi")
    row.trang_thai = value
    if hasattr(row, "updated_at"):
        row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "trang_thai": row.trang_thai}

# ---- Sự kiện: OPEN/CLOSED ----
@router.patch("/ops/su-kien/{event_id}/status", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def ops_set_event_status(
    event_id: int,
    value: str = Query(..., regex="^(OPEN|CLOSED)$"),
    db: Session = Depends(get_db),
):
    row = db.get(SuKien, event_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy sự kiện")
    row.trang_thai = value
    if hasattr(row, "updated_at"):
        row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "trang_thai": row.trang_thai}

# ---- Khuyến mãi: bật/tắt active ----
@router.patch("/ops/khuyen-mai/{km_id}/active", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def ops_set_promo_active(
    km_id: int,
    value: int = Query(..., ge=0, le=1),
    db: Session = Depends(get_db),
):
    row = db.get(KhuyenMai, km_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy khuyến mãi")
    row.active = int(value)
    if hasattr(row, "updated_at"):
        row.updated_at = _now()
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "active": row.active}

# ---- Vé: danh sách cho STAFF/ADMIN duyệt ----
@router.get("/ops/ve", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def ops_list_tickets(
    status: Optional[str] = Query("PENDING", description="PENDING|UNPAID|BOOKED|PAID|CANCELLED|ALL"),
    loai: Optional[str] = Query(None, description="GAME|EVENT"),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    q = db.query(Ve)
    if loai:
        q = q.filter(Ve.loai == loai)
    if status and status.upper() != "ALL":
        q = q.filter(Ve.trang_thai == status.upper())
    total = q.count()
    items = (
        q.order_by(Ve.created_at.desc())
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {"total": total, "page": page, "page_size": page_size, "items": items}

# ---- Vé: duyệt thanh toán ----
@router.post("/ops/ve/{ticket_id}/approve", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
@router.patch("/ops/ve/{ticket_id}/approve", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def ops_approve_ticket(ticket_id: int, db: Session = Depends(get_db)):
    row = db.get(Ve, ticket_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy vé")
    # Không duyệt nếu đã thanh toán hoặc đã hủy
    if row.trang_thai in ("PAID", "CANCELLED"):
        return {"ok": True, "id": row.id, "trang_thai": row.trang_thai}

    if row.trang_thai not in ("BOOKED", "PENDING", "UNPAID"):
        raise HTTPException(400, f"Vé đang ở trạng thái không hợp lệ: {row.trang_thai}")

    row.trang_thai = "PAID"
    if hasattr(row, "paid_at"):
        row.paid_at = _now()
    if hasattr(row, "updated_at"):
        row.updated_at = _now()
    db.add(row)
    db.commit()
    db.refresh(row)

    try:
        if getattr(row, "loai", "") == "GAME":
            from .gamify import update_progress_on_ticket_paid
            update_progress_on_ticket_paid(db, row)
    except Exception:
        pass

    return {"ok": True, "id": row.id, "trang_thai": row.trang_thai}

# ---- Vé: hủy ----
@router.post("/ops/ve/{ticket_id}/cancel", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
@router.patch("/ops/ve/{ticket_id}/cancel", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def ops_cancel_ticket(
    ticket_id: int,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
):
    row = db.get(Ve, ticket_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy vé")
    if row.trang_thai == "CANCELLED":
        return {"ok": True, "id": row.id, "trang_thai": row.trang_thai, "reason": reason or ""}
    # Không cho hủy vé đã thanh toán
    if row.trang_thai == "PAID":
        raise HTTPException(400, "Không thể hủy vé đã thanh toán")

    row.trang_thai = "CANCELLED"
    if hasattr(row, "updated_at"):
        row.updated_at = _now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "trang_thai": row.trang_thai, "reason": reason or ""}

# ---- Debug/FE check: whoami ----
@router.get("/ops/whoami")
def ops_whoami(user: User = Depends(get_current_user)):
    return {"user_id": user.id, "username": user.username, "role": user.role}
