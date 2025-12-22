import React, { useState, useRef } from "react";
import PhotoGallery from "./PhotoGallery";
//컴포넌트 components
import ProfitPrintDialog from "./ProfitPrintDialog";
import { formatEstateLine } from "../utils/estateFormatter";
// y/N 판별 헬퍼
const yn = (v) => String(v ?? "").toLowerCase() === "y";

// 전화번호 포맷(국내 기준)
function fmtPhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("02")) {
    if (d.length === 9)  return `02-${d.slice(2,5)}-${d.slice(5)}`;      // 02-xxx-xxxx
    if (d.length === 10) return `02-${d.slice(2,6)}-${d.slice(6)}`;      // 02-xxxx-xxxx
  }
  if (d.length === 11)    return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`; // 010-xxxx-xxxx
  if (d.length === 10)    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`; // 0xx-xxx-xxxx
  if (d.length === 8)     return `${d.slice(0,4)}-${d.slice(4)}`;               // xxxx-xxxx
  return raw; // 포맷 불가시 원문 유지
}

// 층분할 여부 표시: part/whole → "n층 일부/전체"
function fmtFloorType1(v, floor) {
  if (!v) return null;
  const base =
    floor !== undefined &&
    floor !== null &&
    String(floor).trim() !== "" &&
    String(floor) !== "0"
      ? `${floor}층 `
      : "";
  if (v === "part") return `${base}일부`;
  if (v === "whole") return `${base}전체`;
  return null;
}

function telHref(raw){
  const d = String(raw || "").replace(/\D/g, "");
  return d ? `tel:${d}` : "";
}

// 숫자 파싱: 콤마 등 제거
const num = (v) => {
  const s = String(v ?? "").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// 천단위 콤마
const fmt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("ko-KR") : "";
};

// bld_type → 한글명 매핑
const BLD_TYPE_OPTIONS = [
  ["apt","아파트"],
  ["business-bld","업무용빌딩"],
  ["shop-house","상가주택"],
  ["land","토지"],
  ["sale-shop","분양상가"],
  ["s-home-bld","단독주택"],
  ["multi-household","다가구주택"],
  ["single-room","원룸"],
  ["shop","상가"],
  ["multi-purpose","다용도"],
  ["office","사무실"],
  ["e-apt","오피스텔"],
  ["etc","기타"],
  ["metro-house","도시형주택"],
  ["multi-house","다세대주택"],
  ["row-house","연립주택"],
  ["single-room-owner","원룸주인세대"],
  ["villa","빌라"],
];

const BLD_TYPE_LABEL_MAP = Object.fromEntries(BLD_TYPE_OPTIONS);


