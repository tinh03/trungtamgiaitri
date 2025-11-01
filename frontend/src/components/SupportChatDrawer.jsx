import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer, Button, Input, Space, Tag, message, Spin } from "antd";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/AuthContext";

const ROLE_COLOR = (r) =>
  r === "ADMIN" ? "magenta" : r === "STAFF" ? "cyan" : "green";

function RoleTag({ role }) {
  const code = (role || "KH").toUpperCase();
  return (
    <Tag color={ROLE_COLOR(code)} style={{ marginLeft: 6 }}>
      {code}
    </Tag>
  );
}

export default function SupportChatDrawer({
  open,
  onClose,
  isStaff = false,
  targetUid = null,
}) {
  const { user } = useAuth();
  const myId = user?.id;
  const myRole = (user?.role || "CUSTOMER").toUpperCase();

  const [loading, setLoading] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState([]);
  const listRef = useRef(null);
  const wsRef = useRef(null);

  const canOpen = useMemo(
    () => open && (!isStaff || !!targetUid),
    [open, isStaff, targetUid]
  );

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const token = useMemo(() => {
    try {
      const raw = localStorage.getItem("auth");
      return raw ? JSON.parse(raw)?.access_token || "" : "";
    } catch {
      return "";
    }
  }, []);

  const wsURL = useMemo(() => {
    const host = window.location.hostname || "localhost";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = `${proto}//${host}:8000`;
    const qs = new URLSearchParams({ token });
    if (isStaff && targetUid) qs.set("uid", String(targetUid));
    return `${base}/support/ws?${qs.toString()}`;
  }, [token, isStaff, targetUid]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (isStaff && targetUid) qs.set("uid", String(targetUid));
      const res = await apiFetch(`/support/history?${qs.toString()}`);
      const arr = Array.isArray(res?.items) ? res.items : [];
      setItems(arr);
      requestAnimationFrame(scrollToBottom);
    } catch (e) {
      message.error(e?.message || "Không tải được lịch sử chat");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canOpen) return;

    loadHistory();

    const ws = new WebSocket(wsURL);
    wsRef.current = ws;

    const onOpen = () => setWsOpen(true);
    const onClose = () => setWsOpen(false);
    const onError = () => setWsOpen(false);

    const onMessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === "msg") {
          const sameId =
            data?.from?.id && myId && Number(data.from.id) === Number(myId);
          const sameName =
            (data?.from?.name || "").toLowerCase() ===
            (user?.username || "").toLowerCase();
          if (sameId || sameName) return;

          setItems((old) => {
            const last = old[old.length - 1];
            const now = Date.now();
            const lastTs = last?.ts ? new Date(last.ts).getTime() : 0;
            const near = Math.abs(now - lastTs) <= 3000;
            const sameSender =
              (last?.from?.id &&
                data?.from?.id &&
                Number(last.from.id) === Number(data.from.id)) ||
              ((last?.from?.name || "").toLowerCase() ===
                (data?.from?.name || "").toLowerCase());
            const sameText = (last?.text || "") === (data?.text || "");
            if (near && sameSender && sameText) return old;

            return [
              ...old,
              {
                id: `ws-${now}`,
                from: {
                  id: data?.from?.id,
                  name: data?.from?.name,
                  role: data?.from?.role,
                },
                text: data?.text,
                type: "msg",
                ts: new Date(now).toISOString(),
              },
            ];
          });
          requestAnimationFrame(scrollToBottom);
        }
      } catch {
        /* ignore */
      }
    };

    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);
    ws.addEventListener("message", onMessage);

    return () => {
      try {
        ws.removeEventListener("open", onOpen);
        ws.removeEventListener("close", onClose);
        ws.removeEventListener("error", onError);
        ws.removeEventListener("message", onMessage);
        ws.close(1000);
      } catch {}
      wsRef.current = null;
      setWsOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOpen, wsURL, myId]);

  const actuallySend = (text) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      message.warning("Đang kết nối chat, thử lại…");
      return;
    }
    try {
      ws.send(JSON.stringify({ text }));
      setItems((old) => [
        ...old,
        {
          id: `me-${Date.now()}`,
          from: { id: myId, name: user?.username, role: myRole },
          text,
          type: "msg",
          ts: new Date().toISOString(),
        },
      ]);
      setInput("");
      requestAnimationFrame(scrollToBottom);
    } catch {
      message.error("Gửi không thành công");
    }
  };

  const onSubmit = () => {
    const txt = (input || "").trim();
    if (!txt) return;
    if (isStaff && !targetUid) {
      message.warning("Hãy chọn khách hàng để chat.");
      return;
    }
    actuallySend(txt);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const renderItem = (r) => {
    const isMine =
      (r?.from?.id && myId && Number(r.from.id) === Number(myId)) ||
      (r?.from?.name || "").toLowerCase() ===
        (user?.username || "").toLowerCase();

    return (
      <div
        key={r.id}
        style={{
          display: "flex",
          justifyContent: isMine ? "flex-end" : "flex-start",
          marginBottom: 10,
          padding: "0 8px",
        }}
      >
        <div
          style={{
            maxWidth: "70%",
            background: isMine ? "#e8f0ff" : "#f5f5f5",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: "8px 12px",
            boxShadow: "0 1px 2px rgba(0,0,0,.05)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#64748b",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
              justifyContent: isMine ? "flex-end" : "flex-start",
            }}
          >
            <span>{r?.from?.name || (isMine ? user?.username : "—")}</span>
            <RoleTag role={r?.from?.role} />
          </div>
          <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {r.text}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Hỗ trợ khách hàng"
      width={480}
      destroyOnClose={false}
      styles={{ body: { display: "flex", flexDirection: "column", padding: 0 } }}
    >
      <div
        ref={listRef}
        style={{ flex: 1, overflow: "auto", paddingTop: 8, background: "#fff" }}
      >
        {loading ? (
          <div style={{ padding: 16 }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <div style={{ color: "#94a3b8", padding: 16 }}>Chưa có tin nhắn.</div>
        ) : (
          items.map(renderItem)
        )}
      </div>

      <div
        style={{
          padding: 12,
          borderTop: "1px solid #eef2f7",
          background: "#fafafa",
        }}
      >
        <Space.Compact style={{ width: "100%" }}>
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 4 }}
            placeholder={
              isStaff && !targetUid
                ? "Chọn khách từ danh sách rồi nhắn…"
                : "Nhập tin nhắn…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isStaff && !targetUid}
          />
          <Button
            type="primary"
            onClick={onSubmit}
            disabled={(isStaff && !targetUid) || !input.trim() || !wsOpen}
          >
            Gửi
          </Button>
        </Space.Compact>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "#94a3b8",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Enter để gửi • Shift+Enter để xuống dòng</span>
          <span>{wsOpen ? "Đã kết nối" : "Đang kết nối…"}</span>
        </div>
      </div>
    </Drawer>
  );
}
