from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, text

from ..db import get_db
from ..models import Ve, SuKien, User, TroChoi
from .auth import get_current_user, require_roles

# === Khuyến mãi ===
from app.promo_utils import find_best_promo, list_applicable_promos

# === Gamification khi duyệt vé trò chơi ===
from .gamify import increment_active_challenges
from ..services.gamification import reward_if_reached

# === MoMo (sandbox) ===
import os
import time
import uuid
import hmac
import hashlib
import requests
from datetime import datetime

router = APIRouter(prefix="/ve", tags=["Vé"])

MOMO_CREATE_ENDPOINT = "https://test-payment.momo.vn/v2/gateway/api/create"


# ===================== Schemas =====================
class BookIn(BaseModel):
    su_kien_id: int
    so_luong: int = 1
    promo_id: int | None = None


class BookGameIn(BaseModel):
    tro_choi_id: int
    so_luong: int = 1
    promo_id: int | None = None


class ReviewIn(BaseModel):
    approve: bool


class ListOut(BaseModel):
    id: int
    so_luong: int
    trang_thai: str
    khach: str
    tong_tien: int
    su_kien: dict | None = None
    tro_choi: dict | None = None
    # FE Staff mở chat theo vé (không cần nhập uid)
    khach_user_id: int | None = None


class PageOut(BaseModel):
    items: list[ListOut]
    total: int


# ===================== Helpers =====================
def _get_user_tier(user: User) -> str:
    """Lấy bậc thành viên (STANDARD/…) từ user.khach_hang.hang_thanh_vien."""
    try:
        raw = (getattr(user.khach_hang, "hang_thanh_vien", "") or "").upper().strip()
        return raw if raw else "THUONG"
    except Exception:
        return "THUONG"


def momo_sign_create(payload: dict, secret_key: str) -> str:
    """
    Ký theo đúng thứ tự tham số create (MoMo v2):
    accessKey&amount&extraData&ipnUrl&orderId&orderInfo&partnerCode&
    redirectUrl&requestId&requestType
    """
    keys = [
        "accessKey",
        "amount",
        "extraData",
        "ipnUrl",
        "orderId",
        "orderInfo",
        "partnerCode",
        "redirectUrl",
        "requestId",
        "requestType",
    ]
    raw = "&".join(f"{k}={payload.get(k,'')}" for k in keys)
    return hmac.new(secret_key.encode(), raw.encode(), hashlib.sha256).hexdigest()


def momo_sign_ipn(payload: dict, secret_key: str) -> str:
    """
    Ký xác minh IPN/callback. Sandbox có thể thay đổi danh sách trường;
    phần này dùng bộ tham số phổ biến, nếu thiếu trường sẽ bỏ qua kiểm tra.
    """
    keys = [
        "accessKey",
        "amount",
        "extraData",
        "message",
        "orderId",
        "orderInfo",
        "orderType",
        "partnerCode",
        "payType",
        "requestId",
        "responseTime",
        "resultCode",
        "transId",
    ]
    raw = "&".join(f"{k}={payload.get(k,'')}" for k in keys)
    return hmac.new(secret_key.encode(), raw.encode(), hashlib.sha256).hexdigest()


