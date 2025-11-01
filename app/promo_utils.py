import json
from sqlalchemy import text

# ====== Chuẩn hoá bậc thành viên ======
def _norm_tier(s: str | None) -> str | None:
    if not s:
        return None
    x = str(s).strip().lower()
    mapping = {
        "thuong": "THUONG", "thường": "THUONG", "standard": "THUONG",
        "bac": "BAC", "bạc": "BAC", "silver": "BAC",
        "vang": "VANG", "vàng": "VANG", "gold": "VANG",
        "kimcuong": "KIMCUONG", "kim cương": "KIMCUONG", "diamond": "KIMCUONG",
    }
    return mapping.get(x, x.upper())


def _tier_rank(name: str | None) -> int:
    if not name:
        return 0
    n = str(name).strip().upper()
    if n in {"STANDARD", "THUONG", "THƯỜNG"}:
        return 1
    return {"BAC": 2, "VANG": 3, "KIMCUONG": 4}.get(n, 0)


def _parse_json(obj_or_str):
    if obj_or_str is None:
        return {}
    if isinstance(obj_or_str, (dict, list)):
        return obj_or_str
    s = str(obj_or_str).strip()
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        return {}


def _is_open_row(row) -> bool:
    active = row.get("active")
    return active is None or int(active) == 1


def _allowed_by_event(cond: dict, event_id: int | None) -> bool:
    if not cond or event_id is None:
        return True
    ev = cond.get("member_event") or cond.get("event_id") or cond.get("event") \
         or cond.get("events") or cond.get("event_ids")
    if ev is None or ev == "" or ev == []:
        return True
    try:
        if isinstance(ev, list):
            ids = {int(e) for e in ev}
            return event_id in ids
        return int(ev) == int(event_id)
    except Exception:
        return True


def _allowed_by_tier(cond: dict, user_tier: str | None) -> bool:
    ut = _norm_tier(user_tier)
    tiers = cond.get("member_tiers") or cond.get("tiers") or []
    members_only = bool(
        cond.get("member_only") or cond.get("members_only") or cond.get("only_members")
    )
    min_tier = cond.get("min_tier") or cond.get("tier_at_least") or cond.get("at_least")

    if min_tier:
        return ut is not None and _tier_rank(ut) >= _tier_rank(min_tier)

    if tiers:
        norm = {_norm_tier(t) for t in tiers if t is not None}
        return ut in norm

    if members_only:
        return ut is not None and ut != "THUONG"

    return True


def _allowed_by_amount(cond: dict, amount: float) -> bool:
    try:
        min_amt = float(cond.get("min_amount") or cond.get("min") or cond.get("hoa_don_toi_thieu") or 0)
    except Exception:
        min_amt = 0
    return float(amount) >= min_amt


def _applicable(row, amount: float, user_tier: str | None, event_id: int | None) -> bool:
    if not _is_open_row(row):
        return False
    cond = _parse_json(row.get("dieu_kien"))
    return (
        _allowed_by_amount(cond, amount)
        and _allowed_by_tier(cond, user_tier)
        and _allowed_by_event(cond, event_id)
    )


def list_applicable_promos(db, amount: float, user_tier: str | None = None, event_id: int | None = None):
    rows = db.execute(
        text("""
            SELECT id, ten, ty_le, dieu_kien, thoi_gian_bd, thoi_gian_kt,
                   IFNULL(active,1) AS active
            FROM khuyen_mai
            WHERE NOW() BETWEEN thoi_gian_bd AND thoi_gian_kt
        """)
    ).mappings().all()

    out = []
    for r in rows:
        try:
            rate = float(r.get("ty_le") or 0)
        except Exception:
            rate = 0.0
        if rate <= 0:
            continue
        if not _applicable(r, amount, user_tier, event_id):
            continue
        out.append({"id": r["id"], "ten": r["ten"], "rate": float(rate)})
    out.sort(key=lambda x: x["rate"], reverse=True)
    return out


def find_best_promo(db, amount: float, user_tier: str | None = None, event_id: int | None = None):
    lst = list_applicable_promos(db, amount, user_tier, event_id)
    if not lst:
        return None, 0.0
    top = lst[0]
    class _Simple:
        def __init__(self, id, ten): self.id, self.ten = id, ten
    return _Simple(top["id"], top["ten"]), float(top["rate"])
