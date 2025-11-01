# app/routers/tro_choi.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Dict, Any, List, Optional

from ..db import get_db
from ..models import TroChoi, KhuVuc

router = APIRouter()
router_us = APIRouter(prefix="/tro_choi", tags=["Trò chơi"])
router_dash = APIRouter(prefix="/tro-choi", tags=["Trò chơi"])

# ---------------- Helpers ----------------
def _serialize_game(t: TroChoi, khu: Optional[KhuVuc] = None) -> Dict[str, Any]:
    return {
        "id": t.id,
        "ten": t.ten,
        "khu_vuc_id": t.khu_vuc_id,
        "khu_vuc_ten": khu.ten if khu else None,
        "the_loai": t.the_loai,
        "tuoi_khuyen_nghi": t.tuoi_khuyen_nghi,
        "gia_mac_dinh": float(t.gia_mac_dinh or 0),
        "trang_thai": t.trang_thai,
        # ==== ẢNH ====
        "anh_cover": t.anh_cover,
        "anh_ct_1": t.anh_ct_1,
        "anh_ct_2": t.anh_ct_2,
    }

def _get_khu(db: Session, khu_vuc_id: int) -> KhuVuc:
    khu = db.query(KhuVuc).get(khu_vuc_id)
    if not khu:
        raise HTTPException(status_code=404, detail="Không tìm thấy khu vực")
    return khu

def _get_game(db: Session, game_id: int) -> TroChoi:
    game = db.query(TroChoi).get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Không tìm thấy trò chơi")
    return game

# ---------------- Endpoints ----------------
@router_us.get("/by-khu/{khu_vuc_id}")
@router_dash.get("/by-khu/{khu_vuc_id}")
def list_by_khu(khu_vuc_id: int, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    khu = _get_khu(db, khu_vuc_id)
    games = (
        db.query(TroChoi)
        .filter(TroChoi.khu_vuc_id == khu_vuc_id)
        .order_by(TroChoi.id.asc())
        .all()
    )
    return [_serialize_game(g, khu) for g in games]

@router_us.post("")
@router_dash.post("")
def create_game(payload: Dict[str, Any], db: Session = Depends(get_db)) -> Dict[str, Any]:
    ten = (payload.get("ten") or "").strip()
    khu_vuc_id = payload.get("khu_vuc_id")
    if not ten or not khu_vuc_id:
        raise HTTPException(status_code=400, detail="Thiếu 'ten' hoặc 'khu_vuc_id'")

    _get_khu(db, khu_vuc_id)

    game = TroChoi(
        ten=ten,
        khu_vuc_id=khu_vuc_id,
        the_loai=payload.get("the_loai"),
        tuoi_khuyen_nghi=payload.get("tuoi_khuyen_nghi"),
        gia_mac_dinh=payload.get("gia_mac_dinh", 0),
        trang_thai=payload.get("trang_thai", "OPEN"),
        # ==== ẢNH ====
        anh_cover=payload.get("anh_cover"),
        anh_ct_1=payload.get("anh_ct_1"),
        anh_ct_2=payload.get("anh_ct_2"),
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    return {"message": "Đã thêm trò chơi", "id": game.id}

@router_us.put("/{game_id}")
@router_dash.put("/{game_id}")
def update_game(game_id: int, payload: Dict[str, Any], db: Session = Depends(get_db)) -> Dict[str, Any]:
    game = _get_game(db, game_id)

    updatable_fields = [
        "ten", "the_loai", "tuoi_khuyen_nghi",
        "gia_mac_dinh", "trang_thai", "khu_vuc_id",
        "anh_cover", "anh_ct_1", "anh_ct_2",
    ]
    for field in updatable_fields:
        if field in payload and payload[field] is not None:
            setattr(game, field, payload[field])

    db.add(game)
    db.commit()
    db.refresh(game)
    return {"message": "Đã cập nhật trò chơi", "id": game.id}

@router_us.delete("/{game_id}")
@router_dash.delete("/{game_id}")
def delete_game(game_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    game = _get_game(db, game_id)
    try:
        db.delete(game)
        db.commit()
        return {"message": "Đã xóa trò chơi"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Không thể xoá vì trò chơi đang được tham chiếu (vé, lịch sử, ...)",
        )

@router_us.post("/{game_id}/click")
@router_dash.post("/{game_id}/click")
def click_game(game_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    _get_game(db, game_id)
    return {"message": "Đã ghi nhận click", "game_id": game_id}

router.include_router(router_us)
router.include_router(router_dash)
