from datetime import datetime, timezone
from typing import List, Optional, Union, Tuple
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import and_

from ..db import get_db
from ..models import KhuyenMai, User
from .auth import get_current_user

router = APIRouter(prefix="/khuyen-mai", tags=["Khuyến mãi"])

# ---------- Schemas ----------
class KMBase(BaseModel):
    ten: str = Field(..., min_length=1, max_length=150)
    ty_le: float = Field(0, ge=0, le=100)
    dieu_kien: Optional[Union[str, dict]] = None
    thoi_gian_bd: datetime
    thoi_gian_kt: datetime
    active: int = Field(1, ge=0, le=1)

    @field_validator("active")
    @classmethod
    def _ck_active(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("active phải là 0 hoặc 1")
        return v


class KMCreate(KMBase):
    pass


class KMUpdate(BaseModel):
    ten: Optional[str] = None
    ty_le: Optional[float] = Field(default=None, ge=0, le=100)
    dieu_kien: Optional[Union[str, dict]] = None
    thoi_gian_bd: Optional[datetime] = None
    thoi_gian_kt: Optional[datetime] = None
    active: Optional[int] = Field(default=None, ge=0, le=1)


class KMOut(BaseModel):
    id: int
    ten: str
    ty_le: float
    dieu_kien: Optional[Union[str, dict]] = None
    thoi_gian_bd: datetime
    thoi_gian_kt: datetime
    active: int

    class Config:
        from_attributes = True


class KMLite(BaseModel):
    id: int
    ten: str
    ty_le: float


class KMPreviewOut(BaseModel):
    amount: int
    discount_rate: float
    discount_amount: int
    final_total: int
    promo: Optional[KMLite] = None


# ---------- Helpers ----------
def ensure_admin(user: User):
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Chỉ ADMIN được thao tác")


def _normalize_dieu_kien(val: Optional[Union[str, dict]]) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, dict):
        return json.dumps(val, ensure_ascii=False)
    try:
        json.loads(val)
        return val
    except Exception:
        return json.dumps({"raw": val}, ensure_ascii=False)


def _parse_dieu_kien(s: Optional[str]) -> Optional[dict]:
    if s is None:
        return None
    try:
        return json.loads(s)
    except Exception:
        return {"raw": s}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _tier_rank(name: Optional[str]) -> int:
    if not name:
        return 0
    n = str(name).strip().upper()
    if n in {"STANDARD", "THUONG", "THƯỜNG"}:
        return 1
    return {"BAC": 2, "VANG": 3, "KIMCUONG": 4}.get(n, 0)


def _is_open(row: KhuyenMai, now: Optional[datetime] = None) -> bool:
    now = now or _now_utc()
    return row.active == 1 and (row.thoi_gian_bd <= now <= row.thoi_gian_kt)


def _satisfy_conditions(
    row: KhuyenMai,
    amount: Optional[int] = None,
    tier: Optional[str] = None,
) -> bool:
    """
    Kiểm tra điều kiện KM:
      - min_amount
      - member_tiers / tiers (liệt kê cụ thể)
      - member_only
      - min_tier (bậc tối thiểu, ví dụ: VANG => Vàng và Kim Cương)
    """
    dk = _parse_dieu_kien(row.dieu_kien) or {}

    # --- min_amount ---
    min_amount = dk.get("min_amount")
    if min_amount is not None and amount is not None:
        if amount < int(min_amount):
            return False

    norm_tier = (str(tier).upper() if tier else None)
    if norm_tier in {"THƯỜNG", "THUONG"}:
        norm_tier = "STANDARD"

    # --- member_only ---
    if dk.get("member_only"):
        if norm_tier is None or norm_tier in ("STANDARD", "THUONG"):
            return False

    # --- min_tier (mới) ---
    min_tier = dk.get("min_tier") or dk.get("tier_at_least") or dk.get("at_least")
    if min_tier:
        if norm_tier is None:
            return False
        if _tier_rank(norm_tier) < _tier_rank(min_tier):
            return False
        return True

    # --- member_tiers / tiers (cũ) ---
    tiers = dk.get("member_tiers") or dk.get("tiers")
    if tiers:
        if norm_tier is None:
            return False
        if norm_tier not in [str(x).upper() for x in tiers]:
            return False

    return True


