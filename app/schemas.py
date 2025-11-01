from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Generic, List, Literal, Optional, TypeVar
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# =========================================================
# Helpers (phân trang generic)
# =========================================================
T = TypeVar("T")


class PageOut(BaseModel, Generic[T]):
    total: int
    page: int
    page_size: int
    items: List[T]

# =========================================================
# AUTH
# =========================================================

class RegisterIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=80)
    password: str = Field(..., min_length=6, max_length=128)
    email: EmailStr
    sdt: str = Field(..., min_length=8, max_length=20)
    role: Literal["ADMIN", "STAFF", "CUSTOMER"] = "CUSTOMER"


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Literal["ADMIN", "STAFF", "CUSTOMER"] = "CUSTOMER"


class UserMeOut(BaseModel):
    user_id: int
    username: str
    role: Literal["ADMIN", "STAFF", "CUSTOMER"]

# =========================================================
# KHU VỰC
# =========================================================

class KhuVucBase(BaseModel):
    ten: str
    suc_chua: Optional[int] = None
    mo_ta: Optional[str] = None


class KhuVucCreate(KhuVucBase):
    pass


class KhuVucIn(KhuVucCreate):
    pass


class KhuVucOut(KhuVucBase):
    id: int
    so_tro_open: Optional[int] = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

# =========================================================
# TRÒ CHƠI
# =========================================================

class TroChoiBase(BaseModel):
    ten: str
    khu_vuc_id: int
    the_loai: Optional[str] = None
    tuoi_khuyen_nghi: Optional[int] = None
    gia_mac_dinh: Decimal | int = 0
    trang_thai: str = "OPEN"  # hoặc Literal["OPEN", "CLOSED", "MAINTENANCE"]
    # ---- ẢNH ----
    anh_cover: Optional[str] = None
    anh_ct_1: Optional[str] = None
    anh_ct_2: Optional[str] = None


class TroChoiIn(TroChoiBase):
    pass


class TroChoiCreate(TroChoiBase):
    pass


class TroChoiUpdate(BaseModel):
    ten: Optional[str] = None
    khu_vuc_id: Optional[int] = None
    the_loai: Optional[str] = None
    tuoi_khuyen_nghi: Optional[int] = None
    gia_mac_dinh: Optional[Decimal | int] = None
    trang_thai: Optional[str] = None
    anh_cover: Optional[str] = None
    anh_ct_1: Optional[str] = None
    anh_ct_2: Optional[str] = None


class TroChoiOut(TroChoiBase):
    id: int
    khu_vuc_ten: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class PageTroChoiOut(PageOut[TroChoiOut]):
    pass

# =========================================================
# SỰ KIỆN
# =========================================================

class SuKienBase(BaseModel):
    ten: str
    mo_ta: Optional[str] = None
    thoi_gian: datetime
    gia_ve: Decimal | int = 0
    trang_thai: Literal["OPEN", "CLOSED"] = "OPEN"
    # ✅ hỗ trợ ảnh bìa
    anh_bia: Optional[str] = None


class SuKienCreate(SuKienBase):
    pass


class SuKienIn(SuKienCreate):
    pass


class SuKienUpdate(BaseModel):
    ten: Optional[str] = None
    mo_ta: Optional[str] = None
    thoi_gian: Optional[datetime] = None
    gia_ve: Optional[Decimal | int] = None
    trang_thai: Optional[Literal["OPEN", "CLOSED"]] = None
    anh_bia: Optional[str] = None


class SuKienOut(SuKienBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# =========================================================
# KHUYẾN MÃI
# =========================================================

class KhuyenMaiBase(BaseModel):
    ten: str
    mo_ta: Optional[str] = None
    giam_phan_tram: Optional[int] = 0
    trang_thai: str = "OPEN"


class KhuyenMaiCreate(KhuyenMaiBase):
    pass


class KhuyenMaiIn(KhuyenMaiCreate):
    pass


class KhuyenMaiOut(KhuyenMaiBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# =========================================================
# VÉ (Tickets)
# =========================================================

class VeIn(BaseModel):
    khach_hang_id: Optional[int] = None
    tro_choi_id: Optional[int] = None
    thoi_gian_bat_dau: datetime
    thoi_gian_ket_thuc: Optional[datetime] = None
    gia: Decimal | int
    trang_thai: Literal["BOOKED", "CHECKIN", "CANCELLED", "USED"] = "BOOKED"
    nhan_vien_id: Optional[int] = None


class VeUpdate(BaseModel):
    khach_hang_id: Optional[int] = None
    tro_choi_id: Optional[int] = None
    thoi_gian_bat_dau: Optional[datetime] = None
    thoi_gian_ket_thuc: Optional[datetime] = None
    gia: Optional[Decimal | int] = None
    trang_thai: Optional[Literal["BOOKED", "CHECKIN", "CANCELLED", "USED"]] = None
    nhan_vien_id: Optional[int] = None


class VeOut(VeIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class VeBookIn(BaseModel):
    tro_choi_id: int
    thoi_gian_bat_dau: datetime
    gia: Decimal | int


class VePublicOut(BaseModel):
    id: int
    khach_hang_id: Optional[int] = None
    tro_choi_id: int
    ten_tro_choi: Optional[str] = None
    khu_vuc_ten: Optional[str] = None
    thoi_gian_bat_dau: datetime
    thoi_gian_ket_thuc: Optional[datetime] = None
    gia: Decimal | int
    trang_thai: str
    model_config = ConfigDict(from_attributes=True)

# =========================================================
# GỢI Ý
# =========================================================

class GoiYItem(BaseModel):
    id: int
    ten: str
    khu_vuc_id: Optional[int] = None
    gia_mac_dinh: Optional[Decimal | int] = 0


class GoiYOut(BaseModel):
    khach_hang_id: int
    top: List[GoiYItem]

# =========================================================
# KHÁCH HÀNG
# =========================================================

class KhachHangBase(BaseModel):
    ten: str
    sdt: str | None = None
    email: str | None = None
    hang_thanh_vien: str = "STANDARD"
    diem_tich_luy: int = 0
    user_id: int | None = None


class KhachHangIn(KhachHangBase):
    pass


class KhachHangUpdate(BaseModel):
    ten: str | None = None
    sdt: str | None = None
    email: str | None = None
    hang_thanh_vien: str | None = None
    diem_tich_luy: int | None = None
    user_id: int | None = None


class KhachHangOut(KhachHangBase):
    id: int
    ngay_tao: datetime
    model_config = ConfigDict(from_attributes=True)


class PageKhachHangOut(PageOut[KhachHangOut]):
    pass

# =========================================================
# NHÂN VIÊN
# =========================================================

class NhanVienBase(BaseModel):
    ten: str
    sdt: str | None = None
    email: str | None = None
    vai_tro: str = "STAFF"         # STAFF/ADMIN
    ca_lam: str | None = None
    trang_thai: str = "ACTIVE"     # ACTIVE/INACTIVE
    user_id: int | None = None


class NhanVienIn(NhanVienBase):
    pass


class NhanVienUpdate(BaseModel):
    ten: str | None = None
    sdt: str | None = None
    email: str | None = None
    vai_tro: str | None = None
    ca_lam: str | None = None
    trang_thai: str | None = None
    user_id: int | None = None


class NhanVienOut(NhanVienBase):
    id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PageNhanVienOut(PageOut[NhanVienOut]):
    pass
