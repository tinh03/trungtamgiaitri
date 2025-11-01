from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Text, Float, Numeric,
    Index, CheckConstraint, UniqueConstraint,
)
from sqlalchemy.orm import relationship, declarative_mixin
from .db import Base

# ============================================================
# Mixins & helpers
# ============================================================

@declarative_mixin
class TimeStampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

# ============================================================
# Users / Nhân sự / Khách hàng
# ============================================================

class User(TimeStampMixin, Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="CUSTOMER")  # ADMIN/STAFF/CUSTOMER

    khach_hang = relationship("KhachHang", uselist=False, back_populates="user")
    nhan_vien = relationship("NhanVien", uselist=False, back_populates="user")

    # vé của user (sự kiện + trò chơi)
    ve_su_kien = relationship("Ve", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("role in ('ADMIN','STAFF','CUSTOMER')", name="ck_users_role"),
    )


class KhachHang(TimeStampMixin, Base):
    __tablename__ = "khach_hang"

    id = Column(Integer, primary_key=True)
    ten = Column(String(120), nullable=False)
    sdt = Column(String(20))
    email = Column(String(120), unique=True)
    ngay_tao = Column(DateTime, default=datetime.utcnow, nullable=False)
    hang_thanh_vien = Column(String(30), default="STANDARD")
    diem_tich_luy = Column(Integer, default=0)

    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=True)
    user = relationship("User", back_populates="khach_hang")

    lich_su_choi = relationship("LichSuChoi", back_populates="khach_hang", cascade="all, delete-orphan")
    tuong_tac = relationship("TuongTacCSKH", back_populates="khach_hang", cascade="all, delete-orphan")
    game_clicks = relationship("GameClick", back_populates="khach_hang", cascade="all, delete-orphan")

    @property
    def ve(self):
        return self.user.ve_su_kien if self.user else []


class NhanVien(TimeStampMixin, Base):
    __tablename__ = "nhan_vien"

    id = Column(Integer, primary_key=True)
    ten = Column(String(120), nullable=False)
    sdt = Column(String(20))
    email = Column(String(120), unique=True)
    vai_tro = Column(String(20), default="STAFF")       # STAFF/ADMIN
    ca_lam = Column(String(50))
    trang_thai = Column(String(20), default="ACTIVE")   # ACTIVE/INACTIVE

    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=True)
    user = relationship("User", back_populates="nhan_vien")

    __table_args__ = (
        CheckConstraint("vai_tro in ('STAFF','ADMIN')", name="ck_nhanvien_vaitro"),
        CheckConstraint("trang_thai in ('ACTIVE','INACTIVE')", name="ck_nhanvien_trangthai"),
    )

# ============================================================
# Khu vực / Trò chơi
# ============================================================

class KhuVuc(TimeStampMixin, Base):
    __tablename__ = "khu_vuc"

    id = Column(Integer, primary_key=True)
    ten = Column(String(120), nullable=False, index=True)
    suc_chua = Column(Integer, default=0)
    mo_ta = Column(Text)

    tro_choi = relationship("TroChoi", back_populates="khu_vuc")


class TroChoi(TimeStampMixin, Base):
    __tablename__ = "tro_choi"

    id = Column(Integer, primary_key=True)
    ten = Column(String(120), nullable=False, index=True)
    the_loai = Column(String(80), index=True)
    tuoi_khuyen_nghi = Column(Integer, default=8)
    khu_vuc_id = Column(Integer, ForeignKey("khu_vuc.id"), nullable=True)
    trang_thai = Column(String(20), default="OPEN")  # OPEN/MAINTENANCE/CLOSED
    gia_mac_dinh = Column(Numeric(12, 2), default=0, nullable=False)

    # === ẢNH TRÒ CHƠI ===
    anh_cover = Column(String(255))   # ảnh bìa hiển thị ngoài danh sách
    anh_ct_1  = Column(String(255))   # ảnh chi tiết 1
    anh_ct_2  = Column(String(255))   # ảnh chi tiết 2

    khu_vuc = relationship("KhuVuc", back_populates="tro_choi")
    lich_su_choi = relationship("LichSuChoi", back_populates="tro_choi", cascade="all, delete-orphan")
    game_clicks = relationship("GameClick", back_populates="tro_choi", cascade="all, delete-orphan")
    ve = relationship("Ve", back_populates="tro_choi", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("trang_thai in ('OPEN','MAINTENANCE','CLOSED')", name="ck_tro_choi_trangthai"),
        Index("ix_trochoi_ten_theloai", "ten", "the_loai"),
    )

# ============================================================
# Vé (Sự kiện + Trò chơi)
# ============================================================

