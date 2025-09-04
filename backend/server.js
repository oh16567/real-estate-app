require("dotenv").config();   // ← 이 줄을 server.js 최상단에 추가
const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- MySQL Pool ----
const pool = mysql.createPool({
  host: "localhost",
  user: "33090489",
  password: "Oh01046811253!",
  database: "f5",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ---- Mount routers (defensive) BEFORE static ----
function mountRouterSafely(name, factory, basePath){
  if (!factory) {
    console.error(`[BOOT] ${name} factory is undefined. Skipping mount for ${basePath}`);
    return;
  }
  if (typeof factory !== "function") {
    console.error(`[BOOT] ${name} factory is not a function (type=${typeof factory}). Skipping mount for ${basePath}`);
    return;
  }
  try {
    const router = factory(pool);
    app.use(basePath, router);
    console.log(`[BOOT] Mounted ${name} at ${basePath}`);
  } catch (e) {
    console.error(`[BOOT] Failed to mount ${name} at ${basePath}:`, e);
  }
}

// Regions
let regionsFactory;
try { regionsFactory = require("./routes/regions"); }
catch (e) { console.error("[BOOT] require('./routes/regions') failed:", e); }
mountRouterSafely("regions", regionsFactory, "/api/regions");

// Properties
let propertiesFactory;
try { propertiesFactory = require("./routes/properties"); }
catch (e) { console.error("[BOOT] require('./routes/properties') failed:", e); }
mountRouterSafely("properties", propertiesFactory, "/api/properties");

// ---- Health for JSON sanity check ----
app.get("/api/health", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json({ ok: true, now: new Date().toISOString() });
});

// ---- Static AFTER APIs ----
app.use(express.static(path.join(__dirname, "../frontend/build")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[BOOT] Server running on port ${PORT}`);
});
