// frontend/src/App.js

import React, { useEffect, useState, useCallback } from "react";
import { getProperties } from "./api/propertyApi";
import KakaoMap from "./components/KakaoMap";
import PropertyList from "./components/PropertyList";
import RegionSelector from "./components/RegionSelector";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/OverlayPanel.css";
import "./components/Layout.css";

// --- 유틸리티 및 상수 ---
function todayISO() { return new Date().toISOString().slice(0, 10); }
function sixMonthsAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}
const ESTATE_TYPE_LABELS = { residence: "주거용", profit: "수익성", business: "업무용", commerce: "상업용" };
const BLD_TYPE_LABELS = { "apt":"아파트","multi-house":"다중주택","multi-household":"다가구주택","single-room":"원룸","metro-house":"도생","villa":"다세대","shop":"상가","multi-purpose":"다용도","office":"사무실","e-apt":"오피스텔" };
const DEFAULT_FILTERS = {
  register_date_from: "", register_date_to: "", update_date_from: sixMonthsAgoISO(), update_date_to: todayISO(),
  estate_type: [], bld_type: [], rent_type_4deal: false, rent_type_1year: false, rent_type_2month: false,
  rent_type_3short: false, rent_type_5sale: false, rent_type_6auction: false, q: ""
};
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780, level: 7 };
const DEFAULT_PAGE_SIZE = 20;

