# app/routers/auth.py
from __future__ import annotations

from datetime import datetime, timedelta
import re
import jwt
from fastapi import APIRouter, Depends, HTTPException, WebSocket
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from ..db import get_db
from ..models import User, KhachHang  # NhanVien không dùng ở file này, có thể bỏ
from ..schemas import LoginIn, RegisterIn, TokenOut  # RegisterIn: username,password,email,sdt

router = APIRouter(prefix="/auth", tags=["Auth"])

# =========================
# JWT & Password hashing
# =========================
SECRET_KEY = "CHANGE_ME_SECRET"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 ngày

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(pw: str) -> str:
    return pwd_context.hash(pw)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Hỗ trợ legacy: nếu trước đây lưu plain-text thì vẫn đăng nhập được.
    """
    try:
        # identify() trả về tên scheme nếu là hash hợp lệ, None nếu không phải hash
        if pwd_context.identify(hashed):
            return pwd_context.verify(plain, hashed)
    except Exception:
        # hashed không phải bcrypt -> rơi xuống so sánh thường
        pass
    return hashed == plain


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# Alias cho các phần code khác có thể đang gọi
def decode_access_token(token: str) -> dict:
    return decode_token(token)


# =========================
# Auth dependencies
# =========================
bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    uid = payload.get("user_id")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ===== WebSocket auth: lấy token từ query ?token=... =====
async def get_current_user_ws(
    websocket: WebSocket,
    db: Session = Depends(get_db),
) -> User:
    token = (websocket.query_params.get("token") or "").strip()
    if not token:
        # 4401: Unauthorized (custom)
        await websocket.close(code=4401)
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = decode_access_token(token)
        uid = payload.get("user_id")
        if not uid:
            await websocket.close(code=4401)
            raise HTTPException(status_code=401, detail="Invalid token payload")
        user = db.get(User, int(uid))
        if not user:
            await websocket.close(code=4401)
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except HTTPException:
        # đã đóng WS phía trên
        raise
    except Exception:
        await websocket.close(code=4401)
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*roles: str):
    def _inner(user: User = Depends(get_current_user)) -> dict:
        if roles and user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return {"user_id": user.id, "username": user.username, "role": user.role}
    return _inner


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# =========================
# REGISTRATION
# =========================
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^[0-9()+\-\s]{8,20}$")


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """
    Tạo tài khoản CUSTOMER + hồ sơ KhachHang.
    Validate: username/email/sđt bắt buộc, password >=6; check trùng username/email/sđt.
    FE có thể gửi thêm confirm_password; nếu có và không khớp sẽ báo lỗi field 'confirm_password'.
    """
    username = (body.username or "").strip()
    email = (body.email or "").strip()
    sdt = (body.sdt or "").strip()
    password = (body.password or "").strip()
    confirm_password = getattr(body, "confirm_password", None)

    # Validate cơ bản
    if not username:
        raise HTTPException(status_code=400, detail={"field": "username", "message": "Vui lòng nhập tài khoản"})
    if len(password) < 6:
        raise HTTPException(status_code=400, detail={"field": "password", "message": "Mật khẩu tối thiểu 6 ký tự"})
    if confirm_password is not None and confirm_password != password:
        raise HTTPException(status_code=422, detail={"field": "confirm_password", "message": "Mật khẩu xác nhận không khớp"})
    if not email:
        raise HTTPException(status_code=400, detail={"field": "email", "message": "Vui lòng nhập email"})
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail={"field": "email", "message": "Email không hợp lệ"})
    if not sdt:
        raise HTTPException(status_code=400, detail={"field": "sdt", "message": "Vui lòng nhập số điện thoại"})
    if not PHONE_RE.match(sdt):
        raise HTTPException(status_code=400, detail={"field": "sdt", "message": "Số điện thoại không hợp lệ (8-20 ký tự)"})

    # Uniqueness
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail={"field": "username", "message": "Tài khoản đã tồn tại"})
    if db.query(KhachHang).filter(KhachHang.email == email).first():
        raise HTTPException(status_code=409, detail={"field": "email", "message": "Email đã được sử dụng"})
    if db.query(KhachHang).filter(KhachHang.sdt == sdt).first():
        raise HTTPException(status_code=409, detail={"field": "sdt", "message": "Số điện thoại đã được sử dụng"})

    # Tạo user
    u = User(username=username, role="CUSTOMER", password_hash=hash_password(password))
    db.add(u)
    db.commit()
    db.refresh(u)

    # Tạo hồ sơ khách hàng
    kh = KhachHang(
        user_id=u.id,
        ten=u.username,
        hang_thanh_vien="STANDARD",
        diem_tich_luy=0,
        email=email,
        sdt=sdt,
    )
    db.add(kh)
    db.commit()

    return {"ok": True, "user_id": u.id, "role": u.role}


# =========================
# LOGIN
# =========================
@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    """
    Phân biệt rõ:
    - Tài khoản không tồn tại -> {field:'username', message:'Tài khoản không tồn tại.'}
    - Mật khẩu sai         -> {field:'password', message:'Mật khẩu không đúng.'}
    """
    u = db.query(User).filter(User.username == body.username).first()
    if not u:
        raise HTTPException(
            status_code=401,
            detail={"field": "username", "message": "Tài khoản không tồn tại."},
        )

    if not verify_password(body.password, u.password_hash):
        raise HTTPException(
            status_code=401,
            detail={"field": "password", "message": "Mật khẩu không đúng."},
        )

    token = create_access_token({"user_id": u.id, "username": u.username, "role": u.role})
    return TokenOut(access_token=token, role=u.role)


# =========================
# CURRENT USER
# =========================
@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user_id": user.id, "username": user.username, "role": user.role}


# =========================
# FORGOT / RESET PASSWORD
# =========================
class ForgotIn(BaseModel):
    username: str | None = None
    email: str | None = None


class ResetIn(BaseModel):
    username: str
    code: str
    new_password: str


# Lưu tạm mã khôi phục trong RAM (demo)
_RESET_STORE: dict[str, dict] = {}
_RESET_EXPIRE_MIN = 10


@router.post("/forgot-password")
def forgot_password(payload: ForgotIn, db: Session = Depends(get_db)):
    if not payload.username and not payload.email:
        raise HTTPException(status_code=400, detail="Provide username or email")
    if payload.email and not EMAIL_RE.match(payload.email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    user: User | None = None
    if payload.username:
        user = db.query(User).filter(User.username == payload.username).first()
    elif payload.email:
        # Email đang lưu ở bảng KhachHang
        kh = db.query(KhachHang).filter(KhachHang.email == payload.email).first()
        if kh:
            user = db.get(User, kh.user_id)

    if not user:
        # Tránh lộ thông tin tồn tại tài khoản
        return {"message": "If account exists, a code was sent to its email."}

    code = f"{__import__('random').randint(0, 999999):06d}"
    _RESET_STORE[user.username] = {
        "code": code,
        "expire_at": datetime.utcnow() + timedelta(minutes=_RESET_EXPIRE_MIN),
    }
    # Thực tế: gửi email tại đây. Demo: in ra console.
    print(f"[RESET CODE] username={user.username} code={code} (valid {_RESET_EXPIRE_MIN}m)")
    return {"message": "Reset code sent to your email."}


@router.post("/reset-password")
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    rec = _RESET_STORE.get(payload.username)
    if not rec or rec["expire_at"] < datetime.utcnow() or rec["code"] != payload.code:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    user = db.query(User).filter(User.username == payload.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=422, detail={"field": "new_password", "message": "Mật khẩu tối thiểu 6 ký tự"})

    user.password_hash = hash_password(payload.new_password)
    db.add(user)
    db.commit()
    _RESET_STORE.pop(payload.username, None)
    return {"message": "Password has been reset"}
