import { useEffect, useMemo, useState } from "react";
import { Card, Table, Typography, Tag, Spin } from "antd";
import { CrownFilled } from "@ant-design/icons";
import { apiFetch } from "../lib/api";
import "./leaderboard.css";

const { Title, Text } = Typography;

const tierColor = (code) => {
  switch (code) {
    case "DIAMOND": return "cyan";
    case "GOLD": return "gold";
    case "SILVER": return "#bfbfbf";
    default: return "default";
  }
};

function AvatarCircle({ name, rank }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div className={`avc avc--${rank}`}>
      <span>{initials || "?"}</span>
    </div>
  );
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/leaderboard/weekly")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const others = useMemo(() => rows.slice(3), [rows]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div className="lb-wrap">
      <Title level={3} style={{ marginBottom: 4 }}>
        🏆 Bảng xếp hạng (toàn thời gian)
      </Title>
      <Text type="secondary">
        Ưu tiên <b>điểm cao</b>; nếu bằng điểm thì xếp theo <b>tổng số vé TRÒ CHƠI đã thanh toán</b>.<br />
        Hạng thành viên: <b>Bạc (≥100)</b> • <b>Vàng (≥500)</b> • <b>Kim cương (≥1000)</b>.
      </Text>

      {/* ==== PODIUM ==== */}
      {top3.length > 0 && (
        <div className="pod">
          {/* Rank 2 */}
          {top3[1] && (
            <div className="pod__col pod__col--2">
              <div className="pod__card pod__card--2">
                <div className="pod__ribbon">Hạng 2</div>
                <AvatarCircle name={top3[1].ten_hien_thi} rank={2} />
                <div className="pod__name">{top3[1].ten_hien_thi}</div>
                <div className="pod__score">{top3[1].diem?.toLocaleString("vi-VN")} điểm</div>
                <Tag color={tierColor(top3[1].tier_code)}>{top3[1].tier_label}</Tag>
                <div className="pod__badge">#2</div>
              </div>
              <div className="pod__base pod__base--2">2</div>
            </div>
          )}

          {/* Rank 1 */}
          {top3[0] && (
            <div className="pod__col pod__col--1">
              <div className="pod__crown"><CrownFilled /></div>
              <div className="pod__card pod__card--1">
                <div className="pod__ribbon gold">Quán quân</div>
                <AvatarCircle name={top3[0].ten_hien_thi} rank={1} />
                <div className="pod__name">{top3[0].ten_hien_thi}</div>
                <div className="pod__score">{top3[0].diem?.toLocaleString("vi-VN")} điểm</div>
                <Tag color={tierColor(top3[0].tier_code)}>{top3[0].tier_label}</Tag>
                <div className="pod__badge">#1</div>
              </div>
              <div className="pod__base pod__base--1">1</div>
            </div>
          )}

          {/* Rank 3 */}
          {top3[2] && (
            <div className="pod__col pod__col--3">
              <div className="pod__card pod__card--3">
                <div className="pod__ribbon bronze">Hạng 3</div>
                <AvatarCircle name={top3[2].ten_hien_thi} rank={3} />
                <div className="pod__name">{top3[2].ten_hien_thi}</div>
                <div className="pod__score">{top3[2].diem?.toLocaleString("vi-VN")} điểm</div>
                <Tag color={tierColor(top3[2].tier_code)}>{top3[2].tier_label}</Tag>
                <div className="pod__badge">#3</div>
              </div>
              <div className="pod__base pod__base--3">3</div>
            </div>
          )}
        </div>
      )}

      {/* ==== BẢNG CHI TIẾT ==== */}
      <Card className="lb-card">
        <Table
          rowKey={(r) => r.user_id}
          dataSource={others.length ? others : rows}
          columns={[
            { title: "Hạng", render: (_, __, idx) => (others.length ? idx + 4 : idx + 1), width: 80 },
            { title: "Người chơi", dataIndex: "ten_hien_thi" },
            {
              title: "Điểm",
              dataIndex: "diem",
              align: "right",
              width: 120,
              render: (v) => <strong>{v}</strong>,
            },
            {
              title: "Hạng thành viên",
              dataIndex: "tier_label",
              width: 170,
              render: (_, r) => <Tag color={tierColor(r.tier_code)}>{r.tier_label}</Tag>,
            },
            {
              title: "Lượt chơi (tổng)",
              dataIndex: "so_luot_choi",
              align: "right",
              width: 160,
              render: (v) => <Tag>{v}</Tag>,
            },
          ]}
          pagination={false}
        />
      </Card>
    </div>
  );
}