// ▼ 리스트 타이틀: 건물명/상호명 + 층/호/대체표기
function Title({ p }) {
  const estateType = String(p.estate_type || "").trim();

  // ✅ grade_condition → title 스타일
  const grade = String(p.grade_condition || "").trim();
  let titleStyle = {};
  if (grade === "manage") {
    // 연두 배경 + 가독성 텍스트
    titleStyle = {
      backgroundColor: "#c8f5a8",
      color: "#1f3d08",
      padding: "2px 6px",
      borderRadius: 4,
      display: "inline-block"
    };
  } else if (grade === "prohibit") {
    // 빨강 배경 + 가독성 텍스트
    titleStyle = {
      backgroundColor: "#ff4d4f",
      color: "#ffffff",
      padding: "2px 6px",
      borderRadius: 4,
      display: "inline-block"
    };
  } else if (grade === "attentive") {
    // 주황색 텍스트
    titleStyle = { color: "#fa8c16" };
  } else if (grade === "recommend-price") {
    // 파란색 텍스트
    titleStyle = { color: "#1677ff" };
  } else if (grade === "recommend") {
    // 초록색 텍스트
    titleStyle = { color: "#389e0d" };
  } else if (grade === "nonrecommend") {
    // 연회색 텍스트
    titleStyle = { color: "#bfbfbf" };
  }

  // ── 상업용 / 업무용 ─────────────────────────
  if (estateType === "commerce" || estateType === "business") {
    // left: 건물명 + 상호명, 둘 다 없으면 bld_type 한글
    const estateName =
      p.estate_name &&
      String(p.estate_name).trim() !== "" &&
      String(p.estate_name).trim() !== "0"
        ? String(p.estate_name).trim()
        : "";

    const shopName =
      p.shop_name &&
      String(p.shop_name).trim() !== "" &&
      String(p.shop_name).trim() !== "0"
        ? String(p.shop_name).trim()
        : "";

    const bldLabel =
      BLD_TYPE_LABEL_MAP[p.bld_type] ||
      (estateType === "business" ? "업무용빌딩" : "상업용");

    let left = "";
    if (estateName && shopName) {
      left = `${estateName} ${shopName}`;
    } else if (estateName) {
      left = estateName;
    } else if (shopName) {
      left = shopName;
    } else {
      left = bldLabel;
    }

    // ✅ right: 해당호수 → 호수대체 → (해당층 + 층분할여부)
    let right = "";

    const hoVal = Number(p.estate_ho) > 0 ? Number(p.estate_ho) : null;
    const hasFloorEtc =
      p.floor_etc &&
      String(p.floor_etc).trim() !== "" &&
      String(p.floor_etc).trim() !== "0";

    if (hoVal) {
      // 1) 해당호수
      right = `${hoVal}호`;
    } else if (hasFloorEtc) {
      // 2) 호수대체
      right = String(p.floor_etc).trim();
    } else if (p.floor_type1) {
      // 3) 해당층 + 층분할여부 (층 일부 / 층 전체)
      right = fmtFloorType1(p.floor_type1, p.floor) || "";
    } else {
      right = "";
    }

    const titleText = right ? `${left} • ${right}` : left;
    return (
      <div className="title" style={titleStyle}>
        {titleText}
      </div>
    );
  }

  // ── 그 외(residence 등): 기존 규칙 유지 ───────────
  const name = p.estate_name || p.bld_type || "매물";
  const dongho = [
    p.estate_dong ? `${p.estate_dong}동` : null,
    p.estate_ho ? `${p.estate_ho}호` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const fallback =
    p.floor_etc ||
    fmtFloorType1(p.floor_type1, p.floor) ||
    p.floor_type2 ||
    (p.floor ? `${p.floor}층` : "");

  const right = dongho || fallback || "";
  return (
    <div className="title" style={titleStyle}>
      {right ? `${name} • ${right}` : name}
    </div>
  );
}

function UpdateInfo({ p }) {
  const dt =
    (typeof fmtDateTime === "function" && fmtDateTime(p.update_date, p.update_time)) ||
    (p.update_date ? String(p.update_date) : "") ||
    (p.modify_date ? String(p.modify_date) : "");
  if (!dt) return null;
  return <div className="meta">{p.update_id ? `${p.update_id} · ` : ""}수정 {dt}</div>;
}

function IdInfo({ p }) {
  const id = p.estate_no ?? p.id ?? null;
  if (!id) return null;
  return <div className="meta">No. {id}</div>;
}

function Address({ p }) {
  const addr =
    p.roadAddress ||
    (p.dong ? `${p.dong} ${p.jibun || ""}`.trim() : (p.jibun || "")) ||
    "";
  if (!addr) return null;
  return <div className="addr">{addr}</div>;
}

function Price({ p }) {
    if (p?.estate_no === 46560) {
    console.log({
      fee_year: p.fee_year,
      price_deposit: p.price_deposit,
      price_premium: p.price_premium,
    });
  }
  const base = p.price || "";
  const et = String(p.estate_type || "").trim();
  if (et === "commerce" || et === "business") {
    const fy = num(p.fee_year);          // 보증금
    const pp = num(p.price_premium);     // 시설·권리
    if (pp != null && pp > 0) {
      const total = (fy ?? 0) + pp;      // 합계금액 = 보증금 + 권리금
      const extra = `시설·권리 ${fmt(pp)} · 합계금액 ${fmt(total)}`;
      return <div className="price">{[base, extra].filter(Boolean).join(" · ")}</div>;
    }
  }
  return <div className="price">{base}</div>;
}

  function Section({ title, left, right }) {
    return (
      <div className="detail-section">
        <div className="detail-grid">
          <div className="d-left">{left}</div>
          <div className="d-right">
            <div className="detail-title">{title}</div>
            {right}
          </div>
        </div>
      </div>
    );
  }

function RightCol({ p }) {
  
  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const isY = yn;  // 한 줄만 유지

  // profit 전용 금액 표시 계산
  const estateType = String(p.estate_type || "").trim();
  // ProfitPrintDialog.js의 총보증금/총월세/총관리비와 동일한 우선순위
  const sumFromItems = (items = []) => {
    let deposit = 0, monthly = 0, mgmt = 0;
    for (const r of items) {
      const tn = v => Number(String(v ?? "").replace(/[, ]/g, "")) || 0;
      deposit += tn(r.deposit);
      monthly += tn(r.monthly);
      mgmt    += tn(r.mgmtFee);
    }
    return { deposit, monthly, mgmt };
  };
  const tn = v => Number(String(v ?? "").replace(/[, ]/g, "")) || 0;
  const itemsSum = sumFromItems(p.rent_items);

  // 총보증금: (임대현황 합계) -> sale_type_rent_year -> fee_year
  const depositY =
    (itemsSum.deposit > 0 ? itemsSum.deposit :
    (tn(p.sale_type_rent_year) || tn(p.fee_year)));

  // 총월세: (임대현황 합계) -> sale_type_rent_month -> fee_month
  const rentM =
    (itemsSum.monthly > 0 ? itemsSum.monthly :
    (tn(p.sale_type_rent_month) || tn(p.fee_month)));

  // 총관리비: (임대현황 합계) -> f_price_total_mgr -> (price_per_household * rent_household_cnt)
  const mgrM =
    (itemsSum.mgmt > 0 ? itemsSum.mgmt :
    (tn(p.f_price_total_mgr) || (tn(p.price_per_household) * tn(p.rent_household_cnt))));
  const showProfitMoney = estateType === "profit";  

  // ---- 임대승계/입주가능 포맷 ----
  const fmtSubLiving = (p) => (isY(p.sale_type_sub_living) ? "입주가능" : null);
  const fmtSubRent = (p) => {
    if (!isY(p.sale_type_sub_rent)) return null;
    const t = String(p.sale_type_rent || "").toLowerCase(); // 'y' | 'm' | 's'
    const y = p.sale_type_rent_year ?? "";
    const m = p.sale_type_rent_month ?? "";
    if (t === "y") return `임대승계(전세 ${y})`;
    if (t === "m") return `임대승계(월세 ${y}${m ? ` / ${m}` : ""})`;
    if (t === "s") return `임대승계(단기 ${y}${m ? ` / ${m}` : ""})`;
    return "임대승계";
  };

  // ---- 표시 조건: profit 이거나, residence 이면서 rent_type_4deal = 'y' ----
  const canShowDealSubs =
    p.estate_type === "profit" ||
    (p.estate_type === "residence" && isY(p.rent_type_4deal));

  // ---- 설비/상태 태그 ----
  const tags = [];
  if (isY(p.living_condition_ev)) tags.push("승강기");

  if (canShowDealSubs) {
    const living = fmtSubLiving(p);
    const rent   = fmtSubRent(p);
    if (living) tags.push(living);
    if (rent)   tags.push(rent);
  }

  if (isY(p.internal_condition_interior))  tags.push("인테리어");
  if (isY(p.internal_condition_water))     tags.push("수도시설");
  if (isY(p.internal_condition_city_gas))  tags.push("도시가스");
  if (isY(p.bath_division))                tags.push("화장실 남녀구분");
  if (isY(p.bath_inside))                  tags.push("화장실 내부");
  if (isY(p.external_condition_exsign))    tags.push("옥외광고");

  // 난방/냉방
  const heat = String(p.heat_condition || "");
  if      (heat === "center")       tags.push("중앙난방");
  else if (heat === "floor")        tags.push("층별난방");
  else if (heat === "private-heat") tags.push("개별난방");

  const cold = String(p.cold_condition || "");
  if      (cold === "center")  tags.push("중앙냉방");
  else if (cold === "private") tags.push("개별냉방");
  
  // ---- 기존 우측 정보 유지 ----
  const room = toNum(p.room_cnt);
  const bath = toNum(p.bath_cnt);
  const pph  = toNum(p.price_per_household); // 관리비(만원)
  const pcnt = toNum(p.parking_cnt);         // 주차대수
  const pfee = toNum(p.parking_fee);         // 주차비(만원)

  const ownerY = String(p.owner_household || "").toLowerCase() === "y";
  const oroom = toNum(p.owner_room);
  const obath = toNum(p.owner_bath);

  const usedM2 = toNum(p.used_scale);
  const usedPy = toNum(p.used_scale_square);
  const exM2   = toNum(p.exclusive_scale); // 전용 ㎡
  const exPy   = toNum(p.exclusive_scale_square ?? p.exclusive_area_p); // 전용 평 폴백

  const showUsedLine =
    (p.estate_type === "business" || p.estate_type === "commerce") &&
    (usedM2 !== null || usedPy !== null);

  const eligibleBldForExclusive = [
    "apt","e-apt","metro-house","multi-house","villa","row-house","sale-shop"
  ].includes(p.bld_type);


  
  return (
    <div className="right-col" style={{minWidth:0}}>
      {showProfitMoney && depositY !== null && (
        <div>총임대보증금 {fmt(depositY)}</div>
      )}
      {showProfitMoney && (rentM !== null || mgrM !== null) && (
        <div>
          총월세 {fmt((rentM ?? 0) + (mgrM ?? 0))}
          {mgrM !== null ? ` (관리비 ${fmt(mgrM)} 포함)` : ""}
        </div>
      )}
      {/* 새 태그 라인 */}
      {tags.length > 0 && <div>{tags.join(" · ")}</div>}
      
      {/* 룸/욕실: residence만 */}
      {p.estate_type === "residence" && room !== null && bath !== null && (
        <div>{room} 룸 / {bath}</div>
      )}

      {/* 주인세대: profit */}
      {p.estate_type === "profit" && ownerY && oroom !== null && obath !== null && (
        <div>주인세대 {Math.floor(oroom)} 룸 / {Math.floor(obath)}</div>
      )}

      {/* 면적: business|commerce → 실면적 우선, 없으면 주거형 전용 */}
      {showUsedLine ? (
        <div>실 {usedM2 ?? "-"}㎡ ({usedPy ?? "-"} 평)</div>
      ) : eligibleBldForExclusive && exM2 !== null ? (
        <div>전용 {exM2}㎡ ({exPy ?? "-"} 평)</div>
      ) : null}

      {/* 베란다 */}
      {String(p.living_condition_terrace || "").toLowerCase() === "y" && <div>베란다</div>}

      {/* 관리비 */}
      {estateType !== "profit" && pph !== null && pph > 0 && <div>관 {pph}</div>}

      {/* 주차 */}
      {pcnt !== null && pcnt > 0 ? (
        <div>주차 {pcnt}대{pfee !== null && pfee >= 0.1 ? ` / ${pfee} 만원` : ""}</div>
      ) : (
        <div>주차 확인필요</div>
      )}

    </div>
  );
}



const FLOOR_MAP = { part:"층 일부", whole:"층 전체", bottom:"바닥층", parking:"주차장방", top:"옥탑방" };

// 값 중 첫 번째로 유효한 것 반환
const pick = (...vals) => {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== "" && s.toLowerCase() !== "null" && s.toLowerCase() !== "undefined") {
      return s;
    }
  }
  return "";
};

