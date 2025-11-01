import { Link } from "react-router-dom";
import { Carousel } from "antd";
import "./home.css";

export default function HomePage() {
  const heroImages = [
    "/hero/trienlamm.jpg",
    "/hero/ngayhoi.jpg",
    "/hero/home.jpg",
  ];

  return (
    <main className="home">
      {/* ==== HERO full-screen slideshow ==== */}
      <section className="hero hero--fullscreen">
        <div className="hero__bg">
          <Carousel
            autoplay
            effect="fade"
            dots={false}
            autoplaySpeed={5000}
            speed={800}
            pauseOnHover={false}
            draggable
          >
            {heroImages.map((src) => (
              <div key={src} className="hero__slide">
                <img src={src} alt="banner" />
              </div>
            ))}
          </Carousel>
          {/* overlay mờ nhẹ để chữ nổi */}
          <div className="hero__overlay" />
        </div>

        {/* nội dung hero */}
        <div className="hero__content">
          <div className="hero__badge"><span className="dot" /> Trung Tâm Giải Trí</div>
          <h1 className="hero__title">
            Thế giới trò chơi, sự kiện và niềm vui cho mọi lứa tuổi <span className="spark">✨</span>
          </h1>
          <p className="hero__subtitle">
            Hệ thống giải trí đa năng – đặt vé nhanh chóng, cập nhật sự kiện tức thì.
          </p>

          <div className="hero__actions">
            <Link to="/events" className="btn btn--primary">Khám phá ngay</Link>
            <Link to="/areas" className="btn btn--ghost">Xem khu vực</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        © {new Date().getFullYear()} Trung Tâm Giải Trí · Made with ❤️
      </footer>
    </main>
  );
}
