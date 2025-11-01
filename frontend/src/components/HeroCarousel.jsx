import { Button } from "antd";

export default function HeroCarousel() {
  // Bạn có thể thay 3 ảnh trong /public/hero/ (xem bên dưới)
  const banners = [
    { src: "/hero/monet-1.jpg", title: "CLAUDE MONET – Art lighting experience", tag: "Triển lãm tương tác đa giác quan", offer: "BUY 1 GET 1 • Mua 1 Tặng 1" },
    { src: "/hero/monet-2.jpg", title: "Light City – Thế giới Ánh sáng", tag: "Check-in – Sống ảo – Thư giãn", offer: "Combo cuối tuần siêu hời" },
    { src: "/hero/monet-3.jpg", title: "Jazzy Paradise – Trải nghiệm cho mọi lứa tuổi", tag: "Sự kiện mới mỗi tuần", offer: "Ưu đãi thành viên" },
  ];

  return (
    <div className="hero">
      <div className="hero__badge"><span className="dot" /> Trung Tâm Giải Trí</div>
      <h1 className="hero__title">
        Thế giới trò chơi, sự kiện và niềm vui cho mọi lứa tuổi <span className="spark">✨</span>
      </h1>
      <p className="hero__subtitle">
        Hệ thống giải trí đa dạng – đặt vé nhanh chóng, cập nhật sự kiện tức thì.
      </p>
      <div className="hero__actions">
        <Button type="primary" size="large" className="btn btn--primary">Khám phá ngay</Button>
        <a className="btn btn--ghost" href="/events">Xem sự kiện</a>
      </div>

      {/* Banner */}
      <div style={{marginTop:24, borderRadius:16, overflow:"hidden", border:"1px solid rgba(255,255,255,.08)"}}>
        <div className="hero__slider">
          {banners.map((b, i) => (
            <div key={i} className="hero__slide" style={{backgroundImage:`url('${b.src}')`}}>
              <div className="hero__overlay" />
              <div className="hero__caption">
                <div className="hero__tag">{b.tag}</div>
                <div className="hero__big">{b.title}</div>
                <div className="hero__offer">{b.offer}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="hero__stats">
        <div><span className="stat__num">25+</span><span className="stat__label">Trò chơi</span></div>
        <div><span className="stat__num">12</span><span className="stat__label">Sự kiện/tháng</span></div>
        <div><span className="stat__num">4.9</span><span className="stat__label">Đánh giá</span></div>
      </div>
    </div>
  );
}