# ===================== My tickets (có ảnh + ngày đặt) =====================
@router.get("/me")
def my_tickets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trả về danh sách vé của user, embed thông tin sự kiện/trò chơi.
    Bao gồm cả ngày đặt (created_at) để FE hiển thị.
    """
    rows = (
        db.query(Ve)
        .options(
            joinedload(Ve.su_kien),
            joinedload(Ve.tro_choi),
        )
        .filter(Ve.user_id == user.id)
        .order_by(Ve.id.desc())
        .all()
    )

    def sk_dict(sk: SuKien | None):
        if not sk:
            return None
        return {
            "id": sk.id,
            "ten": sk.ten,
            "gia_ve": float(sk.gia_ve or 0),
            "thoi_gian": sk.thoi_gian.isoformat() if sk.thoi_gian else None,
        }

    def tc_dict(tc: TroChoi | None):
        if not tc:
            return None
        return {
            "id": tc.id,
            "ten": tc.ten,
            "gia_mac_dinh": float(tc.gia_mac_dinh or 0),
            "anh_cover": tc.anh_cover,
            "anh_ct_1": tc.anh_ct_1,
            "anh_ct_2": tc.anh_ct_2,
        }

    out = []
    for v in rows:
        out.append(
            {
                "id": v.id,
                "so_luong": v.so_luong,
                "tong_tien": float(v.tong_tien or 0),
                "trang_thai": v.trang_thai,
                "created_at": v.created_at.isoformat()
                if getattr(v, "created_at", None)
                else None,
                "su_kien": sk_dict(v.su_kien),
                "tro_choi": tc_dict(v.tro_choi),
            }
        )
    return out


# ===================== Book vé SỰ KIỆN =====================
@router.post("/book")
def book_ticket(
    payload: BookIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.so_luong <= 0:
        raise HTTPException(400, "Số lượng không hợp lệ")

    ev = db.get(SuKien, payload.su_kien_id)
    if not ev or ev.trang_thai != "OPEN":
        raise HTTPException(400, "Sự kiện không khả dụng")

    qty = int(payload.so_luong)
    gia_ve = float(ev.gia_ve or 0)
    original_total = gia_ve * qty

    user_tier = _get_user_tier(user)

    promo, rate = None, 0.0
    if payload.promo_id is not None:
        appl = list_applicable_promos(
            db, amount=original_total, user_tier=user_tier, event_id=ev.id
        )
        chosen = next(
            (p for p in appl if int(p["id"]) == int(payload.promo_id)), None
        )
        if not chosen:
            raise HTTPException(422, "Khuyến mãi không hợp lệ cho đơn này")
        promo = type("P", (), {"id": chosen["id"], "ten": chosen["ten"]})()
        rate = float(chosen["rate"])
    else:
        promo, rate = find_best_promo(
            db, amount=original_total, user_tier=user_tier, event_id=ev.id
        )

    discount_amount = round(original_total * rate / 100)
    final_total = int(original_total - discount_amount)

    ve = Ve(
        user_id=user.id,
        su_kien_id=ev.id,
        tro_choi_id=None,
        so_luong=qty,
        tong_tien=final_total,
        trang_thai="BOOKED",
    )
    db.add(ve)
    db.commit()
    db.refresh(ve)

    return {
        "ok": True,
        "id": ve.id,
        "original_total": int(original_total),
        "discount_rate": float(rate),
        "discount_amount": int(discount_amount),
        "final_total": int(final_total),
        "promo": {"id": promo.id, "ten": promo.ten} if promo else None,
    }


# ===================== Book vé TRÒ CHƠI =====================
@router.post("/book-game")
def book_game(
    payload: BookGameIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.so_luong <= 0:
        raise HTTPException(400, "Số lượng không hợp lệ")

    game = db.get(TroChoi, payload.tro_choi_id)
    if not game or game.trang_thai != "OPEN":
        raise HTTPException(404, "Trò chơi không khả dụng")

    qty = int(payload.so_luong)
    gia = float(game.gia_mac_dinh or 0)
    original_total = gia * qty

    user_tier = _get_user_tier(user)

    promo, rate = None, 0.0
    if payload.promo_id is not None:
        appl = list_applicable_promos(
            db, amount=original_total, user_tier=user_tier, event_id=None
        )
        chosen = next(
            (p for p in appl if int(p["id"]) == int(payload.promo_id)), None
        )
        if not chosen:
            raise HTTPException(422, "Khuyến mãi không hợp lệ cho đơn này")
        promo = type("P", (), {"id": chosen["id"], "ten": chosen["ten"]})()
        rate = float(chosen["rate"])
    else:
        promo, rate = find_best_promo(
            db, amount=original_total, user_tier=user_tier, event_id=None
        )

    discount_amount = round(original_total * rate / 100)
    final_total = int(original_total - discount_amount)

    ve = Ve(
        user_id=user.id,
        su_kien_id=None,
        tro_choi_id=game.id,
        so_luong=qty,
        tong_tien=final_total,
        trang_thai="BOOKED",
    )
    db.add(ve)
    db.commit()
    db.refresh(ve)

    return {
        "ok": True,
        "id": ve.id,
        "tro_choi": {"id": game.id, "ten": game.ten},
        "so_luong": qty,
        "original_total": int(original_total),
        "discount_rate": float(rate),
        "discount_amount": int(discount_amount),
        "final_total": int(final_total),
        "promo": {"id": promo.id, "ten": promo.ten} if promo else None,
    }


# ===================== Cancel ticket =====================
@router.post("/cancel/{ve_id}")
def cancel_ticket(
    ve_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ve = db.get(Ve, ve_id)
    if not ve or ve.user_id != user.id:
        raise HTTPException(404, "Vé không tồn tại")
    # Cho phép hủy ở BOOKED / PENDING / UNPAID
    if ve.trang_thai not in ("BOOKED", "PENDING", "UNPAID"):
        raise HTTPException(400, "Không thể hủy vé ở trạng thái hiện tại")

    ve.trang_thai = "CANCELLED"
    db.commit()
    return {"ok": True}


# ===================== Mark paid (user báo đã thanh toán) =====================
@router.post("/mark-paid/{ve_id}")
def mark_paid(
    ve_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ve = db.get(Ve, ve_id)
    if not ve or ve.user_id != user.id:
        raise HTTPException(404, "Vé không tồn tại")
    if ve.trang_thai != "BOOKED":
        raise HTTPException(400, "Chỉ báo thanh toán khi vé đang BOOKED")

    ve.trang_thai = "PENDING"
    db.commit()
    return {"ok": True}


# ===================== Admin review (duyệt thanh toán) =====================
@router.post("/review/{ve_id}", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def review_payment(
    ve_id: int,
    body: ReviewIn,
    db: Session = Depends(get_db),
):
    ve = db.get(Ve, ve_id)
    if not ve:
        raise HTTPException(404, "Vé không tồn tại")
    if ve.trang_thai != "PENDING":
        raise HTTPException(400, "Chỉ duyệt vé ở trạng thái PENDING")

    if body.approve:
        ve.trang_thai = "PAID"
        db.flush()

        so_tien = float(ve.tong_tien or 0)
        diem_cong = int(so_tien / 5000)
        if diem_cong > 0:
            db.execute(
                text(
                    """
                    INSERT INTO so_cai_diem (ma_nguoi_dung, diem_thay_doi, ly_do, thoi_gian)
                    VALUES (:uid, :diem, :lydo, NOW())
                """
                ),
                {
                    "uid": ve.user_id,
                    "diem": diem_cong,
                    "lydo": f"Cộng {diem_cong} điểm từ chi tiêu {int(so_tien):,}đ",
                },
            )

        if ve.tro_choi_id is not None:
            increment_active_challenges(
                db, user_id=ve.user_id, inc=int(ve.so_luong or 1)
            )
            reward_if_reached(db, user_id=ve.user_id)
    else:
        ve.trang_thai = "BOOKED"

    db.commit()
    return {"ok": True}


# ===================== Admin list vé =====================
@router.get(
    "/admin/list",
    response_model=PageOut,
    dependencies=[Depends(require_roles("ADMIN", "STAFF"))],
)
def admin_list(
    db: Session = Depends(get_db),
    status: str = Query(None),
    q: str = Query(""),
    page: int = 1,
    page_size: int = 20,
):
    query = (
        db.query(Ve)
        .join(User, User.id == Ve.user_id)
        .outerjoin(SuKien, SuKien.id == Ve.su_kien_id)
        .outerjoin(TroChoi, TroChoi.id == Ve.tro_choi_id)
        .options(
            joinedload(Ve.user), joinedload(Ve.su_kien), joinedload(Ve.tro_choi)
        )
    )

    if status:
        query = query.filter(Ve.trang_thai == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.username.like(like),
                SuKien.ten.like(like),
                TroChoi.ten.like(like),
            )
        )

    total = query.count()
    rows = (
        query.order_by(Ve.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    )

    items = []
    for v in rows:
        items.append(
            {
                "id": v.id,
                "so_luong": v.so_luong,
                "trang_thai": v.trang_thai,
                "khach": v.user.username if v.user else "",
                "tong_tien": int(v.tong_tien or 0),
                "su_kien": (
                    {
                        "id": v.su_kien.id,
                        "ten": v.su_kien.ten,
                        "gia_ve": int(v.su_kien.gia_ve or 0),
                    }
                    if v.su_kien
                    else None
                ),
                "tro_choi": (
                    {
                        "id": v.tro_choi.id,
                        "ten": v.tro_choi.ten,
                        "gia_mac_dinh": int(v.tro_choi.gia_mac_dinh or 0),
                    }
                    if v.tro_choi
                    else None
                ),
                # Trường phẳng cho FE Staff/Support
                "khach_user_id": v.user.id if v.user else None,
                "khach_username": v.user.username if v.user else "",
                "ten_su_kien": v.su_kien.ten if v.su_kien else None,
                "ten_tro_choi": v.tro_choi.ten if v.tro_choi else None,
            }
        )
    return {"items": items, "total": total}


# ===================== Preview khuyến mãi =====================
@router.get("/promo-preview")
def promo_preview(
    amount: float = Query(..., gt=0),
    su_kien_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user_tier = _get_user_tier(user)
    promo, rate = find_best_promo(
        db, amount=amount, user_tier=user_tier, event_id=su_kien_id
    )
    discount_amount = round(float(amount) * rate / 100)
    final_total = int(float(amount) - discount_amount)

    return {
        "amount": int(amount),
        "discount_rate": float(rate),
        "discount_amount": int(discount_amount),
        "final_total": int(final_total),
        "promo": {"id": promo.id, "ten": promo.ten} if promo else None,
    }


# ===================== Liệt kê KM đang áp dụng =====================
@router.get("/applicable-promos")
def applicable_promos(
    amount: float = Query(..., gt=0),
    su_kien_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user_tier = _get_user_tier(user)
    lst = list_applicable_promos(
        db, amount=amount, user_tier=user_tier, event_id=su_kien_id
    )

    out = []
    for p in lst:
        rate = float(p["rate"])
        disc = round(float(amount) * rate / 100)
        out.append(
            {
                "id": p["id"],
                "ten": p["ten"],
                "rate": rate,
                "discount_amount": int(disc),
                "final_total": int(float(amount) - disc),
            }
        )
    return out


# ===================== MoMo: Khởi tạo thanh toán =====================
@router.post("/pay-init/{ve_id}")
def momo_pay_init(
    ve_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ve = db.get(Ve, ve_id)
    if not ve or ve.user_id != user.id:
        raise HTTPException(404, "Không tìm thấy vé")
    # Cho phép BOOKED hoặc UNPAID để phù hợp dữ liệu cũ
    if ve.trang_thai not in ("BOOKED", "UNPAID"):
        raise HTTPException(400, f"Vé phải ở trạng thái BOOKED/UNPAID. Hiện tại: {ve.trang_thai}")

    partnerCode = os.getenv("MOMO_PARTNER_CODE")
    accessKey = os.getenv("MOMO_ACCESS_KEY")
    secretKey = os.getenv("MOMO_SECRET_KEY")
    redirectUrl = os.getenv("MOMO_REDIRECT_URL") or "http://localhost:5173/payment-success"
    ipnUrl = os.getenv("MOMO_IPN_URL") or "http://127.0.0.1:8000/ve/pay-callback"

    if not (partnerCode and accessKey and secretKey):
        raise HTTPException(500, "Thiếu cấu hình MOMO_* trong .env")

    amount = str(int(ve.tong_tien or 0))
    orderId = f"{ve.id}-{int(time.time())}"
    requestId = str(uuid.uuid4())
    orderInfo = f"Thanh toan ve #{ve.id}"

    payload = {
        "partnerCode": partnerCode,
        "accessKey": accessKey,
        "requestId": requestId,
        "amount": amount,
        "orderId": orderId,
        "orderInfo": orderInfo,
        "redirectUrl": redirectUrl,
        "ipnUrl": ipnUrl,
        "extraData": "",
        "requestType": "captureWallet",
    }
    payload["signature"] = momo_sign_create(payload, secretKey)

    try:
        res = requests.post(MOMO_CREATE_ENDPOINT, json=payload, timeout=15)
        data = res.json()
    except Exception as e:
        raise HTTPException(502, f"Lỗi kết nối MoMo: {e}")

    if data.get("resultCode") != 0:
        raise HTTPException(400, f"MoMo: {data.get('message', 'Tạo lệnh thất bại')}")

    # lưu để đối soát (nếu có cột)
    try:
        ve.payment_ref = orderId
        db.commit()
    except Exception:
        db.rollback()

    return {"payUrl": data["payUrl"]}


# ===================== MoMo: IPN/Callback =====================
@router.post("/pay-callback")
async def momo_ipn(request: Request, db: Session = Depends(get_db)):
    """
    IPN từ MoMo (sandbox): xác minh chữ ký nếu có, cập nhật vé sang PAID, cộng điểm.
    """
    body = await request.json()
    partnerCode = os.getenv("MOMO_PARTNER_CODE")
    accessKey = os.getenv("MOMO_ACCESS_KEY")
    secretKey = os.getenv("MOMO_SECRET_KEY")

    order_id = body.get("orderId", "")
    try:
        ve_id = int(str(order_id).split("-")[0])
    except Exception:
        ve_id = None
    if not ve_id:
        return {"resultCode": 99, "message": "orderId không hợp lệ"}

    ve = db.get(Ve, ve_id)
    if not ve:
        return {"resultCode": 99, "message": "Vé không tồn tại"}

    # xác minh chữ ký nếu đủ trường
    try:
        recv_sig = body.get("signature", "")
        calc_sig = momo_sign_ipn(body, secretKey)
        if recv_sig and calc_sig and recv_sig != calc_sig:
            return {"resultCode": 97, "message": "Sai chữ ký"}
    except Exception:
        # một số bản sandbox trả thiếu trường => cho qua
        pass

    result_code = int(body.get("resultCode", 99))
    if result_code == 0:
        if ve.trang_thai != "PAID":
            ve.trang_thai = "PAID"
            # lưu mã giao dịch & thời gian nếu có cột
            try:
                ve.payment_ref = body.get("transId") or ve.payment_ref
                ve.payment_time = datetime.utcnow()
            except Exception:
                pass

            try:
                # Cộng điểm
                so_tien = float(ve.tong_tien or 0)
                diem_cong = int(so_tien / 5000)
                if diem_cong > 0:
                    db.execute(
                        text(
                            """
                            INSERT INTO so_cai_diem (ma_nguoi_dung, diem_thay_doi, ly_do, thoi_gian)
                            VALUES (:uid, :diem, :lydo, NOW())
                        """
                        ),
                        {
                            "uid": ve.user_id,
                            "diem": diem_cong,
                            "lydo": f"Cộng {diem_cong} điểm từ chi tiêu {int(so_tien):,}đ (MoMo)",
                        },
                    )

                # Gamification cho vé trò chơi
                if ve.tro_choi_id is not None:
                    increment_active_challenges(
                        db, user_id=ve.user_id, inc=int(ve.so_luong or 1)
                    )
                    reward_if_reached(db, user_id=ve.user_id)

                db.commit()
            except Exception as e:
                db.rollback()
                return {"resultCode": 98, "message": f"Lỗi khi cập nhật DB: {e}"}

        return {"resultCode": 0, "message": "Thành công"}

    # thất bại / pending
    return {"resultCode": result_code, "message": "Giao dịch chưa thành công"}
