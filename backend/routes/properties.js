const express = require("express");
const router = express.Router();

function parseBoolY(v){ return (v === "y" || v === "Y" || v === true || v === "true"); }

module.exports = (pool) => {
  router.get("/", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const rawSize = String(req.query.pageSize || "20");
      const unlimited = rawSize.toLowerCase() === "all";
      const pageSize = unlimited ? null : Math.max(1, parseInt(rawSize, 10) || 20);

      const where = [];
      const args = [];
      const today = new Date();
      const six = new Date(); six.setMonth(today.getMonth() - 6);
      const toISO = d => d.toISOString().slice(0,10);

      const updateFrom = req.query.update_date_from || toISO(six);
      const updateTo   = req.query.update_date_to   || toISO(today);

// 이후 SQL where에 반영: update_date BETWEEN updateFrom AND updateTo
      // ★ 추가: 수정일을 기본(6개월)로 강제 적용
      where.push("DATE(update_date) BETWEEN ? AND ?");
      args.push(updateFrom, updateTo);


      if (req.query.register_date_from) { where.push("register_date >= ?"); args.push(req.query.register_date_from); }
      if (req.query.register_date_to)   { where.push("register_date <= ?"); args.push(req.query.register_date_to); }
      if (req.query.update_date_from)   { where.push("update_date >= ?"); args.push(req.query.update_date_from); }
      if (req.query.update_date_to)     { where.push("update_date <= ?"); args.push(req.query.update_date_to); }

      if (req.query.estate_type) {
        const list = String(req.query.estate_type).split(",").filter(Boolean);
        if (list.length){ where.push(`estate_type IN (${list.map(()=>"?").join(",")})`); args.push(...list); }
      }
      if (req.query.bld_type) {
        const list = String(req.query.bld_type).split(",").filter(Boolean);
        if (list.length){ where.push(`bld_type IN (${list.map(()=>"?").join(",")})`); args.push(...list); }
      }

      // ★ 교체: 거래유형을 OR 조건으로 묶기
      const rentOrs = [];
      if (parseBoolY(req.query.rent_type_4deal))   rentOrs.push("rent_type_4deal = 'y'");   // 매매
      if (parseBoolY(req.query.rent_type_1year))   rentOrs.push("rent_type_1year = 'y'");   // 전세
      if (parseBoolY(req.query.rent_type_2month))  rentOrs.push("rent_type_2month = 'y'");  // 월세
      if (parseBoolY(req.query.rent_type_3short))  rentOrs.push("rent_type_3short = 'y'");  // 단기
      // 분양을 쓰지 않는다면 아래 줄은 지워도 됩니다
      if (parseBoolY(req.query.rent_type_5sale))   rentOrs.push("rent_type_5sale = 'y'");   // 분양
      if (parseBoolY(req.query.rent_type_6auction))rentOrs.push("rent_type_6auction = 'y'"); // 경매

      if (rentOrs.length) {
        where.push("(" + rentOrs.join(" OR ") + ")");
      }

      if (req.query.q) {
        const like = `%${req.query.q}%`;
        const cols = [
          "jibunAddress","roadAddress","estate_name","register_memo",
          "contact_name1","contact_name2","contact_name3","contact_name4","contact_name5",
          "contact_phone1","contact_phone2","contact_phone3","contact_phone4","contact_phone5"
        ];
        where.push("(" + cols.map(c => `${c} LIKE ?`).join(" OR ") + ")");
        for (let i=0;i<cols.length;i++) args.push(like);
      }

      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

      const [cntRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM estate ${whereSql}`, args);
      const total = cntRows[0]?.cnt || 0;

      let sql = `
        SELECT
          estate_no, estate_name, estate_dong, estate_ho,
          estate_type, bld_type,                -- ★ 추가
          floor_etc, floor_type1, floor_type2,  -- ★ 추가
          map_x, map_y,
          rent_type_4deal, rent_type_1year, rent_type_2month, rent_type_3short, rent_type_5sale, rent_type_6auction,
          price_sale, fee_year, fee_month,
          dong, jibun, roadAddress
        FROM estate
        ${whereSql}
        ORDER BY estate_no DESC
      `;
      
      const rowsArgs = [...args];
      if (!unlimited) {
        sql += " LIMIT ? OFFSET ?";
        rowsArgs.push(pageSize, (page - 1) * pageSize);
      }
      const [rows] = await pool.query(sql, rowsArgs);

      // 숫자에 콤마 찍기 (null/undefined 안전)
function fmt(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString("ko-KR");
}

const items = rows.map(r => {
  const title = [r.estate_name || "", r.estate_dong || "", r.estate_ho || ""].filter(Boolean).join(" ");

  const parts = [];

  // 매매: price_sale 사용
  if (r.rent_type_4deal === "y") {
    const sale = fmt(r.price_sale);
    parts.push(`매매${sale ? ` ${sale}` : ""}`);
  }

  // 전세: 보증금 fee_year 사용
  if (r.rent_type_1year === "y") {
    const depo = fmt(r.fee_year);
    parts.push(`전세${depo ? ` ${depo}` : ""}`);
  }

  // 월세: 보증금/월세  (fee_year / fee_month)
  if (r.rent_type_2month === "y") {
    const depo = fmt(r.fee_year);
    const monthly = fmt(r.fee_month);
    // 둘 다 있으면 "보증금/월" 형식, 하나만 있으면 있는 값만
    let label = "월세";
    if (depo && monthly) label += ` ${depo}/${monthly}`;
    else if (depo) label += ` ${depo}`;
    else if (monthly) label += ` ${monthly}`;
    parts.push(label);
  }

  // 단기: 보증금/월 (현재 스키마상 같은 필드 사용)
  if (r.rent_type_3short === "y") {
    const depo = fmt(r.fee_year);
    const monthly = fmt(r.fee_month);
    let label = "단기";
    if (depo && monthly) label += ` ${depo}/${monthly}`;
    else if (depo) label += ` ${depo}`;
    else if (monthly) label += ` ${monthly}`;
    parts.push(label);
  }

  // 경매: 금액 정보가 따로 없으면 라벨만
  if (r.rent_type_6auction === "y") {
    // 필요하면 경매금액 필드를 추가로 붙여주세요.
    parts.push("경매");
  }

  // ※ 분양을 표기하고 싶으면 아래 주석 해제
  // if (r.rent_type_5sale === "y") {
  //   parts.push("분양");
  // }

return {
  estate_no: r.estate_no,
  id: r.estate_no,
  title: r.estate_name || "",  // 건물명을 기본 제목으로
  lat: Number(r.map_y),
  lng: Number(r.map_x),
  price: parts.join(" · "),
  dong: r.dong || "",
  jibun: r.jibun || "",
  roadAddress: r.roadAddress || "",
  estate_type: r.estate_type,
  estate_name: r.estate_name,
  estate_dong: r.estate_dong,
  estate_ho: r.estate_ho,
  floor_etc: r.floor_etc,
  floor_type1: r.floor_type1,
  floor_type2: r.floor_type2,
};

});


      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.json({ items, total, page });
    } catch (e) {
      console.error("[/api/properties] error:", e);
      res.status(500).json({ error: "failed" });
    }
  });

  return router;
};