def _calc_preview(amount: int, promo: KhuyenMai) -> Tuple[float, int, int]:
    rate = float(promo.ty_le or 0)
    discount_amount = int(round(amount * rate / 100.0))
    final_total = amount - discount_amount
    return rate, discount_amount, final_total


def _to_out(row: KhuyenMai) -> KMOut:
    return KMOut(
        id=row.id,
        ten=row.ten,
        ty_le=float(row.ty_le or 0),
        dieu_kien=_parse_dieu_kien(row.dieu_kien),
        thoi_gian_bd=row.thoi_gian_bd,
        thoi_gian_kt=row.thoi_gian_kt,
        active=row.active,
    )


# ---------- APIs ----------
@router.get("", response_model=List[KMOut])
def list_promos(
    db: Session = Depends(get_db),
    active: Optional[int] = Query(None),
    open_only: Optional[int] = Query(None),
):
    q = db.query(KhuyenMai)
    now = _now_utc()
    if active in (0, 1):
        q = q.filter(KhuyenMai.active == active)
    if open_only == 1:
        q = q.filter(
            and_(
                KhuyenMai.active == 1,
                KhuyenMai.thoi_gian_bd <= now,
                KhuyenMai.thoi_gian_kt >= now,
            )
        )
    rows = q.order_by(KhuyenMai.id.desc()).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=KMOut)
def create_promo(
    body: KMCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ensure_admin(user)
    row = KhuyenMai(
        ten=body.ten,
        ty_le=body.ty_le,
        dieu_kien=_normalize_dieu_kien(body.dieu_kien),
        thoi_gian_bd=body.thoi_gian_bd,
        thoi_gian_kt=body.thoi_gian_kt,
        active=body.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.put("/{km_id}", response_model=KMOut)
def update_promo(
    km_id: int,
    body: KMUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ensure_admin(user)
    row = db.get(KhuyenMai, km_id)
    if not row:
        raise HTTPException(404, "Khuyến mãi không tồn tại")
    data = body.model_dump(exclude_unset=True)
    if "dieu_kien" in data:
        data["dieu_kien"] = _normalize_dieu_kien(data["dieu_kien"])
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{km_id}")
def delete_promo(
    km_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ensure_admin(user)
    row = db.get(KhuyenMai, km_id)
    if not row:
        raise HTTPException(404, "Khuyến mãi không tồn tại")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/{km_id}/toggle", response_model=KMOut)
def toggle_promo(
    km_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ensure_admin(user)
    row = db.get(KhuyenMai, km_id)
    if not row:
        raise HTTPException(404, "Khuyến mãi không tồn tại")
    row.active = 0 if row.active == 1 else 1
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/applicable-promos", response_model=List[KMLite])
def applicable_promos(
    amount: int = Query(..., ge=0),
    tier: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    now = _now_utc()
    rows = (
        db.query(KhuyenMai)
        .filter(
            and_(
                KhuyenMai.active == 1,
                KhuyenMai.thoi_gian_bd <= now,
                KhuyenMai.thoi_gian_kt >= now,
            )
        )
        .order_by(KhuyenMai.id.desc())
        .all()
    )
    out = []
    for r in rows:
        if _satisfy_conditions(r, amount=amount, tier=tier):
            out.append(KMLite(id=r.id, ten=r.ten, ty_le=float(r.ty_le or 0)))
    return out


@router.get("/preview", response_model=KMPreviewOut)
def preview_best(
    amount: int = Query(..., ge=0),
    tier: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    now = _now_utc()
    rows = (
        db.query(KhuyenMai)
        .filter(
            and_(
                KhuyenMai.active == 1,
                KhuyenMai.thoi_gian_bd <= now,
                KhuyenMai.thoi_gian_kt >= now,
            )
        )
        .all()
    )

    best = None
    for r in rows:
        if not _satisfy_conditions(r, amount=amount, tier=tier):
            continue
        rate, off, final = _calc_preview(amount, r)
        if best is None or off > best[1]:
            best = (rate, off, final, r)

    if best is None:
        return KMPreviewOut(
            amount=amount,
            discount_rate=0,
            discount_amount=0,
            final_total=amount,
            promo=None,
        )

    rate, off, final, row = best
    return KMPreviewOut(
        amount=amount,
        discount_rate=rate,
        discount_amount=off,
        final_total=final,
        promo=KMLite(id=row.id, ten=row.ten, ty_le=float(row.ty_le or 0)),
    )
