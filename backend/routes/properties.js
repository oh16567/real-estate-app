// backend/routes/properties.js
const express = require("express");
const router = express.Router();
// 메타 정보로 수정할 수 있는 칼럼만 whitelist
const META_FIELDS = [
  "use_yn",
  "contract_yn",
  "grade_condition",
  "register_memo",
  "resident_memo",
];
// 상단
const db = require('../config/db'); // 기존 커넥션 모듈 경로에 맞게 유지
const multer = require("multer");
const os = require("os");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const Jimp = require("jimp"); // sharp 미사용 → jimp로 썸네일 생성
const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const thumbDir = path.join(uploadDir, "thumbs");
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

const { google } = require("googleapis");
const { toPyeong } = require("../lib/units");

const MAX_BYTES = Number(process.env.PHOTO_MAX_BYTES || 5 * 1024 * 1024); // 5MB 기본
const MAX_COUNT = Number(process.env.PHOTO_MAX_COUNT || 20);              // 매물당 20장 기본

// 서버 디스크에 선저장하지 않기 위해 메모리 스토리지 사용
const upload = multer({ storage: multer.memoryStorage() });

function parseBoolY(v){ return (v === "y" || v === "Y" || v === true || v === "true"); }

 async function getDrive() {
   const keyFile =
     process.env.GDRIVE_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined;
   const auth = new google.auth.GoogleAuth({
     keyFilename: keyFile,
     scopes: ["https://www.googleapis.com/auth/drive.file"],
   });
   return google.drive({ version: "v3", auth });
 }

 // 안전 삭제 유틸
async function rmIfExists(p) {
  if (!p) return;
  try { await fsp.unlink(p); }
  catch (e) { if (e.code !== "ENOENT") console.warn("[CLEANUP]", e.message); }
}

// estate 결과 행에서 숫자로 써야 하는 컬럼들을 일괄 number 캐스팅
function castToNumber(row, keys) {
  if (!row) return;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
    const v = row[k];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) row[k] = n;
  }
}

// estate 테이블에서 실제로 숫자로 사용하는 컬럼 목록
const ESTATE_NUMBER_FIELDS = [
  // 면적
  "sale_scale","sale_scale_square",
  "exclusive_scale","exclusive_area_m2","exclusive_scale_square",
  "used_scale","used_scale_square",
  "site_scale","site_scale_square",
  "site_amount","site_amount_square",
  "common_area_m2","common_area_square",

  // 방/욕실/층
  "room_cnt","bath_cnt","floor","floor_total",

  // 금액
  "price_sale","price_bunyang","price_per_scale","mortgage",
  "fee_year","fee_month",
  "price_premium","price_sum","price_investment",
  "price_deposit","price_per_household","price_per_mgr","price_per_sacle",

  // 수익성 계산 관련
  "f_interest_loan","f_price_finance_year","f_profit_per_year",
  "f_price_total_mgr","f_price_total_mgr_year",
  "f_rate_change_month","f_rate_change_year","f_rate_exclude_finance",
  "f_rate_include_mgr","f_price_commission_avg","f_price_commission_year",
  "f_price_repair","f_price_repair_year",
  "f_rate_income_admin","f_interest_deposit","f_rate_tax_interest",
  "f_income_profit_deposit","f_rate_profit_deposit",
  "f_income_invest","f_income_invest_admin",
  "f_profit_mgr","f_profit_mgr_year",

  // 주차·역세권
  "parking_cnt","parking_fee","station_cnt","walking_minutes",

  // 지도 좌표
  "lat","lng"
];

