import { useEffect, useState } from "react";
import { Card, Button, message, Tag, Space, Typography } from "antd";
import { apiGetMyTickets, apiCancelTicket, apiMarkPaidTicket } from "../lib/api";
import PayQRModal from "../components/PayQRModal";
import dayjs from "dayjs";

const { Text } = Typography;

export default function MyTicketsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrInfo, setQrInfo] = useState({ id: null, name: "", amount: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGetMyTickets();
      setRows(data || []);
    } catch (e) {
      message.error(e.message || "Lỗi tải vé");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openPay = (row) => {
    const name = row.su_kien?.ten || row.tro_choi?.ten || "Không xác định";
    setQrInfo({ id: row.id, name, amount: row.tong_tien || 0 });
    setQrOpen(true);
  };

  const markPaid = async () => {
    try {
      await apiMarkPaidTicket(qrInfo.id);
      setQrOpen(false);
      message.success("Đã báo thanh toán, vui lòng chờ duyệt");
      load();
    } catch (e) {
      message.error(e.message || "Không thể báo thanh toán");
    }
  };

  const cancel = async (row) => {
    try {
      await apiCancelTicket(row.id);
      message.success("Đã hủy vé");
      load();
    } catch (e) {
      message.error(e.message || "Không thể hủy vé");
    }
  };

  const renderStatus = (s) => {
    if (s === "PAID") return <Tag color="green">Đã thanh toán</Tag>;
    if (s === "PENDING") return <Tag color="gold">Đang chờ duyệt</Tag>;
    if (s === "CANCELLED") return <Tag color="red">Đã hủy</Tag>;
    return <Tag>Chưa thanh toán</Tag>;
  };

  return (
    <div style={{ maxWidth: 1024, margin: "16px auto", padding: "0 12px" }}>
      <h2>Vé của tôi</h2>

      {rows.length === 0 && !loading && (
        <div style={{ textAlign: "center", color: "#777", marginTop: 40 }}>
          Chưa có vé
        </div>
      )}

      <Space direction="vertical" style={{ width: "100%" }} size={16}>
        {rows.map((r) => {
          const isEvent = !!r.su_kien;
          const isGame = !!r.tro_choi;
          const name = r.su_kien?.ten || r.tro_choi?.ten || "Không xác định";
          const price = isEvent ? r.su_kien?.gia_ve : r.tro_choi?.gia_mac_dinh;
          const timeStr = r.su_kien?.thoi_gian
            ? new Date(r.su_kien.thoi_gian).toLocaleString("vi-VN")
            : null;
          const createdAt = r.created_at
            ? dayjs(r.created_at).format("DD/MM/YYYY HH:mm")
            : "Không rõ";
          const cover = isGame ? r.tro_choi?.anh_cover : null;

          return (
            <Card
              key={r.id}
              cover={
                cover ? (
                  <img
                    src={cover}
                    alt={name}
                    style={{ height: 220, objectFit: "cover" }}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : null
              }
            >
              <div style={{ fontSize: 18, fontWeight: 600 }}>
                {isEvent ? "🎫 Vé sự kiện: " : "🎮 Vé trò chơi: "}
                {name}
              </div>

              <div style={{ marginTop: 8 }}>
                {timeStr && <div>Thời gian: {timeStr}</div>}
                <div>Ngày đặt: <Text strong>{createdAt}</Text></div> {/* ✅ hiển thị ngày đặt */}
                <div>Số lượng: {r.so_luong}</div>
                <div>Giá vé: {new Intl.NumberFormat("vi-VN").format(price || 0)} đ</div>
                <div style={{ fontWeight: 600, marginTop: 4 }}>
                  Tổng tiền: {new Intl.NumberFormat("vi-VN").format(r.tong_tien || 0)} đ
                </div>
                <div style={{ marginTop: 6 }}>
                  Trạng thái: {renderStatus(r.trang_thai)}
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                {r.trang_thai === "BOOKED" && (
                  <Button type="primary" onClick={() => openPay(r)}>
                    Thanh toán
                  </Button>
                )}
                {(r.trang_thai === "BOOKED" || r.trang_thai === "PENDING") && (
                  <Button danger onClick={() => cancel(r)}>
                    Hủy vé
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </Space>

      <PayQRModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        eventName={qrInfo.name}
        amount={qrInfo.amount}
        ticketId={qrInfo.id}
        onConfirm={markPaid}
      />
    </div>
  );
}
