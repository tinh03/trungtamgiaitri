from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..db import get_db

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])


@router.get("/weekly")  # dùng đường dẫn cũ cho FE, nhưng dữ liệu là all-time
def leaderboard_all_time(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """
    BXH toàn thời gian:
    - Ưu tiên tổng điểm ↓
    - Nếu bằng điểm, ưu tiên tổng số vé TRÒ CHƠI đã thanh toán ↓
    - Hiển thị cả người chỉ có điểm hoặc chỉ có lượt chơi
    - Kèm hạng thành viên (Bạc/Vàng/Kim cương) theo tổng điểm
    """
    sql = text(
        """
        -- Tổng điểm của từng người (mọi thời điểm)
        WITH points AS (
            SELECT scd.ma_nguoi_dung, COALESCE(SUM(scd.diem_thay_doi), 0) AS diem
            FROM so_cai_diem scd
            GROUP BY scd.ma_nguoi_dung
        ),
        -- Tổng lượt chơi (mọi thời điểm): chỉ tính vé TRÒ CHƠI đã PAID
        -- Đếm theo so_luong; nếu so_luong NULL -> 1
        plays AS (
            SELECT v.user_id AS ma_nguoi_dung,
                   SUM(CASE
                         WHEN v.tro_choi_id IS NOT NULL AND v.trang_thai = 'PAID'
                         THEN COALESCE(v.so_luong, 1)
                         ELSE 0
                       END) AS so_luot_choi
            FROM trung_tam_giai_tri.ve v
            GROUP BY v.user_id
        )
        SELECT
            u.id AS user_id,
            COALESCE(u.username, CONCAT('user_', u.id)) AS ten_hien_thi,
            COALESCE(p.diem, 0) AS diem,
            COALESCE(pl.so_luot_choi, 0) AS so_luot_choi,
            CASE
              WHEN COALESCE(p.diem, 0) >= 1000 THEN 'DIAMOND'
              WHEN COALESCE(p.diem, 0) >=  500 THEN 'GOLD'
              WHEN COALESCE(p.diem, 0) >=  100 THEN 'SILVER'
              ELSE 'STANDARD'
            END AS tier_code,
            CASE
              WHEN COALESCE(p.diem, 0) >= 1000 THEN 'Kim cương'
              WHEN COALESCE(p.diem, 0) >=  500 THEN 'Vàng'
              WHEN COALESCE(p.diem, 0) >=  100 THEN 'Bạc'
              ELSE 'Thường'
            END AS tier_label
        FROM users u
        LEFT JOIN points p ON p.ma_nguoi_dung = u.id
        LEFT JOIN plays  pl ON pl.ma_nguoi_dung = u.id
        -- Chỉ hiện ai có điểm > 0 hoặc có lượt chơi > 0
        WHERE COALESCE(p.diem, 0) > 0 OR COALESCE(pl.so_luot_choi, 0) > 0
        ORDER BY COALESCE(p.diem, 0) DESC, COALESCE(pl.so_luot_choi, 0) DESC, u.id ASC
        LIMIT :lim
        """
    )

    rows = db.execute(sql, {"lim": limit}).mappings().all()

    out = []
    for i, r in enumerate(rows, 1):
        out.append(
            {
                "rank": i,
                "user_id": r["user_id"],
                "ten_hien_thi": r["ten_hien_thi"],
                "so_luot_choi": int(r["so_luot_choi"] or 0),
                "diem": int(r["diem"] or 0),
                "tier_code": r["tier_code"],
                "tier_label": r["tier_label"],
            }
        )
    return out