class Ve(TimeStampMixin, Base):
    __tablename__ = "ve"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Một trong hai
    su_kien_id = Column(Integer, ForeignKey("su_kien.id"), nullable=True, index=True)
    tro_choi_id = Column(Integer, ForeignKey("tro_choi.id"), nullable=True, index=True)

    so_luong = Column(Integer, nullable=False, default=1)
    tong_tien = Column(Numeric(12, 0), nullable=False, default=0)
    trang_thai = Column(String(20), nullable=False, default="BOOKED")

    user = relationship("User", back_populates="ve_su_kien")
    su_kien = relationship("SuKien", back_populates="ve")
    tro_choi = relationship("TroChoi", back_populates="ve")

    __table_args__ = (
        CheckConstraint(
            "trang_thai in ('BOOKED','PENDING','PAID','CANCELLED','CHECKIN','USED')",
            name="ck_ve_trangthai",
        ),
        CheckConstraint("so_luong > 0", name="ck_ve_soluong_pos"),
    )

# ============================================================
# Lịch sử chơi TRÒ CHƠI
# ============================================================

class LichSuChoi(TimeStampMixin, Base):
    __tablename__ = "lich_su_choi"

    id = Column(Integer, primary_key=True)
    khach_hang_id = Column(Integer, ForeignKey("khach_hang.id"), nullable=True, index=True)
    tro_choi_id = Column(Integer, ForeignKey("tro_choi.id"), nullable=True, index=True)
    thoi_luong = Column(Integer, default=10)
    danh_gia = Column(Float)
    thoi_gian = Column(DateTime, default=datetime.utcnow, nullable=False)

    khach_hang = relationship("KhachHang", back_populates="lich_su_choi")
    tro_choi = relationship("TroChoi", back_populates="lich_su_choi")

# ============================================================
# Sự kiện / Khuyến mãi
# ============================================================

class SuKien(TimeStampMixin, Base):
    __tablename__ = "su_kien"

    id = Column(Integer, primary_key=True, index=True)
    ten = Column(String(150), nullable=False)
    mo_ta = Column(Text, nullable=True)
    thoi_gian = Column(DateTime, nullable=False)
    gia_ve = Column(Numeric(12, 0), nullable=False, default=0)
    trang_thai = Column(String(20), nullable=False, default="OPEN")
    # ✅ Ảnh bìa sự kiện (đã thêm cột DB)
    anh_bia = Column(String(255), nullable=True)

    ve = relationship("Ve", back_populates="su_kien", cascade="all, delete-orphan")

    @property
    def bat_dau(self):
        return self.thoi_gian

    @property
    def ket_thuc(self):
        return self.thoi_gian

    __table_args__ = (
        CheckConstraint("trang_thai in ('OPEN','CLOSED')", name="ck_sukien_trangthai"),
        Index("ix_sukien_thoigian", "thoi_gian"),
    )


class KhuyenMai(TimeStampMixin, Base):
    __tablename__ = "khuyen_mai"

    id = Column(Integer, primary_key=True)
    ten = Column(String(150), nullable=False, index=True)
    ty_le = Column(Numeric(5, 2), nullable=False)  # %
    dieu_kien = Column(Text)                       # JSON string
    thoi_gian_bd = Column(DateTime, nullable=False)
    thoi_gian_kt = Column(DateTime, nullable=False)
    active = Column(Integer, default=1)

    __table_args__ = (
        CheckConstraint("active in (0,1)", name="ck_khuyenmai_active"),
    )

# ============================================================
# Gợi ý / Click
# ============================================================

class GameClick(TimeStampMixin, Base):
    __tablename__ = "game_click"

    id = Column(Integer, primary_key=True)
    khach_hang_id = Column(Integer, ForeignKey("khach_hang.id"), nullable=False, index=True)
    tro_choi_id = Column(Integer, ForeignKey("tro_choi.id"), nullable=False, index=True)
    so_lan = Column(Integer, default=0, nullable=False)
    last_click = Column(DateTime, default=datetime.utcnow, nullable=False)

    khach_hang = relationship("KhachHang", back_populates="game_clicks")
    tro_choi = relationship("TroChoi", back_populates="game_clicks")

    __table_args__ = (
        UniqueConstraint("khach_hang_id", "tro_choi_id", name="uq_gameclick_kh_tc"),
        CheckConstraint("so_lan >= 0", name="ck_gameclick_nonneg"),
    )

# ============================================================
# Tương tác CSKH
# ============================================================

class TuongTacCSKH(TimeStampMixin, Base):
    __tablename__ = "tuong_tac_cskh"

    id = Column(Integer, primary_key=True)
    khach_hang_id = Column(Integer, ForeignKey("khach_hang.id"), nullable=True, index=True)
    tro_choi_id = Column(Integer, nullable=True, index=True)
    loai = Column(String(50), nullable=True)
    noi_dung = Column(Text, nullable=True)
    kenh = Column(String(50), nullable=True)
    thoi_gian = Column(DateTime, default=datetime.utcnow, nullable=True)

    khach_hang = relationship("KhachHang", back_populates="tuong_tac")