export default function App() {
  // --- 상태 관리 ---
  const [tab, setTab] = useState("search");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [items, setItems] = useState([]);
  const [mapItems, setMapItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [visibleSections, setVisibleSections] = useState({ region:true, register_date:true, update_date:true, estate_type:true, bld_type:true, rent_types:true, search:true });
  const [highlightedId, setHighlightedId] = useState(null);
  const [showFilters, setShowFilters] = useState(true);

  const getId = (p) => p?.id ?? p?.estate_no;
  const findById = (id, list) => (list || []).find(p => getId(p) === id);

  const buildParams = useCallback((forMap = false) => {
    const p = forMap ? { ...filters, pageSize: 'all' } : { ...filters, page, pageSize };
    if (p.estate_type?.length) p.estate_type = p.estate_type.join(",");
    if (p.bld_type?.length) p.bld_type = p.bld_type.join(",");
    Object.keys(p).forEach(k => { if (k.startsWith("rent_type_") && p[k]) p[k] = "y"; });
    if (!forMap) delete p.filters; 
    return p;
  }, [page, pageSize, filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setHighlightedId(null);
    setMapItems([]);
    try {
      const data = await getProperties(buildParams());
      setItems(data?.items || []);
      setTotal(data?.total || 0);
    } catch (e) {
      console.error("[LOAD] error:", e);
      setItems([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(); }, [load]);

  const loadAllForMap = async () => {
    setLoading(true);
    try {
      const params = buildParams(true);
      const data = await getProperties(params);
      setMapItems(data?.items || []);
    } catch (e) { console.error("[LOAD ALL] error:", e); } 
    finally { setLoading(false); }
  };
  
  const handleMarkerClick = useCallback((id) => {
    setHighlightedId(id);
    const allItems = mapItems.length > 0 ? mapItems : items;
    const clickedItem = findById(id, allItems);
    if (clickedItem) {
        const indexInList = items.findIndex(item => getId(item) === id);
        if (indexInList !== 0) {
            const newList = items.filter(item => getId(item) !== id);
            newList.unshift(clickedItem);
            setItems(newList);
        }
    }
  }, [items, mapItems]);

  const resetAll = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPageSize(DEFAULT_PAGE_SIZE);
    setPage(1);
    setTab("search");
  }, []);

  const totalPages = Math.max(Math.ceil(total / (pageSize || 1)), 1);
  function countActiveFilters(f) {
    if (!f) return 0;
    let n = 0;
    if (f.register_date_from || f.register_date_to) n++;
    if (f.update_date_from !== sixMonthsAgoISO() || f.update_date_to !== todayISO()) n++;
    if (f.estate_type?.length > 0) n++;
    if (f.bld_type?.length > 0) n++;
    Object.keys(f).forEach(k => { if (k.startsWith("rent_type_") && f[k]) n++; });
    if (f.q) n++;
    return n;
  }
  const activeFilters = countActiveFilters(filters);

  // ★ 사라졌던 검색 패널 UI를 여기에 다시 정의합니다.
  const OverlayPanel = (
    <div className="overlay-panel">
      {visibleSections.region && ( <section><div className="label">지역</div> <RegionSelector value={mapCenter} onChange={(center)=>{ setMapCenter(center); setPage(1); }} /> </section> )}
      {visibleSections.register_date && ( <section><div className="label">등록일</div> <input type="date" value={filters.register_date_from} onChange={(e)=>{ setPage(1); setFilters({...filters, register_date_from:e.target.value}); }} /> <span style={{margin:"0 6px"}}>~</span> <input type="date" value={filters.register_date_to} onChange={(e)=>{ setPage(1); setFilters({...filters, register_date_to:e.target.value}); }} /> </section> )}
      {visibleSections.update_date && ( <section><div className="label">수정일</div> <input type="date" value={filters.update_date_from} onChange={(e)=>{ setPage(1); setFilters({...filters, update_date_from:e.target.value}); }} /> <span style={{margin:"0 6px"}}>~</span> <input type="date" value={filters.update_date_to} onChange={(e)=>{ setPage(1); setFilters({...filters, update_date_to:e.target.value}); }} /> </section> )}
      {visibleSections.estate_type && ( <section><div className="label">용도</div> {Object.entries(ESTATE_TYPE_LABELS).map(([t, label])=>( <label key={t} style={{marginRight:8}}> <input type="checkbox" checked={filters.estate_type.includes(t)} onChange={(e)=>{ const set=new Set(filters.estate_type); e.target.checked?set.add(t):set.delete(t); setPage(1); setFilters({...filters, estate_type:[...set]}); }}/> {label} </label> ))} </section> )}
      {visibleSections.bld_type && ( <section><div className="label">종류</div> {Object.entries(BLD_TYPE_LABELS).map(([t, label])=>( <label key={t} style={{marginRight:8}}> <input type="checkbox" checked={filters.bld_type.includes(t)} onChange={(e)=>{ const set=new Set(filters.bld_type); e.target.checked?set.add(t):set.delete(t); setPage(1); setFilters({...filters, bld_type:[...set]}); }}/> {label} </label> ))} </section> )}
      {visibleSections.rent_types && ( <section><div className="label">거래유형</div> { [["rent_type_4deal","매매"], ["rent_type_1year","전세"], ["rent_type_2month","월세"], ["rent_type_3short","단기"], ["rent_type_5sale","분양"], ["rent_type_6auction","경매"]].map(([k,label])=>( <label key={k} style={{marginRight:8}}> <input type="checkbox" checked={!!filters[k]} onChange={(e)=>{ setPage(1); setFilters({...filters, [k]:e.target.checked}); }}/> {label} </label> ))} </section> )}
      {visibleSections.search && ( <section><div className="label">기타검색</div> <input type="text" placeholder="지번/도로명/메모/연락처 등" value={filters.q} onChange={(e)=>{ setPage(1); setFilters({...filters, q:e.target.value}); }} style={{width:"100%"}}/> </section> )}
      <section><div className="label">페이지 크기</div> <select value={pageSize} onChange={(e)=>{ const v = Number(e.target.value); setPage(1); setPageSize(v); }}> {[10,20,50,100,150,200].map(n=><option key={n} value={n}>{n}개</option>)} </select> </section>
      <section style={{marginTop:8, display:"flex", gap:8}}> <button onClick={resetAll}>검색 초기화</button> </section>
    </div>
  );

  const propertiesForMap = mapItems.length > 0 ? mapItems : items;

  return (
    <ErrorBoundary>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: 12 }}>
        <div className="tabs">
          <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}> 검색(지도/리스트) </button>
          <button className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}> 조건관리 </button>
        </div>

        {tab === "manage" ? (
          <div className="manage-page">
            <h2>조건관리</h2>
            {Object.keys(visibleSections).map((key) => ( <label key={key} style={{ display: "block" }}> <input type="checkbox" checked={visibleSections[key]} onChange={(e) => setVisibleSections({ ...visibleSections, [key]: e.target.checked, }) } /> {key} </label> ))}
          </div>
        ) : (
          <div className="search-page">
            <div className="map-top">
              <KakaoMap
                key={`${mapItems.length > 0 ? 'map' : 'page'}-${propertiesForMap.length}`} 
                properties={propertiesForMap}
                center={mapCenter}
                highlightedId={highlightedId}
                onMarkerClick={handleMarkerClick}
              />
              <div className="map-overlay">
                <div className="map-chip">
                  <button className="chip-button" onClick={() => setShowFilters(v => !v)}>
                    🔍 조건검색 {activeFilters > 0 && <span className="chip-badge">{activeFilters}</span>}
                  </button>
                </div>
                <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 30, pointerEvents: 'auto' }}>
                  <button onClick={loadAllForMap} className="chip-button">
                    🗺️ 현 검색결과 전체보기
                  </button>
                </div>
                {/* ★ 사라졌던 검색 패널을 다시 화면에 표시하는 코드 */}
                {showFilters && ( <div className="overlay-panel-wrapper">{OverlayPanel}</div> )}
              </div>
            </div>

            <div className="pager" style={{ margin: "8px 0" }}>
              <span> 전체 {total}건 • 페이지 {page}/{totalPages} </span>
              <div style={{ display: "inline-flex", gap: 8, marginLeft: 8 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}> 이전 </button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}> 다음 </button>
              </div>
            </div>

            <div className="list-bottom">
              <PropertyList
                properties={items}
                loading={loading}
                highlightedId={highlightedId}
                onSelect={(id) => {
                  setHighlightedId(id);
                  const p = findById(id, items.length > 0 ? items : mapItems);
                  if (p) setMapCenter({ lat: p.lat, lng: p.lng });
                }}
              />
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}