function formatResidenceSubLine(p) {
  if (p.estate_type !== "residence") return "";

   const dong = pick(p.estate_dong);
   const name = pick(p.estate_name);
   const namePart = name ? `${name} •` : "";   // ← estate_name 뒤에 •
  const ho   = pick(p.estate_ho);


  const dongPart = dong ? `${dong}동` : "";
  let tail = "";

  if (ho) {
    tail = `${ho}호`;
  } else {
    const t = pick(p.floor_etc, p.floor_type1, p.floor_type2);
    if (t) tail = FLOOR_MAP[String(t).trim()] || String(t).trim();
  }

  // 건물명(•) (동/호/층)
  return [namePart, dongPart, tail].filter(Boolean).join(" ");
}

// ★ 1. 상업용/업무용 매물 이름과 호/층을 포맷하는 새 함수 추가
function formatCommercialLine(p = {}) {
  // 이름 부분: shop_name -> estate_name -> estate_type 순서로 대체
  const baseName = pick(p.shop_name, p.estate_name, p.estate_type);
  const namePart = baseName ? `${baseName} •` : "";   // ← 뒤에
  

  // ★ estate_dong 값을 가져와 "ㅇㅇ동" 형태로 만드는 로직 추가
  const dong = pick(p.estate_dong);
  const dongPart = dong ? `${dong}동` : "";

  // 층/호수 부분: estate_ho -> floor_etc -> floor_type1 -> floor 순서로 대체
  let floorPart = pick(p.estate_ho); // 1순위: 호
  const ho   = pick(p.estate_ho);
  
  if (ho) { // ★ 호 정보가 있으면
    floorPart = `${ho}호`; // ★ " 호"를 붙여줍니다.
  } else { // 호 정보가 없을 경우
    let floorToken = pick(p.floor_etc, p.floor_type1);
    if (floorToken) {
      floorPart = FLOOR_MAP[floorToken] || floorToken;
    } else if (pick(p.floor)) {
      floorPart = `${pick(p.floor)}층`;
    }
  }

  // 최종적으로 이름과 층/호수 정보를 합쳐서 반환
  return [namePart, dongPart, floorPart].filter(Boolean).join(" ");
}