module.exports = (pool) => {

  // GET /api/properties/search-address?q=키워드&limit=20
  router.get("/search-address", async (req, res) => {
    try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(50, Number(req.query.limit) || 20);
    // ① 백엔드에서도 짧은 검색어는 바로 컷
    if (!q || q.length < 2) {
      return res.json({ ok: true, items: [] });
    }

    const like = `%${q}%`;

    const [rows] = await pool.query(
      `
      SELECT e.estate_no,
             COALESCE(e.roadAddress,'') AS roadAddress,
             COALESCE(e.jibunAddress, COALESCE(e.jibun,'')) AS jibunAddress,
             e.estate_name,
             e.estate_dong,
             e.estate_ho,
             e.estate_type,
             e.bld_type,
             e.rent_type_1year,
             e.rent_type_2month,
             e.rent_type_3short,
             e.rent_type_4deal,
             e.rent_type_5sale,
             e.rent_type_6auction
      FROM estate e
      WHERE
        (
          e.roadAddress   LIKE ?
          OR e.jibunAddress LIKE ?
          OR e.jibun      LIKE ?
          OR e.estate_name LIKE ?
          OR e.estate_dong LIKE ?
          OR e.estate_ho   LIKE ?
        )
        /* 필요하면 최근 N개월로 제한 */
        /* AND e.update_date >= DATE_SUB(NOW(), INTERVAL 24 MONTH) */
      ORDER BY e.update_date DESC, e.estate_no DESC
      LIMIT ?`,
      [like, like, like, like, like, like, limit]
    );
      return res.json({ ok:true, items: rows });
    } catch (e) {
      console.error("[/api/properties/search-address] error:", e);
      return res.status(500).json({ ok:false, error:"internal_error" });
    }
  });

  // GET /api/properties/:id  → 단건 JSON
  router.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok:false, error:"invalid id" });
      }
      const [rows] = await pool.query(
        "SELECT * FROM estate e WHERE e.estate_no=? LIMIT 1",
        [id]
      );
      if (!rows.length) return res.status(404).json({ ok:false, error:"not_found" });
      const r = rows[0];
      return res.json({
        ok: true,
        item: {
          estate_no: r.estate_no,
          use_yn: r.use_yn,
          contract_yn: r.contract_yn,
          update_date: r.update_date,
          // 필요한 필드 추가 가능
        }
      });
    } catch (e) {
      console.error("[GET /api/properties/:id] error:", e);
      return res.status(500).json({ ok:false, error:"internal_error" });
    }
  });

  router.get("/", async (req, res) => {
    try {
      const where = [];
      const args = [];
      const page = Math.max(1, parseInt(req.query.page || "1", 10));
      const rawSize = String(req.query.pageSize || "20");
      
      // ★ 'all' 요청이 들어오면 페이지네이션을 적용하지 않도록 수정
      const unlimited = rawSize.toLowerCase() === "all";
      const pageSize = unlimited ? null : Math.max(1, parseInt(rawSize, 10) || 20);
      const today = new Date();
      const six = new Date(); six.setMonth(today.getMonth() - 6);
      const toISO = d => d.toISOString().slice(0,10);

      // estate_no 유무를 먼저 판단해 기본 필터의 적용 여부를 제어
      const qEstateNoRaw = req.query.estate_no;
      const hasEstateNo = qEstateNoRaw !== undefined && qEstateNoRaw !== null && String(qEstateNoRaw).trim() !== "";
      const qEstateNo = hasEstateNo ? Number(qEstateNoRaw) : null;
      if (hasEstateNo && !Number.isFinite(qEstateNo)) {
        return res.status(400).json({ ok:false, error:"invalid estate_no" });
      }

      const allDates = String(req.query.all_dates || "").toLowerCase() === "y";
      const updateFrom = req.query.update_date_from || "";
      const updateTo   = req.query.update_date_to   || "";
      // estate_no가 있을 땐 기본 날짜 필터 비활성
      if (!hasEstateNo) {
        if (updateFrom) { where.push("DATE(update_date) >= ?"); args.push(updateFrom); }
        if (updateTo)   { where.push("DATE(update_date) <= ?"); args.push(updateTo); }
        if (!updateFrom && !updateTo && !allDates) {
          where.push("DATE(update_date) BETWEEN ? AND ?");
          args.push(toISO(six), toISO(today));
        }
      }

      if (req.query.register_date_from) { where.push("register_date >= ?"); args.push(req.query.register_date_from); }
      if (req.query.register_date_to)   { where.push("register_date <= ?"); args.push(req.query.register_date_to); }
      // 준공년도 범위 필터
      if (req.query.completion_year_from) { where.push("completion_year >= ?"); args.push(req.query.completion_year_from); }
      if (req.query.completion_year_to)   { where.push("completion_year <= ?"); args.push(req.query.completion_year_to); }
      
      if (req.query.estate_type) {
        const list = String(req.query.estate_type).split(",").filter(Boolean);
        if (list.length){ where.push(`estate_type IN (${list.map(()=>"?").join(",")})`); args.push(...list); }
      }
      // bld_type 매핑: villa 선택 시 multi-house도 포함
      if (req.query.bld_type) {
        const raw = String(req.query.bld_type).split(",").filter(Boolean);
        const expanded = [];
        for (const t of raw) {
          expanded.push(t);
          if (t === "villa") expanded.push("multi-house");
        }
        const uniq = [...new Set(expanded)];
        where.push(`bld_type IN (${uniq.map(()=>"?").join(",")})`);
        args.push(...uniq);
      }

      // 조건 배열

      /* 삭제데이터/계약가능/근저당제외 */
      if (req.query.use_yn === "n" || req.query.use_yn_n === "y") {
        where.push("use_yn = 'n'");
      }
      if (req.query.contract_yn === "y" || req.query.contract_yn_y === "y") {
        where.push("contract_yn = 'y'");
      }
      if (req.query.mortgage_yn === "n" || req.query.mortgage_yn_n === "y") {
        where.push("mortgage_yn = 'n'");
      }


      /* 형태구분: CSV 다중선택 */
      if (req.query.bld_structure) {
        const list = String(req.query.bld_structure).split(",").filter(Boolean);
        if (list.length > 0) {
          where.push(`bld_structure IN (${list.map(() => "?").join(",")})`);
          args.push(...list);
        }
      }

      /* 물건관리: 단일 */
      if (req.query.grade_condition) {
        where.push("grade_condition = ?");
        args.push(String(req.query.grade_condition));
      }

      /* 준공년도: 범위 (DATE 컬럼 → YEAR()로 비교) */
      const cyMin = req.query.completion_year_min ? Number(req.query.completion_year_min) : null;
      const cyMax = req.query.completion_year_max ? Number(req.query.completion_year_max) : null;
      if (Number.isFinite(cyMin) && Number.isFinite(cyMax)) {
        where.push("YEAR(completion_year) BETWEEN ? AND ?");
        args.push(cyMin, cyMax);
      } else if (Number.isFinite(cyMin)) {
        where.push("YEAR(completion_year) >= ?");
        args.push(cyMin);
      } else if (Number.isFinite(cyMax)) {
        where.push("YEAR(completion_year) <= ?");
        args.push(cyMax);
      }
      
      /* 주차비(유료) */
      if (req.query.parking_min_fee) {
        where.push("CAST(parking_fee AS DECIMAL(18,6)) >= ?");
        args.push(Number(req.query.parking_min_fee));
      }

      // 룸/욕실
      if (req.query.room_cnt_min) { where.push("CAST(room_cnt AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.room_cnt_min)); }
      if (req.query.room_cnt_max) { where.push("CAST(room_cnt AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.room_cnt_max)); }
      if (req.query.bath_cnt_min) { where.push("CAST(bath_cnt AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.bath_cnt_min)); }
      if (req.query.bath_cnt_max) { where.push("CAST(bath_cnt AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.bath_cnt_max)); }

      // 보증금/월세(만원)
      if (req.query.fee_year_min)  { where.push("CAST(fee_year  AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.fee_year_min)); }
      if (req.query.fee_year_max)  { where.push("CAST(fee_year  AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.fee_year_max)); }
      if (req.query.fee_month_min) { where.push("CAST(fee_month AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.fee_month_min)); }
      if (req.query.fee_month_max) { where.push("CAST(fee_month AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.fee_month_max)); }

      // 전용면적(㎡/평)
      if (req.query.exclusive_scale_min)  { where.push("CAST(exclusive_scale AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.exclusive_scale_min)); }
      if (req.query.exclusive_scale_max)  { where.push("CAST(exclusive_scale AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.exclusive_scale_max)); }
      if (req.query.exclusive_scale_square_min) { where.push("CAST(exclusive_scale_square AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.exclusive_scale_square_min)); }
      if (req.query.exclusive_scale_square_max) { where.push("CAST(exclusive_scale_square AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.exclusive_scale_square_max)); }

      // 실면적(㎡/평)
      if (req.query.used_scale_min)  { where.push("CAST(used_scale AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.used_scale_min)); }
      if (req.query.used_scale_max)  { where.push("CAST(used_scale AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.used_scale_max)); }
      if (req.query.used_scale_square_min) { where.push("CAST(used_scale_square AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.used_scale_square_min)); }
      if (req.query.used_scale_square_max) { where.push("CAST(used_scale_square AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.used_scale_square_max)); }

      // 해당층
      if (req.query.floor_min) { where.push("CAST(floor AS SIGNED) >= ?"); args.push(Number(req.query.floor_min)); }
      if (req.query.floor_max) { where.push("CAST(floor AS SIGNED) <= ?"); args.push(Number(req.query.floor_max)); }

      if (parseBoolY(req.query.owner_household)) {
        where.push("owner_household = 'y'");
        if (req.query.owner_room_min) { where.push("CAST(owner_room AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.owner_room_min)); }
        if (req.query.owner_room_max) { where.push("CAST(owner_room AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.owner_room_max)); }
        if (req.query.owner_bath_min) { where.push("CAST(owner_bath AS DECIMAL(18,6)) >= ?"); args.push(Number(req.query.owner_bath_min)); }
        if (req.query.owner_bath_max) { where.push("CAST(owner_bath AS DECIMAL(18,6)) <= ?"); args.push(Number(req.query.owner_bath_max)); }
      }

      if (parseBoolY(req.query.sale_type_sub_rent))   { where.push("sale_type_sub_rent = 'y'"); }
      if (parseBoolY(req.query.sale_type_sub_living)) { where.push("sale_type_sub_living = 'y'"); }

      // 단순 Y/N
      if (parseBoolY(req.query.living_condition_ev))       where.push("living_condition_ev = 'y'");
      if (parseBoolY(req.query.internal_condition_interior)) where.push("internal_condition_interior = 'y'");
      if (parseBoolY(req.query.internal_condition_water))  where.push("internal_condition_water = 'y'");
      if (parseBoolY(req.query.internal_condition_city_gas)) where.push("internal_condition_city_gas = 'y'");
      if (parseBoolY(req.query.bath_division))             where.push("bath_division = 'y'");
      if (parseBoolY(req.query.bath_inside))               where.push("bath_inside = 'y'");
      if (parseBoolY(req.query.external_condition_exsign)) where.push("external_condition_exsign = 'y'");

      // 값 매칭
      if (req.query.heat_condition) where.push("heat_condition = ?"), args.push(String(req.query.heat_condition));
      if (req.query.cold_condition) where.push("cold_condition = ?"), args.push(String(req.query.cold_condition));


      /* 거래유형: 배열(rent_types) 구방식 플래그 모두 지원 */

        const orConds = [];
        const map = {
          sale: "rent_type_5sale = 'y'",
          rent: "rent_type_2month = 'y'",
          charter: "rent_type_1year = 'y'",
          short: "rent_type_3short = 'y'",
          deal: "rent_type_4deal = 'y'",
          auction: "rent_type_6auction = 'y'",
        };

      if (req.query.rent_types) {
        const list = String(req.query.rent_types).split(",").filter(Boolean);
        for (const k of list) if (map[k]) orConds.push(map[k]);
      }
      // 구방식 파라미터도 병행
      const y = (v) => v === "y" || v === "true" || v === true;
      if (y(req.query.rent_type_4deal))    orConds.push(map.deal);
      if (y(req.query.rent_type_1year))    orConds.push(map.charter);
      if (y(req.query.rent_type_2month))   orConds.push(map.rent);
      if (y(req.query.rent_type_3short))   orConds.push(map.short);
      if (y(req.query.rent_type_5sale))    orConds.push(map.sale);
      if (y(req.query.rent_type_6auction)) orConds.push(map.auction);

      if (orConds.length > 0) {
        const joiner = req.query.rent_type_and === "y" ? " AND " : " OR ";
        where.push("(" + orConds.join(joiner) + ")");
      }
      

      if (req.query.q) {
        const cols = ["estate_name", "estate_dong", "estate_ho", "roadAddress", "jibun"];
        where.push("(" + cols.map(c => `${c} LIKE ?`).join(" OR ") + ")");
        args.push(...cols.map(() => `%${req.query.q}%`));
      }

      // 단건 조회 지원
      if (hasEstateNo) {
        where.push("e.estate_no = ?");
        args.push(qEstateNo);
      }
      const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

      // BUGFIX: COUNT 쿼리에 별칭(e) 누락 → estate_no 검색 시 500
      const [cntRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM estate e ${whereSql}`, args);
      const total = cntRows[0]?.cnt || 0;

      let sql = `
        SELECT
          e.*,
          -- 면적 별칭: 전용/공용 m2
          e.exclusive_scale AS exclusive_area_m2,
          e.common_area_m2    AS common_area_m2,
          NULL              AS common_area_m2,
          CASE
            WHEN e.thumb_url IS NOT NULL AND e.thumb_url <> '' THEN e.thumb_url
            ELSE pp.url
          END AS coalesced_thumb_url
        FROM estate e
        LEFT JOIN (
          SELECT p1.property_id, p1.url
          FROM property_photos p1
          JOIN (
            SELECT property_id, MAX(id) AS max_id
            FROM property_photos
            GROUP BY property_id
          ) last
            ON last.property_id = p1.property_id
           AND last.max_id = p1.id
        ) pp
          ON pp.property_id = e.estate_no
        ${whereSql}
        ORDER BY e.update_date DESC, e.estate_no DESC
      `;
      
      const rowsArgs = [...args];
      // ★ 'all' 요청이 아닐 때만 LIMIT과 OFFSET을 적용
      if (!unlimited) {
        sql += " LIMIT ? OFFSET ?";
        rowsArgs.push(pageSize, (page - 1) * pageSize);
      }
      const [rows] = await pool.query(sql, rowsArgs);

      // 공통 숫자 필드 캐스팅 + 전용면적 통합
      for (const r of rows) {
        castToNumber(r, ESTATE_NUMBER_FIELDS);
        // exclusive_scale이 있으면 exclusive_area_m2를 동일한 값으로 맞춘다
        if (r.exclusive_scale != null && r.exclusive_scale !== "") {
          r.exclusive_area_m2 = r.exclusive_scale;
        }
      }

      function fmt(n) {
        if (n === null || n === undefined || n === "") return "";
        const num = Number(n);
        if (Number.isNaN(num)) return String(n);
        return num.toLocaleString("ko-KR");
      }

      const items = rows.map(r => {
        const FALLBACK_NOIMG = "/static/thumbs/no_img.jpg";
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

        const exM2 =
          r.exclusive_scale != null && r.exclusive_scale !== ''
            ? Number(r.exclusive_scale)
            : Number(r.exclusive_area_m2) || null;

        const siteM2 = (r.site_amount ?? null);
        const commonM2 = Number(r.common_area_m2) || null;

        const siteP =
          (r.site_amount_square != null && r.site_amount_square !== '')
            ? Number(r.site_amount_square)
            : toPyeong(siteM2);

        const commonP =
          (r.common_area_square != null && r.common_area_square !== '')
            ? Number(r.common_area_square)
            : toPyeong(commonM2);

        return {
          id: r.estate_no, 
          estate_no: r.estate_no, 
          title: r.estate_name || "",
          // 새 컬럼(lat,lng) 우선, 없으면 구컬럼(map_y,map_x) 사용
          lat: Number(r.lat ?? r.map_y), 
          lng: Number(r.lng ?? r.map_x),
          price: parts.join(" · "), //복합거래시 금액 연결
          dong: r.dong || "", //행정동
          jibun: r.jibun || "", //지번
          roadAddress: r.roadAddress || "", //도로명주소
          estate_type: r.estate_type,  //용도
          bld_type: r.bld_type,                      // 종류 필터·표시용
          estate_name: r.estate_name,  //건물명
          shop_name: r.shop_name,   //상호명
          estate_dong: r.estate_dong,  //건물동명
          estate_ho: r.estate_ho,  //건물호수
          floor_etc: r.floor_etc,  //호수대체_기타
          floor_type1: r.floor_type1, //호수대체
          floor_type2: r.floor_type2,
          floor: r.floor,
          update_id: r.update_id, // 수정아이디
          update_date: r.update_date, // 수정일
          use_yn: r.use_yn,                          // 삭제데이터 필터
          contract_yn: r.contract_yn,                // 계약가능 필터
          mortgage_yn: r.mortgage_yn,                // 근저당제외 필터
          bld_structure: r.bld_structure,            // 형태구분(open/separate/multi)
          // 준공일: DB에서 DATE로 오든 문자열로 오든 항상 'YYYY-MM-DD' 로 통일
          completion_year: (() => {
            const v = r.completion_year;
            if (!v) return "";

            // DATE 객체일 때 (mysql2가 DATE → JS Date 로 변환)
            if (v instanceof Date) {
              const y = v.getFullYear();
              const m = String(v.getMonth() + 1).padStart(2, "0");
              const d = String(v.getDate()).padStart(2, "0");
              return `${y}-${m}-${d}`;
            }

            // 문자열인 경우 (혹시라도)
            const s = String(v);
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

            return "";
          })(),
          price_per_household: Number(r.price_per_household) || 0,
          parking_cnt: Number(r.parking_cnt) || 0, //주차수
          parking_fee: Number(r.parking_fee) || 0, //주차비
          room_cnt: r.room_cnt ?? null, //룸수
          bath_cnt: r.bath_cnt ?? null, //욕실수
          living_condition_terrace: r.living_condition_terrace ?? null, //베란다여부
          exclusive_scale: Number(r.exclusive_scale) || null,               // 전용 ㎡
          exclusive_scale_square: Number(r.exclusive_scale_square) || null, // 전용 평(보유시)
          exclusive_area_m2: exM2,                                          // 전용 ㎡ 일관화
          exclusive_area_p:
            (r.exclusive_scale_square != null && r.exclusive_scale_square !== '')
              ? Number(r.exclusive_scale_square)
              : toPyeong(exM2),                                             // 전용 평 파생
          common_area_m2: commonM2,
          common_area_p: toPyeong(commonM2),
          // ✅ 면적: 상업용 실면적 우선 노출을 위해 추가
          used_scale: Number(r.used_scale) || null, //실사용면적
          used_scale_square: Number(r.used_scale_square) || null, //실사용평수
          // ✅ 수익형에서 주인세대 표기를 위해 추가
          owner_household: r.owner_household, //주인세대 여부
          owner_room: Number(r.owner_room) || null, //주인세대 룸수
          owner_bath: Number(r.owner_bath) || null, //주인세대 욕실수
          grade_condition: r.grade_condition,
          // 임대/입주 서브옵션 + 금액
          sale_type_sub_living: r.sale_type_sub_living, //입주가능
          sale_type_sub_rent:   r.sale_type_sub_rent, //임대승계
          sale_type_rent:       r.sale_type_rent,                 // 'y' | 'm' | 's'
          sale_type_rent_year:  Number(r.sale_type_rent_year) || null,
          sale_type_rent_month: Number(r.sale_type_rent_month) || null,

          // 관리비 및 합계(총월세=월세+관리비)
          f_price_total_mgr:     Number(r.f_price_total_mgr) || 0,
          total_month_with_mgr: (Number(r.sale_type_rent_month) || 0) + (Number(r.f_price_total_mgr) || 0),

          // EV
          living_condition_ev: r.living_condition_ev,

          // 좌측열: 대지규모
          use_district: r.use_district || null, //용도지역
          site_scale: r.site_scale ?? null, //지분면적
          site_scale_square: r.site_scale_square ?? null, //지분평수
          site_amount_square: Number(r.site_amount_square) || null, //대지 평(보유시)
          site_amount: siteM2 ?? null,                              //대지 ㎡
          site_area_p:
            (r.site_amount_square != null && r.site_amount_square !== '')
              ? Number(r.site_amount_square)
              : toPyeong(siteM2),                                   // 대지 평 파생
          // 공용
          common_area_m2: commonM2 ?? null,
          common_area_square: Number(r.common_area_square) || null,
          common_area_p: commonP,
          register_date: r.register_date || null, //등록일
          // completion_year: r.completion_year || null, //사용승인일
          bld_scale_under: r.bld_scale_under ?? null, //건물규모 지하
          bld_scale: r.bld_scale ?? null, //건물규모 지상
          floor_total: r.floor_total ?? null, //총층
          price_sale: r.price_sale ?? null, //매매금액
          mortgage: r.mortgage ?? null, //대출금액
          permission_detail: r.permission_detail || null, //상세용도
          permission_type: r.permission_type || null, //허가종류
          rent_household_cnt: r.rent_household_cnt ?? null, //임대가구수
          price_premium: r.price_premium ?? null, //상가 권리금
          fee_year: r.fee_year,          // 보증금(만원)
          fee_month: r.fee_month,        // 월세(만원)
          price_sum: r.price_sum ?? null, //상가 합계금액
          price_mgr_item_basic: r.price_mgr_item_basic, //기본관리비
          price_mgr_item_water: r.price_mgr_item_water,  //수도요금
          price_mgr_item_internet: r.price_mgr_item_internet, //인터넷요금
          price_mgr_item_online: r.price_mgr_item_online, //유선요금
          price_mgr_item_heat: r.price_mgr_item_heat, //난방요금
          price_mgr_item_elec: r.price_mgr_item_elec, //전기요금
          // 지번주소 폴백: 새 컬럼 없으면 구컬럼(jibun) 사용
          jibunAddress: r.jibunAddress || r.jibun || "",
          roadAddress:  r.roadAddress  ?? r.roadaddress  ?? null,
          dong: r.dong ?? null,
          jibun: r.jibun ?? null,
          station: r.station || null, //역명
          station_distance: r.station_distance ?? null, //역거리
          heat_condition: r.heat_condition || null, //난방방식
          internal_condition_interior: r.internal_condition_interior, //시설상태-인테리어
          internal_condition_water: r.internal_condition_water, //시설상태-수도시설
          internal_condition_city_gas: r.internal_condition_city_gas, //시설상태-도시가스
          bath_division: r.bath_division, //화장실 남녀구분
          bath_inside: r.bath_inside, //화장실 내부
          external_condition_exsign: r.external_condition_exsign, //옥외광고
          cold_condition: r.cold_condition, //냉방시설
          register_memo: r.register_memo || null, //등록자메모
          contact_name1: r.contact_name1 || null,
          contact_phone1: r.contact_phone1 || null,
          contact_name2: r.contact_name2 || null,
          contact_phone2: r.contact_phone2 || null,
          contact_name3: r.contact_name3 || null,
          contact_phone3: r.contact_phone3 || null,
          contact_name4: r.contact_name4 || null,
          contact_phone4: r.contact_phone4 || null,
          contact_name5: r.contact_name5 || null,
          contact_phone5: r.contact_phone5 || null,
          resident_name: r.resident_name || null,
          resident_phone: r.resident_phone || null,
          resident_memo: r.resident_memo || null,

          // 거래유형: 개별 플래그도 함께 내려줌(서버/프런트 양쪽 호환)
          rent_type_1year: r.rent_type_1year,        // 전세
          rent_type_2month: r.rent_type_2month,      // 월세
          rent_type_3short: r.rent_type_3short,      // 단기
          rent_type_4deal: r.rent_type_4deal,        // 매매(구)
          rent_type_5sale: r.rent_type_5sale,        // 분양
          rent_type_6auction: r.rent_type_6auction,  // 경매

          // 프런트 다중 선택 대응: 배열과 대표값 동시 제공
          rent_types: [
            ...(r.rent_type_5sale === 'y' ? ['sale'] : []),
            ...(r.rent_type_2month === 'y' ? ['rent'] : []),
            ...(r.rent_type_1year === 'y' ? ['charter'] : []),
            ...(r.rent_type_3short === 'y' ? ['short'] : []),
            ...(r.rent_type_6auction === 'y' ? ['auction'] : []),
            ...(r.rent_type_4deal === 'y' ? ['deal'] : []),
          ],
          rent_type:
            (r.rent_type_5sale === 'y' && 'sale') ||
            (r.rent_type_2month === 'y' && 'rent') ||
            (r.rent_type_1year === 'y' && 'charter') ||
            (r.rent_type_3short === 'y' && 'short') ||
            (r.rent_type_6auction === 'y' && 'auction') ||
            (r.rent_type_4deal === 'y' && 'deal') ||
            '',

          // 🔧 타입 정규화 블록: 문자열 숫자들을 number로 변환
          bld_scale: Number(r.bld_scale) || null,
          bld_scale_under: Number(r.bld_scale_under) || null,
          site_amount: Number(r.site_amount) || null,
          site_scale: Number(r.site_scale) || null,
          site_scale_square: Number(r.site_scale_square) || null,
          fee_month: Number(r.fee_month) || null,
          fee_year: Number(r.fee_year) || null,
          mortgage: Number(r.mortgage) || null,
          station_distance: Number(r.station_distance) || null,

          // 대표 썸네일: estate.thumb_url 없으면 최근 사진 URL 사용
          thumb_file_id: r.thumb_file_id || null,
          // 기본 썸네일 폴백(/public/images/no_img.jpg)
          thumb_url: ((r.thumb_url || r.coalesced_thumb_url) || FALLBACK_NOIMG)
                       .replace(/\?v=\d+$/, ""),
          url: ((r.thumb_url || r.coalesced_thumb_url) || FALLBACK_NOIMG)
                       .replace(/\?v=\d+$/, ""),
        };
      });

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.json({ ok:true, items, total, page });
    } catch (e) {
      console.error("[/api/properties] error:", e);
      res.status(500).json({ error: "failed" });
    }
  });

  // 대표이미지 강제 NULL
  router.put("/:id/thumbnail/clear", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:"bad id" });
      await pool.query("UPDATE estate SET thumb_url=NULL, thumb_file_id=NULL WHERE estate_no=?", [id]);
      return res.json({ ok:true, estate_no:id, cleared:true });
    } catch (e) {
      console.error("[thumbnail/clear]", e);
      return res.status(500).json({ ok:false, error:String(e.message||e) });
    }
  });

  // 대표이미지 재계산: 남은 사진 있으면 최신 URL, 없으면 NULL
  router.put("/:id/thumbnail/recalc", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok:false, error:"bad id" });
      const [[cnt]] = await pool.query("SELECT COUNT(*) AS c FROM property_photos WHERE property_id=?", [id]);
      const remain = Number(cnt?.c||0);
      if (remain > 0) {
        const [[last]] = await pool.query(
          "SELECT url FROM property_photos WHERE property_id=? ORDER BY id DESC LIMIT 1", [id]
        );
        const nextUrl = last?.url || null;
        await pool.query("UPDATE estate SET thumb_url=?, thumb_file_id=NULL WHERE estate_no=?",
          [nextUrl, id]);
        return res.json({ ok:true, estate_no:id, recalculated:true, thumb_url:nextUrl });
      } else {
        await pool.query("UPDATE estate SET thumb_url=NULL, thumb_file_id=NULL WHERE estate_no=?", [id]);
        return res.json({ ok:true, estate_no:id, cleared:true });
      }
    } catch (e) {
      console.error("[thumbnail/recalc]", e);
      return res.status(500).json({ ok:false, error:String(e.message||e) });
    }
  });

// 함수 export 내부(router 생성 후) 아래 라우트들 추가
// 필드명 유연화: file 또는 files 모두 허용
router.post(
  "/:id/photos",
  upload.any(),
  async (req, res, next) => {
   try {
    console.log("[photos] ct=%s len=%s files=%s keys=%s",
      req.headers["content-type"],
      req.headers["content-length"],
      Array.isArray(req.files) ? req.files.length : "na",
      Object.keys(req.body||{}).join(","));
     const { id } = req.params;
     const arr = Array.isArray(req.files) ? req.files : [];
     const f = arr[0];
     if (!f) return res.status(400).json({ ok:false, error:"no file" });

    // 개수 제한: 매물당 MAX_COUNT
    const [[cnt]] = await pool.query(
      "SELECT COUNT(*) AS c FROM property_photos WHERE property_id=?", [id]
    );
    if ((cnt?.c || 0) >= MAX_COUNT) {
      return res.status(409).json({ ok:false, error:"limit exceeded", max: MAX_COUNT });
    }

     // 저장소 설정 조회
     const [conf] = await pool.query("SELECT `value` FROM app_config WHERE `key`='photo.storage'");
     let storage = (conf?.[0]?.value || "server").toLowerCase();

      // 공통 파일명(서버 규격): prop_<estate_no>_<ts>.<ext>
      const ext = path.extname(f.originalname || "") || ".jpg";
      const baseName = `prop_${id}_${Date.now()}${ext}`;
      const thumbName = baseName.replace(/(\.[a-zA-Z0-9]+)?$/, "_thumb.jpg");
      // gdrive에서는 임시폴더(os.tmpdir)로만 쓰고 즉시 삭제
      // server에서는 실제 uploads/에 저장 유지
      const tmpDir = os.tmpdir();
      const tmpSrcPath = path.join(tmpDir, baseName);
      const tmpThumbPath = path.join(tmpDir, thumbName);
      const thumbUrlServer = `/static/thumbs/${thumbName}`;

      // 메모리 버퍼를 임시/목적지 경로에 기록(필요한 케이스만)
      const gm = require("gm").subClass({ imageMagick: true });
      const writeFile = (p) => fs.promises.writeFile(p, f.buffer);
      const buildThumb = async (src, out) => {
        const maxSide = 1280;
        await new Promise((resolve, reject) => {
          gm(src).autoOrient()
                 .resize(maxSide, maxSide, ">")
                 .quality(90)
                 .noProfile()
                 .write(out, (err)=> err ? reject(err) : resolve());
        });
      };

      // 2) gdrive: 원본 + 썸네일 업로드, DB에는 썸네일 링크 저장 + estate 대표썸네일 갱신
      if (storage === "gdrive") {
        let drive;
        try {
          drive = await getDrive();
        } catch (e) {
          // ⚠️ 인증 실패 시 더 이상 로컬로 폴백하지 않음: 즉시 에러 반환
          return res
            .status(500)
            .json({ ok:false, error:"gdrive auth failed (no fallback): " + (e?.message || e) });
        }
        if (storage === "gdrive") {
          // 메모리 → 임시파일
          await writeFile(tmpSrcPath);
          await buildThumb(tmpSrcPath, tmpThumbPath);
          const parentId = process.env.GDRIVE_PHOTO_FOLDER_ID || "";
          const parents = /^[A-Za-z0-9_-]{10,}$/.test(parentId) ? [parentId] : undefined;

          // 매 시도마다 새 ReadStream 생성
          const makeMedia = (filePath, mime) => ({
            mimeType: mime || "application/octet-stream",
            body: fs.createReadStream(filePath),
          });

          async function createWithFallback(reqBody, filePath, mime) {
            try {
              return await drive.files.create({
                requestBody: reqBody,
                media: makeMedia(filePath, mime),
                fields: "id,name,webViewLink",
                supportsAllDrives: true,
              });
            } catch (e) {
              // 공유드라이브 폴더가 없거나 권한이 없으면 그대로 에러 반환
              throw e;
            }
          }

          // 원본: 서버 규격(baseName)으로 업로드(로컬 보존 없음)
          const origReq = { name: baseName, ...(parents ? { parents } : {}) };
          const origRes = await createWithFallback(origReq, tmpSrcPath, f.mimetype || "image/jpeg");
          try {
            await drive.permissions.create({
              fileId: origRes.data.id,
              requestBody: { role: "reader", type: "anyone" },
              supportsAllDrives: true,
            });
          } catch {}
          // 썸네일
          const thReq = { name: thumbName, ...(parents ? { parents } : {}) };
          const thRes = await createWithFallback(thReq, tmpThumbPath, "image/jpeg");

          try {
            await drive.permissions.create({
              fileId: thRes.data.id,
              requestBody: { role: "reader", type: "anyone" },
              supportsAllDrives: true,
            });
          } catch {}
          // 썸네일 업로드 완료 후 URL은 thumbnail 엔드포인트로 고정
          const thId  = thRes.data.id;
          const thUrl = `https://drive.google.com/thumbnail?id=${thId}&sz=w1200`;
          // DB에는 '썸네일 URL(thUrl)' 저장, filename에는 '원본 fileId' 저장
          await pool.query(
            `INSERT INTO property_photos
               (property_id, filename, mime_type, size, url)
             VALUES (?,?,?,?,?)`,
            [id, origRes.data.id, f.mimetype || "image/jpeg", f.size || 0, thUrl]
          );
          // 대표썸네일(estate)도 드라이브 썸네일로 즉시 반영
          await pool.query(
            "UPDATE estate SET thumb_url=?, thumb_file_id=? WHERE estate_no=?",
            [thUrl, thId, id]
          );

          // estate 최신값을 즉시 읽어서 반환 (프런트 캐시 갱신용)
          const [[estateRow]] = await pool.query(
            "SELECT thumb_url, thumb_file_id FROM estate WHERE estate_no=? LIMIT 1",
            [id]
          );

          // ✅ 임시파일 정리
          try { await fs.promises.unlink(tmpSrcPath); } catch {}
          try { await fs.promises.unlink(tmpThumbPath); } catch {}


          // ✅ 서버에는 처음부터 저장하지 않으므로 로컬 경로 삭제 로직 제거
          // (추가 안전조치) 혹시 구버전에서 남은 파일이 있다면만 삭제
          for (const p of [
            path.join(uploadDir, baseName),
            path.join(thumbDir, thumbName),
          ]) {
            try { await fs.promises.unlink(p); } catch {}
          }

          return res.json({
            ok: true,
            photo: { 
              id: origRes.data.id, 
              name: baseName, 
              url: thUrl, 
              size: f.size, 
              storage: "gdrive", 
              thumb_url: estateRow?.thumb_url || thUrl,
              thumb_file_id: estateRow?.thumb_file_id || thRes.data.id 
            }
          });
          
        }
      }

      // 3) server: (정말로 조건관리에서 server로 선택된 경우에만)
      if (storage !== "gdrive") {
        await pool.query(
          `INSERT INTO property_photos (property_id, filename, mime_type, size, url)
            VALUES (?,?,?,?,?)`,
          [id, f.filename, f.mimetype, f.size, thumbUrlServer]
        );
        await pool.query(
          `UPDATE estate SET thumb_url=?, thumb_file_id=NULL WHERE estate_no=?`,
          [thumbUrlServer, id]
        );
        return res.json({
          ok:true,
          photo:{ id: f.filename, name: f.filename, url: thumbUrlServer, size: f.size, storage: "server" }
        });
      }
    } catch (e) { next(e); }

 });

// 사진 정렬 저장: [{photoId, sort_no}]
router.put("/:id/photos/order", async (req, res, next) => {
  const { id } = req.params;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ ok:false, error:"empty items" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sql = "UPDATE property_photos SET sort_no=? WHERE id=? AND property_id=?";
    for (const it of items) {
      const pid = Number(it.photoId); const no = Number(it.sort_no) || 0;
      if (!Number.isFinite(pid)) continue;
      await conn.query(sql, [no, pid, id]);
    }

    // 정렬 반영 후 최상위 썸네일을 estate.thumb_url에 동기화
    const [top] = await conn.query(
      `SELECT url FROM property_photos
        WHERE property_id=?
        ORDER BY sort_no DESC, id DESC
        LIMIT 1`, [id]
    );
    const topUrl = top?.[0]?.url || null;
    if (topUrl) {
      await conn.query(
        "UPDATE estate SET thumb_url=?, thumb_file_id=NULL WHERE estate_no=?",
        [topUrl, id]
      );
    }

    await conn.commit();
    res.json({ ok:true, count: items.length, cover_updated: !!topUrl, thumb_url: topUrl || null });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally {
    conn.release();
  }
});

  // ---------------------- 매물 메타데이터 수정 ----------------------
  router.put("/:id/meta", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "bad id" });
      }

      const body = req.body || {};
      const sets = [];
      const args = [];

      // META_FIELDS 에 정의된 컬럼만 업데이트
      for (const col of META_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, col)) {
          sets.push(`${col}=?`);
          args.push(body[col]);
        }
      }

      if (!sets.length) {
        return res.status(400).json({ ok: false, error: "no_fields" });
      }

      // ★ 메타 수정 시에도 update_date 갱신
      const sql = `UPDATE estate SET ${sets.join(", ")}, update_date=NOW() WHERE estate_no=?`;
      args.push(id);

      await pool.query(sql, args);

      const [rows] = await pool.query(
        "SELECT * FROM estate WHERE estate_no=? LIMIT 1",
        [id]
      );

      return res.json({ ok: true, estate: rows[0] || null });
    } catch (e) {
      // 필요하면 디버그 로그는 유지
      console.error("[PUT /api/properties/:id/meta] error:", e);
      return res.status(500).json({
        ok: false,
        error: "internal_error",
      });
    }
  });
  // ---------------------- /매물 메타데이터 수정 ----------------------

  // ---------------------- 매물 기본정보 수정 ----------------------
  // 건물명, 동/호, 층 관련 필드만 수정
  router.put("/:id/basic", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "bad id" });
      }

      const {
        estate_name,
        estate_dong,
        estate_ho,
        estate_type,
        bld_type,
        floor,
        floor_type1,
        floor_type2,
        floor_etc,
      } = req.body || {};

      const sets = [];
      const args = [];

      const pushString = (col, val) => {
        if (typeof val === "string") {
          sets.push(`${col}=?`);
          args.push(val);
        }
      };

      pushString("estate_name", estate_name);
      pushString("estate_dong", estate_dong);
      pushString("estate_ho", estate_ho);
      pushString("estate_type", estate_type);
      pushString("bld_type", bld_type);
      pushString("floor_type1", floor_type1);
      pushString("floor_type2", floor_type2);
      pushString("floor_etc", floor_etc);

      if (floor !== undefined) {
        const n = Number(floor);
        if (!Number.isNaN(n)) {
          sets.push("floor=?");
          args.push(n);
        }
      }

      if (!sets.length) {
        return res.status(400).json({ ok: false, error: "no_fields" });
      }

      const sql = `UPDATE estate SET ${sets.join(", ")}, update_date=NOW() WHERE estate_no=?`;
      args.push(id);
      await pool.query(sql, args);

      const [rows] = await pool.query(
        "SELECT * FROM estate WHERE estate_no=? LIMIT 1",
        [id]
      );

      return res.json({ ok: true, estate: rows[0] || null });
    } catch (e) {
      console.error("[PUT /api/properties/:id/basic] error:", e);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
  // ---------------------- /매물 기본정보 수정 ----------------------

  // ---------------------- 매물 상세정보 수정 ----------------------
    // room_cnt, bath_cnt, exclusive_scale, used_scale 등 상세 필드만 따로 저장
    router.put("/:id/detail", async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          return res.status(400).json({ ok: false, error: "bad id" });
        }

        const {
          room_cnt,
          bath_cnt,
          exclusive_scale,
          exclusive_scale_square,
          used_scale,
          used_scale_square,
          completion_year,
          parking_fee,
          owner_household,
          owner_room,
          owner_bath,
          // 역세권
          station,
          station_distance,
          station_transport,
        } = req.body || {};

        const sets = [];
        const args = [];

        const pushNum = (col, v) => {
          if (v === undefined || v === null || v === "") return;
          const n = Number(v);
          if (!Number.isNaN(n)) {
            sets.push(`${col}=?`);
            args.push(n);
          }
        };

        const pushStr = (col, v) => {
          if (typeof v !== "string") return;
          sets.push(`${col}=?`);
          args.push(v);
        };

        // 숫자 필드
        pushNum("room_cnt", room_cnt);
        pushNum("bath_cnt", bath_cnt);
        pushNum("exclusive_scale", exclusive_scale);
        pushNum("exclusive_scale_square", exclusive_scale_square);
        pushNum("used_scale", used_scale);
        pushNum("used_scale_square", used_scale_square);
        // pushNum("completion_year", completion_year);
        pushNum("parking_fee", parking_fee);
        pushNum("owner_room", owner_room);
        pushNum("owner_bath", owner_bath);
        // 역까지 시간(분)
        pushNum("station_distance", station_distance);
        // 역명 / 이동수단(문자열)
        pushStr("station", station);
        pushStr("station_transport", station_transport);

        // completion_year: 연도만 들어오든, YYYY-MM, YYYY-MM-DD든 모두 DATE로 정규화
        if (completion_year === "" || completion_year == null) {
          // 비우면 NULL
          sets.push("completion_year=?");
          args.push(null);
        } else {
          let raw = completion_year;

          // 숫자(2005 같은 것)로 들어온 경우
          if (typeof raw === "number") {
            raw = String(raw);
          }

          if (typeof raw === "string") {
            const v = raw.trim();

            let dateStr = null;

            if (/^\d{4}$/.test(v)) {
              // "2005" → "2005-01-01"
              dateStr = `${v}-01-01`;
            } else if (/^\d{4}-\d{2}$/.test(v)) {
              // "2005-03" → "2005-03-01"
              dateStr = `${v}-01`;
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
              // 이미 YYYY-MM-DD 형식이면 그대로
              dateStr = v;
            }

            if (dateStr) {
              sets.push("completion_year=?");
              args.push(dateStr);
            }
            // else: 이상한 형식이면 그냥 무시해서 에러 안 나게 함
          }
        }

        // 주인세대 여부(Y/N) – 비워두면 공백으로
        if (
          owner_household === "y" ||
          owner_household === "n" ||
          owner_household === "" ||
          owner_household === null
        ) {
          pushStr("owner_household", owner_household || "");
        }

        // 역명 / 교통수단(지하철/버스 등)
        pushStr("station", station);
        pushStr("station_transport", station_transport);

        if (!sets.length) {
          return res.status(400).json({ ok: false, error: "no_fields" });
        }

        const sql = `UPDATE estate SET ${sets.join(", ")}, update_date=NOW() WHERE estate_no=?`;
        args.push(id);
        await pool.query(sql, args);

        const [rows] = await pool.query(
          "SELECT * FROM estate WHERE estate_no=? LIMIT 1",
          [id]
        );

        return res.json({ ok: true, estate: rows[0] || null });
      } catch (e) {
        console.error("[PUT /api/properties/:id/detail] error:", e);
        return res.status(500).json({ ok: false, error: "internal_error" });
      }
    });
  // ---------------------- /매물 상세정보 수정 ----------------------

  // ---------------------- 신규 매물 등록 ----------------------
  // ---------------------- 신규 매물 등록 ----------------------
  router.post("/new", async (req, res) => {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // 1) 다음 estate_no 구하기 (MAX + 1)
      const [[row]] = await conn.query(
        "SELECT COALESCE(MAX(estate_no), 0) + 1 AS next_no FROM estate"
      );
      const estateNo = row.next_no;

      // 2) 현재 시간 문자열 (YYYY-MM-DD HH:MM:SS)
      const now = new Date();
      const pad = (n) => (n < 10 ? "0" +n : String(n));
      const nowStr = `${now.getFullYear()}-${pad(
        now.getMonth() + 1
      )}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
        now.getMinutes()
      )}:${pad(now.getSeconds())}`;

      // 3) 요청 바디에서 값 꺼내기 (필요한 최소 필드 + 메타)
      const {
        roadAddress = "",
        jibunAddress = "",
        detailAddress = "",
        use_yn = "y",
        contract_yn = "n",
        grade_condition = "",
        register_memo = "",
        resident_memo = "",
      } = req.body || {};

      // 4) INSERT 데이터 구성
      const insertRow = {
        estate_no: estateNo,
        roadAddress,
        jibunAddress,
        detailAddress,
        use_yn,
        contract_yn,
        grade_condition,
        register_memo,
        resident_memo,
        register_date: nowStr,
        insert_date: nowStr,
        update_date: nowStr,
      };

      await conn.query("INSERT INTO estate SET ?", [insertRow]);

      const [rows2] = await conn.query(
        "SELECT * FROM estate WHERE estate_no=? LIMIT 1",
        [estateNo]
      );

      await conn.commit();
      return res.json({
        ok: true,
        estate_no: estateNo,
        estate: rows2[0] || null,
      });
    } catch (e) {
      if (conn) {
        try {
          await conn.rollback();
        } catch (_) {}
      }
      console.error("[POST /api/properties/new] error:", e);
      return res.status(500).json({ ok: false, error: "internal_error" });
    } finally {
      if (conn) conn.release();
    }
  });
  // ---------------------- /신규 매물 등록 ---------------------

  // ---------------------- 매물 복사 등록 ----------------------
  router.post("/:id/copy", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: "bad id" });
      }

      // 원본 행 조회
      const [rows] = await pool.query(
        "SELECT * FROM estate WHERE estate_no=? LIMIT 1",
        [id]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      const src = { ...rows[0] };

    // 새 매물번호: estate 테이블의 최대 estate_no + 1 사용
    const [[maxRow]] = await pool.query(
      "SELECT COALESCE(MAX(estate_no), 0) + 1 AS next_no FROM estate"
    );
    const nextNo = maxRow?.next_no || 1;
    src.estate_no = nextNo;

      const {
        use_yn,
        contract_yn,
        grade_condition,
        register_memo,
        resident_memo,
      } = req.body || {};

      // 메타 필드 덮어쓰기
      if (typeof use_yn === "string") src.use_yn = use_yn;
      if (typeof contract_yn === "string") src.contract_yn = contract_yn;
      if (typeof grade_condition === "string") src.grade_condition = grade_condition;
      if (typeof register_memo === "string") src.register_memo = register_memo;
      if (typeof resident_memo === "string") src.resident_memo = resident_memo;

      // 기본값 보정: 새 매물은 기본적으로 사용중·미계약
      if (!src.use_yn) src.use_yn = "y";
      if (!src.contract_yn) src.contract_yn = "n";

      // 등록/수정일은 오늘자로 갱신 (필드가 존재할 때만)
    // 등록/저장 시점의 날짜+시간(YYYY-MM-DD HH:mm:ss)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const nowStr =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    src.register_date = nowStr;
    src.insert_date   = nowStr;
    src.update_date   = nowStr;

 // INSERT ... SET src  (명시적으로 nextNo 사용)
 await pool.query("INSERT INTO estate SET ?", [src]);

 const [rows2] = await pool.query(
   "SELECT * FROM estate WHERE estate_no=? LIMIT 1",
   [nextNo]
 );

 return res.json({
   ok: true,
   estate_no: nextNo,
   estate: rows2[0] || null,
 });
    } catch (e) {
      console.error("[POST /api/properties/:id/copy] error:", e);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
  // ---------------------- /매물 복사 등록 ----------------------  

// PUT /api/properties/:id/rent-memo
router.put("/:id/rent-memo", async (req, res) => {
  const { id } = req.params;
  const { memo } = req.body || {};
  try {
    await pool.query(
      "UPDATE property_rent SET memo = ? WHERE property_id = ?",
      [memo || "", id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[rent-memo]", e);
    res.status(500).json({ ok: false, error: "db error" });
  }
});

// PUT /api/properties/:id/rent-misc  → 전체 행에 동일 값 반영
router.put("/:id/rent-misc", async (req, res, next) => {
  const { id } = req.params;
  const { misc_label = "", misc_amount = 0 } = req.body || {};
  try {
    await pool.query(
      `UPDATE property_rent
          SET misc_label=?, misc_amount=?
        WHERE property_id=?`,
      [misc_label, Number(misc_amount) || 0, id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/properties/photo-storage
router.get("/photo-storage", async (req,res)=>{
  try {
    const [rows] = await pool.query(
      "SELECT `value` FROM app_config WHERE `key`='photo.storage'"
    );
    const val = rows?.[0]?.value || "server";
    res.json({ok:true, storage: val});
  } catch (e) {
    console.error("[photo-storage:get]", e);
    res.status(500).json({ok:false, error:"db error"});
  }
});

// PUT /api/properties/photo-storage
router.put("/photo-storage", async (req,res)=>{
  try {
    const storage = req.body?.storage || "server";
    await pool.query(
      "INSERT INTO app_config (`key`,`value`) VALUES ('photo.storage',?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)",
      [storage]
    );
    res.json({ok:true, storage});
  } catch (e) {
    console.error("[photo-storage:put]", e);
    res.status(500).json({ok:false, error:"db error"});
  }
});


// GET /api/properties/:id/rent-items  -> 조회(선택)
router.get("/:id/rent-items", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT unit_no AS unitNo, estate_type, type, deposit, monthly, mgmt_fee AS mgmtFee, note
       FROM property_rent WHERE property_id=? ORDER BY id`, [id]
    );
    res.json({ ok: true, items: rows });
  } catch (e) { next(e); }
});

// GET /api/properties/:id/rent-memo  -> 최근 메모 1건 조회
router.get("/:id/rent-memo", async (req, res, next) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT memo FROM property_rent WHERE property_id=? AND memo IS NOT NULL AND memo <> '' ORDER BY updated_at DESC, id DESC LIMIT 1",
      [id]
    );
    res.json({ ok: true, memo: rows[0]?.memo || "" });
  } catch (e) { next(e); }
});

// GET /api/properties/:id/rent-misc  → 최신 1건 로드
router.get("/:id/rent-misc", async (req, res, next) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT misc_label, misc_amount
         FROM property_rent
        WHERE property_id=?
        ORDER BY updated_at DESC, id DESC
        LIMIT 1`, [id]
    );
    const r = rows?.[0] || {};
    res.json({ ok: true, misc_label: r.misc_label || "", misc_amount: r.misc_amount || 0 });
  } catch (e) { next(e); }
});

// DELETE /api/properties/:id/photos/:photoId
router.delete("/:id/photos/:photoId", async (req, res, next) => {
  const { id, photoId } = req.params;
  try {
    // DB 레코드 조회
    
    const [rows] = await pool.query(
      `SELECT id, filename, url FROM property_photos WHERE property_id=? AND (id=? OR filename=?) LIMIT 1`,
      [id, photoId, photoId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ ok:false, error:"not found" });

    const isDrive = !/^prop_\d+_\d+\./.test(row.filename); // 파일명이 생성 규칙이 아니면 드라이브로 간주
    if (isDrive) {
      try {
        const drive = await getDrive();
        await drive.files.delete({ fileId: row.filename, supportsAllDrives: true }); // filename에 Drive fileId 저장해둔 구조
      } catch (e) {
        // 권한 문제 등은 무시하고 계속
      }
    } else {
      const p = path.join(uploadDir, row.filename);
      try { fs.unlinkSync(p); } catch (_) {}
    }

    await pool.query(`DELETE FROM property_photos WHERE id=?`, [row.id]);
    res.json({ ok:true });
  } catch (e) { next(e); }
});

// PUT /api/properties/:id/photo-thumb  -> 대표 썸네일 URL/파일ID 저장
router.put("/:id/photo-thumb", async (req, res, next) => {
  const { id } = req.params;
  const { thumb_url = null, thumb_file_id = null } = req.body || {};
  try {
    const [r] = await pool.query(
      `UPDATE estate
         SET thumb_url = ?, thumb_file_id = ?
       WHERE estate_no = ?
       LIMIT 1`,
      [thumb_url, thumb_file_id, id]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ ok:false, error:"not found", where:{ estate_no:id } });
    }
    // 즉시 읽어서 현재 값 반환(실제 갱신 대상 확인)
    const [rows] = await pool.query(
      `SELECT estate_no, thumb_url, thumb_file_id
         FROM estate
        WHERE estate_no = ?
        LIMIT 1`,
      [id]
    );
    res.json({ ok:true, affected:r.affectedRows, row: rows[0] || null });
  } catch (e) { next(e); }
});

// JSON 에러 핸들러(라우터 전용)
router.use((err, req, res, next) => {
  console.error("[properties] error:", err);
  res.status(500).json({ ok: false, error: err?.message || "server error" });
});

  // ---------------------- 사진 갤러리 API ----------------------
  // 목록
  router.get("/:id/photos", async (req, res) => {
    const id = Number(req.params.id) || 0;
    if (!id) return res.status(400).json({ ok:false, error:"invalid id" });
    try {
      const sql = `
        SELECT
          id,
          property_id,
          filename,
          mime_type AS mime,
          size,
          /* 구글 파일 id 추출: url 또는 filename(=fileId 저장 케이스) */
          CASE
            WHEN url LIKE 'https://drive.google.com/file/d/%'
              THEN CONCAT(
                    'https://drive.google.com/thumbnail?id=',
                    SUBSTRING_INDEX(SUBSTRING(url, LOCATE('/d/', url) + 3), '/', 1),
                    '&sz=w1200'
                  )
            WHEN url LIKE '%?id=%'
              THEN CONCAT(
                    'https://drive.google.com/thumbnail?id=',
                    SUBSTRING_INDEX(SUBSTRING(url, LOCATE('id=', url) + 3), '&', 1),
                    '&sz=w1200'
                  )
            WHEN filename REGEXP '^[A-Za-z0-9_-]{20,}$'
              THEN CONCAT('https://drive.google.com/thumbnail?id=', filename, '&sz=w1200')
            ELSE url
          END AS url,
          sort_no,
          created_at
        FROM property_photos
        WHERE property_id = ${pool.escape(id)}
        ORDER BY sort_no DESC, id DESC
      `;
      const [rows] = await pool.query(sql);
      res.json({ ok: true, photos: rows });
    } catch (e) {
      res.status(500).json({ ok:false, error:String(e) });
    }
  });


// 임시 마이그레이션: /uploads/* → 썸네일 생성 후 /static/thumbs/* 로 교정
router.post("/:id/photos/rebuild-thumbs", async (req, res, next) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT id, filename, url FROM property_photos WHERE property_id=? ORDER BY id DESC`, [id]
    );
    let fixed = 0, skipped = 0;
    for (const r of rows) {
      if (!String(r.url).startsWith("/uploads/")) { skipped++; continue; }
      const base = path.basename(r.url);
      const srcPath = path.join(uploadDir, base);
      if (!fs.existsSync(srcPath)) { skipped++; continue; }
      const thumbName = base.replace(/(\.[a-zA-Z0-9]+)?$/, "_thumb.jpg");
      const thumbPath = path.join(thumbDir, thumbName);
      try {
        const img = await Jimp.read(srcPath);
        const w = img.getWidth(), h = img.getHeight();
        const k = Math.min(1280 / Math.max(w, h), 1);
        if (k < 1) img.resize(Math.round(w*k), Math.round(h*k));
        await img.quality(82).writeAsync(thumbPath);
      } catch { fs.copyFileSync(srcPath, thumbPath); }
      const newUrl = `/static/thumbs/${thumbName}`;
      await pool.query(`UPDATE property_photos SET url=? WHERE id=?`, [newUrl, r.id]);
      fixed++;
    }
    res.json({ ok:true, fixed, skipped });
  } catch (e) { next(e); }
});

  // 삭제
  router.delete("/:id/photos/:photoId", async (req, res) => {
    const id = Number(req.params.id) || 0;
    const pid = Number(req.params.photoId) || 0;
    if (!id || !pid) return res.status(400).json({ ok:false, error:"invalid id" });
    try {
      const [[row]] = await pool.query("SELECT url FROM property_photos WHERE id=? AND property_id=? LIMIT 1", [pid, id]);
      await pool.query("DELETE FROM property_photos WHERE id=? AND property_id=?", [pid, id]);
      // 서버 파일 정리(로컬에 있는 경우만)
      if (row?.url && String(row.url).startsWith("/static/thumbs/")) {
        const abs = path.join(__dirname, "..", "uploads", "thumbs", row.url.replace(/^\/static\/thumbs\//,""));
        try { fs.unlinkSync(abs); } catch {}
      }
      // 남은 사진 수 확인
      const [[cnt]] = await pool.query("SELECT COUNT(*) AS c FROM property_photos WHERE property_id=?", [id]);
      const remain = Number(cnt?.c || 0);
      if (remain > 0) {
        const [[last]] = await pool.query(
          "SELECT url FROM property_photos WHERE property_id=? ORDER BY id DESC LIMIT 1", [id]
        );
        const nextUrl = last?.url || null;
        await pool.query("UPDATE estate SET thumb_url=?, thumb_file_id=NULL WHERE estate_no=?", [nextUrl, id]);
        res.json({ ok:true, deleted: pid, remain, thumb_url: nextUrl });
      } else {
        await pool.query("UPDATE estate SET thumb_url=NULL, thumb_file_id=NULL WHERE estate_no=?", [id]);
        res.json({ ok:true, deleted: pid, remain: 0, thumb_url: null });
      }
    } catch (e) {
      res.status(500).json({ ok:false, error:String(e) });
    }
  });

  // 대표사진 지정: estate.thumb_url 업데이트(thumb_file_id는 비움)
  router.patch("/:id/photos/:photoId/cover", async (req, res) => {
    const id = Number(req.params.id) || 0;
    const pid = Number(req.params.photoId) || 0;
    if (!id || !pid) return res.status(400).json({ ok:false, error:"invalid id" });
    try {
      const [[row]] = await pool.query("SELECT url FROM property_photos WHERE id=? AND property_id=? LIMIT 1", [pid, id]);
      if (!row) return res.status(404).json({ ok:false, error:"photo not found" });
      await pool.query("UPDATE estate SET thumb_url=?, thumb_file_id=NULL WHERE estate_no=?", [row.url, id]);
      res.json({ ok:true, estate_no:id, thumb_url: row.url });
    } catch (e) {
      res.status(500).json({ ok:false, error:String(e) });
    }
  });

  // 썸네일 직접 저장 API(프론트가 drive id 등을 넘겨줄 때 사용)
  router.patch("/:id/thumbnail", async (req, res) => {
    const id = Number(req.params.id) || 0;
    const { thumb_file_id=null, thumb_url=null } = req.body || {};
    if (!id) return res.status(400).json({ ok:false, error:"invalid id" });
    try {
      await pool.query("UPDATE estate SET thumb_file_id=?, thumb_url=? WHERE estate_no=?", [thumb_file_id, thumb_url, id]);
      res.json({ ok:true, estate_no:id, thumb_file_id, thumb_url });
    } catch (e) {
      res.status(500).json({ ok:false, error:String(e) });
    }
  });

  // 구버전 호환(PUT /photo-thumb)
  router.put("/:id/photo-thumb", async (req, res) => {
    req.url = `/${req.params.id}/thumbnail`;
    req.method = "PATCH";
    return router.handle(req, res);
  });
  // ---------------------- /사진 갤러리 API ----------------------

  return router;
};

