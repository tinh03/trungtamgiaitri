# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from .routers import (
    auth,
    tro_choi,
    goi_y,
    khu_vuc,
    su_kien,
    khuyen_mai,
    ve,
    khach_hang as khach_hang_router,
    nhan_vien as nhan_vien_router,
    admin_users,
    leaderboard,
    gamify,
    support_chat,
)

# Nếu bạn đã có file staff_ops.py thì có thể import thêm
try:
    from .routers import staff_ops
    HAS_STAFF_OPS = True
except ImportError:
    HAS_STAFF_OPS = False

# ==========================================================
#  FastAPI Application
# ==========================================================
app = FastAPI(
    title="Trung Tâm Giải Trí API",
    version="1.0.0",
    description=(
        "Hệ thống quản lý Trung tâm Giải Trí: khu vực, trò chơi, sự kiện, "
        "vé, khuyến mãi, người dùng, CSKH, gamification."
    ),
)

# ==========================================================
#  CORS Middleware
# ==========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ==========================================================
#  Database init
# ==========================================================
Base.metadata.create_all(bind=engine)

# ==========================================================
#  Routers
# ==========================================================
app.include_router(auth.router)
app.include_router(tro_choi.router)
app.include_router(goi_y.router)
app.include_router(khu_vuc.router)
app.include_router(su_kien.router)
app.include_router(khuyen_mai.router)
app.include_router(ve.router)
app.include_router(khach_hang_router.router)
app.include_router(nhan_vien_router.router)
app.include_router(admin_users.router)
app.include_router(gamify.router)
app.include_router(leaderboard.router)
app.include_router(support_chat.router)

# nếu bạn vẫn giữ file staff_ops riêng (không gộp vào nhan_vien.py)
if HAS_STAFF_OPS:
    app.include_router(staff_ops.router)

# ==========================================================
#  Health check & root
# ==========================================================
@app.get("/health")
def health():
    """Kiểm tra tình trạng dịch vụ."""
    return {"status": "ok", "service": "Trung Tam Giai Tri API"}

@app.get("/")
def root():
    """Thông tin cơ bản của API."""
    return {
        "service": "Trung Tam Giai Tri API",
        "status": "running",
        "version": "1.0.0",
        "routers": [
            "auth", "tro_choi", "su_kien", "khuyen_mai",
            "ve", "nhan_vien", "khach_hang",
            "leaderboard", "gamify", "support_chat"
        ],
    }
