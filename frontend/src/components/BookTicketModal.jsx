// src/components/BookTicketModal.jsx
import { useEffect, useState } from "react";
import { Modal, Form, Select, InputNumber, Space, Typography, message } from "antd";
import { apiListOpenEvents, apiBookTicket, apiPromoPreview } from "../lib/api";

const { Text } = Typography;

export default function BookTicketModal({ open, onClose, defaultQty = 1, onBooked }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [calc, setCalc] = useState(null);

  const loadEvents = async () => {
    try {
      const rows = await apiListOpenEvents();
      setEvents(rows || []);
    } catch (e) {
      message.error(e.message || "Không tải được danh sách sự kiện");
    }
  };

  useEffect(() => {
    if (open) {
      loadEvents();
      form.setFieldsValue({ so_luong: defaultQty });
      setCalc(null);
    }
    // eslint-disable-next-line
  }, [open]);

  const values = Form.useWatch([], form) || {};
  useEffect(() => {
    const ev = events.find((x) => x.id === values?.su_kien_id);
    const qty = Number(values?.so_luong || 0);
    if (!ev || !qty) { setCalc(null); return; }

    // preview khuyến mãi (không bắt buộc)
    (async () => {
      try {
        const preview = await apiPromoPreview(ev.gia_ve * qty, ev.id);
        setCalc(preview);
      } catch {
        setCalc({ amount: ev.gia_ve * qty, final_total: ev.gia_ve * qty, discount_rate: 0, discount_amount: 0 });
      }
    })();
  }, [values, events]);

  const onOk = async () => {
    try {
      const v = await form.validateFields();
      setLoading(true);
      const res = await apiBookTicket({ su_kien_id: v.su_kien_id, so_luong: v.so_luong });
      message.success("Đặt vé thành công");
      onClose?.();
      onBooked?.(res);
    } catch (e) {
      if (e?.errorFields) return; // lỗi form
      message.error(e.message || "Không thể đặt vé");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Đặt vé sự kiện"
      onCancel={onClose}
      onOk={onOk}
      okText="Đặt vé"
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="su_kien_id"
          label="Chọn sự kiện"
          rules={[{ required: true, message: "Hãy chọn sự kiện" }]}
        >
          <Select
            placeholder="Chọn sự kiện đang mở bán"
            options={events.map((e) => ({
              value: e.id,
              label: `${e.ten} — ${new Intl.NumberFormat("vi-VN").format(e.gia_ve)} đ`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="so_luong"
          label="Số lượng"
          rules={[{ required: true, message: "Nhập số lượng" }]}
        >
          <InputNumber min={1} max={50} style={{ width: 160 }} />
        </Form.Item>

        {calc && (
          <Space direction="vertical" size={2}>
            <Text type="secondary">
              Tạm tính: {new Intl.NumberFormat("vi-VN").format(calc.amount || 0)} đ
            </Text>
            {calc.discount_rate > 0 && (
              <Text type="secondary">
                Khuyến mãi: −{new Intl.NumberFormat("vi-VN").format(calc.discount_amount || 0)} đ
                {" "}(−{calc.discount_rate}%)
              </Text>
            )}
            <Text strong>
              Tổng thanh toán: {new Intl.NumberFormat("vi-VN").format(calc.final_total || 0)} đ
            </Text>
          </Space>
        )}
      </Form>
    </Modal>
  );
}
