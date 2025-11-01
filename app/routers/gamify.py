# app/routers/gamify.py
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from typing import Optional
from datetime import datetime

from ..db import get_db
from .auth import get_current_user, require_roles

router = APIRouter(prefix="/gamify", tags=["Gamification"])

# ---------------------------------------------------------------------
# Helpers & Timezone
# ---------------------------------------------------------------------
_DT_FORMAT = "%Y-%m-%d %H:%M:%S"

# Nếu MySQL chạy UTC nhưng bạn lưu thời gian theo VN (+07:00),
# hãy đổi _NOW_EXPR = "CONVERT_TZ(NOW(), '+00:00', '+07:00')"
_NOW_EXPR = "NOW()"


def _try_parse_many(raw: str) -> Optional[datetime]:
    if not raw:
        return None
    s = str(raw).strip().replace("T", " ").replace("/", "-")
    if s.endswith("Z"):
        s = s[:-1]
    if " " in s:
        last = s.split(" ")[-1]
        if (last.startswith("+") or last.startswith("-")) and ":" in last:
            s = s[: s.rfind(" ")]
    for p in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H", "%Y-%m-%d", "%Y%m%d%H%M%S", "%Y%m%d"):
        try:
            return datetime.strptime(s, p)
        except Exception:
            continue
    return None


def _norm_start(raw: str) -> str:
    dt = _try_parse_many(raw)
    if not dt:
        raise HTTPException(status_code=422, detail="ngay_bat_dau không hợp lệ")
    return dt.strftime(_DT_FORMAT)


def _norm_end(raw: str) -> str:
    dt = _try_parse_many(raw)
    if not dt:
        raise HTTPException(status_code=422, detail="ngay_ket_thuc không hợp lệ")
    if dt.hour == 0 and dt.minute == 0 and dt.second == 0 and len(str(raw).strip()) <= 10:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt.strftime(_DT_FORMAT)


def _to_int(v, default=None):
    try:
        return int(v)
    except Exception:
        return default


def _extract_times(payload: dict):
    s = payload.get("ngay_bat_dau") or payload.get("start") or payload.get("start_date")
    e = payload.get("ngay_ket_thuc") or payload.get("end") or payload.get("end_date")
    if not s or not e:
        for key in ("time", "range", "thoi_gian", "thoi_gian_ap_dung"):
            rng = payload.get(key)
            if isinstance(rng, (list, tuple)) and len(rng) >= 2:
                s = s or rng[0]
                e = e or rng[1]
                break
    return s, e


def _has_column(db: Session, table: str, column: str) -> bool:
    try:
        row = db.execute(
            text(
                """
                SELECT 1
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = :t
                  AND COLUMN_NAME = :c
                LIMIT 1
                """
            ),
            {"t": table, "c": column},
        ).first()
        if row:
            return True
        row2 = db.execute(
            text(
                """
                SELECT 1
                FROM information_schema.COLUMNS
                WHERE TABLE_NAME = :t
                  AND COLUMN_NAME = :c
                LIMIT 1
                """
            ),
            {"t": table, "c": column},
        ).first()
        return bool(row2)
    except Exception:
        return False


# =====================================================================
# PUBLIC: điểm & thử thách tuần (kèm tiến độ hiện tại)
# =====================================================================
@router.get("/me/score")
def my_score(db: Session = Depends(get_db), user=Depends(get_current_user)):
    row = db.execute(
        text(
            """
            SELECT COALESCE(SUM(diem_thay_doi), 0) AS score
            FROM so_cai_diem
            WHERE ma_nguoi_dung = :uid
            """
        ),
        {"uid": user.id},
    ).mappings().first()
    return {"score": int((row or {}).get("score", 0))}