export default function PropertyList({
  properties = [],
  loading = false,
  highlightedId = null,     // ★ 추가: 현재 선택된 id
  onSelect = () => {},      // ★ 추가: 클릭 시 선택 콜백
  onHover,
  onLeave,
  displaySource = "server",   // ← App에서 내려줄 값
  onEditEstate = () => {},
  onCopyEstate = () => {},
  onContractEstate = () => {},
}) {
  
  const [printOpenFor, setPrintOpenFor] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [thumbVer, setThumbVer] = useState(Date.now());
  // App에서 내려준 properties 순서를 그대로 사용하기 위한 내부 사본
  const [list, setList] = useState(properties);

  // props가 바뀌면 항상 같은 순서로 반영
  React.useEffect(() => {
    setList(properties);
  }, [properties]);
  const withVer = (u) => u ? `${u}${u.includes('?') ? '&' : '?'}t=${thumbVer}` : u
  const FALLBACK_NOIMG = "/static/thumbs/no_img.jpg";
  const normalizeThumb = (u) => {
    const s = String(u ?? "").trim().toLowerCase();
    if (!s || s === "null" || s === "undefined") return FALLBACK_NOIMG;
    return u;
  };

  React.useEffect(() => {
    const handler = () => setThumbVer(Date.now());
    window.addEventListener("photo:changed", handler);
    return () => window.removeEventListener("photo:changed", handler);
  }, []);

  // 특정 매물의 커버 변경 이벤트 수신 → 리스트 한 항목만 즉시 갱신
  React.useEffect(() => {
    const onCover = (e) => {
      const { estateNo, url } = e.detail || {};
      if (!estateNo) return;
      setList(prev => (prev || []).map(x =>
        Number(x.estate_no) === Number(estateNo) ? { ...x, thumb_url: url || null } : x
      ));
      setThumbVer(Date.now()); // 캐시 버스터
    };
    window.addEventListener("photo:cover", onCover);
    return () => window.removeEventListener("photo:cover", onCover);
  }, []);

  const items = Array.isArray(list) ? list : [];     // ← 내부 list 사용
  //console.log('[PropertyList] items.len=', items.length, items[0]);
  if (items.length === 0) {
    return <div className="list empty">데이터 없음</div>;
  }
  // estate_no를 최우선. 숫자/문자 혼용 대비해 Number 우선 변환.
  const getId = (p, idx) => {
    const raw = (p?.estate_no ?? p?.id ?? idx);
    return Number.isFinite(Number(raw)) ? Number(raw) : String(raw);
  };

  // 거래유형 라벨러
  const tradeLabel = (p) => {
    const arr = Array.isArray(p.rent_types) ? p.rent_types : [];
    const m = {
      deal: "매매",     // rent_type_4deal === 'y'
      rent: "월세",
      sale: "분양",
      auction: "경매",
      short: "단기",
      charter: "전세",
    };
    if (arr.length) return m[arr[0]] || arr[0];
    // price 문자열에 "매매" 포함 시
    if (String(p.price||"").includes("매매")) return "매매";
    return null;
  };

  return (
    <>
      <div className="list property-list">
          {items.map((p, idx) => {
            const id = getId(p, idx);             // id는 Number 또는 String 하나로만
            const estateNo = Number(p?.estate_no ?? id);
            const selected = highlightedId != null && (p.id === highlightedId || p.estate_no === highlightedId || id === highlightedId);
            const notContract = String(p.contract_yn || "").toLowerCase() !== "y";
            const opened = Number(expandedId) === Number(id);
            return (
              <div
                key={estateNo}                     // 키도 estate_no 기준이 가장 안정적
                className={`list-row ${selected ? "selected" : ""} ${notContract ? "not-contract" : ""} ${opened ? "opened" : ""}`}
                onClick={(e) => {
                  if (e.target.closest('.pg-root')) return; // 갤러리 내부 클릭은 행 토글 금지
                  if (opened) { setExpandedId(null); onSelect && onSelect(null); }
                  else { setExpandedId(estateNo); onSelect && onSelect(estateNo); }
                  console.log("[row-click]", { estateNo });
                }}
                >

            <div className="summary" style={{display:"flex", alignItems:"stretch", gap:12, paddingBottom:8, marginBottom:8}}>
                  {/* 대표썸네일 */}
                  {(p.estate_type === "residence"
                    || p.estate_type === "business"
                    || p.estate_type === "commerce"
                    || p.estate_type === "profit") && (
                    <div className="thumb-col" style={{marginRight:0}}>
                      <img
                        key={`${estateNo}-${thumbVer}`}
                        src={withVer(normalizeThumb(p.thumb_url))}
                        onError={(e)=>{ e.currentTarget.onerror=null; e.currentTarget.src = withVer(FALLBACK_NOIMG); }}
                        alt=""
                        style={{ width:72, height:72, objectFit:"cover", borderRadius:6, background:"#f2f2f2" }}
                      />
                    </div>
                  )}

                  {/* 좌측: 등록번호 · 거래유형 · 소재지 + 가격 */}
                  <div
                    className="left-col"
                    style={{
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      {/* 건물명 + 동/호(또는 층대체 포함) */}
                      <Title p={p} />
                      <Address p={p} />
                    </div>
                    <div>
                      <Price p={p} />
                      {String(p.estate_type || "").trim() === "profit" ? (
                        <div>{(p.site_amount_square ?? p.site_area_p) ? `${p.site_amount_square ?? p.site_area_p} 평` : null}</div>
                      ) : null}
                      <IdInfo p={p} />
                      <UpdateInfo p={p} />
                    </div>
                  </div>
                  {/* 우측 컬럼: RightCol 묶음 (동/호는 좌측 title에서 처리) */}
                  <div className="right-col" style={{marginLeft:"auto", minWidth:260, textAlign:"right", display:"flex", flexDirection:"column", justifyContent:"space-between"}}>
                    <div>
                      <RightCol p={p} />
                    </div>
                  </div>
                </div>
                
                {/* 상세영역: 타입별 공통 */}
                 <div className={`details ${opened ? "expand" : ""}`}>
                   {opened && 
                   <div className="detail-section">
                       <>
                         {/* 상단 버튼 행: 왼쪽 수정/복사/거래완료, 오른쪽 상세내역 */}
                         <div
                           style={{
                             display: "flex",
                             alignItems: "center",
                             justifyContent: "space-between",
                             marginBottom: 8,
                           }}
                         >
                           {/* 왼쪽: 수정 / 복사 / 거래완료 */}
                           <div
                             style={{
                               display: "flex",
                               alignItems: "center",
                               gap: 8,
                             }}
                           >
                             <button
                               type="button"
                               style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6, background: "#fff" }}
                               onClick={(e) => {
                                 e.stopPropagation();
                                if (typeof onEditEstate === "function") {
                                  onEditEstate(p);
                                }
                               }}
                             >
                               수정
                             </button>
                             <button
                               type="button"
                               style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6, background: "#fff" }}
                               onClick={(e) => {
                                if (typeof onEditEstate === "function") {
                                  onCopyEstate(p);
                                }
                               }}
                             >
                               복사
                             </button>
                             <button
                               type="button"
                               style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6, background: "#fff" }}
                               onClick={(e) => {
                                 e.stopPropagation();
                                if (typeof onEditEstate === "function") {
                                  onContractEstate(p);
                                }
                               }}
                             >
                               거래완료
                             </button>
                           </div>

                           {/* 오른쪽: 상세내역 (수익성일 때만 노출, 왼쪽과 100px 정도 간격) */}
                           <div style={{ marginLeft: 100 }}>
                             {p.estate_type === "profit" && (
                               <button
                                 type="button"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   setPrintOpenFor(p);
                                 }}
                                 style={{
                                   padding: "6px 10px",
                                   border: "1px solid #ddd",
                                   borderRadius: 8,
                                   background: "#fff",
                                 }}
                               >
                                 상세내역
                               </button>
                             )}
                           </div>
                         </div>

                         <CommonDetail p={p} />
                          {(p.estate_type === "residence" ||
                            p.estate_type === "business" ||
                            p.estate_type === "commerce") && (
                            <div style={{ marginTop: 8 }}>
                            </div>
                          )}
                        {p.estate_type === "profit" && <ProfitDetail p={p} />}
                        {/* 주거/업무/상업/수익성: 확장영역에 전체 사진 갤러리 */}
                        {(p.estate_type === "residence"
                          || p.estate_type === "business"
                          || p.estate_type === "commerce"
                          || p.estate_type === "profit") && (
                          <div style={{ marginTop:8 }}>
                            <PhotoGallery propertyId={p.estate_no} 
                              onCoverChanged={(url) => {
                                // 대표사진 즉시 반영 및 expandedId 상태도 함께 유지
                                setList((prev) =>
                                  (prev || []).map((x) =>
                                    Number(x.estate_no) === Number(p.estate_no)
                                      ? { ...x, thumb_url: url }
                                      : x
                                  )
                                );
                                setThumbVer(Date.now());

                                // 확장/축소 시에도 대표사진이 유지되도록 강제 업데이트
                                setExpandedId((prev) => (prev === p.estate_no ? p.estate_no : prev));
                              }}/>
                          </div>
                        )}
                      </>
                  </div>
                  }
                </div>
              </div>
            );
          })}
      </div>
      {/* 모달은 리스트 밖에서 단일 렌더 */}
      <ProfitPrintDialog
        key={printOpenFor?.estate_no || printOpenFor?.id || 'none'}
        open={!!printOpenFor}
        property={printOpenFor}
        onClose={()=>setPrintOpenFor(null)}
        displaySource={displaySource}   // ← 여기 추가
        onUpdated={({ estate_no, thumb_url, thumb_file_id }) => {
          // 리스트 데이터 즉시 갱신
          setList(prev => (prev || []).map(p =>
            Number(p.estate_no) === Number(estate_no)
              ? { ...p, thumb_url, thumb_file_id }
              : p
          ));
          setThumbVer(Date.now()); // 캐시 무효화
        }}
      />
    </>
  );
 }

  function Field({ label, value }) {
    if (value === null || value === undefined || value === "" || value === false) return null;
    return <div className="frow">{`${label} ${value}`}</div>;
  }

