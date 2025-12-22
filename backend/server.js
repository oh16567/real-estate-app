// backend/server.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const http = require('http');
const app = express();

// 기본 보안 헤더
// helmet CSP: 구글 드라이브 썸네일 허용
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // 기본은 헬멧 기본값 유지
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        // 구글 드라이브/썸네일 도메인 허용
        "https://drive.google.com",
        "https://*.googleusercontent.com",
        "https://lh3.googleusercontent.com",
        "https://*.ggpht.com",
        "https://*.googleapis.com",
        "https://*.google.com"
      ],
      // 프록시 캐시 쿼리스트링(예: ?v=...) 허용은 기본으로 문제 없음
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// CSP: 구글 이미지 허용 (helmet v6/v7 표준 API)
app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      "img-src": ["'self'", "data:", "blob:", "https://*.google.com", "https://*.googleusercontent.com"],
    },
  })
);

// HTTP server 객체 생성 후 타임아웃 설정
const server = http.createServer(app);
server.requestTimeout = 0;      // 무제한
server.headersTimeout = 65000;  // 65s
server.keepAliveTimeout = 65000;

// ---- core deps
const pool = require("./config/db");

// ---- routers (팩토리/일반 혼재)
const uploadsRouter = require("./routes/uploads");              // optional
const configRouterFactory = require("./routes/config");         // factory(pool)
const regionsRouterFactory = require("./routes/regions");       // factory(pool)
const propertiesRouterFactory = require("./routes/properties"); // factory(pool)
const photoStorageRouter = require("./routes/photo-storage");   // router(일반)
const subwayRouter = require("./routes/subway");                // ★ 지하철
// const buildingInfoRouter = require("./routes/buildingInfo");   // ★ 건물정보
const buildingInfoRouter = require("./building-info");

// ---- middleware
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- static for uploads (API보다 먼저여도 무방)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/static/thumbs",
  express.static(path.join(__dirname, "uploads", "thumbs"), {
    etag: false,
    lastModified: false,
    cacheControl: true,
    maxAge: 0,
    setHeaders: (res) => {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    },
  })
); // prop_..._thumb.jpg 서빙

// ---- API routes FIRST
// factories
if (typeof configRouterFactory === "function") app.use("/api/config", configRouterFactory(pool));
if (typeof regionsRouterFactory === "function") app.use("/api/regions", regionsRouterFactory(pool));
if (typeof propertiesRouterFactory === "function") app.use("/api/properties", propertiesRouterFactory(pool));

// plain routers
if (photoStorageRouter) app.use("/api/photo-storage", photoStorageRouter);
if (uploadsRouter) app.use("/api/uploads", uploadsRouter);
if (subwayRouter) app.use("/api/subway", subwayRouter);
app.use("/api/building-info", buildingInfoRouter);

// simple config helpers
app.get("/api/photo-storage", (_req, res) => {
  res.json({ ok: true, storage: process.env.PHOTO_STORAGE || "server" });
});

app.get("/api/properties/photo-storage", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT `value` FROM app_config WHERE `key`='PHOTO_STORAGE'");
    res.json({ ok: true, storage: rows?.[0]?.value || process.env.PHOTO_STORAGE || "server" });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.put("/api/properties/photo-storage", async (req, res) => {
  try {
    const storage = req.body?.storage;
    if (!storage) return res.status(400).json({ ok: false, error: "storage required" });
    await pool.query(
      "INSERT INTO app_config(`key`,`value`) VALUES('PHOTO_STORAGE',?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)",
      [String(storage)]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// health
app.get("/api/health", (_req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json({ ok: true, now: new Date().toISOString() });
});

// optional public images
app.use(
  "/images",
  express.static(path.resolve(__dirname, "../frontend/public/images"), { fallthrough: false })
);

// ---- SPA static AFTER APIs
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- boot
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`[BOOT] Server running on http://${HOST}:${PORT}`);
});

app.use((req,res,next)=>{
  if (req.url.startsWith("/api/properties/") && req.method !== "GET") {
    console.log("[pre] %s %s ct=%s", req.method, req.url, req.headers["content-type"]);
  }
  next();
});