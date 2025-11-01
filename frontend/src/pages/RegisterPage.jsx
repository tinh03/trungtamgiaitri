import { useState } from "react";
import { Button, Card, Form, Input, Typography, Alert, message } from "antd";
import { useNavigate } from "react-router-dom";
import { apiRegister } from "../lib/api";

const { Title } = Typography;

export default function RegisterPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [unknownErr, setUnknownErr] = useState("");
  const navigate = useNavigate();

  async function onFinish(values) {
    setUnknownErr("");
    try {
      setLoading(true);
      await apiRegister({
        username: values.username.trim(),
        password: values.password,
        confirm_password: values.confirm_password, // BE có thể dùng hoặc bỏ qua
        email: values.email.trim(),
        sdt: values.sdt.trim(),
      });
      message.success("Đăng ký thành công! Vui lòng đăng nhập.");
      navigate("/login");
    } catch (e) {
      // 1) Nếu BE trả dạng { detail: { field, message } } -> gắn vào đúng ô
      const detailObj = e?.response?.data?.detail;
      if (detailObj?.field && detailObj?.message) {
        form.setFields([{ name: detailObj.field, errors: [detailObj.message] }]);
        return;
      }

      // 2) Nếu BE trả danh sách lỗi Pydantic (list)
      const list = Array.isArray(e?.response?.data?.detail)
        ? e.response.data.detail
        : null;
      if (list?.length) {
        // map lỗi đầu tiên vào ô tương ứng
        const first = list[0];
        const loc = first?.loc || [];
        const field = loc[loc.length - 1]; // vd: 'sdt'
        const msg = first?.msg || "Dữ liệu không hợp lệ.";
        if (field) {
          form.setFields([{ name: field, errors: [msg] }]);
          return;
        }
      }

      // 3) Nếu BE trả chuỗi (ví dụ auth.py hiện tại)
      const msgStr =
        e?.response?.data?.detail || e?.message || "Đăng ký thất bại.";
      // đoán field phổ biến để gắn đúng ô
      if (/tồn tại|username/i.test(msgStr)) {
        form.setFields([{ name: "username", errors: [msgStr] }]);
      } else if (/email/i.test(msgStr)) {
        form.setFields([{ name: "email", errors: [msgStr] }]);
      } else if (/điện thoại|phone|sdt/i.test(msgStr)) {
        form.setFields([{ name: "sdt", errors: [msgStr] }]);
      } else if (/xác nhận|khớp|confirm/i.test(msgStr)) {
        form.setFields([{ name: "confirm_password", errors: [msgStr] }]);
      } else if (/password|mật khẩu/i.test(msgStr)) {
        form.setFields([{ name: "password", errors: [msgStr] }]);
      } else {
        setUnknownErr(msgStr);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "24px auto" }}>
      <Card>
        <Title level={3}>Đăng ký</Title>

        {unknownErr ? (
          <Alert type="error" message={unknownErr} style={{ marginBottom: 12 }} />
        ) : null}

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            label="Tài khoản"
            rules={[
              { required: true, message: "Vui lòng nhập tài khoản" },
              { min: 3, message: "Tối thiểu 3 ký tự" },
              { max: 50, message: "Tối đa 50 ký tự" },
            ]}
          >
            <Input placeholder="vd: nguyenvanA" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật khẩu"
            hasFeedback
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu" },
              { min: 6, message: "Tối thiểu 6 ký tự" },
              { max: 100, message: "Tối đa 100 ký tự" },
            ]}
          >
            <Input.Password placeholder="••••••" />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="Xác nhận mật khẩu"
            dependencies={["password"]}
            hasFeedback
            rules={[
              { required: true, message: "Vui lòng nhập xác nhận mật khẩu" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error("Mật khẩu xác nhận không khớp")
                  );
                },
              }),
            ]}
          >
            <Input.Password placeholder="Nhập lại mật khẩu" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Vui lòng nhập email" },
              { type: "email", message: "Email không hợp lệ" },
            ]}
          >
            <Input placeholder="you@example.com" />
          </Form.Item>

          <Form.Item
            name="sdt"
            label="Số điện thoại"
            rules={[
              { required: true, message: "Vui lòng nhập số điện thoại" },
              { min: 8, message: "Ít nhất 8 ký tự" }, // khớp BE
              { max: 20, message: "Tối đa 20 ký tự" },
              {
                pattern: /^[0-9()+\-\s]+$/,
                message: "Chỉ cho phép số và ký tự (+) (-) khoảng trắng",
              },
            ]}
          >
            <Input placeholder="vd: 0987654321" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block>
            Tạo tài khoản
          </Button>
        </Form>
      </Card>
    </div>
  );
}