// 여러 줄 의뢰인 표시: 이름 + tel:링크
function ContactsBlock({ lines = [] }) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  return (
    <div>
      {lines.map((c, i) => {
        if (typeof c === "string") return <div key={i} className="frow">{c}</div>;
        const name = (c.name || "").trim();
        const href = telHref(c.phone);
        const label = c.formatted || c.phone || "";
        return (
          <div key={i} className="frow">
            {name && <span>{name} </span>}
            {href ? <a href={href}>{label}</a> : <span>{label}</span>}
          </div>
        );
      })}
    </div>
  );
}

  function pad2(n){return String(n).padStart(2,"0");}
  function fmtDateTime(dateStr, timeStr){
    const s = [String(dateStr||"").trim(), String(timeStr||"").trim()].filter(Boolean).join(" ");
    if (!s) return null;
    const tryISO = s.replace(" ", "T");
    const d = new Date(tryISO);
    if (!isNaN(d)) {
      return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    const m = s.match(/(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}))/);
    return m ? `${m[1]} ${m[2]}:${m[3]}` : s;
  }

  function CommonDetail({ p }) {
  const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

  // 건물규모
  const bUnder = n(p.bld_scale_under);
  const bUp = n(p.bld_scale);
  const floorTotal = n(p.floor_total);
  let bScale = null;
  if (bUnder !== null || bUp !== null) {
    const parts = [];
    if (bUnder !== null) parts.push(`지하 ${bUnder}층`);
    if (bUp !== null) parts.push(`지상 ${bUp}층`);
    bScale = parts.join(" / ");
  } else if (floorTotal !== null) {
    bScale = `${floorTotal}층`;
  }

  // 관리비 포함내역
  const mgrItems = [
    yn(p.price_mgr_item_basic) ? "기본관리비" : null,
    yn(p.price_mgr_item_water) ? "수도" : null,
    yn(p.price_mgr_item_internet) ? "인터넷" : null,
    yn(p.price_mgr_item_online) ? "유선" : null,
    yn(p.price_mgr_item_heat) ? "난방" : null,
    yn(p.price_mgr_item_elec) ? "전기" : null,
  ].filter(Boolean);
  const mgrList = mgrItems.length ? mgrItems.join(" / ") : null;

  // 난방방식
  const heatMap = {
    "private-heat": "개별난방",
    center: "중앙난방",
    floor: "층난방",
  };
  const heat = heatMap[String(p.heat_condition || "").toLowerCase()] || null;
  // ▼ commerce/business 우측열 요약
  const featuresCommerce = [
    yn(p.internal_condition_interior) && "인테리어",
    yn(p.internal_condition_water) && "수도시설",
    yn(p.internal_condition_city_gas) && "도시가스",
  ].filter(Boolean).join(" / ");
  const featuresBusiness = [
    yn(p.internal_condition_interior) && "인테리어",
    yn(p.bath_division) && "화장실 남녀구분",
    yn(p.bath_inside) && "화장실 내부",
    yn(p.external_condition_exsign) && "옥외광고",
  ].filter(Boolean).join(" / ");
  const heatMapBiz = { center:"중앙난방", floor:"층별난방", "private-heat":"개별난방" };
  const coldMapBiz = { center:"중앙냉방", private:"개별냉방" };
  const hvacRaw = [
    heatMapBiz[String(p.heat_condition||"").toLowerCase()] || null,
    coldMapBiz[String(p.cold_condition||"").toLowerCase()] || null,
  ].filter(Boolean).join(" / ");
  const hvac = hvacRaw || null;

  // 이용역과 거리
  const station = p.station || null;
  const sd = n(p.station_distance);
  const stationLine = station
    ? `${station}${sd !== null ? ` / ${sd}분` : ""}`
    : sd !== null
    ? `${sd}분`
    : null;

  // 의뢰인 정보 1~5: 전화번호가 없으면 둘 다 출력 안 함
  const contacts = [];
  for (let i = 1; i <= 5; i++) {
    const phone = String(p[`contact_phone${i}`] ?? "").trim();
    if (!phone) continue; // 전화가 없으면 스킵
    const name = String(p[`contact_name${i}`] ?? "").trim();
    contacts.push({ name, phone, formatted: fmtPhone(phone) });
  }


  // 거주인정보(존재 시만 표시)
  const resident =
    p.resident_name || p.resident_phone || p.resident_memo
      ? [p.resident_name, p.resident_phone, p.resident_memo].filter(Boolean).join(" / ")
      : null;
  // 주거형 전용 표시값(우측 컬럼에 합류)
  const heatMapRes = { "private-heat":"개별난방", center:"중앙난방", floor:"층난방" };
  const heatRes = heatMapRes[String(p.heat_condition || "").toLowerCase()] || null;
  const terrace = String(p.living_condition_terrace || "").toLowerCase() === "y" ? "있음" : null;

  return (
    <Section
      left={
        <>
          <Field label="등록일" value={fmtDateTime(p.register_date, p.register_time)} />
          <Field label="사용승인일" value={p.completion_year || null} />
          <Field label="건물규모" value={bScale} />
          <Field label="이용역/거리" value={stationLine} />
          <Field label="" value={p.register_memo || null} />
          {/* 의뢰인: 줄바꿈으로 다중 출력 */}
          <ContactsBlock lines={contacts} />
        </>
      }
      right={
        <>
          <Field label="" value={mgrList} />
          <Field label="거주인" value={resident} />
          {/* 주거형도 동일 위치에 출력 */}
          {p.estate_type === "residence" && heatRes && (
            <Field label="" value={heatRes} />
          )}
          {p.estate_type === "commerce" && featuresCommerce && (
            <Field value={featuresCommerce} />
          )}
          {p.estate_type === "business" && featuresBusiness && (
            <Field label="" value={featuresBusiness} />
          )}
          {p.estate_type === "business" && hvac && (
            <Field label="" value={hvac} />
          )}
        </>
      }
    />
  );
}

