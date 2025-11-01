import { Card, Row, Col, Button } from "antd";
import { useNavigate } from "react-router-dom";
import { CheckCircleOutlined, TeamOutlined } from "@ant-design/icons";

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px" }}>
      <h2 style={{ marginBottom: 20 }}>Bảng điều khiển quản trị</h2>
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12}>
          <Card
            title="Quản trị người dùng"
            bordered={false}
            actions={[
              <Button
                key="1"
                type="primary"
                icon={<TeamOutlined />}
                onClick={() => navigate("/admin/users")}
              >
                Mở trang quản lý
              </Button>,
            ]}
          >
            <p>Xem, phân quyền, tạo hồ sơ và reset mật khẩu cho tài khoản.</p>
          </Card>
        </Col>

        <Col xs={24} sm={12}>
          <Card
            title="Duyệt thanh toán vé"
            bordered={false}
            actions={[
              <Button
                key="2"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => navigate("/admin/tickets")}
              >
                Mở trang duyệt vé
              </Button>,
            ]}
          >
            <p>Xem danh sách vé chờ duyệt, xác nhận thanh toán hoặc trả về.</p>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
