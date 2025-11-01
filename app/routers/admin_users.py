from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError
from typing import Optional

from ..db import get_db
from ..models import User, KhachHang, NhanVien
from .auth import require_roles
from .. import models

router = APIRouter(prefix="/admin/users", tags=["AdminUsers"])


# --- helpers -----------------------------------------------------------------
def _tier_from_points(points: int) -> str:
    if points >= 1000:
        return "DIAMOND"
    if points >= 500:
        return "GOLD"
    if points >= 100:
        return "SILVER"
    return "STANDARD"


def _serialize_user(
    db: Session,
    u: User,
    points: int = 0,
) -> dict:
    """
    Ghép thêm thông tin hồ sơ + bậc thành viên theo TỔNG ĐIỂM thực tế.
    Trả về cả 'email' & 'sdt' ở cấp root cho FE render trực tiếp.
    """
    profile = None
    email: Optional[str] = None
    sdt: Optional[str] = None

    if u.role == "CUSTOMER":
        kh = db.query(KhachHang).filter(KhachHang.user_id == u.id).first()
        if kh:
            email = kh.email
            sdt = kh.sdt
            profile = {
                "id": kh.id,
                "type": "KH",
                "ten": kh.ten,
                "sdt": kh.sdt,
                "email": kh.email,
            }
    else:  # STAFF / ADMIN
        nv = db.query(NhanVien).filter(NhanVien.user_id == u.id).first()
        if nv:
            email = nv.email
            sdt = nv.sdt
            profile = {
                "id": nv.id,
                "type": "NV",
                "ten": nv.ten,
                "sdt": nv.sdt,
                "email": nv.email,
                "vai_tro": nv.vai_tro,
                "trang_thai": nv.trang_thai,
            }

    return {
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "created_at": u.created_at,
        "updated_at": u.updated_at,
        "profile": profile,   # giữ để tương thích cũ
        "email": email,
        "sdt": sdt,
        # điểm & bậc tính theo dữ liệu thật
        "total_points": int(points or 0),
        "hang_thanh_vien": _tier_from_points(int(points or 0)),
    }


# ========== Danh sách người dùng ==========
@router.get("", dependencies=[Depends(require_roles("ADMIN"))])
def list_users(
    q: str | None = Query(None, description="Từ khoá username/email/sđt"),
    role: str | None = Query(None, regex="^(ADMIN|STAFF|CUSTOMER)$"),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    """
    Lấy danh sách users + bậc thành viên (theo tổng điểm thật).
    """
    query = db.query(User)

    if role:
        query = query.filter(User.role == role)

    if q:
        like = f"%{q.strip()}%"
        sub_kh = (
            db.query(KhachHang.user_id)
            .filter(
                or_(
                    KhachHang.ten.ilike(like),
                    KhachHang.email.ilike(like),
                    KhachHang.sdt.ilike(like),
                )
            )
        )
        sub_nv = (
            db.query(NhanVien.user_id)
            .filter(
                or_(
                    NhanVien.ten.ilike(like),
                    NhanVien.email.ilike(like),
                    NhanVien.sdt.ilike(like),
                )
            )
        )
        query = query.filter(
            or_(
                User.username.ilike(like),
                User.id.in_(sub_kh),
                User.id.in_(sub_nv),
            )
        )

    total = query.count()
    rows = (
        query.order_by(User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Lấy tổng điểm thật cho TẤT CẢ user đang ở trang hiện tại (tránh N+1 query)
    ids = [u.id for u in rows]
    points_map = {i: 0 for i in ids}
    if ids:
        for r in db.execute(
            text(
                """
                SELECT ma_nguoi_dung AS uid, COALESCE(SUM(diem_thay_doi),0) AS diem
                FROM so_cai_diem
                WHERE ma_nguoi_dung IN :ids
                GROUP BY ma_nguoi_dung
                """
            ),
            {"ids": tuple(ids)},
        ).mappings():
            points_map[int(r["uid"])] = int(r["diem"] or 0)

    items = [_serialize_user(db, u, points_map.get(u.id, 0)) for u in rows]
    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ========== Cập nhật quyền ==========
@router.post("/{user_id}/role", dependencies=[Depends(require_roles("ADMIN"))])
def set_role(user_id: int, payload: dict, db: Session = Depends(get_db)):
    new_role = (payload.get("role") or "").upper()
    if new_role not in ("ADMIN", "STAFF", "CUSTOMER"):
        raise HTTPException(422, "role phải là ADMIN/STAFF/CUSTOMER")

    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User không tồn tại")

    u.role = new_role
    db.commit()
    return {"ok": True}


# ========== Reset mật khẩu ==========
@router.post("/{user_id}/reset-password", dependencies=[Depends(require_roles("ADMIN"))])
def reset_password(user_id: int, payload: dict, db: Session = Depends(get_db)):
    new_pwd = payload.get("new_password")
    if not new_pwd:
        raise HTTPException(422, "Thiếu new_password")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User không tồn tại")
    u.password_hash = new_pwd
    db.commit()
    return {"ok": True}


# ========== Đảm bảo hồ sơ (giữ nguyên nếu bạn vẫn cần) ==========
@router.post("/{user_id}/ensure-profile", dependencies=[Depends(require_roles("ADMIN"))])
def ensure_profile(user_id: int, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User không tồn tại")

    if u.role == "CUSTOMER":
        kh = db.query(KhachHang).filter(KhachHang.user_id == u.id).first()
        if kh:
            return {"ok": True, "profile_id": kh.id}
        kh = KhachHang(ten=u.username, user_id=u.id)
        db.add(kh)
        db.commit()
        db.refresh(kh)
        return {"ok": True, "profile_id": kh.id}

    nv = db.query(NhanVien).filter(NhanVien.user_id == u.id).first()
    if nv:
        return {"ok": True, "profile_id": nv.id}
    nv = NhanVien(ten=u.username, user_id=u.id, vai_tro=u.role)
    db.add(nv)
    db.commit()
    db.refresh(nv)
    return {"ok": True, "profile_id": nv.id}


# ========== Xoá tài khoản ==========
@router.delete("/{user_id}", dependencies=[Depends(require_roles("ADMIN"))])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        db.delete(user)
        db.commit()
        return {"message": "User deleted successfully"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Không thể xóa tài khoản vì còn dữ liệu liên kết.",
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
