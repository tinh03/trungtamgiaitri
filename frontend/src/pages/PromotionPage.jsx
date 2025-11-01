// src/pages/PromotionPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Tag,
  Typography,
  message,
  Popconfirm,
  InputNumber,
  DatePicker,
  Checkbox,
  Select,
  Divider,
} from "antd";
import {
  apiCreatePromo,
  apiDeletePromo,
  apiGetPromos,
  apiTogglePromo,
  apiUpdatePromo,
  apiListOpenEvents,
  apiFetch,
} from "../lib/api";
import {
  EditOutlined,
  DeleteOutlined,
  PoweroffOutlined,
  CheckCircleTwoTone,
  CloseCircleTwoTone,
} from "@ant-design/icons";
import dayjs from "dayjs";
import "dayjs/locale/vi";
dayjs.locale("vi");

const { Title, Text } = Typography;
const DATE_FMT = "DD/MM/YYYY HH:mm";

/* =============== UI Helpers =============== */
const ST = {
  shell: {
    background:
      "radial-gradient(1200px 600px at 10% -10%,#ffe3f2 0%,transparent 60%), radial-gradient(1200px 600px at 110% 10%,#e6f0ff 0%,transparent 60%)",
  },
  page: { maxWidth: 1360, margin: "0 auto", padding: "0 20px 40px" },
  hero: {
    margin: "18px 0 10px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  grid: { marginTop: 8 },

  card: {
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 14px 34px rgba(15,23,42,.10)",
    transition: "transform .18s ease, box-shadow .18s ease",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background:
      "linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.72))",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(255,255,255,.6)",
  },
  cardHover: {
    transform: "translateY(-4px)",
    boxShadow: "0 20px 42px rgba(15,23,42,.18)",
  },

  header: {
    minHeight: 140,
    position: "relative",
    color: "#fff",
    padding: 18,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    // gradient + overlay bubbles
    background:
      "linear-gradient(135deg,#ff6aa6 0%,#ffb266 100%) padding-box, radial-gradient(60px 60px at 25% 15%,rgba(255,255,255,.35),transparent 70%)",
    borderRadius: "18px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.35)",
  },
  titleWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 900,
    fontSize: 20,
    textShadow: "0 1px 0 rgba(0,0,0,.18)",
  },
  statusPill: {
    fontSize: 12,
    fontWeight: 800,
    padding: "4px 10px",
    borderRadius: 999,
    background: "rgba(255,255,255,.22)",
    border: "1px solid rgba(255,255,255,.45)",
    color: "#fff",
  },

  body: { padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: "1 1 auto" },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    background: "#fff",
    border: "1px solid #eef2f7",
  },

  footer: { background: "#fafafa", borderTop: "1px solid #f0f0f0", padding: 10 },
  actionBtn: { fontWeight: 600 },

  // closed look
  closed: { filter: "grayscale(0.08)", opacity: 0.92 },
};

/* Ring phần trăm (conic-gradient) */
function PercentRing({ value = 0 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const ring = {
    width: 96,
    height: 96,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: `conic-gradient(rgba(255,255,255,.95) ${v}%, rgba(255,255,255,.22) ${v}% 100%)`,
    border: "1px solid rgba(255,255,255,.55)",
    boxShadow: "0 2px 10px rgba(0,0,0,.08) inset",
  };
  const inner = {
    width: 78,
    height: 78,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,.25)",
    backdropFilter: "blur(3px)",
    fontWeight: 900,
    color: "#fff",
    lineHeight: 1.05,
    textAlign: "center",
    border: "1px solid rgba(255,255,255,.45)",
  };
  return (
    <div style={ring} aria-label={`Giảm ${v}%`}>
      <div style={inner}>
        <div style={{ fontSize: 12 }}>Giảm</div>
        <div style={{ fontSize: 22 }}>{v}%</div>
      </div>
    </div>
  );
}

const TIER_OPTIONS = [
  { value: "STANDARD", label: "Thường" },
  { value: "BAC", label: "Bạc" },
  { value: "VANG", label: "Vàng" },
  { value: "KIMCUONG", label: "Kim cương" },
];