function ResidenceDetail({ p }) {
  const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const exm2 = n(p.exclusive_scale);
  const expy = n(p.exclusive_scale_square);
  const room = n(p.room_cnt);
  const bath = n(p.bath_cnt);
  const floorDisp =
    p.estate_dong || p.estate_ho || p.floor_etc || p.floor_type1 || p.floor_type2
      ? [p.estate_dong ? `${p.estate_dong}동` : null, p.estate_ho ? `${p.estate_ho}호` : null]
          .filter(Boolean)
          .join(" / ")
      : null;
  const heatMap = { "private-heat":"개별난방", center:"중앙난방", floor:"층난방" };
  const heat = heatMap[String(p.heat_condition || "").toLowerCase()] || null;

  // commerce 시설
  const featuresCommerce = [
    yn(p.internal_condition_interior) ? "인테리어" : null,
    yn(p.internal_condition_water)    ? "수도시설" : null,
    yn(p.internal_condition_city_gas) ? "도시가스" : null,
  ].filter(Boolean).join(" / ") || null;

  // business 시설+냉난방
  const featuresBusiness = [
    yn(p.internal_condition_interior) ? "인테리어" : null,
    yn(p.bath_division)               ? "화장실 남녀구분" : null,
    yn(p.bath_inside)                 ? "화장실 내부" : null,
    yn(p.external_condition_exsign)   ? "옥외광고" : null,
  ].filter(Boolean).join(" / ") || null;
  const heatMapBiz = { center:"중앙난방", floor:"층별난방", "private-heat":"개별난방" };
  const coldMapBiz = { center:"중앙냉방", private:"개별냉방" };
  const hvac = [
    heatMapBiz[String(p.heat_condition||"").toLowerCase()] || null,
    coldMapBiz[String(p.cold_condition||"").toLowerCase()] || null,
  ].filter(Boolean).join(" / ") || null;


  return (
    <Section
      title="주거형"
      left={
        <>
          <Field label="베란다" value={String(p.living_condition_terrace || "").toLowerCase() === "y" ? "있음" : null} />
        </>
      }
      right={
        <>
          <Field label="난방방식" value={heat} />
        </>
      }
    />
  );
}

