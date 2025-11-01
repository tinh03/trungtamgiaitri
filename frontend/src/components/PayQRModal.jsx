// src/components/PayQRModal.jsx
import { Modal, Typography, Input, Button, Space } from "antd";
import { CopyOutlined } from "@ant-design/icons";

const { Text, Title } = Typography;

export default function PayQRModal({ open, onClose, eventName, amount, ticketId, onConfirm }) {
  const desc = `TQTT-VE-${ticketId}`;
  const amountText = new Intl.NumberFormat("vi-VN").format(amount || 0) + " đ";

  const copy = (text) => navigator.clipboard.writeText(text);

  return (
    <Modal open={open} footer={null} onCancel={onClose} width={660}>
      <Title level={4} style={{ textAlign: "center" }}>{eventName}</Title>
      <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
        <img
          src="/qr.png"
          alt="QR"
          style={{ width: 260, height: 260, borderRadius: 8, objectFit: "cover" }}
        />
      </div>

      <Title level={4} style={{ textAlign: "center", marginTop: 8 }}>
        {amountText}
      </Title>

      <div style={{ marginTop: 16 }}>
        <Text strong>Nội dung chuyển khoản</Text>
        <Space.Compact style={{ width: "100%", marginTop: 6 }}>
          <Input value={desc} readOnly />
          <Button icon={<CopyOutlined />} onClick={() => copy(desc)}>Copy</Button>
        </Space.Compact>
      </div>

      <div style={{ marginTop: 12 }}>
        <Text strong>Số tiền</Text>
        <Space.Compact style={{ width: "100%", marginTop: 6 }}>
          <Input value={amountText} readOnly />
          <Button icon={<CopyOutlined />} onClick={() => copy(String(amount || 0))}>Copy</Button>
        </Space.Compact>
      </div>

      <div style={{ marginTop: 16, color: "#555" }}>
        Quét QR bằng app ngân hàng/Momo/ZaloPay của bạn. Sau đó bấm{" "}
        <Text strong>“Tôi đã thanh toán”</Text>.
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button onClick={onClose}>Đóng</Button>
        <Button type="primary" onClick={onConfirm}>
          Tôi đã thanh toán
        </Button>
      </div>
    </Modal>
  );
}