@router.get("/me/challenges")
def my_week_challenges(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Danh sách thử thách đang hoạt động + tiến độ hiện tại (da_dat) của user.
    """
    has_active = _has_column(db, "thu_thach_tuan", "hoat_dong")
    where_active = "AND IFNULL(tt.hoat_dong, 1) = 1" if has_active else ""

    rows = db.execute(
        text(
            f"""
            SELECT
                tt.ma_thu_thach,
                tt.ten_thu_thach,
                tt.muc_tieu,
                tt.diem_thuong,
                DATE(tt.ngay_bat_dau) AS d_start,
                DATE(tt.ngay_ket_thuc) AS d_end,
                COALESCE(td.gia_tri_hien_tai, 0) AS da_dat
            FROM thu_thach_tuan tt
            LEFT JOIN tien_do_thu_thach td
                   ON td.ma_thu_thach = tt.ma_thu_thach
                  AND td.ma_nguoi_dung = :uid
            WHERE {_NOW_EXPR} BETWEEN tt.ngay_bat_dau AND tt.ngay_ket_thuc
            {where_active}
            ORDER BY tt.ngay_bat_dau ASC, tt.ma_thu_thach ASC
            """
        ),
        {"uid": user.id},
    ).mappings().all()

    return {
        "items": [
            {
                "ma_thu_thach": r["ma_thu_thach"],
                "ten_thu_thach": r["ten_thu_thach"],
                "muc_tieu": int(r["muc_tieu"] or 0),
                "diem_thuong": int(r["diem_thuong"] or 0),
                "tuan_bat_dau": str(r["d_start"]),
                "tuan_ket_thuc": str(r["d_end"]),
                "da_dat": int(r["da_dat"] or 0),
            }
            for r in rows
        ]
    }


# =====================================================================
# ADMIN: CRUD thu_thach_tuan
# =====================================================================
class ChallengeBase(BaseModel):
    ten_thu_thach: str = Field(..., max_length=255)
    muc_tieu: int = Field(..., ge=1)
    diem_thuong: int = Field(..., ge=0)
    ngay_bat_dau: str
    ngay_ket_thuc: str


class ChallengeCreate(ChallengeBase):
    pass  # ID tự tăng


class ChallengeUpdate(BaseModel):
    ten_thu_thach: Optional[str] = Field(None, max_length=255)
    muc_tieu: Optional[int] = Field(None, ge=1)
    diem_thuong: Optional[int] = Field(None, ge=0)
    ngay_bat_dau: Optional[str] = None
    ngay_ket_thuc: Optional[str] = None


@router.get("/challenges")
def list_challenges(
    db: Session = Depends(get_db),
    start: Optional[str] = Query(None, description="YYYY-MM-DD hoặc datetime"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD hoặc datetime"),
    all: int = Query(0, description="=1 để xem tất cả thay vì chỉ bản ghi còn hiệu lực"),
):
    where = []
    params = {}

    # Mặc định: chỉ hiển thị thử thách đang hiệu lực
    if not all:
        where.append(f"{_NOW_EXPR} BETWEEN ngay_bat_dau AND ngay_ket_thuc")
        if _has_column(db, "thu_thach_tuan", "hoat_dong"):
            where.append("IFNULL(hoat_dong, 1) = 1")
    else:
        # Nếu all=1 vẫn tôn trọng bộ lọc ngày nếu có
        if _has_column(db, "thu_thach_tuan", "hoat_dong"):
            where.append("IFNULL(hoat_dong, 1) IN (0,1)")

    # Bộ lọc theo ngày nếu truyền vào
    if start:
        params["start"] = _norm_start(start)
        where.append("ngay_ket_thuc >= :start")
    if end:
        params["end"] = _norm_end(end)
        where.append("ngay_bat_dau <= :end")

    sql = f"""
        SELECT
            ma_thu_thach, ten_thu_thach, muc_tieu, diem_thuong,
            ngay_bat_dau, ngay_ket_thuc
        FROM thu_thach_tuan
        {'WHERE ' + ' AND '.join(where) if where else ''}
        ORDER BY ngay_bat_dau DESC, ma_thu_thach ASC
    """
    rows = db.execute(text(sql), params).mappings().all()

    return {
        "items": [
            {
                "ma_thu_thach": r["ma_thu_thach"],
                "ten_thu_thach": r["ten_thu_thach"],
                "muc_tieu": int(r["muc_tieu"] or 0),
                "diem_thuong": int(r["diem_thuong"] or 0),
                "ngay_bat_dau": str(r["ngay_bat_dau"]),
                "ngay_ket_thuc": str(r["ngay_ket_thuc"]),
            }
            for r in rows
        ]
    }


@router.post("/challenges", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def create_challenge(body: dict = Body(...), db: Session = Depends(get_db)):
    ten = (body.get("ten_thu_thach") or body.get("ten") or "").strip()
    if not ten:
        raise HTTPException(status_code=422, detail="Thiếu 'ten_thu_thach'")

    muc = _to_int(body.get("muc_tieu"), 0)
    diem = _to_int(body.get("diem_thuong"), 0)

    raw_s, raw_e = _extract_times(body)
    if not raw_s or not raw_e:
        raise HTTPException(status_code=422, detail="Thiếu thời gian áp dụng")
    s = _norm_start(raw_s)
    e = _norm_end(raw_e)
    if e < s:
        s, e = e, s

    cols = ["ten_thu_thach", "muc_tieu", "diem_thuong", "ngay_bat_dau", "ngay_ket_thuc"]
    vals = [":t", ":mt", ":d", ":s", ":e"]
    params = {"t": ten, "mt": muc, "d": diem, "s": s, "e": e}

    sql_ins = text(f"INSERT INTO thu_thach_tuan ({', '.join(cols)}) VALUES ({', '.join(vals)})")
    try:
        db.execute(sql_ins, params)
        new_id = db.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        db.commit()
        return {"ok": True, "ma_thu_thach": new_id}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Thử thách trùng ràng buộc unique. Hãy đổi thời gian hoặc tên.")


@router.put("/challenges/{ma}", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def update_challenge(ma: str, body: dict = Body(...), db: Session = Depends(get_db)):
    sets, params = [], {"m": ma}

    if "ten_thu_thach" in body or "ten" in body:
        sets.append("ten_thu_thach = :t")
        params["t"] = (body.get("ten_thu_thach") or body.get("ten") or "").strip()
    if "muc_tieu" in body:
        sets.append("muc_tieu = :mt")
        params["mt"] = _to_int(body.get("muc_tieu"), 0)
    if "diem_thuong" in body:
        sets.append("diem_thuong = :d")
        params["d"] = _to_int(body.get("diem_thuong"), 0)

    raw_s, raw_e = _extract_times(body)
    if raw_s is not None:
        sets.append("ngay_bat_dau = :s")
        params["s"] = _norm_start(raw_s)
    if raw_e is not None:
        sets.append("ngay_ket_thuc = :e")
        params["e"] = _norm_end(raw_e)

    if not sets:
        return {"ok": True, "ma_thu_thach": ma}

    if "s" in params and "e" in params and params["e"] < params["s"]:
        params["s"], params["e"] = params["e"], params["s"]

    res = db.execute(text(f"UPDATE thu_thach_tuan SET {', '.join(sets)} WHERE ma_thu_thach = :m"), params)
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Không tìm thấy thử thách")
    db.commit()
    return {"ok": True, "ma_thu_thach": ma}


@router.delete("/challenges/{ma}", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def delete_challenge(ma: str, db: Session = Depends(get_db)):
    """
    XÓA CỨNG thử thách:
    1) Xóa các tiến độ liên quan ở `tien_do_thu_thach`
    2) Xóa bản ghi ở `thu_thach_tuan`
    """
    try:
        db.execute(text("DELETE FROM tien_do_thu_thach WHERE ma_thu_thach = :m"), {"m": ma})
        res = db.execute(text("DELETE FROM thu_thach_tuan WHERE ma_thu_thach = :m"), {"m": ma})
        if res.rowcount == 0:
            db.rollback()
            raise HTTPException(status_code=404, detail="Không tìm thấy thử thách")
        db.commit()
        return {"ok": True, "deleted": True}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================
# PROGRESS ENGINE
# =====================================================================
def increment_active_challenges(db: Session, user_id: int, inc: int = 1) -> int:
    """
    Cộng tiến độ 'inc' cho TẤT CẢ thử thách đang hoạt động của user.
    - Hoạt động = NOW() (hay _NOW_EXPR) nằm trong [ngay_bat_dau, ngay_ket_thuc]
      và (hoat_dong IS NULL hoặc =1).
    - Yêu cầu UNIQUE KEY (ma_thu_thach, ma_nguoi_dung) trên `tien_do_thu_thach`.
    Trả về số thử thách được cộng (ước lượng theo rowcount).
    """
    has_active = _has_column(db, "thu_thach_tuan", "hoat_dong")
    where_active = "AND IFNULL(tt.hoat_dong,1)=1" if has_active else ""

    res = db.execute(
        text(
            f"""
            INSERT INTO tien_do_thu_thach (ma_thu_thach, ma_nguoi_dung, gia_tri_hien_tai)
            SELECT tt.ma_thu_thach, :uid, :inc
            FROM thu_thach_tuan tt
            WHERE {_NOW_EXPR} BETWEEN tt.ngay_bat_dau AND tt.ngay_ket_thuc
            {where_active}
            ON DUPLICATE KEY UPDATE
              gia_tri_hien_tai = tien_do_thu_thach.gia_tri_hien_tai + VALUES(gia_tri_hien_tai)
            """
        ),
        {"uid": user_id, "inc": inc},
    )
    db.commit()
    return res.rowcount or 0


@router.post("/hook/played", dependencies=[Depends(require_roles("ADMIN", "STAFF", "CUSTOMER"))])
def hook_played(body: dict = Body({}), db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Endpoint test: giả lập 'user vừa chơi/thanh toán 1 lượt'.
    Thực tế, bạn KHÔNG cần gọi endpoint này từ FE. Chỉ cần gọi helper
    `increment_active_challenges(db, user.id)` trong router thanh toán là xong.
    """
    inc = int(body.get("inc") or 1)
    changed = increment_active_challenges(db, user.id, inc=inc)
    return {"ok": True, "affected": int(changed)}


@router.post("/progress/increment", dependencies=[Depends(require_roles("ADMIN", "STAFF", "CUSTOMER"))])
def progress_increment(body: dict = Body({}), db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Cộng 'inc' tiến độ cho mọi thử thách đang hoạt động của user hiện tại.
    FE gọi route này; nếu 404 thì FE sẽ fallback /hook/played.
    """
    inc = int(body.get("inc") or 1)
    changed = increment_active_challenges(db, user.id, inc=inc)
    return {"ok": True, "affected": int(changed)}