function ProfitDetail({ p }) {
  const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const oroom = n(p.owner_room);
  const obath = n(p.owner_bath);
  return null; // 다음 단계에서 실제 섹션 붙일 예정
}

function BusinessDetail({ p }) {
  const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const um2 = n(p.used_scale);
  const upy = n(p.used_scale_square);
  const features = [
    yn(p.internal_condition_interior) ? "인테리어" : null,
    yn(p.bath_division)               ? "화장실 남녀구분" : null,
    yn(p.bath_inside)                 ? "화장실 내부" : null,
    yn(p.external_condition_exsign)   ? "옥외광고" : null,
  ].filter(Boolean).join(" / ") || null;
  const heatMap = { center:"중앙난방", floor:"층별난방", "private-heat":"개별난방" };
  const coldMap = { center:"중앙냉방", private:"개별냉방" };
  const hvac = [heatMap[String(p.heat_condition||"").toLowerCase()]||null,
                coldMap[String(p.cold_condition||"").toLowerCase()]||null]
               .filter(Boolean).join(" / ") || null;
  return (
    <Section
      title="업무용"
      left={
        <>
          <Field label="실면적" value={um2 !== null || upy !== null ? `실 ${um2 ?? "-"}㎡ (${upy ?? "-"} 평)` : null} />
          <Field label="층" value={p.floor || null} />
          <Field label="명칭" value={p.shop_name || p.estate_name || null} />
        </>
      }
      right={
        <>
          <Field label="시설" value={features} />
          <Field label="냉난방" value={hvac} />
        </>
      }
    />
  );
}

function CommerceDetail({ p }) {
  const n = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const um2 = n(p.used_scale);
  const upy = n(p.used_scale_square);
  const features = [
    yn(p.internal_condition_interior)   ? "인테리어" : null,
    yn(p.internal_condition_water)      ? "수도시설" : null,
    yn(p.internal_condition_city_gas)   ? "도시가스" : null,
  ].filter(Boolean).join(" / ") || null;

  return (
    <Section
      title="상업용"
      left={
        <>
          <Field label="실면적" value={um2 !== null || upy !== null ? `실 ${um2 ?? "-"}㎡ (${upy ?? "-"} 평)` : null} />
          <Field label="층" value={p.floor || null} />
          <Field label="명칭" value={p.shop_name || p.estate_name || null} />
        </>
      }
      right={
        <>
          <Field label="시설" value={features} />
        </>
      }
    />
  );
}

