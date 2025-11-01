# Gợi ý đơn giản (rule-based) để chạy ngay.
# Sau này có thể nâng cấp collaborative filtering (implicit ALS).

from sqlalchemy.orm import Session
from ..models import LichSuChoi, TroChoi

def recommend_for_user(db: Session, khach_hang_id: int, k: int = 6):
    # Bỏ qua những trò đã chơi, ưu tiên độ khó thấp và thời lượng ngắn
    subq = db.query(LichSuChoi.tro_choi_id).filter(
        LichSuChoi.khach_hang_id == khach_hang_id
    )

    return (
        db.query(TroChoi)
        .filter(~TroChoi.id.in_(subq))
        .order_by(TroChoi.do_kho.asc(), TroChoi.thoi_luong_tb.asc())
        .limit(k)
        .all()
    )