function tryParseJSON(s) {
  if (!s || typeof s !== "string") return null;
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}
const fmtRange = (bd, kt) =>
  `${bd ? dayjs(bd).format(DATE_FMT) : "?"} – ${kt ? dayjs(kt).format(DATE_FMT) : "?"}`;

function prettyCondition(cond, eventsDict) {
  if (!cond) return "-";
  if (typeof cond === "string") return cond;
  const parts = [];
  if (cond.min_amount) parts.push(`Áp dụng hóa đơn từ ${Number(cond.min_amount).toLocaleString("vi-VN")} đ`);
  if (cond.member_only) parts.push("Chỉ áp dụng cho thành viên");
  if (Array.isArray(cond.member_tiers) && cond.member_tiers.length) {
    const names = cond.member_tiers
      .map((v) => TIER_OPTIONS.find((o) => o.value === String(v).toUpperCase())?.label || String(v))
      .join(", ");
    parts.push(`Bậc: ${names}`);
  }
  if (cond.event_id) parts.push(`Cho sự kiện: ${eventsDict?.[cond.event_id] || `#${cond.event_id}`}`);
  return parts.join(" · ");
}

/* =============== Page =============== */
export default function PromotionPage() {
  const [list, setList] = useState([]);
  const [events, setEvents] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const { isAdmin, isStaff } = useMemo(() => {
    try {
      const role = JSON.parse(localStorage.getItem("auth") || "{}")?.role;
      return { isAdmin: role === "ADMIN", isStaff: role === "STAFF" || role === "ADMIN" };
    } catch {
      return { isAdmin: false, isStaff: false };
    }
  }, []);

  useEffect(() => { (async () => setList((await apiGetPromos()) || []))(); }, []);
  useEffect(() => { (async () => setEvents((await apiListOpenEvents()) || []))(); }, []);
  const refresh = async () => setList((await apiGetPromos()) || []);

  // CRUD
  const onAdd = () => {
    setEditing(null);
    const now = dayjs();
    form.resetFields();
    form.setFieldsValue({
      ten: "",
      ty_le: 0,
      cond_min_amount: null,
      cond_member_only: false,
      cond_event_id: undefined,
      cond_member_tiers: [],
      dieu_kien_text: "",
      thoi_gian_bd: now,
      thoi_gian_kt: now.add(30, "day"),
      active: 1,
    });
    setOpen(true);
  };

  const onEdit = (p) => {
    setEditing(p);
    form.resetFields();
    const parsed = tryParseJSON(p.dieu_kien);
    form.setFieldsValue({
      ten: p.ten,
      ty_le: Number(p.ty_le || 0),
      thoi_gian_bd: p.thoi_gian_bd ? dayjs(p.thoi_gian_bd) : undefined,
      thoi_gian_kt: p.thoi_gian_kt ? dayjs(p.thoi_gian_kt) : undefined,
      cond_min_amount: parsed?.min_amount ?? null,
      cond_member_only: !!parsed?.member_only,
      cond_member_tiers: parsed?.member_tiers?.map((x) => String(x).toUpperCase()) || [],
      cond_event_id: parsed?.event_id ?? undefined,
      dieu_kien_text: parsed ? "" : (p.dieu_kien || ""),
      active: Number(p.active ?? 1),
    });
    setOpen(true);
  };

  const onDelete = async (p) => {
    await apiDeletePromo(p.id);
    message.success("Đã xoá khuyến mãi");
    refresh();
  };

  const onToggle = async (p) => {
    const nextVal = Number(p.active) ? 0 : 1;
    try {
      await apiFetch(`/nhan-vien/ops/khuyen-mai/${p.id}/active?value=${nextVal}`, { method: "PATCH" });
      message.success("Đã đổi trạng thái");
      setList((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: nextVal } : x)));
    } catch (e) {
      if (isAdmin) {
        try {
          await apiTogglePromo(p.id);
          message.success("Đã đổi trạng thái");
          refresh();
          return;
        } catch {}
      }
      message.error(e?.message || "Không đổi được trạng thái");
    }
  };

  const submit = async () => {
    const v = await form.validateFields();
    const cond = {};
    if (v.cond_min_amount && Number(v.cond_min_amount) > 0) cond.min_amount = Number(v.cond_min_amount);
    if (v.cond_member_only) cond.member_only = true;
    if (v.cond_event_id) cond.event_id = Number(v.cond_event_id);
    if (Array.isArray(v.cond_member_tiers) && v.cond_member_tiers.length)
      cond.member_tiers = v.cond_member_tiers.map((x) => String(x).toUpperCase());
    const dieu_kien = Object.keys(cond).length ? JSON.stringify(cond) : (v.dieu_kien_text?.trim() || "");
    const payload = {
      ten: v.ten?.trim(),
      ty_le: Number(v.ty_le || 0),
      dieu_kien,
      thoi_gian_bd: v.thoi_gian_bd ? v.thoi_gian_bd.toDate().toISOString() : null,
      thoi_gian_kt: v.thoi_gian_kt ? v.thoi_gian_kt.toDate().toISOString() : null,
      active: Number(v.active ?? 1),
    };
    if (editing) { await apiUpdatePromo(editing.id, payload); message.success("Đã cập nhật khuyến mãi"); }
    else { await apiCreatePromo(payload); message.success("Đã tạo khuyến mãi"); }
    setOpen(false);
    refresh();
  };

  const eventDict = (events || []).reduce((a, e) => (a[e.id] = e.ten, a), {});

  return (
    <div style={ST.shell}>
      <div style={ST.page}>
        {/* Hero */}
        <div style={ST.hero}>
          <Title level={2} style={{ margin: 0 }}>Khuyến mãi</Title>
          <Tag color="magenta" style={{ borderRadius: 999, fontWeight: 700 }}>Ưu đãi hiện hành</Tag>
          {isAdmin && <div style={{ marginLeft: "auto" }}>
            <Button type="primary" onClick={onAdd}>Thêm khuyến mãi</Button>
          </div>}
        </div>
        <Text type="secondary">
          Tổng hợp các chương trình ưu đãi đang mở. Nhấn để bật/tắt (Staff) hoặc chỉnh sửa (Admin).
        </Text>

        {!list.length ? (
          <Empty description="Không có khuyến mãi" style={{ marginTop: 24 }} />
        ) : (
          <Row gutter={[16, 16]} style={ST.grid}>
            {list.map((p) => {
              const parsed = tryParseJSON(p.dieu_kien);
              const condText = prettyCondition(parsed ?? p.dieu_kien, eventDict);
              const isOpen = Number(p.active) === 1;

              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={p.id}>
                  <Card
                    bordered
                    style={{ ...ST.card, ...(isOpen ? {} : ST.closed) }}
                    bodyStyle={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}
                    onMouseEnter={(e) => Object.assign(e.currentTarget.style, ST.cardHover)}
                    onMouseLeave={(e) => Object.assign(e.currentTarget.style, { transform: "", boxShadow: ST.card.boxShadow })}
                  >
                    {/* Header */}
                    <div style={ST.header}>
                      <div>
                        <div style={ST.titleWrap}>
                          <span>{p.ten}</span>
                          <span style={ST.statusPill}>{isOpen ? "OPEN" : "CLOSED"}</span>
                        </div>
                        <div style={{ marginTop: 6, opacity: .95 }}>
                          Thời gian: {fmtRange(p.thoi_gian_bd, p.thoi_gian_kt)}
                        </div>
                      </div>
                      <PercentRing value={Number(p.ty_le || 0)} />
                    </div>

                    {/* Body */}
                    <div style={ST.body}>
                      <div style={ST.chipRow}>
                        <span style={ST.chip}>ID: {p.id}</span>
                        <span style={ST.chip}>
                          Trạng thái:{" "}
                          {isOpen ? (
                            <><CheckCircleTwoTone twoToneColor="#16a34a" /> <b style={{ color: "#16a34a" }}>Đang mở</b></>
                          ) : (
                            <><CloseCircleTwoTone twoToneColor="#dc2626" /> <b style={{ color: "#dc2626" }}>Đã đóng</b></>
                          )}
                        </span>
                      </div>

                      <Divider style={{ margin: "8px 0" }} />

                      <Space direction="vertical" size={6}>
                        <Text type="secondary">Điều kiện</Text>
                        <Text>{condText}</Text>
                      </Space>
                    </div>

                    {/* Footer actions */}
                    <div style={ST.footer}>
                      <Space size={18} wrap>
                        {(isStaff || isAdmin) && (
                          <Button
                            type="link"
                            icon={<PoweroffOutlined />}
                            style={ST.actionBtn}
                            onClick={() => onToggle(p)}
                          >
                            {isOpen ? "Đóng chương trình" : "Mở chương trình"}
                          </Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button
                              type="link"
                              icon={<EditOutlined />}
                              style={ST.actionBtn}
                              onClick={() => onEdit(p)}
                            >
                              Sửa
                            </Button>
                            <Popconfirm
                              title="Xoá khuyến mãi này?"
                              onConfirm={() => onDelete(p)}
                              okText="Xoá"
                              cancelText="Huỷ"
                            >
                              <Button type="link" icon={<DeleteOutlined />} danger style={ST.actionBtn}>
                                Xoá
                              </Button>
                            </Popconfirm>
                          </>
                        )}
                      </Space>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}

        {/* Modal tạo/sửa */}
        <Modal
          open={open}
          onCancel={() => setOpen(false)}
          onOk={submit}
          title={editing ? "Sửa khuyến mãi" : "Thêm khuyến mãi"}
          okText={editing ? "Cập nhật" : "Tạo"}
          width={740}
        >
          <Form form={form} layout="vertical">
            <Form.Item name="ten" label="Tên" rules={[{ required: true, message: "Nhập tên khuyến mãi" }]}>
              <Input placeholder="VD: Ưu đãi Gold" />
            </Form.Item>

            <Row gutter={12}>
              <Col span={8}>
                <Form.Item name="ty_le" label="Tỷ lệ giảm (%)" rules={[{ required: true }]}>
                  <InputNumber min={0} max={100} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="thoi_gian_bd" label="Bắt đầu" rules={[{ required: true }]}>
                  <DatePicker style={{ width: "100%" }} format={DATE_FMT} showTime={{ format: "HH:mm" }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="thoi_gian_kt" label="Kết thúc" rules={[{ required: true }]}>
                  <DatePicker style={{ width: "100%" }} format={DATE_FMT} showTime={{ format: "HH:mm" }} />
                </Form.Item>
              </Col>
            </Row>

            <div style={{ background: "#fafafa", border: "1px solid #eee", padding: 12, borderRadius: 10 }}>
              <Text strong>Điều kiện áp dụng</Text>
              <Row gutter={12} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <Form.Item name="cond_min_amount" label="Hóa đơn tối thiểu (đ)">
                    <InputNumber min={0} style={{ width: "100%" }} placeholder="VD: 200000" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="cond_member_only" valuePropName="checked" label=" ">
                    <Checkbox>Chỉ áp dụng cho thành viên</Checkbox>
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="cond_member_tiers" label="Bậc thành viên áp dụng">
                <Select mode="multiple" allowClear placeholder="— Chọn bậc —" options={TIER_OPTIONS} />
              </Form.Item>
              <Form.Item name="cond_event_id" label="Giới hạn theo sự kiện">
                <Select
                  allowClear
                  placeholder="-- Không giới hạn --"
                  options={(events || []).map((e) => ({ value: e.id, label: e.ten }))}
                />
              </Form.Item>
            </div>

            <Form.Item name="dieu_kien_text" label="Ghi chú điều kiện (tùy chọn)">
              <Input.TextArea rows={3} placeholder="Ví dụ: Chỉ áp dụng Chủ nhật…" />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
}
