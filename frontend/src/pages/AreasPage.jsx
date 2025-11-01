// src/pages/AreasPage.jsx
import { useEffect, useRef, useState } from "react";
import {
  Button, Card, Empty, Form, Input, Modal, Select, Space,
  Typography, message, Popconfirm, InputNumber, Spin, Image,
} from "antd";
import {
  getKhuVucMenu, getTroChoiByKhu,
  apiCreateKhuVuc, apiUpdateKhuVuc, apiDeleteKhuVuc,
  apiCreateGame, apiUpdateGame, apiDeleteGame,
  apiClickGame, apiBookGameTicket, apiPromoPreview, apiFetch,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import "./areas.css";

const { Title, Text } = Typography;

export default function AreasPage() {
  const { isAdmin: ctxIsAdmin, user } = useAuth();

  // role
  const lsRole = (() => {
    try {
      const raw = localStorage.getItem("auth");
      return raw ? JSON.parse(raw)?.role : null;
    } catch {
      return null;
    }
  })();
  const role = user?.role || lsRole || null;
  const isAdmin = ctxIsAdmin || role === "ADMIN";
  const isStaff = role === "STAFF" || isAdmin; // STAFF cũng có quyền đổi trạng thái
  const isCustomer = role === "CUSTOMER";

  const [menu, setMenu] = useState([]);
  const [kvId, setKvId] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);

  // form khu vực
  const [openKV, setOpenKV] = useState(false);
  const [kvEditing, setKvEditing] = useState(null);
  const [kvForm] = Form.useForm();

  // form trò chơi
  const [openGame, setOpenGame] = useState(false);
  const [gameEditing, setGameEditing] = useState(null);
  const [gameForm] = Form.useForm();

  // modal chi tiết ảnh trò chơi
  const [openDetail, setOpenDetail] = useState(false);
  const [detailGame, setDetailGame] = useState(null);

  // modal đặt vé trò chơi
  const [openTicket, setOpenTicket] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [ticketForm] = Form.useForm();

  // preview KM
  const [kmPreview, setKmPreview] = useState(null);
  const [kmLoading, setKmLoading] = useState(false);

  // danh sách KM
  const [promoList, setPromoList] = useState([]);
  const [promoId, setPromoId] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // load menu khu
  useEffect(() => {
    (async () => {
      try {
        const m = await getKhuVucMenu();
        setMenu(m || []);
        if ((m || []).length) setKvId(m[0].id);
      } catch (e) {
        message.error(e?.message || "Lỗi tải khu vực");
      }
    })();
  }, []);

  // load trò theo khu
  useEffect(() => {
    if (!kvId) return;
    setLoading(true);
    getTroChoiByKhu(kvId)
      .then((data) => setGames(data || []))
      .catch((e) => message.error(e?.message || "Lỗi tải trò chơi"))
      .finally(() => setLoading(false));
  }, [kvId]);

  // ====== KHU VỰC ======
  const onAddKV = () => {
    setKvEditing(null);
    kvForm.resetFields();
    setOpenKV(true);
  };
  const onEditKV = () => {
    const curr = menu.find((x) => x.id === kvId);
    if (!curr) return;
    setKvEditing(curr);
    kvForm.setFieldsValue({
      ten: curr.ten,
      mo_ta: curr.mo_ta,
      suc_chua: curr.suc_chua,
    });
    setOpenKV(true);
  };
  const onDeleteKV = async () => {
    await apiDeleteKhuVuc(kvId);
    message.success("Đã xoá khu vực");
    const m = await getKhuVucMenu();
    setMenu(m || []);
    setKvId(m?.[0]?.id || null);
  };
  const submitKV = async () => {
    const values = await kvForm.validateFields();
    if (kvEditing) {
      await apiUpdateKhuVuc(kvEditing.id, values);
      message.success("Đã cập nhật khu vực");
    } else {
      await apiCreateKhuVuc(values);
      message.success("Đã tạo khu vực");
    }
    setOpenKV(false);
    const m = await getKhuVucMenu();
    setMenu(m || []);
    setKvId(m?.[0]?.id || null);
  };

  // ====== TRÒ CHƠI ======
  const onAddGame = () => {
    setGameEditing(null);
    gameForm.resetFields();
    gameForm.setFieldsValue({
      khu_vuc_id: kvId,
      trang_thai: "OPEN",
      gia_mac_dinh: 0,
      anh_cover: "",
      anh_ct_1: "",
      anh_ct_2: "",
    });
    setOpenGame(true);
  };
  const onEditGame = (g) => {
    setGameEditing(g);
    gameForm.setFieldsValue({
      ten: g.ten,
      khu_vuc_id: kvId,
      the_loai: g.the_loai,
      tuoi_khuyen_nghi: g.tuoi_khuyen_nghi,
      gia_mac_dinh: g.gia_mac_dinh,
      trang_thai: g.trang_thai,
      anh_cover: g.anh_cover || "",
      anh_ct_1: g.anh_ct_1 || "",
      anh_ct_2: g.anh_ct_2 || "",
    });
    setOpenGame(true);
  };
  const onDeleteGame = async (g) => {
    try {
      await apiDeleteGame(g.id);
      message.success("Đã xoá trò chơi");
      const data = await getTroChoiByKhu(kvId);
      setGames(data || []);
    } catch (e) {
      message.error(e?.message || "Xoá trò chơi thất bại");
    }
  };
  const submitGame = async () => {
    const values = await gameForm.validateFields();
    if (gameEditing) {
      await apiUpdateGame(gameEditing.id, values);
      message.success("Đã cập nhật trò chơi");
    } else {
      await apiCreateGame(values);
      message.success("Đã tạo trò chơi");
    }
    setOpenGame(false);
    const data = await getTroChoiByKhu(kvId);
    setGames(data || []);
  };

  // ====== STAFF/ADMIN: đổi trạng thái trò chơi ======
  const updateGameStatus = async (game, newStatus) => {
    try {
      await apiFetch(`/nhan-vien/ops/tro-choi/${game.id}/status?value=${encodeURIComponent(newStatus)}`, {
        method: "PATCH",
      });
      message.success("Đã cập nhật trạng thái");
      setGames((prev) =>
        prev.map((g) => (g.id === game.id ? { ...g, trang_thai: newStatus } : g))
      );
    } catch (e) {
      message.error(e?.message || "Cập nhật trạng thái thất bại");
    }
  };

  // ====== CHI TIẾT ẢNH ======
  const openDetailModal = async (g) => {
    // ghi nhận lượt truy cập khi xem chi tiết
    try { await apiClickGame(g.id); } catch {}
    setDetailGame(g);
    setOpenDetail(true);
  };

  // ====== ĐẶT VÉ TRÒ CHƠI ======
  const openBooking = (game) => {
    setSelectedGame(game);
    ticketForm.resetFields();
    ticketForm.setFieldsValue({ so_luong: 1 });
    setKmPreview(null);
    setPromoList([]);
    setPromoId(null);
    setOpenTicket(true);

    const amt = Number(game?.gia_mac_dinh || 0) * 1;
    fetchPromoPreview(amt);
    fetchApplicablePromos(amt);
  };

  const recomputePreviewFromChoice = () => {
    if (!selectedGame) return;
    const qty = Number(ticketForm.getFieldValue("so_luong") || 0);
    const price = Number(selectedGame?.gia_mac_dinh || 0);
    const amount = qty * price;
    if (!amount) {
      setKmPreview(null);
      return;
    }
    if (!promoId) return;
    const chosen = promoList.find((p) => String(p.id) === String(promoId));
    if (!chosen) return;
    const rate = Number(chosen.rate || 0);
    const discount_amount = Math.round((amount * rate) / 100);
    const final_total = amount - discount_amount;
    setKmPreview({
      amount,
      discount_rate: rate,
      discount_amount,
      final_total,
      promo: { id: chosen.id, ten: chosen.ten },
    });
  };

  const debounceRef = useRef(null);
  const fetchPromoPreview = (amount) => {
    if (!amount || amount <= 0) {
      setKmPreview(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setKmLoading(true);
      try {
        const p = await apiPromoPreview(amount);
        setKmPreview(p || null);
        if (!promoId && p?.promo?.id) setPromoId(p.promo.id);
        if (promoId) recomputePreviewFromChoice();
      } catch {
        setKmPreview(null);
      } finally {
        setKmLoading(false);
      }
    }, 250);
  };

  const fetchApplicablePromos = async (amount) => {
    if (!amount || amount <= 0) {
      setPromoList([]);
      setPromoId(null);
      return;
    }
    setPromoLoading(true);
    try {
      const qs = new URLSearchParams({ amount: String(amount) });
      const res = await apiFetch(`/ve/applicable-promos?${qs.toString()}`);
      const items = Array.isArray(res) ? res : (res?.items || []);
      const normalized = items.map((x) => ({
        id: x.id ?? x?.promo_id ?? x?.pid,
        ten: x.ten ?? x?.name ?? "Khuyến mãi",
        rate: Number(x.ty_le ?? x?.rate ?? 0),
      }));
      setPromoList(normalized);
      if (!promoId && normalized?.[0]?.id) setPromoId(normalized[0].id);
    } catch {
      setPromoList([]);
    } finally {
      setPromoLoading(false);
    }
  };

  const onTicketValuesChange = () => {
    const qty = Number(ticketForm.getFieldValue("so_luong") || 0);
    const price = Number(selectedGame?.gia_mac_dinh || 0);
    const amount = qty * price;
    fetchPromoPreview(amount);
    fetchApplicablePromos(amount);
  };

  useEffect(() => {
    if (!openTicket) return;
    recomputePreviewFromChoice();
  }, [promoId, promoList]); // eslint-disable-line

  const submitTicket = async () => {
    const v = await ticketForm.validateFields();
    try {
      await apiBookGameTicket({
        tro_choi_id: selectedGame?.id,
        so_luong: v.so_luong,
        promo_id: promoId || undefined,
      });
      message.success("Đặt vé trò chơi thành công!");
      setOpenTicket(false);
    } catch (e) {
      message.error(e?.message || "Không thể đặt vé trò chơi");
    }
  };

  // UI helpers
  const fmtVnd = (n) => (Number(n || 0)).toLocaleString("vi-VN") + " đ";
  const statusTone = (s) => {
    const v = String(s || "").toUpperCase();
    if (v === "OPEN") return { bg: "linear-gradient(135deg,#22c55e,#16a34a)", text: "#fff" };
    if (v === "MAINTENANCE")
      return { bg: "linear-gradient(135deg,#f59e0b,#d97706)", text: "#fff" };
    return { bg: "linear-gradient(135deg,#ef4444,#dc2626)", text: "#fff" };
  };

  const ST = {
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
      gap: 16,
    },
    coverWrap: { position: "relative", aspectRatio: "16/9", overflow: "hidden" },
    coverImg: {
      width: "100%", height: "100%", objectFit: "cover",
      transform: "scale(1.02)", transition: "transform .45s ease",
    },
    price: {
      position: "absolute", right: 12, top: 12,
      padding: "6px 10px", borderRadius: 12, fontWeight: 800, fontSize: 12,
      background: "#fff", color: "#e91e63",
      border: "1px solid rgba(0,0,0,.06)", boxShadow: "0 6px 14px rgba(0,0,0,.12)"
    },
    ribbon: {
      position: "absolute", left: 12, top: 12, fontWeight: 800, fontSize: 12,
      padding: "6px 12px", borderRadius: 999, boxShadow: "0 6px 14px rgba(0,0,0,.18)",
      color: "#fff"
    },
    chips: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 },
    chip: {
      fontSize: 12, padding: "6px 10px", borderRadius: 999,
      border: "1px solid rgba(0,0,0,.08)", background: "#fff", color: "#334155"
    },
    chipPink: {
      fontSize: 12, padding: "6px 10px", borderRadius: 999,
      border: "1px solid rgba(255,110,168,.35)",
      background: "linear-gradient(180deg,#ffe3f0,#ffd7ea)",
      color: "#b31257", fontWeight: 700
    },
    foot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  };

  // Component điều khiển trạng thái cho STAFF/ADMIN
  const StatusControl = ({ game }) => (
    <Space onClick={(e) => e.stopPropagation()} size={6}>
      <Select
        size="small"
        style={{ width: 160 }}
        value={String(game.trang_thai || "OPEN").toUpperCase()}
        options={[
          { label: "OPEN", value: "OPEN" },
          { label: "MAINTENANCE", value: "MAINTENANCE" },
          { label: "CLOSED", value: "CLOSED" },
        ]}
        onChange={(v) => updateGameStatus(game, v)}
      />
    </Space>
  );

  return (
    <div className="areas-wrap">
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>
        <Title level={2} style={{ margin: "16px 0 8px" }}>Khu vực</Title>

        <Space style={{ marginBottom: 16 }} wrap>
          <Typography.Text>Chọn khu:</Typography.Text>
          <Select
            style={{ minWidth: 260 }}
            value={kvId ?? undefined}
            onChange={setKvId}
            options={(menu || []).map((x) => ({
              label: `${x.ten} - Sức chứa: ${x.suc_chua ?? "N/A"} (${x.so_tro_open ?? 0} OPEN)`,
              value: x.id,
            }))}
          />
          {isAdmin && (
            <Space>
              <Button type="primary" onClick={onAddKV}>Thêm khu</Button>
              <Button onClick={onEditKV} disabled={!kvId}>Sửa khu</Button>
              <Popconfirm
                title="Xoá khu vực này?"
                onConfirm={onDeleteKV}
                okText="Xoá"
                cancelText="Huỷ"
              >
                <Button danger disabled={!kvId}>Xoá khu</Button>
              </Popconfirm>
              <Button onClick={onAddGame} disabled={!kvId}>Thêm trò</Button>
            </Space>
          )}
        </Space>

        {/* Thông tin khu */}
        {kvId && (() => {
          const kv = menu.find((m) => m.id === kvId);
          if (!kv) return null;
          return (
            <div style={{ marginBottom: 20 }}>
              <Text strong>Mô tả:</Text>{" "}
              <Text>{kv.mo_ta || "Chưa có mô tả"}</Text>
              <br />
              <Text strong>Sức chứa:</Text>{" "}
              <Text>{kv.suc_chua ?? "Không rõ"}</Text>
            </div>
          );
        })()}

        {!games.length ? (
          <Empty description="Không có trò chơi" />
        ) : (
          <div style={ST.grid}>
            {games.map((g) => {
              const tone = statusTone(g.trang_thai);
              return (
                <Card
                  key={g.id}
                  loading={loading}
                  className="game-card"
                  bordered={false}
                  bodyStyle={{ padding: 14 }}
                  onClick={() => apiClickGame(g.id).catch(() => {})}
                  cover={
                    <div style={ST.coverWrap}>
                      {g.anh_cover && (
                        <img
                          className="game-cover"
                          src={g.anh_cover}
                          alt={g.ten}
                          style={ST.coverImg}
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      )}
                      <div style={{ ...ST.ribbon, background: tone.bg, color: tone.text }}>
                        {String(g.trang_thai || "OPEN").toUpperCase()}
                      </div>
                      <div style={ST.price}>{fmtVnd(g.gia_mac_dinh)}</div>
                    </div>
                  }
                  title={<div className="game-title">{g.ten}</div>}
                  extra={
                    (isAdmin || isStaff) ? (
                      <Space onClick={(e) => e.stopPropagation()}>
                        {isStaff && <StatusControl game={g} />}
                        {isAdmin && (
                          <>
                            <Button size="small" onClick={() => onEditGame(g)}>Sửa</Button>
                            <Popconfirm title="Xoá trò chơi này?" onConfirm={() => onDeleteGame(g)}>
                              <Button size="small" danger>Xoá</Button>
                            </Popconfirm>
                          </>
                        )}
                      </Space>
                    ) : null
                  }
                >
                  <div className="game-sub">{g.khu_vuc_ten}</div>

                  <div style={ST.chips}>
                    {g.the_loai && <span style={ST.chip}>Thể loại: {g.the_loai}</span>}
                    {g.tuoi_khuyen_nghi && <span style={ST.chip}>Tuổi: {g.tuoi_khuyen_nghi}+</span>}
                    <span style={ST.chipPink}>Giá: {fmtVnd(g.gia_mac_dinh)}</span>
                  </div>

                  <div style={ST.foot}>
                    <Space>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetailModal(g);
                        }}
                      >
                        Chi tiết
                      </Button>

                      {isCustomer && g.trang_thai === "OPEN" && (
                        <Button
                          type="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            openBooking(g);
                          }}
                        >
                          Đặt vé trò chơi
                        </Button>
                      )}
                    </Space>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal khu vực */}
      <Modal
        open={openKV}
        onCancel={() => setOpenKV(false)}
        onOk={submitKV}
        title={kvEditing ? "Sửa khu vực" : "Thêm khu vực"}
      >
        <Form form={kvForm} layout="vertical">
          <Form.Item
            name="ten"
            label="Tên khu"
            rules={[{ required: true, message: "Nhập tên khu" }]}
          >
            <Input placeholder="Ví dụ: Nhà lớn" />
          </Form.Item>
          <Form.Item name="suc_chua" label="Sức chứa">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="mo_ta" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả khu vực..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal trò chơi */}
      <Modal
        open={openGame}
        onCancel={() => setOpenGame(false)}
        onOk={submitGame}
        title={gameEditing ? "Sửa trò chơi" : "Thêm trò chơi"}
      >
        <Form form={gameForm} layout="vertical">
          <Form.Item name="ten" label="Tên trò chơi" rules={[{ required: true }]}>
            <Input placeholder="Đua xe, Bắn súng..." />
          </Form.Item>

          <Form.Item name="khu_vuc_id" label="Khu vực" rules={[{ required: true }]}>
            <Select options={(menu || []).map((x) => ({ label: x.ten, value: x.id }))} />
          </Form.Item>

          <Form.Item name="the_loai" label="Thể loại">
            <Input placeholder="Mạo hiểm, Giải trí..." />
          </Form.Item>

          <Form.Item name="tuoi_khuyen_nghi" label="Tuổi khuyến nghị">
            <InputNumber min={1} max={99} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            name="gia_mac_dinh"
            label="Giá mặc định"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item name="trang_thai" label="Trạng thái" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "OPEN", value: "OPEN" },
                { label: "MAINTENANCE", value: "MAINTENANCE" },
                { label: "CLOSED", value: "CLOSED" },
              ]}
            />
          </Form.Item>

          <Form.Item name="anh_cover" label="Ảnh bìa (URL)">
            <Input placeholder="https://.../cover.jpg" />
          </Form.Item>
          <Form.Item name="anh_ct_1" label="Ảnh chi tiết 1 (URL)">
            <Input placeholder="https://.../detail1.jpg" />
          </Form.Item>
          <Form.Item name="anh_ct_2" label="Ảnh chi tiết 2 (URL)">
            <Input placeholder="https://.../detail2.jpg" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal chi tiết ảnh */}
      <Modal
        open={openDetail}
        onCancel={() => setOpenDetail(false)}
        footer={null}
        title={`Chi tiết hình ảnh - ${detailGame?.ten || ""}`}
        width={900}
      >
        {(detailGame?.anh_ct_1 || detailGame?.anh_ct_2) ? (
          <Image.PreviewGroup>
            <Space wrap>
              {detailGame?.anh_ct_1 && (
                <Image src={detailGame.anh_ct_1} alt="Ảnh chi tiết 1" width={400} style={{ objectFit: "cover" }} />
              )}
              {detailGame?.anh_ct_2 && (
                <Image src={detailGame.anh_ct_2} alt="Ảnh chi tiết 2" width={400} style={{ objectFit: "cover" }} />
              )}
            </Space>
          </Image.PreviewGroup>
        ) : (
          <Empty description="Chưa có ảnh chi tiết" />
        )}
      </Modal>

      {/* Modal đặt vé trò chơi */}
      <Modal
        open={openTicket}
        title={`Đặt vé trò chơi - ${selectedGame?.ten || ""}`}
        onCancel={() => setOpenTicket(false)}
        onOk={submitTicket}
        okText="Đặt vé"
      >
        <Form form={ticketForm} layout="vertical" onValuesChange={onTicketValuesChange}>
          <Form.Item
            name="so_luong"
            label="Số lượng vé"
            rules={[{ required: true, message: "Nhập số lượng vé" }]}
          >
            <InputNumber min={1} max={50} style={{ width: "100%" }} />
          </Form.Item>

          {promoList.length > 0 && (
            <Form.Item label="Chọn khuyến mãi">
              <Select
                loading={promoLoading}
                value={promoId ?? undefined}
                onChange={setPromoId}
                options={promoList.map((p) => ({
                  value: p.id,
                  label: `${p.ten} (Giảm ${p.rate}%)`,
                }))}
              />
            </Form.Item>
          )}

          <Form.Item shouldUpdate noStyle>
            {() => {
              const qty = Number(ticketForm.getFieldValue("so_luong") || 0);
              const price = Number(selectedGame?.gia_mac_dinh || 0);
              const amount = qty * price;

              const rate = Number(kmPreview?.discount_rate || 0);
              const off = Number(kmPreview?.discount_amount || 0);
              const final = Number(rate > 0 ? kmPreview?.final_total ?? amount : amount);
              const promoName = kmPreview?.promo?.ten || "";

              if (kmLoading) {
                return (
                  <div style={{ marginTop: 6 }}>
                    <Spin size="small" /> <Text type="secondary">Đang tính khuyến mãi…</Text>
                  </div>
                );
              }

              if (rate > 0) {
                return (
                  <div
                    style={{
                      border: "1px solid #b7eb8f",
                      background: "#f6ffed",
                      padding: 12,
                      borderRadius: 6,
                      color: "#389e0d",
                      marginTop: 6,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      🎉 Khuyến mãi: <span style={{ textDecoration: "underline" }}>{promoName}</span>
                    </div>
                    <div>Tạm tính: {amount.toLocaleString("vi-VN")} đ</div>
                    <div>Giảm: {off.toLocaleString("vi-VN")} đ ({rate}%)</div>
                    <div style={{ fontWeight: 700, color: "#cf1322", marginTop: 4 }}>
                      Còn lại: {final.toLocaleString("vi-VN")} đ
                    </div>
                  </div>
                );
              }

              return (
                <Space direction="vertical" size={2}>
                  <Text type="secondary">Giá vé: {price.toLocaleString("vi-VN")} đ</Text>
                  <Text strong>Tạm tính: {amount.toLocaleString("vi-VN")} đ</Text>
                </Space>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
