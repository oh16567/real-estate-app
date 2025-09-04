import React, { useEffect, useState } from "react";
import { getProperties } from "./api/propertyApi";
import KakaoMap from "./components/KakaoMap";
import PropertyList from "./components/PropertyList";
import RegionSelector from "./components/RegionSelector";
import "./styles/OverlayPanel.css";
import "./components/Layout.css";

// === (추가) 날짜 유틸 ===
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function sixMonthsAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0,10);
}

const ESTATE_TYPE_LABELS = {
  residence: "주거용",
  profit: "수익성",
  business: "업무용",
  commerce: "상업용",
};
const BLD_TYPE_LABELS = {
  "apt":"아파트","multi-house":"다중주택","multi-household":"다가구주택",
  "single-room":"원룸","metro-house":"도생","villa":"다세대",
  "shop":"상가","multi-purpose":"다용도","office":"사무실","e-apt":"오피스텔",
};

// === (교체) 기존 DEFAULT_FILTERS를 아래로 바꾸세요 ===
const DEFAULT_FILTERS = {
  register_date_from:"", register_date_to:"",
  // 수정일 기본값: 오늘 ~ 6개월 전
  update_date_from: sixMonthsAgoISO(),
  update_date_to: todayISO(),
  estate_type:[], bld_type:[],
  rent_type_4deal:false, rent_type_1year:false, rent_type_2month:false,
  rent_type_3short:false, rent_type_5sale:false, rent_type_6auction:false,
  q:""
};

const DEFAULT_CENTER = { lat:37.5665, lng:126.9780, level:7 };
const DEFAULT_PAGE_SIZE = 20;


