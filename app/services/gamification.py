# app/services/gamification.py
from sqlalchemy import text

"""
Gamification:
- Thử thách tuần: thu_thach_tuan(ma_thu_thach, ten_thu_thach, muc_tieu, diem_thuong, ngay_bat_dau, ngay_ket_thuc)
- Khi đạt mốc: ghi vào so_cai_diem(ma_nguoi_dung, diem_thay_doi, ly_do, thoi_gian)
- Idempotent: kiểm tra đã có dòng thưởng tuần này chưa bằng khóa [WEEK yyyy-mm-dd] <ma_thu_thach> trong cột ly_do.
"""

def _current_week_challenges(db):
    # Bỏ cột trang_thai (không tồn tại trong DB của bạn)
    sql = text("""
        SELECT ma_thu_thach, ten_thu_thach, muc_tieu, diem_thuong,
               DATE(ngay_bat_dau) AS d_start, DATE(ngay_ket_thuc) AS d_end
        FROM thu_thach_tuan
        WHERE NOW() BETWEEN ngay_bat_dau AND ngay_ket_thuc
        ORDER BY ma_thu_thach
    """)
    return db.execute(sql).mappings().all()

def _paid_game_count_in_range(db, user_id, d_start, d_end):
    # Đếm số vé TRÒ CHƠI đã PAID trong khoảng tuần
    sql = text("""
        SELECT COUNT(*) AS cnt
        FROM ve
        WHERE user_id = :uid
          AND tro_choi_id IS NOT NULL
          AND trang_thai = 'PAID'
          AND DATE(created_at) BETWEEN :d_start AND :d_end
    """)
    return int(db.execute(sql, {"uid": user_id, "d_start": d_start, "d_end": d_end}).scalar() or 0)

def _already_rewarded(db, user_id, code, d_start):
    # Dùng cột ly_do (không phải mo_ta)
    key = f"[WEEK {d_start}] {code}"
    sql = text("""
        SELECT 1
        FROM so_cai_diem
        WHERE ma_nguoi_dung = :uid
          AND ly_do LIKE :k
        LIMIT 1
    """)
    return db.execute(sql, {"uid": user_id, "k": f"%{key}%"}).first() is not None

def _insert_reward(db, user_id, diem, code, title, d_start):
    # Ghi vào cột ly_do, thời gian vào thoi_gian
    ly_do = f"Thưởng thử thách tuần [WEEK {d_start}] {code}: {title}"
    sql = text("""
        INSERT INTO so_cai_diem (ma_nguoi_dung, diem_thay_doi, ly_do, thoi_gian)
        VALUES (:uid, :diem, :ly_do, NOW())
    """)
    db.execute(sql, {"uid": user_id, "diem": int(diem), "ly_do": ly_do})

def update_progress_on_ticket_paid(user_id: int, so_luong: int, db):
    """
    Gọi sau khi ADMIN duyệt vé TRÒ CHƠI -> PAID.
    Tự đếm lại số vé PAID trong tuần và cộng thưởng nếu đạt mốc.
    Idempotent nhờ _already_rewarded().
    """
    thachs = _current_week_challenges(db)
    if not thachs:
        return

    for t in thachs:
        code   = t["ma_thu_thach"]
        title  = t["ten_thu_thach"]
        target = int(t["muc_tieu"] or 0)
        d_start = t["d_start"]
        d_end   = t["d_end"]

        if target <= 0:
            continue

        paid_cnt = _paid_game_count_in_range(db, user_id, d_start, d_end)
        if paid_cnt < target:
            continue

        if not _already_rewarded(db, user_id, code, d_start):
            _insert_reward(db, user_id, int(t["diem_thuong"] or 0), code, title, d_start)
    # Commit do caller (router) kiểm soát
def reward_if_reached(db, user_id: int) -> int:
    """
    Thưởng cho các thử thách tuần mà user đã đạt mục tiêu dựa theo bảng tien_do_thu_thach.
    Chống thưởng trùng nhờ marker TT#<id>@<week> trong ly_do.
    """
    rows = db.execute(text("""
        SELECT
            tt.ma_thu_thach,
            tt.diem_thuong,
            DATE(tt.ngay_bat_dau) AS week_start
        FROM thu_thach_tuan tt
        JOIN tien_do_thu_thach td
          ON td.ma_thu_thach = tt.ma_thu_thach
         AND td.ma_nguoi_dung = :uid
        WHERE NOW() BETWEEN tt.ngay_bat_dau AND tt.ngay_ket_thuc
          AND IFNULL(tt.hoat_dong,1)=1
          AND COALESCE(td.gia_tri_hien_tai,0) >= COALESCE(tt.muc_tieu,0)
    """), {"uid": user_id}).mappings().all()

    count = 0
    for r in rows:
        ma = int(r["ma_thu_thach"])
        diem = int(r["diem_thuong"] or 0)
        week = str(r["week_start"])
        marker = f"TT#{ma}@{week}"

        exist = db.execute(text("""
            SELECT 1 FROM so_cai_diem
            WHERE ma_nguoi_dung = :uid AND ly_do LIKE :mk LIMIT 1
        """), {"uid": user_id, "mk": f"%{marker}%"}).first()

        if exist:
            continue

        if diem > 0:
            db.execute(text("""
                INSERT INTO so_cai_diem (ma_nguoi_dung, diem_thay_doi, ly_do, thoi_gian)
                VALUES (:uid, :diem, :lydo, NOW())
            """), {
                "uid": user_id,
                "diem": diem,
                "lydo": f"Thưởng thử thách tuần {marker}",
            })
            count += 1

    if count:
        db.commit()
    return count