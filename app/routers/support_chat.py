# app/routers/support_chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Set, Optional

from ..db import get_db
from ..models import User, KhachHang
from .auth import decode_access_token, get_current_user, require_roles  # dùng cho /recent

router = APIRouter(prefix="/support", tags=["CSKH"])


# ============= Manager (rooms theo user.id của KH) =============
class Manager:
    rooms: Dict[int, Set[WebSocket]] = {}

    async def connect(self, room_uid: int, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_uid, set()).add(ws)

    def disconnect(self, room_uid: int, ws: WebSocket):
        try:
            self.rooms[room_uid].remove(ws)
            if not self.rooms[room_uid]:
                del self.rooms[room_uid]
        except KeyError:
            pass

    async def broadcast(self, room_uid: int, data: dict):
        for ws in list(self.rooms.get(room_uid, [])):
            try:
                await ws.send_json(data)
            except Exception:
                try:
                    await ws.close()
                except Exception:
                    pass
                self.disconnect(room_uid, ws)


manager = Manager()


# ============= Helpers =============
def get_user(db: Session, uid: int) -> Optional[User]:
    return db.query(User).filter(User.id == uid).first()


def kh_id_by_user(db: Session, uid: int) -> Optional[int]:
    kh = db.query(KhachHang).filter(KhachHang.user_id == uid).first()
    return kh.id if kh else None


# ============= Danh sách KH có chat gần đây (cho STAFF/ADMIN) =============
@router.get("/recent", dependencies=[Depends(require_roles("ADMIN", "STAFF"))])
def recent_customers(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT u.id AS user_id, u.username, MAX(t.thoi_gian) AS last_time
            FROM tuong_tac_cskh t
            JOIN khach_hang kh ON kh.id = t.khach_hang_id
            JOIN user u        ON u.id = kh.user_id
            WHERE t.loai = 'CHAT'
            GROUP BY u.id, u.username
            ORDER BY last_time DESC
            LIMIT :lim
            """
        ),
        {"lim": limit},
    ).mappings().all()

    return {
        "items": [
            {
                "user_id": int(r["user_id"]),
                "username": r["username"],
                "last_time": str(r["last_time"]) if r["last_time"] else None,
                "status": "online" if int(r["user_id"]) in manager.rooms else "offline",
            }
            for r in rows
        ]
    }


# ============= REST: lịch sử chat 1 khách =============
@router.get("/history")
def get_history(
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
    uid: Optional[int] = Query(None, description="user.id của KH (admin/staff phải truyền)"),
    limit: int = Query(100, ge=1, le=500),
):
    role = (me.role or "").upper()
    room_uid = me.id if role == "CUSTOMER" else uid
    if room_uid is None:
        raise HTTPException(status_code=400, detail="Thiếu uid khách hàng.")

    kh_id = kh_id_by_user(db, int(room_uid))
    if not kh_id:
        return {"items": []}

    rows = db.execute(
        text(
            """
            SELECT id, noi_dung, thoi_gian
            FROM tuong_tac_cskh
            WHERE khach_hang_id = :kh AND loai = 'CHAT'
            ORDER BY thoi_gian ASC
            LIMIT :lim
            """
        ),
        {"kh": kh_id, "lim": limit},
    ).mappings().all()

    def parse_row(r):
        """
        Định dạng đã lưu: "[ROLE] username: message"
        - ROLE có thể là ADMIN / STAFF / CUSTOMER (hoặc trống).
        """
        raw = r["noi_dung"] or ""
        name, text_msg, role_code = None, raw, None

        split_at = raw.find(": ")
        if split_at > 0:
            header = raw[:split_at].strip()
            text_msg = raw[split_at + 2:].strip()

            if header.startswith("[") and "]" in header:
                bracket_end = header.find("]")
                role_code = header[1:bracket_end].strip().upper() or None
                name = header[bracket_end + 1:].strip()
            else:
                name = header

        return {
            "id": r["id"],
            "from": {"name": name, "role": role_code},  # ⬅️ thêm role để FE render badge & căn trái/phải
            "text": text_msg,
            "type": "msg",
            "ts": str(r["thoi_gian"]),
        }

    return {"items": [parse_row(r) for r in rows]}


# ============= WebSocket: Chat realtime =============
@router.websocket("/ws")
async def ws_support(websocket: WebSocket, db: Session = Depends(get_db)):
    token = (websocket.query_params.get("token") or "").strip()
    if not token:
        await websocket.accept()
        await websocket.send_json({"type": "system", "text": "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."})
        await websocket.close(code=4401)
        return

    try:
        payload = decode_access_token(token)
        uid = int(payload.get("user_id") or 0)
    except Exception:
        await websocket.accept()
        await websocket.send_json({"type": "system", "text": "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại."})
        await websocket.close(code=4401)
        return

    me = get_user(db, uid)
    if not me:
        await websocket.accept()
        await websocket.send_json({"type": "system", "text": "Không tìm thấy người dùng."})
        await websocket.close(code=4401)
        return

    role = (me.role or "").upper()
    raw_uid = websocket.query_params.get("uid")

    if role in {"ADMIN", "STAFF"}:
        if not raw_uid:
            await websocket.accept()
            await websocket.send_json({"type": "system", "text": "Bạn chưa chọn khách hàng (uid) để vào phòng chat."})
            await websocket.close(code=4403)
            return
        try:
            room_uid = int(raw_uid)
        except Exception:
            await websocket.accept()
            await websocket.send_json({"type": "system", "text": "UID khách không hợp lệ."})
            await websocket.close(code=4403)
            return
    else:
        room_uid = me.id

    await manager.connect(room_uid, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            msg = (data.get("text") or "").strip()
            if not msg:
                continue

            kh_id = kh_id_by_user(db, room_uid)
            if not kh_id:
                await websocket.send_json({"type": "system", "text": "Không tìm thấy hồ sơ khách hàng."})
                await websocket.close(code=4403)
                break

            # Lưu lịch sử: "[ROLE] username: message"
            try:
                db.execute(
                    text(
                        """
                        INSERT INTO tuong_tac_cskh
                          (khach_hang_id, tro_choi_id, loai, noi_dung, kenh, thoi_gian)
                        VALUES (:kh, NULL, 'CHAT', :msg, 'WEB', NOW())
                        """
                    ),
                    {"kh": kh_id, "msg": f"[{me.role}] {me.username}: {msg}"},
                )
                db.commit()
            except Exception:
                db.rollback()
                await websocket.send_json({"type": "system", "text": "Không lưu được tin nhắn vào CSDL."})

            # Phát realtime tới tất cả WS trong room
            await manager.broadcast(
                room_uid,
                {"type": "msg", "from": {"id": me.id, "name": me.username, "role": me.role}, "text": msg},
            )

    except WebSocketDisconnect:
        manager.disconnect(room_uid, websocket)
        return