export default function App() {
  // ---------- 상태 ----------
  const [tab, setTab] = useState("search");
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [visibleSections, setVisibleSections] = useState({
  	region:true, register_date:true, update_date:true,
  	estate_type:true, bld_type:true, rent_types:true, search:true
  });
  const [hoverId, setHoverId] = useState(null);   // 리스트에서 마우스 오버한 항목 id
  const [highlightedId, setHighlightedId] = useState(null);
  const [showFilters, setShowFilters] = useState(true); // 기본: 열린 상태  
  const getId = (p) => p?.id ?? p?.estate_no ?? `${p?.lat},${p?.lng}`; // === 선택/식별 유틸 ===
  const findById = (id, list) => (list || []).find(p => getId(p) === id);


  // ---------- persist ----------
// === 페이지 접속/새로고침 시 항상 초기값으로 ===
  useEffect(() => {
    resetAll();
    // 여기서 load() 부르지 않음. 아래 로딩 useEffect가 자동 처리
  }, []);


//  위의 const [visibleSections, setVisibleSections].... 때문에 남겨뒀는데 에러나면 삭제


  // ---------- 쿼리 파라미터 ----------
// === API 파라미터 구성 ===
const buildParams = () => {
  const p = { page, pageSize };
  if (filters.register_date_from) p.register_date_from = filters.register_date_from;
  if (filters.register_date_to)   p.register_date_to   = filters.register_date_to;
  if (filters.update_date_from)   p.update_date_from   = filters.update_date_from;
  if (filters.update_date_to)     p.update_date_to     = filters.update_date_to;
  if (filters.estate_type?.length) p.estate_type = filters.estate_type.join(",");
  if (filters.bld_type?.length)    p.bld_type    = filters.bld_type.join(",");
  ["rent_type_4deal","rent_type_1year","rent_type_2month",
   "rent_type_3short","rent_type_5sale","rent_type_6auction"].forEach(k=>{
    if (filters[k]) p[k] = "y";
  });
  if (filters.q) p.q = filters.q;
  return p;
};

  // ---------- 로드 ----------
// === 데이터 로드 ===
const load = async () => {
  setLoading(true);
  try {
    const data = await getProperties(buildParams());
    setItems(Array.isArray(data?.items) ? data.items : []);
    setTotal(Number.isFinite(data?.total) ? data.total : 0);
  } catch (e) {
    console.error("[LOAD] error:", e);
    setItems([]); setTotal(0);
  } finally {
    setLoading(false);
  }
};

  // ---------- 조건검색 초기화 ----------
const clearPersist = () => {
  // 혹시 과거 저장분이 있으면 지워서 새로고침 후에도 초기값 유지
  try {
    ["tab","filters","visibleSections","pageSize","mapCenter"].forEach(k => localStorage.removeItem(k));
  } catch {}
};

const resetAll = React.useCallback(() => {
  clearPersist();               // 과거 저장값 정리(지역 키는 건드리지 않음)
  setFilters({ ...DEFAULT_FILTERS });      // 날짜는 위의 기본값으로 리셋
  setPageSize(DEFAULT_PAGE_SIZE);
  setPage(1);
  setTab("search");
  // mapCenter(지도 중심, 즉 지역)는 그대로 둡니다. (setMapCenter 호출 X)
}, []);


  // 최초 1회 + 페이지/사이즈/필터 변경 시 자동 로드
  useEffect(() => { load(); }, [page, pageSize, JSON.stringify(filters)]);

  
  // ---------- 페이지네이션 ----------
  const totalPages = pageSize === -1 ? 1 : Math.max(Math.ceil(total / (pageSize || 1)), 1);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // ---------- 오버레이(조건검색) ----------
  const OverlayPanel = (
    <div className="overlay-panel">
      {visibleSections.region && (
        <section><div className="label">지역</div>
          <RegionSelector value={mapCenter} onChange={(center)=>{
            setMapCenter(center);
            // 지역 바뀌면 첫 페이지로
            setPage(1);
          }} />
        </section>
      )}

      {visibleSections.register_date && (
        <section><div className="label">등록일</div>
          <input type="date" value={filters.register_date_from}
                 onChange={(e)=>{ setPage(1); setFilters({...filters, register_date_from:e.target.value}); }} />
          <span style={{margin:"0 6px"}}>~</span>
          <input type="date" value={filters.register_date_to}
                 onChange={(e)=>{ setPage(1); setFilters({...filters, register_date_to:e.target.value}); }} />
        </section>
      )}

      {visibleSections.update_date && (
        <section><div className="label">수정일</div>
          <input type="date" value={filters.update_date_from}
                 onChange={(e)=>{ setPage(1); setFilters({...filters, update_date_from:e.target.value}); }} />
          <span style={{margin:"0 6px"}}>~</span>
          <input type="date" value={filters.update_date_to}
                 onChange={(e)=>{ setPage(1); setFilters({...filters, update_date_to:e.target.value}); }} />
        </section>
      )}

      {visibleSections.estate_type && (
        <section><div className="label">용도</div>
          {["residence","profit","business","commerce"].map((t)=>(
            <label key={t} style={{marginRight:8}}>
              <input type="checkbox" checked={filters.estate_type.includes(t)}
                    onChange={(e)=>{ const set=new Set(filters.estate_type);
                      e.target.checked?set.add(t):set.delete(t);
                      setPage(1); setFilters({...filters, estate_type:[...set]}); }}/>
              {ESTATE_TYPE_LABELS[t] || t}
            </label>
          ))}

        </section>
      )}

      {visibleSections.bld_type && (
        <section><div className="label">종류</div>
          {["apt","multi-house","multi-household","single-room","metro-house","villa","shop","multi-purpose","office","e-apt"].map((t)=>(
            <label key={t} style={{marginRight:8}}>
              <input type="checkbox" checked={filters.bld_type.includes(t)}
                    onChange={(e)=>{ const set=new Set(filters.bld_type);
                      e.target.checked?set.add(t):set.delete(t);
                      setPage(1); setFilters({...filters, bld_type:[...set]}); }}/>
              {BLD_TYPE_LABELS[t] || t}
            </label>
          ))}
        </section>
      )}

      {visibleSections.rent_types && (
        <section><div className="label">거래유형</div>
          {[
            ["rent_type_4deal","매매"],
            ["rent_type_1year","전세"],
            ["rent_type_2month","월세"],
            ["rent_type_3short","단기"],
            ["rent_type_5sale","분양"],
            ["rent_type_6auction","경매"],
          ].map(([k,label])=>(
            <label key={k} style={{marginRight:8}}>
              <input type="checkbox"
                     checked={!!filters[k]}
                     onChange={(e)=>{ setPage(1); setFilters({...filters, [k]:e.target.checked}); }}/>
              {label}
            </label>
          ))}
        </section>
      )}

      {visibleSections.search && (
        <section><div className="label">기타검색</div>
          <input type="text" placeholder="지번/도로명/메모/연락처 등"
                 value={filters.q}
                 onChange={(e)=>{ setPage(1); setFilters({...filters, q:e.target.value}); }}
                 style={{width:"100%"}}/>
        </section>
      )}

      <section><div className="label">페이지 크기</div>
        <select
          value={pageSize}
          onChange={(e)=>{
            const v = Number(e.target.value);
            setPage(1); setPageSize(v);
          }}>
          {[10,20,50,100,150,200].map(n=><option key={n} value={n}>{n}개</option>)}
        </select>
      </section>

      <section style={{marginTop:8, display:"flex", gap:8}}>
	<button onClick={resetAll}>검색 초기화</button>
     </section>


    </div>
  );

  function countActiveFilters(f) {
  if (!f) return 0;
  let n = 0;
  if (f.register_date_from || f.register_date_to) n++;
  if (f.update_date_from || f.update_date_to) n++;
  if ((f.estate_type?.length || 0) > 0) n++;
  if ((f.bld_type?.length || 0) > 0) n++;
  ["rent_type_4deal", "rent_type_1year", "rent_type_2month",
   "rent_type_3short", "rent_type_5sale", "rent_type_6auction"].forEach(k => { if (f[k]) n++; });
  if (f.q) n++;
  return n;
}

const activeFilters = countActiveFilters(filters);


return (
  <div style={{ maxWidth: 1360, margin: "0 auto", padding: 12 }}>
    <div className="tabs">
      <button
        className={tab === "search" ? "active" : ""}
        onClick={() => setTab("search")}
      >
        검색(지도/리스트)
      </button>
      <button
        className={tab === "manage" ? "active" : ""}
        onClick={() => setTab("manage")}
      >
        조건관리
      </button>
    </div>

    {tab === "manage" ? (
      <div className="manage-page">
        <h2>조건관리</h2>
        {Object.keys(visibleSections).map((key) => (
          <label key={key} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={visibleSections[key]}
              onChange={(e) =>
                setVisibleSections({
                  ...visibleSections,
                  [key]: e.target.checked,
                })
              }
            />
            {key}
          </label>
        ))}
      </div>
    ) : (
      <div className="search-page">
        {/* ── 상단: 지도(50vh 고정) + 지도 안쪽 조건검색 오버레이 ── */}
        <div className="map-top">
          <KakaoMap
            properties={items || []}
            center={mapCenter}
            visible={true}
            highlightedId={highlightedId}
            onMarkerClick={(id, p) => {
            // 1) 강조 유지
            setHighlightedId(id);
            // 2) 리스트 최상단으로 이동
            setItems((prev) => {
              const idx = prev.findIndex(x => getId(x) === id);
              if (idx <= 0) return prev;        // 이미 맨 앞이거나 없음
              const copy = prev.slice();
              const [hit] = copy.splice(idx, 1);
              copy.unshift(hit);
              return copy;
            });
            }}
          />

          {/* 지도창 안쪽 오버레이 */}
          <div className="map-overlay">
            {/* 좌측 상단 ‘심플’ 칩/버튼 */}
            <div className="map-chip">
              <button
                className="chip-button"
                onClick={() => setShowFilters(v => !v)}
                title="조건검색 열기/닫기"
              >
                🔍 조건검색
                {activeFilters > 0 && <span className="chip-badge">{activeFilters}</span>}
              </button>
            </div>

            {/* 조건검색 패널 */}
            {showFilters && (
              <div className="overlay-panel-wrapper">
                {OverlayPanel}
              </div>
            )}
          </div>
        </div>

        {/* ── 하단: 리스트만 스크롤 ── */}
        {pageSize !== -1 && (
          <div className="pager" style={{ margin: "8px 0" }}>
            <span>
              전체 {total}건 • 페이지 {page}/{totalPages}
            </span>
            <div style={{ display: "inline-flex", gap: 8, marginLeft: 8 }}>
              <button disabled={!canPrev} onClick={() => canPrev && setPage(page - 1)}>
                이전
              </button>
              <button disabled={!canNext} onClick={() => canNext && setPage(page + 1)}>
                다음
              </button>
            </div>
          </div>
        )}

        <div className="list-bottom">
          <PropertyList
            properties={items}
            loading={loading}
            highlightedId={highlightedId}
            onSelect={(id) => {
            setHighlightedId(id);
            const p = findById(id, items);
            if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
              setMapCenter({ lat: p.lat, lng: p.lng }); // level 제거
            }
            }}
            onHover={(id) => setHoverId(id)}
            onLeave={() => setHoverId(null)}
          />
        </div>
      </div>
    )}
  </div>
);



}
