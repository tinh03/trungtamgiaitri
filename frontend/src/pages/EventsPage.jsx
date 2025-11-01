// src/pages/EventsPage.jsx
import { useEffect, useState } from "react";
import {
  Button, Card, Empty, Space, Typography, message,
  Modal, InputNumber, Form, Popconfirm, Input, Select, Spin
} from "antd";
import dayjs from "dayjs";

import {
  apiGetEvents, apiCreateEvent, apiUpdateEvent, apiDeleteEvent,
  apiBookTicket, apiFetch
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";

const { Title, Text } = Typography;
const { Meta } = Card;

/* ===== Helpers ===== */
function makePlaceholder(title = "Event") {
  const txt = encodeURIComponent((title || "Event").slice(0, 26));
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='675'>
      <defs>
        <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0%' stop-color='#e6f7ff'/>
          <stop offset='100%' stop-color='#fff1f0'/>
        </linearGradient>
      </defs>
      <rect width='100%' height='100%' fill='url(#g)'/>
      <text x='50%' y='54%' text-anchor='middle' font-family='Segoe UI, Roboto, Arial' font-size='38' fill='#555'>${txt}</text>
    </svg>`
  );
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}
const fmtVND = (n) => Number(n || 0).toLocaleString("vi-VN") + " đ";

/* ===== Styles ===== */
const styles = `
.container{ max-width:1300px; margin:0 auto; padding:0 20px 40px; box-sizing:border-box; }
.header-line{ display:flex; align-items:center; justify-content:space-between; margin:18px 0 24px; }
.grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:24px; align-items:stretch; }

.card{ height:100%; border-radius:18px !important; overflow:hidden; border:1px solid #eef2f7; background:#fff;
  box-shadow:0 6px 18px rgba(15,23,42,.06); transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
.card:hover{ transform:translateY(-4px); box-shadow:0 16px 36px rgba(15,23,42,.12); border-color:#d6e4ff; }

.cover{ position:relative; width:100%; aspect-ratio:16/9; background:#fafafa; overflow:hidden; }
.cover-img{ width:100%; height:100%; object-fit:cover; object-position:center; display:block; transition:transform .6s ease; }
.card:hover .cover-img{ transform:scale(1.05); }

.overlay{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.45); opacity:0; pointer-events:none; transition:opacity .25s ease; z-index:2; }
.card:hover .overlay{ opacity:1; pointer-events:auto; }
.overlay-btn{ background:rgba(255,255,255,.92); color:#111; padding:10px 20px; border-radius:999px; border:none;
  font-weight:600; box-shadow:0 4px 10px rgba(0,0,0,.15); cursor:pointer; }
.overlay-btn:hover{ background:#1677ff; color:#fff; }

.badges{ position:absolute; top:10px; left:10px; z-index:3; }
.actions{ position:absolute; top:10px; right:10px; display:flex; gap:6px; z-index:3; }

.status{ padding:2px 10px; border-radius:999px; font-size:12px; font-weight:700; line-height:20px; }
.status.open{ background:#f6ffed; color:#237804; border:1px solid #b7eb8f; }
.status.closed{ background:#fff1f0; color:#cf1322; border:1px solid #ffa39e; }
.status.maintenance{ background:#fff7e6; color:#d46b08; border:1px solid #ffd591; }

.body{ display:flex; flex-direction:column; gap:8px; min-height:150px; }
.title-row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.meta-row{ color:#555; }
.desc{ color:#8c8c8c; line-height:1.45; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
`;

/* =========================== Component =========================== */
export default function EventsPage() {
  const { user, isAdmin: ctxIsAdmin } = useAuth();
  const lsRole = (() => {
    try { return JSON.parse(localStorage.getItem("auth") || "{}")?.role || null; }
    catch { return null; }
  })();
  const role = user?.role || lsRole || null;
  const isAdmin = ctxIsAdmin || role === "ADMIN";

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Booking state
  const [openBook, setOpenBook] = useState(false);
  const [bookingEvent, setBookingEvent] = useState(null);
  const [qty, setQty] = useState(1);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [promoList, setPromoList] = useState([]);
  const [promoId, setPromoId] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // Admin edit
  const [openEditModal, setOpenEditModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  // Detail
  const [openDetail, setOpenDetail] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetEvents();
      setEvents(data?.items ?? data ?? []);
    } catch (e) {
      message.error(e.message || "Không tải được sự kiện");
    } finally { setLoading(false); }
  };

  /* ======= FE PREVIEW CALC ======= */
  const buildPreview = (amount, chosen /* may be null */) => {
    if (chosen) {
      const rate = Number(chosen.rate || 0);
      const discount_amount = Math.round((amount * rate) / 100);
      return {
        amount,
        discount_rate: rate,
        discount_amount,
        final_total: Math.max(0, amount - discount_amount),
        promo: { id: chosen.id, ten: chosen.ten },
      };
    }
    return null;
  };

  /* -------------------- BOOKING -------------------- */
  const onBook = async (ev) => {
    if (!ev || String(ev.trang_thai).toUpperCase() !== "OPEN") {
      return message.warning("Sự kiện đã đóng hoặc không khả dụng");
    }
    setBookingEvent(ev);
    setQty(1);
    setPreview(null);
    setPromoList([]);
    setPromoId(null);
    setOpenBook(true);

    const amount = Number(ev.gia_ve || 0);

    // Lấy danh sách KM áp dụng
    const items = await fetchApplicablePromos(amount, ev.id);

    // Ưu tiên chọn best từ BE; nếu không có, chọn item có rate lớn nhất
    let defaultId = null; // <-- FIX: JS thuần, không dùng ": any"
    try {
      setPreviewLoading(true);
      const best = await apiFetch(`/ve/promo-preview?amount=${amount}&su_kien_id=${ev.id}`);
      if (best?.promo?.id && items.some((x) => String(x.id) === String(best.promo.id))) {
        defaultId = best.promo.id;
      }
    } catch { /* ignore */ } finally { setPreviewLoading(false); }

    if (!defaultId && items.length) {
      defaultId = items.slice().sort((a,b)=>b.rate-a.rate)[0].id;
    }
    if (defaultId) setPromoId(defaultId);

    // Build preview theo lựa chọn (hoặc null nếu không có KM)
    const chosen = items.find((x) => String(x.id) === String(defaultId)) || null;
    const local = buildPreview(amount, chosen);
    if (local) setPreview(local); else setPreview(null);
  };

  const submitBook = async () => {
    try {
      const chosenOk = promoId && promoList.some((p) => String(p.id) === String(promoId));
      const res = await apiBookTicket({
        su_kien_id: bookingEvent.id,
        so_luong: qty,
        promo_id: chosenOk ? promoId : undefined,
      });
      const total = res?.final_total ?? (Number(bookingEvent.gia_ve || 0) * qty);
      message.success(`Đặt vé thành công! Tổng: ${fmtVND(total)}`);
      setOpenBook(false);
    } catch (e) {
      message.error(e?.data?.detail || e.message || "Đặt vé thất bại");
    }
  };

  const fetchApplicablePromos = async (amount, id) => {
    try {
      setPromoLoading(true);
      const res = await apiFetch(`/ve/applicable-promos?amount=${amount}&su_kien_id=${id}`);
      const items = Array.isArray(res) ? res : res.items || [];
      const mapped = items.map((x) => ({
        id: x.id ?? x.promo_id ?? x.pid,
        ten: x.ten ?? x.name ?? "Khuyến mãi",
        rate: Number(x.rate ?? x.ty_le ?? 0),
      }));
      setPromoList(mapped);
      return mapped;
    } catch {
      setPromoList([]);
      return [];
    } finally {
      setPromoLoading(false);
    }
  };

  // Đổi số lượng -> giữ promoId hiện tại nếu còn hợp lệ, và tính preview FE
  useEffect(() => {
    if (!bookingEvent || !openBook) return;
    const amount = Number(bookingEvent.gia_ve || 0) * qty;

    (async () => {
      const items = await fetchApplicablePromos(amount, bookingEvent.id);
      const chosen =
        (promoId && items.find((p) => String(p.id) === String(promoId))) ||
        items[0] || null;
      if (chosen && String(chosen.id) !== String(promoId)) setPromoId(chosen.id);
      const local = buildPreview(amount, chosen);
      setPreview(local);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty]);

  // Đổi KM trên dropdown -> preview FE ngay (không gọi BE)
  useEffect(() => {
    if (!bookingEvent || !openBook) return;
    const amount = Number(bookingEvent.gia_ve || 0) * qty;
    const chosen = promoList.find((p) => String(p.id) === String(promoId)) || null;
    const local = buildPreview(amount, chosen);
    setPreview(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoId]);

  /* -------------------- DETAIL -------------------- */
  const onDetail = (ev) => { setDetail(ev); setOpenDetail(true); };

  /* -------------------- ADMIN -------------------- */
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      ten: "", mo_ta: "", anh_bia: "",
      thoi_gian: dayjs().add(1, "day").format("YYYY-MM-DDTHH:mm"),
      gia_ve: 0, trang_thai: "OPEN",
    });
    setOpenEditModal(true);
  };

  const openEditEvent = (ev) => {
    setEditing(ev);
    form.setFieldsValue({
      ten: ev.ten, mo_ta: ev.mo_ta, anh_bia: ev.anh_bia || "",
      thoi_gian: ev.thoi_gian ? dayjs(ev.thoi_gian).format("YYYY-MM-DDTHH:mm") : "",
      gia_ve: Number(ev.gia_ve || 0), trang_thai: ev.trang_thai || "OPEN",
    });
    setOpenEditModal(true);
  };

  const submitEdit = async () => {
    const v = await form.validateFields();
    const payload = {
      ten: v.ten, mo_ta: v.mo_ta, anh_bia: v.anh_bia,
      gia_ve: Number(v.gia_ve || 0),
      thoi_gian: v.thoi_gian ? new Date(v.thoi_gian).toISOString() : null,
      trang_thai: v.trang_thai,
    };
    if (editing) await apiUpdateEvent(editing.id, payload);
    else await apiCreateEvent(payload);
    message.success(editing ? "Đã cập nhật" : "Đã tạo mới");
    setOpenEditModal(false);
    load();
  };

  /* -------------------- UI -------------------- */
  const statusClass = (s) => {
    const v = String(s || "").toUpperCase();
    if (v === "OPEN") return "status open";
    if (v === "MAINTENANCE") return "status maintenance";
    return "status closed";
  };

  return (
    <div className="container">
      <style>{styles}</style>

      <div className="header-line">
        <Title level={2} style={{ margin: 0 }}>Sự kiện</Title>
        {isAdmin && <Button type="primary" onClick={openCreate}>Thêm sự kiện</Button>}
      </div>

      {!events.length ? (
        <Empty description="Chưa có sự kiện" />
      ) : (
        <div className="grid">
          {events.map((ev) => {
            const cover = ev.anh_bia || makePlaceholder(ev.ten);
            const dateTxt = ev.thoi_gian ? dayjs(ev.thoi_gian).format("DD/MM/YYYY HH:mm") : "—";
            const isOpen = String(ev.trang_thai).toUpperCase() === "OPEN";
            return (
              <Card key={ev.id} className="card" hoverable bodyStyle={{ padding: 16 }}>
                <div className="cover">
                  <div className="badges">
                    <span className={statusClass(ev.trang_thai)}>
                      {String(ev.trang_thai || "").toUpperCase() || "CLOSED"}
                    </span>
                  </div>
                  <div className="actions">
                    <Button size="small" type="primary" disabled={!isOpen} onClick={() => onBook(ev)}>Đặt vé</Button>
                    {isAdmin && (
                      <>
                        <Button size="small" onClick={() => openEditEvent(ev)}>Sửa</Button>
                        <Popconfirm title="Xóa sự kiện này?" onConfirm={() => apiDeleteEvent(ev.id).then(load)}>
                          <Button size="small" danger>Xóa</Button>
                        </Popconfirm>
                      </>
                    )}
                  </div>
                  <div className="overlay">
                    <button className="overlay-btn" onClick={() => onDetail(ev)}>Xem chi tiết</button>
                  </div>
                  <img
                    src={cover}
                    alt={ev.ten}
                    className="cover-img"
                    onError={(e) => { e.currentTarget.src = makePlaceholder(ev.ten); }}
                  />
                </div>

                <Meta
                  title={<div className="title-row"><Text strong>{ev.ten}</Text></div>}
                  description={
                    <div className="body">
                      <div className="meta-row">Thời gian: {dateTxt}</div>
                      <div className="meta-row">Giá vé: {fmtVND(ev.gia_ve)}</div>
                      {ev.mo_ta && <div className="desc">{ev.mo_ta}</div>}
                    </div>
                  }
                />
              </Card>
            );
          })}
        </div>
      )}

      {/* === Modal Xem Chi Tiết === */}
      <Modal open={openDetail} onCancel={() => setOpenDetail(false)} footer={null} width={750} title={detail?.ten}>
        {detail && (
          <>
            <img
              src={detail.anh_bia || makePlaceholder(detail.ten)}
              alt={detail.ten}
              style={{ width: "100%", height: "auto", borderRadius: 8, marginBottom: 12, display: "block" }}
              onError={(e) => { e.currentTarget.src = makePlaceholder(detail.ten); }}
            />
            <p><b>Thời gian:</b> {dayjs(detail.thoi_gian).format("DD/MM/YYYY HH:mm")}</p>
            <p><b>Giá vé:</b> {fmtVND(detail.gia_ve)}</p>
            <p style={{ color: "#555" }}>{detail.mo_ta || "Chưa có mô tả chi tiết."}</p>
          </>
        )}
      </Modal>

      {/* === Modal Đặt Vé === */}
      <Modal
        open={openBook}
        onCancel={() => setOpenBook(false)}
        onOk={submitBook}
        okText="Xác nhận đặt"
        title={bookingEvent ? `Đặt vé: ${bookingEvent.ten}` : "Đặt vé"}
      >
        {bookingEvent && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text>Giá: {fmtVND(bookingEvent.gia_ve)}</Text>
            <div>
              <Text>Số lượng: </Text>
              <InputNumber min={1} max={50} value={qty} onChange={(v) => setQty(Number(v || 1))} />
            </div>

            {promoList.length > 0 && (
              <Select
                loading={promoLoading}
                value={promoId ?? undefined}
                onChange={setPromoId}
                style={{ width: "100%" }}
                placeholder="Chọn khuyến mãi"
                options={promoList.map((p) => ({ value: p.id, label: `${p.ten} (Giảm ${p.rate}%)` }))}
              />
            )}

            {previewLoading ? (
              <Spin size="small" />
            ) : preview && typeof preview.final_total === "number" && (
              <div style={{ background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, padding: 8 }}>
                {preview?.promo?.ten && (
                  <Text style={{ color: "#389e0d" }}>🎉 Áp dụng: {preview.promo.ten}</Text>
                )}<br />
                <Text>Tạm tính: {fmtVND(preview.amount)}</Text><br />
                <Text>
                  Giảm: {fmtVND(preview.discount_amount)}
                  {typeof preview.discount_rate === "number" ? ` (${preview.discount_rate}%)` : ""}
                </Text><br />
                <Text strong style={{ color: "#cf1322" }}>Còn lại: {fmtVND(preview.final_total)}</Text>
              </div>
            )}
          </Space>
        )}
      </Modal>

      {/* === Modal Thêm / Sửa (Admin) === */}
      <Modal
        open={openEditModal}
        onCancel={() => setOpenEditModal(false)}
        onOk={submitEdit}
        okText={editing ? "Lưu" : "Tạo"}
        title={editing ? "Sửa sự kiện" : "Thêm sự kiện"}
      >
        <Form layout="vertical" form={form}>
          <Form.Item name="ten" label="Tên sự kiện" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="mo_ta" label="Mô tả"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="anh_bia" label="Ảnh bìa (URL)"><Input /></Form.Item>
          <Form.Item name="thoi_gian" label="Thời gian" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
          <Form.Item name="gia_ve" label="Giá vé" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="trang_thai" label="Trạng thái"><Select options={[{ value: "OPEN" }, { value: "CLOSED" }, { value: "MAINTENANCE", label: "MAINTENANCE" }]} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
