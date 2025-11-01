# app/routers/khu_vuc.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import KhuVuc, TroChoi
from ..schemas import KhuVucCreate, KhuVucOut
from .auth import require_roles

router = APIRouter(prefix="/khu-vuc", tags=["Khu vuc"])

@router.get("/menu", response_model=list[KhuVucOut])
def get_menu(db: Session = Depends(get_db)):
    from sqlalchemy import func
    rows = db.query(KhuVuc).all()
    ids = [r.id for r in rows]
    if ids:
        counts = (
            db.query(TroChoi.khu_vuc_id, func.count().label("cnt"))
            .filter(TroChoi.khu_vuc_id.in_(ids), TroChoi.trang_thai == "OPEN")
            .group_by(TroChoi.khu_vuc_id)
            .all()
        )
        m = {kv_id: cnt for kv_id, cnt in counts}
        for r in rows:
            setattr(r, "so_tro_open", m.get(r.id, 0))
    return rows

@router.post("", response_model=KhuVucOut, dependencies=[Depends(require_roles("ADMIN"))])
def create_khu_vuc(body: KhuVucCreate, db: Session = Depends(get_db)):
    kv = KhuVuc(
        ten=body.ten,
        mo_ta=body.mo_ta,
        suc_chua=body.suc_chua
    )
    db.add(kv)
    db.commit()
    db.refresh(kv)
    return kv

@router.put("/{kv_id}", response_model=KhuVucOut, dependencies=[Depends(require_roles("ADMIN"))])
def update_khu_vuc(kv_id: int, body: KhuVucCreate, db: Session = Depends(get_db)):
    kv = db.get(KhuVuc, kv_id)
    if not kv:
        raise HTTPException(404, "Khu vực không tồn tại")
    kv.ten = body.ten
    kv.mo_ta = body.mo_ta
    kv.suc_chua = body.suc_chua
    db.commit()
    db.refresh(kv)
    return kv

@router.delete("/{kv_id}", dependencies=[Depends(require_roles("ADMIN"))])
def delete_khu_vuc(kv_id: int, db: Session = Depends(get_db)):
    kv = db.get(KhuVuc, kv_id)
    if not kv:
        raise HTTPException(404, "Khu vực không tồn tại")
    db.delete(kv)
    db.commit()
    return {"ok": True}
