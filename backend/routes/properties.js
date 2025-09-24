// backend/routes/properties.js
const express = require("express");
const router = express.Router();

function parseBoolY(v){ return (v === "y" || v === "Y" || v === true || v === "true"); }

module.exports = (pool) => {
  router.get("/", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const rawSize = String(req.query.pageSize || "20");
      
      // ★ 'all' 요청이 들어오면 페이지네이션을 적용하지 않도록 수정
      const unlimited = rawSize.toLowerCase() === "all";
      const pageSize = unlimited ? null : Math.max(1, parseInt(rawSize, 10) || 20);

      const where = [];
      const args = [];
      const today = new Date();
      const six = new Date(); six.setMonth(today.getMonth() - 6);
      const toISO = d => d.toISOString().slice(0,10);

      const updateFrom = req.query.update_date_from || toISO(six);
      const updateTo   = req.query.update_date_to   || toISO(today);

      where.push("DATE(update_date) BETWEEN ? AND ?");
      args.push(updateFrom, updateTo);

      if (req.query.register_date_from) { where.push("register_date >= ?"); args.push(req.query.register_date_from); }
      if (req.query.register_date_to)   { where.push("register_date <= ?"); args.push(req.query.register_date_to); }
      
      if (req.query.estate_type) {
        const list = String(req.query.estate_type).split(",").filter(Boolean);
        if (list.length){ where.push(`estate_type IN (${list.map(()=>"?").join(",")})`); args.push(...list); }
      }
      if (req.query.bld_type) {
        const list = String(req.query.bld_type).split(",").filter(Boolean);
        if (list.length){ where.push(`bld_type IN (${list.map(()=>"?").join(",")})`); args.push(...list); }
      }

      const rentOrs = [];
      if (parseBoolY(req.query.rent_type_4deal))   rentOrs.push("rent_type_4deal = 'y'");
      if (parseBoolY(req.query.rent_type_1year))   rentOrs.push("rent_type_1year = 'y'");
      if (parseBoolY(req.query.rent_type_2month))  rentOrs.push("rent_type_2month = 'y'");
      if (parseBoolY(req.query.rent_type_3short))  rentOrs.push("rent_type_3short = 'y'");
      if (parseBoolY(req.query.rent_type_5sale))   rentOrs.push("rent_type_5sale = 'y'");
      if (parseBoolY(req.query.rent_type_6auction))rentOrs.push("rent_type_6auction = 'y'");

      if (rentOrs.length) {
        where.push("(" + rentOrs.join(" OR ") + ")");
      }

      if (req.query.q) {
        const like = `%${req.query.q}%`;
        const cols = ["jibunAddress","roadAddress","estate_name","register_memo","contact_name1","contact_name2","contact_name3","contact_name4","contact_name5","contact_phone1","contact_phone2","contact_phone3","contact_phone4","contact_phone5"];
        where.push("(" + cols.map(c => `${c} LIKE ?`).join(" OR ") + ")");
        for (let i=0;i<cols.length;i++) args.push(like);
      }

      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

      const [cntRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM estate ${whereSql}`, args);
      const total = cntRows[0]?.cnt || 0;

      let sql = `
        SELECT
          estate_no, estate_name, estate_dong, estate_ho,
          estate_type, bld_type, floor_etc, floor_type1, floor_type2,
          map_x, map_y,
          rent_type_4deal, rent_type_1year, rent_type_2month, rent_type_3short, rent_type_5sale, rent_type_6auction,
          price_sale, fee_year, fee_month,
          dong, jibun, roadAddress
        FROM estate
        ${whereSql}
        ORDER BY estate_no DESC
      `;
      
      const rowsArgs = [...args];
      // ★ 'all' 요청이 아닐 때만 LIMIT과 OFFSET을 적용
      if (!unlimited) {
        sql += " LIMIT ? OFFSET ?";
        rowsArgs.push(pageSize, (page - 1) * pageSize);
      }
      const [rows] = await pool.query(sql, rowsArgs);

      function fmt(n) {
        if (n === null || n === undefined || n === "") return "";
        const num = Number(n);
        if (Number.isNaN(num)) return String(n);
        return num.toLocaleString("ko-KR");
      }

      const items = rows.map(r => {
        const parts = [];
        if (r.rent_type_4deal === "y") { const sale = fmt(r.price_sale); parts.push(`매매${sale ? ` ${sale}` : ""}`); }
        if (r.rent_type_1year === "y") { const depo = fmt(r.fee_year); parts.push(`전세${depo ? ` ${depo}` : ""}`); }
        if (r.rent_type_2month === "y") {
          const depo = fmt(r.fee_year); const monthly = fmt(r.fee_month);
          let label = "월세"; if (depo && monthly) label += ` ${depo}/${monthly}`; else if (depo) label += ` ${depo}`; else if (monthly) label += ` ${monthly}`;
          parts.push(label);
        }
        if (r.rent_type_3short === "y") {
          const depo = fmt(r.fee_year); const monthly = fmt(r.fee_month);
          let label = "단기"; if (depo && monthly) label += ` ${depo}/${monthly}`; else if (depo) label += ` ${depo}`; else if (monthly) label += ` ${monthly}`;
          parts.push(label);
        }
        if (r.rent_type_6auction === "y") { parts.push("경매"); }

        return {
          id: r.estate_no, estate_no: r.estate_no, title: r.estate_name || "",
          lat: Number(r.map_y), lng: Number(r.map_x), price: parts.join(" · "),
          dong: r.dong || "", jibun: r.jibun || "", roadAddress: r.roadAddress || "",
          estate_type: r.estate_type, estate_name: r.estate_name, estate_dong: r.estate_dong,
          estate_ho: r.estate_ho, floor_etc: r.floor_etc, floor_type1: r.floor_type1, floor_type2: r.floor_type2,
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