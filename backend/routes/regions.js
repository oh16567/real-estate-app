// routes/regions.js
const express = require("express");
const router = express.Router();
const provider = require("../services/regionsProvider");

// 시/도
router.get("/sido", async (req, res) => {
  try {
    const items = await provider.getSido();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({ items });
  } catch (e) {
    console.error("[/api/regions/sido] error:", e);
    res.status(500).json({ error: "failed" });
  }
});

// 시/군/구
router.get("/sigungu", async (req, res) => {
  const { sido } = req.query;
  if (!sido) return res.status(400).json({ error: "sido required" });
  try {
    const items = await provider.getSigungu(sido);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({ items });
  } catch (e) {
    console.error("[/api/regions/sigungu] error:", e);
    res.status(500).json({ error: "failed" });
  }
});

// ★ POST /api/regions/refresh : 캐시 파일 삭제 API
router.post("/refresh", async (req, res) => { // ★ async 추가
  try {
    const resultMessage = await provider.forceRefresh(); // ★ forceRefresh 함수 호출
    res.json({ ok: true, message: resultMessage }); // ★ 성공 메시지를 그대로 전달
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = (/* pool not needed */) => router;
