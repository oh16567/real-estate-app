// frontend/src/App.js

import React, { useEffect, useState, useCallback } from "react";
import { DEFAULT_FILTERS, FILTER_VISIBILITY_DEFAULTS } from "./constants/filters";
import { getProperties } from "./api/propertyApi";
import AddressSearch from "./components/AddressSearch";
import KakaoMap from "./components/KakaoMap";
import PropertyList from "./components/PropertyList";
import RegionSelector from "./components/RegionSelector";
import ErrorBoundary from "./components/ErrorBoundary";
import EstateEditor from "./components/EstateEditor";
import "./styles/OverlayPanel.css";
import "./components/Layout.css";
import { useRef } from "react";
import ConditionManage from "./pages/ConditionManage";
import ConditionSearchPanel from "./components/ConditionSearchPanel";
import { BLD_TYPE_LABELS } from "./constants/bldLabels";

// App.js — imports 아래에 추가
const ESTATE_TYPE_OPTIONS = [
  ["residence","주거용"],
  ["profit","수익성"],
  ["business","업무용"],
  ["commerce","상업용"],
];

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

const RENT_TYPE_OPTIONS = [
  ["sale","매매"],
  ["rent","월세"],
  ["charter","전세"],
  ["short","단기"],
];

const BLD_STRUCTURE_OPTIONS = [
  ["open","오픈형"],
  ["separate","분리형"],
  ["multi","복층형"],
];

const GRADE_CONDITION_OPTIONS = [
  ["manage","지속관리"],
  ["recommend","추천"],
  ["recommend-price","가성비"],
  ["attentive","계약유의"],
  ["nonrecommend","비추천"],
  ["prohibit","계약금지"],
];

const FACILITY_OPTIONS = [
  ["ev","승강기"], ["interior","인테리어"], ["water","수도시설"], ["city_gas","도시가스"],
  ["bath_div","화장실 남녀구분"], ["bath_in","화장실 내부"], ["exsign","옥외광고"],
  ["heat:center","중앙난방"], ["heat:floor","층별난방"], ["heat:private-heat","개별난방"],
  ["cold:center","중앙냉방"], ["cold:private","개별냉방"],
];

  // 평↔㎡
  const toNum = (v)=>{ const n = Number(String(v).replace(/[^0-9.]/g,"")); return Number.isFinite(n)? n : null; };
  const SQM_PER_PY = 3.305785;
  const sqm2py = (n)=> Number.isFinite(n)? +(n / SQM_PER_PY).toFixed(2) : "";
  const py2sqm = (n)=> Number.isFinite(n)? Math.round(n * SQM_PER_PY) : "";

  const VIS_KEY = "cm_visibility";
  const VAL_KEY = "cm_values";

// === 재사용 드롭다운들(App.js 상단에 추가) ===

// 단순 리듀서: 값/노출 각각 업데이트
function filtersReducer(state, action) {
  switch (action.type) {
    case "SET_FILTER": {
      const { key, value } = action.payload;
      return { ...state, values: { ...state.values, [key]: value } };
    }
    case "SET_FILTERS": {
      return { ...state, values: { ...state.values, ...action.payload } };
    }
    case "SET_VIS": {
      const { key, value } = action.payload; // boolean
      return { ...state, visibility: { ...state.visibility, [key]: value } };
    }
    case "SET_VIS_ALL": {
      return { ...state, visibility: { ...state.visibility, ...action.payload } };
    }
    default:
      return state;
  }
}

function BlurCommitNumber({ initial, onCommit, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(()=>{ if(ref.current) ref.current.value = initial ?? ""; }, [initial]);
  return (
    <input
      {...rest}
      defaultValue={initial ?? ""}
      ref={ref}
      onBlur={e=>onCommit?.(e.target.value)}
      onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); }}
    />
  );
}

function MultiDropdown({label, options, values=[], onChange, width="100%"}) {
  const [open, setOpen] = useState(false);
  //const [pending, setPending] = useState(values);
  const panelRef = useRef(null);

  // 열릴 때 props→pending 동기화
  //useEffect(() => { if (open) setPending(values); }, [open, values]);

  // 체크 토글 시 즉시 onChange 호출
  const toggle = (v) => {
    const newValues = new Set(values); // 현재 부모의 상태(values)를 기준으로 Set 생성
    if (newValues.has(v)) {
      newValues.delete(v);
    } else {
      newValues.add(v);
    }
    onChange?.([...newValues]); // 변경된 값을 즉시 부모에게 전달
  };


  // 닫기만 수행 (값은 이미 즉시 반영됨)
  const commitAndClose = () => {
    setOpen(false);
  };

  return (

    <div style={{ position:"relative", display:"inline-block", width, maxWidth: 360 }}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        style={{width:"100%", padding:"6px 10px", textAlign:"left", border:"1px solid #ccc", borderRadius:6}}>
        {label} {values.length?`(${values.length})`:""}
      </button>
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          // 포커스가 빠져나가면 그냥 닫기
          onBlur={(e)=>{ if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
          style={{position:"absolute", zIndex:20, top:"100%", left:0, right:0,
                  background:"#fff", border:"1px solid #ddd", borderRadius:6, padding:8, marginTop:4,
                  boxShadow:"0 6px 20px rgba(0,0,0,.12)"}}
        >
          <label style={{display:"block", padding:"4px 2px"}}>
            <input
              type="checkbox"
              checked={values.length === 0} // pending 대신 values 사용
              onChange={(e)=>{
                if (e.target.checked) onChange?.([]); // 즉시 부모 상태 변경
              }}
            /> 전체
          </label>
          {options.map(([val,text])=>(
            <label key={val} style={{display:"block", padding:"4px 2px"}}>
              <input
                type="checkbox"
                checked={values.includes(val)} // pending 대신 values 사용
                onChange={()=>toggle(val)}
              /> {text}
            </label>
          ))}
          <div style={{display:"flex", justifyContent:"space-between", marginTop:6}}>
            {/* 초기화 버튼도 즉시 onChange 호출 */}
            <button type="button" onClick={()=> onChange?.([])} style={{padding:"4px 10px"}}>초기화</button>
            <button type="button" onClick={commitAndClose} style={{padding:"4px 10px"}}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SingleDropdown({label, options, value = "", onChange, width = "100%"}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const close = () => setOpen(false);

  return (
    <div style={{ position:"relative", display:"inline-block", width, maxWidth: 360 }}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        style={{width:"100%", padding:"6px 10px", textAlign:"left", border:"1px solid #ccc", borderRadius:6}}>
        {label} {value?`(${options.find(o=>o[0]===value)?.[1]||""})`:""}
      </button>
      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          onBlur={(e)=>{ if (!e.currentTarget.contains(e.relatedTarget)) close(); }} // commitAndClose 호출 부분을 close()로 변경
          style={{position:"absolute", zIndex:20, top:"100%", left:0, right:0,
                  background:"#fff", border:"1px solid #ddd", borderRadius:6, padding:8, marginTop:4,
                  boxShadow:"0 6px 20px rgba(0,0,0,.12)"}}
        >
          <label style={{display:"block", padding:"4px 2px"}}>
            <input
              type="radio"
              name={label}
              checked={!value}
              onChange={()=>onChange?.("")} // pending 상태 대신 즉시 onChange 호출
            /> 전체
          </label>
          {options.map(([val,text])=>(
            <label key={val} style={{display:"block", padding:"4px 2px"}}>
              <input
                type="radio"
                name={label}
                checked={value===val}
                onChange={()=>onChange?.(val)} // pending 상태 대신 즉시 onChange 호출
              /> {text}
            </label>
          ))}
          <div style={{display:"flex", justifyContent:"space-between", marginTop:6}}>
            <button type="button" onClick={()=>onChange?.("")} style={{padding:"4px 10px"}}>초기화</button>
            <button type="button" onClick={close} style={{padding:"4px 10px"}}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlurCommitInput({ value, onCommit, ...rest }) {
  const [val, setVal] = React.useState(value ?? "");
  React.useEffect(() => { setVal(value ?? ""); }, [value]);
  const commit = () => onCommit?.(val);
  return (
    <input
      {...rest}
      value={val}
      onChange={(e)=>setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e)=>{ if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}






// --- 유틸리티 및 상수 ---
function todayISO() { return new Date().toISOString().slice(0, 10); }
function sixMonthsAgoISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}
// 수정일 기본 범위
function defaultUpdateDateRange() {
  return { update_date_from: sixMonthsAgoISO(), update_date_to: todayISO(), all_dates: "" };
}
const ESTATE_TYPE_LABELS = { residence: "주거용", profit: "수익성", business: "업무용", commerce: "상업용" };
// ▼▼▼ UI 1개 체크로 두 코드를 동시에 제어 - 빌라 선택 시 데이터컬럼에서 bld_type이 multi_house와 villa 모두 '빌라'로 출력 및 검색
const BLD_GROUPS = [
  { label: "빌라", codes: ["multi-house", "villa"] },
];
// ▼▼▼ 그룹에 포함된 코드들은 개별 렌더링에서 제외 - 빌라 선택 시 데이터컬럼에서 bld_type이 multi_house와 villa 모두 '빌라'로 출력 및 검색
const GROUPED_CODES = new Set(BLD_GROUPS.flatMap(g => g.codes));

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780, level: 4 };
const DEFAULT_PAGE_SIZE = 20;

export default function App() {
  // --- 상태 관리 ---
  const [mapsReady, setMapsReady] = useState(false);
  const [tab, setTab] = useState("search");
  const [manageMsg, setManageMsg] = useState(""); // ★ 관리페이지 메시지 상태
  // 수정일 기본값: 시작=6개월 전, 종료=오늘
  const [filters, setFilters] = useState({
    ...DEFAULT_FILTERS,
    ...defaultUpdateDateRange(),
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  // const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [locationQuery, setLocationQuery] = useState("");
  const [mapCenter, setMapCenter] = useState(() => {
    try {
      const s = localStorage.getItem("homeCenter");
      return s ? JSON.parse(s) : DEFAULT_CENTER;
    } catch { return DEFAULT_CENTER; }
  });
  const listRef = useRef(null);

  // 로컬스토리지 → 초기 노출 상태
  const initialVis =
    JSON.parse(localStorage.getItem("filter_visibility") || "null") ||
    FILTER_VISIBILITY_DEFAULTS;

  const [filtersState, dispatch] = React.useReducer(filtersReducer, {
    values: { ...DEFAULT_FILTERS },
    visibility: initialVis
  });

  // 예: 검색 실행 시 쿼리 빌드 (값이 비어있으면 제외)
  const buildQuery = React.useCallback(() => {
    const v = filtersState.values;
    const q = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== "" && val != null) q[k] = val;
    }
    const usp = new URLSearchParams(q);
    return `/api/properties?${usp.toString()}`;
  }, [filtersState.values]);

// 추가
const handleSearch = React.useCallback(() => {
  const url = buildQuery();
  console.log("[SEARCH]", url);
  // 여기에 리스트/맵 로딩 로직 연결
  // loadProperties(url) 또는 setApiUrl(url)
}, [buildQuery]);

  const handleReset = () => {
    dispatch({ type: "SET_FILTERS", payload: { ...DEFAULT_FILTERS } });
  };

  // 단위변환 상태
  const [sqm, setSqm] = useState("");      // ㎡ 입력값(문자열)
  const [pyeong, setPyeong] = useState(""); // 평 입력값(문자열)

  const toNum = (s) => {
    const n = parseFloat(String(s).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  // ㎡ → 평: 평 소수점 2자리
  const onSqmChange = (e) => {
    const v = e.target.value;
    setSqm(v);
    const n = toNum(v);
    if (n === null) return setPyeong("");
    setPyeong((n / 3.305785).toFixed(2));
  };

  // 평 → ㎡: 정수만
  const onPyeongChange = (e) => {
    const v = e.target.value;
    setPyeong(v);
    const n = toNum(v);
    if (n === null) return setSqm("");
    setSqm(String(Math.floor(n * 3.305785)));
  };



  // 앱 시작 후에도 한 번 더 보정(파싱 실패 대비)
  useEffect(() => {
    try {
      const s = localStorage.getItem("homeCenter");
      if (s) setMapCenter(JSON.parse(s));
    } catch {}
  }, []);

  const [items, setItems] = useState([]);
  const [mapItems, setMapItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [visibleSections, setVisibleSections] = useState({ 
    region:true, 
    register_date:true, 
    update_date:true, 
    estate_type:true, 
    bld_type:true, 
    parking_paid: true, 
    rent_types:true, 
    use_yn:true, 
    contract_yn:true, 
    mortgage_yn:true,
    bld_structure:true, 
    grade_condition:true, 
    completion_year:true,
    facility: "시설상태",
    owner: "주인세대",
    search:true });

    // ✅ 여기에 SECTION_LABELS 선언
  const SECTION_LABELS = {
    region:"지역",
    register_date: "등록일",
    update_date: "수정일",
    estate_type: "용도",
    bld_type: "종류",
    rent_types: "거래유형",
    bld_structure:"형태구분", 
    grade_condition:"물건관리", 
    use_yn:"삭제데이터", 
    contract_yn:"계약가능", 
    mortgage_yn:"근저당제외",
    parking_paid: "주차(유료)",
    completion_year:"준공일",
    search: "기타검색",
    price: "금액",
    facility: "시설상태",
    owner: "주인세대",
  };

  const [highlightedId, setHighlightedId] = useState(null);
  const [pickedEstate, setPickedEstate] = useState(null);   // AddressSearch 선택값
  const [searchResetKey, setSearchResetKey] = useState(0);  // AddressSearch 초기화용 키
  const [showFilters, setShowFilters] = useState(true);

  // === EstateEditor 오버레이 ===
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("edit"); // "edit" | "copy" | "contract"
  const [editorEstate, setEditorEstate] = useState(null);

  const openEditor = React.useCallback((mode, estate) => {
    setEditorMode(mode);
    setEditorEstate(estate);
    setEditorOpen(true);
  }, []);

  const closeEditor = React.useCallback(() => {
    setEditorOpen(false);
    setPickedEstate(null);
    setSearchResetKey((v) => v + 1);   // 에디터 닫힐 때 검색창 리셋
  }, []);

  // === 우측 패널 열림/탭/투명도 ===
  const [panelOpen, setPanelOpen] = useState(false); // 기본 숨김
  const [overlayTab, setOverlayTab] = useState("filter"); // "filter" | "etc"
  const [overlayOpacity, setOverlayOpacity] = useState(1); // 1 → 0.8 → 0.6 → 0.4
  useEffect(() => {
    document.documentElement.style.setProperty("--overlay-opacity", String(overlayOpacity));
  }, [overlayOpacity]);
  const cycleOpacity = () => {
    const ladder = [1, 0.8, 0.6, 0.4];
    const i = ladder.indexOf(overlayOpacity);
    setOverlayOpacity(ladder[(i + 1) % ladder.length]);
  };
  const [isRentTypeAnd, setRentTypeAnd] = useState(false); // ★ '복합거래' AND 조건 상태
  const [completionDateFrom, setCompletionDateFrom] = useState("");
  const [completionDateTo, setCompletionDateTo] = useState("");
  const [managementType, setManagementType] = useState("");
  const [completionYearRange, setCompletionYearRange] = useState([0,40]);
  const [completionYearRangeLocal, setCompletionYearRangeLocal] = React.useState(completionYearRange);
  React.useEffect(()=>{ setCompletionYearRangeLocal(completionYearRange); }, [completionYearRange]);

  // 복원
  React.useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(VIS_KEY) || "null");
      if (v) dispatch({ type: "SET_VIS_ALL", payload: v });
      const vals = JSON.parse(localStorage.getItem(VAL_KEY) || "null");
      if (vals) dispatch({ type: "SET_FILTERS", payload: vals });
    } catch {}
  }, []);

  // 저장
  React.useEffect(() => {
    localStorage.setItem(VIS_KEY, JSON.stringify(filtersState.visibility));
  }, [filtersState.visibility]);
  React.useEffect(() => {
    localStorage.setItem(VAL_KEY, JSON.stringify(filtersState.values));
  }, [filtersState.values]);
  
  const getId = (p) => p?.id ?? p?.estate_no;
  const findById = (id, list) => (list || []).find(p => getId(p) === id);
  
  //사진 소스선택
  const [photoSource, setPhotoSource] = React.useState(
    localStorage.getItem("photo_source") || "server"
  );
  React.useEffect(() => {
    localStorage.setItem("photo_source", photoSource);
  }, [photoSource]);


   // Kakao SDK 준비되면 지도 렌더 시작
 useEffect(() => {
  const K = window?.kakao?.maps;
  console.log("[APP] kakao.maps =", K);
  if (!K) return;                          // SDK 태그 미로딩 시 조용히 대기
  if (typeof K.load === "function") {
    K.load(() => { console.log("[APP] maps.load done"); setMapsReady(true); });      // ★ autoload=false 대응: 로드 완료 후 true
    return;
  }
  if (typeof K.LatLng === "function") {
    console.log("[APP] LatLng already available");                  // autoload=true 또는 이미 로드된 경우
    setMapsReady(true);
  }
 }, []);

  const buildParams = useCallback((forMap = false) => {
    const p = forMap ? { ...filters, pageSize: 'all' } : { ...filters, page, pageSize };
      // 준공년도: "최근 ~N년" → 연도 범위로 변환
    if (Array.isArray(completionYearRange)) {
      const [lo, hi] = completionYearRange;
      const CUR = new Date().getFullYear();
      p.completion_year_min = CUR - (typeof hi === "number" ? hi : 40);
      p.completion_year_max = CUR - (typeof lo === "number" ? lo : 0);
      delete p.completion_year; // 서버에는 연도 범위만 보냄
    }
    if (isRentTypeAnd) p.rent_type_and = "y"; // ★ AND 조건일 때 파라미터 추가
    if (completionDateFrom) p.completion_year_from = completionDateFrom;
    if (completionDateTo) p.completion_year_to = completionDateTo;
    if (managementType) p.grade_condition = managementType;
    if (p.estate_type?.length) p.estate_type = p.estate_type.join(",");
    if (p.bld_type?.length) p.bld_type = p.bld_type.join(",");
    // ★ 소재지 검색 추가
    if (locationQuery.trim()) p.addr_like = locationQuery.trim();

    // 불린 플래그
    if (p.sale_type_sub_rent)   p.sale_type_sub_rent   = "y"; else delete p.sale_type_sub_rent;
    if (p.sale_type_sub_living) p.sale_type_sub_living = "y"; else delete p.sale_type_sub_living;
    if (p.owner_household)      p.owner_household      = "y"; else delete p.owner_household;

    // 시설상태 → 개별 키로 분해
    if (Array.isArray(p.facility)) {
    const has = (k)=>p.facility.includes(k);
    if (has("ev"))        p.living_condition_ev = "y";
    if (has("interior"))  p.internal_condition_interior = "y";
    if (has("water"))     p.internal_condition_water = "y";
    if (has("city_gas"))  p.internal_condition_city_gas = "y";
    if (has("bath_div"))  p.bath_division = "y";
    if (has("bath_in"))   p.bath_inside = "y";
    if (has("exsign"))    p.external_condition_exsign = "y";
    // heat / cold 값 매핑
    if (has("heat:center"))       p.heat_condition = "center";
    else if (has("heat:floor"))   p.heat_condition = "floor";
    else if (has("heat:private-heat")) p.heat_condition = "private-heat";
    if (has("cold:center"))       p.cold_condition = "center";
    else if (has("cold:private")) p.cold_condition = "private";
    delete p.facility;
  }

// 빈 문자열 정리는 기존 로직 유지

    Object.keys(p).forEach(k => { if (k.startsWith("rent_type_") && p[k]) p[k] = "y"; });

    if (!forMap) delete p.filters;
    // ▼ 빈 값 제거: "" | null | undefined 는 쿼리에서 제외
    Object.keys(p).forEach((k) => {
      const v = p[k];
      if (v === "" || v === null || v === undefined) delete p[k];
    });
    return p;
  }, [page, pageSize, filters,
      completionYearRange, isRentTypeAnd,
      completionDateFrom, completionDateTo,
      managementType]);

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

  // 에디터에서 저장 완료되면 리스트 리로드
  const handleEditorSaved = React.useCallback((result) => {
    console.log("[EstateEditor saved]", result);
    // 굳이 페이지 초기화 안 하고, 현재 필터 그대로 다시 로드
    load();
  }, [load]);

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
  
  // AddressSearch에서 선택했을 때: 리스트 최상단으로 이동 + 스크롤
  const handleSearchPick = useCallback((picked) => {
    if (!picked || !picked.estate_no) return;
      const id = picked.estate_no;     // 검색결과의 estate_no 사용

      setHighlightedId(id);

      const allItems = mapItems.length > 0 ? mapItems : items;
      const clickedItem = findById(id, allItems);
      if (clickedItem) {
        const newList = items.filter(item => getId(item) !== id);
        newList.unshift(clickedItem);     // 맨 위로 올리기
        setItems(newList);
      }

      // 리스트 영역 위로 스크롤
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, [items, mapItems, findById]
  );

  // AddressSearch → 결과 없음 → "신규등록" 클릭 시 호출
  const handleNewFromAddress = useCallback((keyword) => {
    const addr = (keyword || "").trim();
    if (!addr) return;

    // TODO:
    //  1) addr을 기반으로 새 매물 stub 생성
    //  2) EstateEditor를 "신규등록" 모드로 열고
    //  3) 백엔드에 신규 INSERT까지 연결
    //
    // 현 상태의 EstateEditor는 estate_no 없으면
    //   alert("매물 번호(estate_no)가 없습니다.");
    // 로 막고 있으므로,
    // 신규등록 저장 로직은 다음 단계에서 별도로 구현해야 합니다.
    if (!keyword || typeof keyword !== "object") return;

    const { roadAddress, jibunAddress } = keyword;

    const newEstate = {
      estate_no: null,
      estate_id: null,
      branch_id: null,
      roadAddress,
      jibunAddress,
      detailAddress: "",
    };
    openEditor("edit", newEstate);
  }, []);

  const resetAll = useCallback(() => {
    // 리셋 시에도 수정일 기본 범위를 다시 주입
    setFilters({ ...DEFAULT_FILTERS, ...defaultUpdateDateRange() });
    setPageSize(DEFAULT_PAGE_SIZE);
    setPage(1);
    setTab("search");
    setRentTypeAnd(false); // ★ '복합거래' 상태를 false(기본값)로 초기화
  }, []); // <-- 의존성 배열은 비워둬도 괜찮습니다.

  const totalPages = Math.max(Math.ceil(total / (pageSize || 1)), 1);

  function countActiveFilters(f) {
    if (!f) return 0;
    let n = 0;
    if (f.register_date_from || f.register_date_to) n++;
    if (f.update_date_from !== sixMonthsAgoISO() || f.update_date_to !== todayISO()) n++;
    if (f.estate_type?.length > 0) n++;
    if (f.bld_type?.length > 0) n++;
    if (f.parking_paid) n++;              // ← 추가
    Object.keys(f).forEach(k => { if (k.startsWith("rent_type_") && f[k]) n++; });
    if (f.q) n++;
    if (f.use_yn_n) n++;
    if (f.contract_yn_y) n++;
    if (f.mortgage_yn_n) n++;
    if (f.bld_structure?.length>0) n++;
    if (f.grade_condition) n++;
    if (f.completion_age?.[0]!==0 || f.completion_age?.[1]!==40) n++;
    return n;
  }

  const RENT_FILTER_LABELS = {
    rent_type_4deal: "매매",
    rent_type_1year: "전세",
    rent_type_2month: "월세",
    rent_type_3short: "단기",
    rent_type_5sale: "분양",
    rent_type_6auction: "경매",
  };

  function listActiveFilters(f) {
    if (!f) return [];
    const list = [];

    if (f.register_date_from || f.register_date_to)
      list.push("등록일 조건");

    if (
      f.update_date_from !== sixMonthsAgoISO() ||
      f.update_date_to !== todayISO()
    )
      list.push("수정일 조건");

    if (f.estate_type?.length > 0)
      list.push("용도 필터(estate_type)");

    if (f.bld_type?.length > 0)
      list.push("건물유형 필터(bld_type)");

    if (f.parking_paid)
      list.push("유료주차 포함");

    Object.keys(f).forEach((k) => {
      if (k.startsWith("rent_type_") && f[k]) {
        const label = RENT_FILTER_LABELS[k] || k;
        list.push(`거래유형: ${label}`);
      }
    });

    if (f.q)
      list.push("텍스트 검색(q)");

    if (f.use_yn_n)
      list.push("미사용 매물 포함");

    if (f.contract_yn_y)
      list.push("거래완료 매물 포함");

    if (f.mortgage_yn_n)
      list.push("근저당 없는 매물만");

    if (f.bld_structure?.length > 0)
      list.push("구조 필터(bld_structure)");

    if (f.grade_condition)
      list.push("관리형태/등급 필터");

    if (
      f.completion_age?.[0] !== 0 ||
      f.completion_age?.[1] !== 40
    )
      list.push("준공연차 범위 필터");

    return list;
  }

  const activeFilters = countActiveFilters(filters);
  const activeFilterLabels = listActiveFilters(filters);

  // 검색 패널: 우측 고정 + 투명도 버튼 + 탭
  const OverlayPanel = ({ inline = false, open = true }) => (
    <aside className={`overlay-panel${inline ? " inline" : ""} ${open ? "is-open" : ""}`}>
      <div className="overlay-header">
        <div className="overlay-title">조건 관리</div>
        <div className="overlay-actions">
          <button className="btn" onClick={cycleOpacity}>
            투명도 {Math.round(overlayOpacity * 100)}%
          </button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button
          type="button"
          className={`tab ${overlayTab === "filter" ? "is-active" : ""}`}
          onClick={() => setOverlayTab("filter")}
        >필터</button>
        <button
          type="button"
          className={`tab ${overlayTab === "etc" ? "is-active" : ""}`}
          onClick={() => setOverlayTab("etc")}
        >기타</button>
      </div>
      <div className="overlay-body">
        {overlayTab === "filter" ? (
          <div key="tab-filter" className="tab-panel" style={{display:"grid", gap:8}}>

      {visibleSections.region && ( 
        <section>
          {/* <div className="label">지역</div>  */}
          <RegionSelector 
            value={mapCenter} 
            onChange={(center)=>{ setMapCenter(center); setPage(1); }} 
          /> 
        </section> )}
      {visibleSections.register_date && ( 
        <section>
          <div className="label">등록일</div> 
            <input 
            type="date" 
            style={{width: "80px"}} 
            value={filters.register_date_from} 
            onChange={(e)=>{ 
              setPage(1); 
              setFilters({...filters, register_date_from:e.target.value}); }} 
            /> 
              <span style={{margin:"0 6px"}}>~</span> 
              <input 
              type="date" style={{width: "80px"}} value={filters.register_date_to} onChange={(e)=>{ setPage(1); setFilters({...filters, register_date_to:e.target.value}); }} /> </section> )}
      {visibleSections.update_date && (
        <section>
          <div className="label">수정일</div>

          {/* 시작일 */}
          <input
            type="date"
            style={{ width: "80px" }}
            value={filters.update_date_from ?? ""}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, update_date_from: e.target.value, all_dates: "" }));
            }}
          />

          <span style={{ margin: "0 6px" }}>~</span>

          {/* 종료일(그대로) */}
          <input
            type="date"
            style={{ width: "80px" }}
            value={filters.update_date_to ?? ""}
            onChange={(e) => {
              setPage(1);
              setFilters((f) => ({ ...f, update_date_to: e.target.value }));
            }}
          />

          <button
            type="button"
            style={{ marginLeft: 6, padding: "2px 6px" }}
            onClick={() => {
              setPage(1);
              // 시작일 초기화: 전체 기간 선택(all_dates=y)로 전환
              setFilters((f) => ({ ...f, update_date_from: "", all_dates: "y" }));
              const sp = new URLSearchParams(window.location.search);
              sp.delete("update_date_from");
              sp.set("all_dates","y");
              window.history.replaceState(null, "", `?${sp.toString()}`);
            }}
          >
            시작일 초기화
          </button>

        </section>
      )}


      {/* {visibleSections.estate_type && ( <section><div className="label">용도</div> {Object.entries(ESTATE_TYPE_LABELS).map(([t, label])=>( <label key={t} style={{marginRight:8}}> <input type="checkbox" checked={filters.estate_type.includes(t)} onChange={(e)=>{ const set=new Set(filters.estate_type); e.target.checked?set.add(t):set.delete(t); setPage(1); setFilters({...filters, estate_type:[...set]}); }}/> {label} </label> ))} </section> )} */}
      {/* {visibleSections.bld_type && ( <section><div className="label">종류</div> {Object.entries(BLD_TYPE_LABELS).map(([t, label])=>( <label key={t} style={{marginRight:8}}> <input type="checkbox" checked={filters.bld_type.includes(t)} onChange={(e)=>{ const set=new Set(filters.bld_type); e.target.checked?set.add(t):set.delete(t); setPage(1); setFilters({...filters, bld_type:[...set]}); }}/> {label} </label> ))} </section> )} */}
      {/* ▼▼▼ 빌라 선택 시 데이터컬럼에서 bld_type이 multi_house와 villa 모두 '빌라'로 출력 및 검색 */}

      {/* 용도: 다중선택 드롭다운 */}
      {visibleSections.estate_type && (
        <section>
          {/* <div className="label">용도</div> */}
          <MultiDropdown
            label="용도 선택"
            options={ESTATE_TYPE_OPTIONS}
            values={filters.estate_type}
            onChange={(vals)=>{ setPage(1); setFilters(f=>({...f, estate_type: vals})); }}
          />
        </section>
      )}

      {/* 종류: 다중선택 드롭다운 */}
      {visibleSections.bld_type && (
        <section>
          {/* <div className="label">종류</div> */}
          <MultiDropdown
            label="종류 선택"
            options={BLD_TYPE_OPTIONS}
            values={filters.bld_type}
            onChange={(vals)=>{ setPage(1); setFilters(f=>({...f, bld_type: vals})); }}
          />
        </section>
      )}

      {/* 거래유형: 다중선택 드롭다운 */}
      {visibleSections.rent_types && (
        <section>
          {/* <div className="label">거래유형</div> */}

          <MultiDropdown
            label="거래유형 선택"
            options={RENT_TYPE_OPTIONS}
            values={filters.rent_types}
            onChange={(vals)=>{ setPage(1); setFilters(f=>({...f, rent_types: vals})); }}
          />

          {/* ★ '복합거래' 버튼 추가 */}
          <button
            onClick={() => setRentTypeAnd(!isRentTypeAnd)}
            style={{
              padding: '2px 8px', fontSize: '11px',
              backgroundColor: isRentTypeAnd ? '#3b82f6' : '#e5e7eb',
              color: isRentTypeAnd ? 'white' : 'black',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
            }}
          >
            복합거래
          </button>

        </section>
      )}    

      {/* 형태구분: 다중선택 드롭다운 */}
      {visibleSections.bld_structure && (
        <section>
          {/* <div className="label">형태구분</div> */}
          <MultiDropdown
            label="형태구분 선택"
            options={BLD_STRUCTURE_OPTIONS}
            values={filters.bld_structure}
            onChange={(vals)=>{ setPage(1); setFilters(f=>({...f, bld_structure: vals})); }}
          />
        </section>
      )}

      {/* 물건관리: 단일 드롭다운(그대로) */}
      {visibleSections.grade_condition && (
        <section>
          {/* <div className="label">물건관리</div> */}
          <SingleDropdown
            label="물건관리 선택"
            options={GRADE_CONDITION_OPTIONS}
            value={filters.grade_condition}
            onChange={(val)=>{ setPage(1); setFilters(f=>({...f, grade_condition: val})); }}
          />
        </section>
      )}
      
      {visibleSections.facility && (
        <section>
          <MultiDropdown
            label="시설상태 선택"
            options={FACILITY_OPTIONS}
            values={filters.facility}
            onChange={(vals)=>setFilters(f=>({...f, facility: vals}))}
          />
        </section>
      )}                                                                                                                                                                

      {/* 삭제데이터(n) */}
      {visibleSections.use_yn && (
        <section>
          <label>
            <input
              type="checkbox"
              checked={filters.use_yn_n}
              onChange={e=>{ setPage(1); setFilters(f=>({...f, use_yn_n:e.target.checked})); }}
            /> 삭제데이터
          </label>
        </section>
      )}

      {/* 계약가능(y) */}
      {visibleSections.contract_yn && (
        <section>
          <label>
            <input
              type="checkbox"
              checked={filters.contract_yn_y}
              onChange={e=>{ setPage(1); setFilters(f=>({...f, contract_yn_y:e.target.checked})); }}
            /> 계약가능
          </label>
        </section>
      )}

      {/* 근저당 제외(n) */}
      {visibleSections.mortgage_yn && (
        <section>
          <label>
            <input
              type="checkbox"
              checked={filters.mortgage_yn_n}
              onChange={e=>{ setPage(1); setFilters(f=>({...f, mortgage_yn_n:e.target.checked})); }}
            /> 근저당제외
          </label>
        </section>
      )}

      {visibleSections.parking_paid !== false && (
        <section>
          {/* <div className="label">주차</div> */}
          <label style={{ marginRight: 8 }}>
            <input
              type="checkbox"
              checked={filters.parking_paid}
              onChange={(e) => {
                setPage(1);
                setFilters(f => ({ ...f, parking_paid: e.target.checked }));
              }}
            /> 주차가능
          </label>
        </section>
      )}

      {/* 준공년도: 한 바, 두 핸들 */}
{visibleSections.completion_year && (
  <section>
    <div className="label" style={{ marginBottom: 6 }}>사용승인일</div>

    {/* 최소~최대 숫자 입력 */}
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div>
        <div style={{fontSize:12, color:"#666"}}>최소(년)</div>
          <BlurCommitNumber
            type="number" inputMode="numeric" min={0} max={40} step={1}
            initial={completionYearRangeLocal?.[0] ?? 0}
            onCommit={(val)=>{
              const raw = Number(val) || 0;
              const lo = Math.max(0, Math.min(40, Math.floor(raw)));
              const hiPrev = completionYearRangeLocal?.[1] ?? 40;
              const hi = Math.max(lo, Math.min(40, Math.floor(hiPrev)));
              const norm = [lo, hi];
              setCompletionYearRangeLocal(norm);
              setCompletionYearRange(norm);
              setPage(1);
              setFilters(f=>({ ...f }));   // onBlur 시에만 재조회
            }}
            style={{ width: 64, padding:"4px 6px", textAlign:"right" }}
          />

      </div>
      <span>~</span>
      <div>
        <div style={{fontSize:12, color:"#666"}}>최대(년)</div>
          <BlurCommitNumber
            type="number" inputMode="numeric" min={0} max={40} step={1}
            initial={completionYearRangeLocal?.[1] ?? 40}
            onCommit={(val)=>{
              const raw = Number(val) || 0;
              const hi = Math.max(0, Math.min(40, Math.floor(raw)));
              const loPrev = completionYearRangeLocal?.[0] ?? 0;
              const lo = Math.min(hi, Math.max(0, Math.floor(loPrev)));
              const norm = [lo, hi];
              setCompletionYearRangeLocal(norm);
              setCompletionYearRange(norm);
              setPage(1);
              setFilters(f=>({ ...f }));   // onBlur 시에만 재조회
            }}
            style={{ width: 64, padding:"4px 6px", textAlign:"right" }}
          />

      </div>
    </div>

    {/* 프리셋 버튼 (그대로 유지) */}
    <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
      {[
        { v:0,  label:"입주예정" },
        { v:2,  label:"2년" },
        { v:4,  label:"4년" },
        { v:10, label:"10년" },
        { v:15, label:"15년" },
        { v:20, label:"20년" },
        { v:25, label:"25년" },
        { v:30, label:"30년" },
        { v:35, label:"35년" },
        { v:40, label:"40년" },
      ].map(preset=>(
        <button
          key={preset.v}
          onClick={()=>{
            const norm = [0, preset.v];
            setCompletionYearRange(norm);        // 실제 상태
            setCompletionYearRangeLocal(norm);   // 로컬 입력창 동기화
            setPage(1);
            setFilters(f=>({...f}));             // 재조회
          }}
        >
          {preset.label}
        </button>
      ))}
      <button onClick={()=>{
        setCompletionYearRange([0,40]);
        setPage(1);
        setFilters(f=>({...f}));
      }}>
        조건삭제
      </button>
    </div>
  </section>
)}

      {visibleSections.search && ( 
        <div>
          <section>
            <div className="label">기타검색</div> 
              <BlurCommitInput
                type="text"
                placeholder="지번/도로명/메모/연락처 등"
                value={filters.q ?? ""}
                onCommit={(val)=>{ setPage(1); setFilters(f=>({ ...f, q: val })); }}
                style={{width:"100%"}}
              />

            {/* <div className="label">수량·금액·층</div> */}
            룸
            <BlurCommitInput  type="number" placeholder="최소" style={{width:60}}
              value={filters.room_cnt_min ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, room_cnt_min:v})) }}/>
            ~
            <BlurCommitInput  type="number" placeholder="최대" style={{width:60}}
              value={filters.room_cnt_max ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, room_cnt_max:v})) }}/>

            &nbsp;욕실
            <BlurCommitInput  type="number" placeholder="최소" style={{width:60}}
              value={filters.bath_cnt_min ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, bath_cnt_min:v})) }}/>
            ~
            <BlurCommitInput  type="number" placeholder="최대" style={{width:60}}
              value={filters.bath_cnt_max ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, bath_cnt_max:v})) }}/>
            <br/>

            보증금(만원)
            <BlurCommitInput  type="number" placeholder="최소" style={{width:80}}
              value={filters.fee_year_min ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, fee_year_min:v})) }}/>
            ~
            <BlurCommitInput  type="number" placeholder="최대" style={{width:80}}
              value={filters.fee_year_max ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, fee_year_max:v})) }}/>

            &nbsp;월세(만원)
            <BlurCommitInput  type="number" placeholder="최소" style={{width:80}}
              value={filters.fee_month_min ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, fee_month_min:v})) }}/>
            ~
            <BlurCommitInput  type="number" placeholder="최대" style={{width:80}}
              value={filters.fee_month_max ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, fee_month_max:v})) }}/>

            <br/>

            해당층
            <BlurCommitInput  type="number" placeholder="최소" style={{width:60}}
              value={filters.floor_min ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, floor_min:v})) }}/>
            ~
            <BlurCommitInput  type="number" placeholder="최대" style={{width:60}}
              value={filters.floor_max ?? ""} onCommit={(v)=>{ setPage(1); setFilters(f=>({...f, floor_max:v})) }}/>
          
          </section> 

          <section>
            <div className="label">전용면적</div>

            {/* 전용평수(평) */}
            <div style={{marginBottom:6}}>
              전용평수(평)
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.exclusive_scale_square_min}
                onCommit={(v)=>{
                  const minPy = toNum(v);
                  const maxPy = toNum(filters.exclusive_scale_square_max);
                  const minSqm = minPy==null? "" : py2sqm(minPy);
                  const maxSqm = maxPy==null? "" : py2sqm(maxPy);
                  setFilters(f=>({
                    ...f,
                    exclusive_scale_square_min: minPy ?? "",
                    exclusive_scale_min:        minSqm,
                    exclusive_scale_square_max: f.exclusive_scale_square_max, // 그대로 두고 아래에서 커밋
                    exclusive_scale_max:        maxSqm
                  }));
                }}
              />
              ~
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.exclusive_scale_square_max}
                onCommit={(v)=>{
                  const minPy = toNum(filters.exclusive_scale_square_min);
                  const maxPy = toNum(v);
                  const minSqm = minPy==null? "" : py2sqm(minPy);
                  const maxSqm = maxPy==null? "" : py2sqm(maxPy);
                  setFilters(f=>({
                    ...f,
                    exclusive_scale_square_min: f.exclusive_scale_square_min,
                    exclusive_scale_min:        minSqm,
                    exclusive_scale_square_max: maxPy ?? "",
                    exclusive_scale_max:        maxSqm
                  }));
                }}
              />
            </div>

            {/* 전용면적㎡ */}
            <div>
              전용면적(㎡)
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.exclusive_scale_min}
                onCommit={(v)=>{
                  const minSqm = toNum(v);
                  const maxSqm = toNum(filters.exclusive_scale_max);
                  const minPy = minSqm==null? "" : sqm2py(minSqm);
                  const maxPy = maxSqm==null? "" : sqm2py(maxSqm);
                  setFilters(f=>({
                    ...f,
                    exclusive_scale_min:        minSqm ?? "",
                    exclusive_scale_square_min: minPy,
                    exclusive_scale_max:        f.exclusive_scale_max,
                    exclusive_scale_square_max: maxPy
                  }));
                }}
              />
              ~
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.exclusive_scale_max}
                onCommit={(v)=>{
                  const minSqm = toNum(filters.exclusive_scale_min);
                  const maxSqm = toNum(v);
                  const minPy = minSqm==null? "" : sqm2py(minSqm);
                  const maxPy = maxSqm==null? "" : sqm2py(maxSqm);
                  setFilters(f=>({
                    ...f,
                    exclusive_scale_min:        f.exclusive_scale_min,
                    exclusive_scale_square_min: minPy,
                    exclusive_scale_max:        maxSqm ?? "",
                    exclusive_scale_square_max: maxPy
                  }));
                }}
              />
            </div>
          </section>

          <section>
            <div className="label">실면적</div>

            {/* 실평수(평) */}
            <div style={{marginBottom:6}}>
              실평수(평)
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.used_scale_square_min}
                onCommit={(v)=>{
                  const minPy = toNum(v);
                  const maxPy = toNum(filters.used_scale_square_max);
                  const minSqm = minPy==null? "" : py2sqm(minPy);
                  const maxSqm = maxPy==null? "" : py2sqm(maxPy);
                  setFilters(f=>({
                    ...f,
                    used_scale_square_min: minPy ?? "",
                    used_scale_min:        minSqm,
                    used_scale_square_max: f.used_scale_square_max,
                    used_scale_max:        maxSqm
                  }));
                }}
              />
              ~
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.used_scale_square_max}
                onCommit={(v)=>{
                  const minPy = toNum(filters.used_scale_square_min);
                  const maxPy = toNum(v);
                  const minSqm = minPy==null? "" : py2sqm(minPy);
                  const maxSqm = maxPy==null? "" : py2sqm(maxPy);
                  setFilters(f=>({
                    ...f,
                    used_scale_square_min: f.used_scale_square_min,
                    used_scale_min:        minSqm,
                    used_scale_square_max: maxPy ?? "",
                    used_scale_max:        maxSqm
                  }));
                }}
              />
            </div>

            {/* 실면적㎡ */}
            <div>
              실면적(㎡)
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.used_scale_min}
                onCommit={(v)=>{
                  const minSqm = toNum(v);
                  const maxSqm = toNum(filters.used_scale_max);
                  const minPy = minSqm==null? "" : sqm2py(minSqm);
                  const maxPy = maxSqm==null? "" : sqm2py(maxSqm);
                  setFilters(f=>({
                    ...f,
                    used_scale_min:        minSqm ?? "",
                    used_scale_square_min: minPy,
                    used_scale_max:        f.used_scale_max,
                    used_scale_square_max: maxPy
                  }));
                }}
              />
              ~
              <BlurCommitNumber
                type="number" inputMode="numeric" style={{width:80, marginLeft:8}}
                initial={filters.used_scale_max}
                onCommit={(v)=>{
                  const minSqm = toNum(filters.used_scale_min);
                  const maxSqm = toNum(v);
                  const minPy = minSqm==null? "" : sqm2py(minSqm);
                  const maxPy = maxSqm==null? "" : sqm2py(maxSqm);
                  setFilters(f=>({
                    ...f,
                    used_scale_min:        f.used_scale_min,
                    used_scale_square_min: minPy,
                    used_scale_max:        maxSqm ?? "",
                    used_scale_square_max: maxPy
                  }));
                }}
              />
            </div>
          </section>

          <section>
            <div className="label">매매 서브옵션</div>
            <div>
              <label style={{marginRight:10}}>
                <input type="checkbox"
                  checked={!!filters.sale_type_sub_rent}
                  onChange={e=>setFilters(f=>({...f, sale_type_sub_rent:e.target.checked}))}/>
                임대승계 매매
              </label>
              <label>
                <input type="checkbox"
                  checked={!!filters.sale_type_sub_living}
                  onChange={e=>setFilters(f=>({...f, sale_type_sub_living:e.target.checked}))}/>
                입주가능 매매
              </label>
            </div>
          </section>

          <section>
            <div className="label">주인세대</div>

            {/* 주인세대 여부 */}
            <div style={{ marginBottom: 6 }}>
              <label>
                <input
                  type="checkbox"
                  checked={!!filters.owner_household}
                  onChange={e =>
                    setFilters(f => ({ ...f, owner_household: e.target.checked ? "y" : "" }))
                  }
                />
                주인세대만
              </label>
            </div>

            {/* 주인세대 룸수 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span>룸수</span>
              <BlurCommitNumber
                type="number"
                inputMode="numeric"
                style={{ width: 60 }}
                initial={filters.owner_room_min ?? ""}
                onCommit={(v) => setFilters(f => ({ ...f, owner_room_min: v }))}
                placeholder="최소"
              />
              <BlurCommitNumber
                type="number"
                inputMode="numeric"
                style={{ width: 60 }}
                initial={filters.owner_room_max ?? ""}
                onCommit={(v) => setFilters(f => ({ ...f, owner_room_max: v }))}
                placeholder="최대"
              />
            </div>

            {/* 주인세대 욕실수 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>욕실수</span>
              <BlurCommitNumber
                type="number"
                inputMode="numeric"
                style={{ width: 60 }}
                initial={filters.owner_bath_min ?? ""}
                onCommit={(v) => setFilters(f => ({ ...f, owner_bath_min: v }))}
                placeholder="최소"
              />
              <BlurCommitNumber
                type="number"
                inputMode="numeric"
                style={{ width: 60 }}
                initial={filters.owner_bath_max ?? ""}
                onCommit={(v) => setFilters(f => ({ ...f, owner_bath_max: v }))}
                placeholder="최대"
              />
            </div>
          </section>
        </div>
      )}

        <section>
          <div className="label">페이지 크기</div> 
            <select 
              value={pageSize} 
              onChange={(e)=>{ const v = Number(e.target.value); setPage(1); setPageSize(v); }}
              > 
              {[10,20,50,100,150,200,500,1000].map(n=><option key={n} value={n}>{n}개</option>)} 
            </select> 
        </section>
        
        <section style={{marginTop:8, display:"flex", gap:8}}>
          <button onClick={resetAll}>검색 초기화</button>
        </section>
      </div>
        ) : (
          <div key="tab-etc" className="tab-panel">
            {/* 필요 시 기타 도구/프리셋 배치 */}
            <button className="btn" onClick={() => setRentTypeAnd(v => !v)}>
              복합거래 {isRentTypeAnd ? "AND" : "OR"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  // 주차 유료 필터 유틸
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const passExtraFilters = (p) => {
    if (filters.use_yn_n && p.use_yn !== "n") return false;
    if (filters.contract_yn_y && p.contract_yn !== "y") return false;
    if (filters.mortgage_yn_n && p.mortgage_yn !== "n") return false;
    if (filters.estate_type?.length>0 && !filters.estate_type.includes(p.estate_type)) return false;
    if (filters.bld_type?.length>0 && !filters.bld_type.includes(p.bld_type)) return false;
    if (filters.rent_types?.length>0 && !filters.rent_types.includes(p.rent_type)) return false;
    if (filters.bld_structure?.length>0 && !filters.bld_structure.includes(p.bld_structure)) return false;
    if (filters.grade_condition && p.grade_condition !== filters.grade_condition) return false;

  // 준공년도 [minYear, maxYear]
  if (filters.completion_year?.length===2 && p.completion_year) {
    const y = Number(p.completion_year);
    if (Number.isFinite(y)) {
      const [minY, maxY] = filters.completion_year;
      if (!(y >= minY && y <= maxY)) return false;
    }
  }
    return true;
  };

  const feeOK = (p) => {
    if (!filters.parking_paid) return true; // 체크 안 했으면 통과
    const fee = num(p.parking_fee ?? p.parking_price);
    return fee >= 0.1;
  };

  // 리스트용, 지도용 각각 필터 적용
  const filteredItems = (items || []).filter(feeOK).filter(passExtraFilters);
  const propertiesForMap = ((mapItems.length>0?mapItems:items) || []).filter(feeOK).filter(passExtraFilters);

  return (
    <>
      <ErrorBoundary>
        <div style={{ maxWidth: 1360, margin: "0 auto", padding: 12, height: "100vh", overflow: "auto" }}>
          <div className="tabs">
            <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}> 검색(지도/리스트) </button>
            <button className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}> 조건관리 </button>
            {/* <button className={tab === "manage" ? "active" : ""} onClick={() => { setTab("manage"); setManageMsg(""); }}> 관리페이지 </button> */}

          </div>

            {tab === "manage" ? (
              <div className="manage-scroll">
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1100px", gap:16, minHeight: 0 }}>

                <div>

                <h2>관리페이지</h2>

                {/* ★ 1. 사라졌던 '조건 선택' UI를 여기에 복구합니다. */}
                <section style={{display:"block"}}>
                    <h3 style={{ marginTop: 0 }}>조건 선택 관리</h3>
                    <p style={{ fontSize: '12px', color: '#666', marginTop: '-8px', marginBottom: '12px' }}>
                      검색 페이지에 표시할 검색 조건 항목을 선택합니다.
                    </p>
                    {Object.keys(visibleSections).map((key) => (
                      <label key={key} style={{ display: "block", marginBottom: '4px' }}>
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
                        {SECTION_LABELS[key] || key}
                      </label>
                    ))}
                </section>

                {/* ★ 2. '코드 수신' 기능은 별도의 섹션으로 유지합니다. */}
                <section style={{display:"block"}}>
                  <h3 style={{ marginTop: 0 }}>데이터 관리</h3>
                  <button onClick={async () => {
                    try {
                      setManageMsg("요청 중...");
                      console.log('[LOAD] url =', API_URL); 
                      const res = await fetch('/api/regions/refresh', { method: 'POST' });
                      if (!res.ok) throw new Error(`서버 응답: ${res.statusText}`);
                      const result = await res.json();
                      setManageMsg(result.message || '성공적으로 요청했습니다.');
                    } catch (e) {
                      setManageMsg(`오류: ${e.message}`);
                    }
                  }}>
                    시/도, 시/군/구 코드 수신
                  </button>
                  {manageMsg && <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>{manageMsg}</p>}
                </section>

                {/* ★ 3.기본 지역 설정 */}
                <section style={{display:"block"}}>
                  <h3 style={{ marginTop: 0 }}>기본 지역 설정</h3>
                  <p style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>
                    첫 화면에서 지도의 시작 위치로 사용할 지역을 지정합니다.
                  </p>

                  {/* RegionSelector는 자동 이동이 제거된 상태여야 함 */}
                  <RegionSelector
                    value={mapCenter}
                    onChange={(center) => {
                      // 선택 즉시 미리보기 이동
                      setMapCenter(center);
                      // 저장 버튼으로 확정 저장
                      localStorage.setItem("homeCenter.pending", JSON.stringify(center));
                    }}
                  />

                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button onClick={() => {
                      const s = localStorage.getItem("homeCenter.pending");
                      if (s) {
                        localStorage.setItem("homeCenter", s);
                        setMapCenter(JSON.parse(s)); // 현재 화면에서도 즉시 반영
                        alert("기본 지역을 저장했습니다.");
                      } else {
                        alert("먼저 지역을 선택하세요.");
                      }
                    }}>
                      기본 지역으로 저장
                    </button>

                    <button onClick={() => {
                      localStorage.removeItem("homeCenter");
                      localStorage.removeItem("homeCenter.pending");
                      setMapCenter(DEFAULT_CENTER);
                      alert("기본 지역을 초기화했습니다.");
                    }}>
                      기본 지역 초기화
                    </button>
                  </div>
                </section>

                </div>
          {/* // 사진 저장소선택, 공급자정보, 사진 저장설정, 워터마크*/}
          <ConditionManage
            visibility={filtersState.visibility}
            values={filtersState.values}
            onToggle={(key, value) =>
              dispatch({ type: "SET_VIS", payload: { key, value } })
            }
            onChange={(key, value) =>
              dispatch({ type: "SET_FILTER", payload: { key, value } })
            }
            onSearch={handleSearch}
            onReset={handleReset}
          />

          {/* // "사진 소스선택 */}
          <div style={{margin:"8px 0 16px"}}>
            <strong>사진소스선택</strong>
            <label style={{marginLeft:12}}>
              <input
                type="radio"
                name="photoSrc"
                value="server"
                checked={photoSource === "server"}
                onChange={() => setPhotoSource("server")}
              /> 서버
            </label>
            <label style={{marginLeft:12}}>
              <input
                type="radio"
                name="photoSrc"
                value="gdrive"
                checked={photoSource === "gdrive"}
                onChange={() => setPhotoSource("gdrive")}
              /> 구글드라이브
            </label>
          </div>
              </div>   
            </div> 
          ) : (

            // 출력 화면
            <div className="search-page">

              {/* 지도 출력 */}
              <div className="map-top">
                {mapsReady && (
                  <KakaoMap
                    key={`${mapItems.length > 0 ? 'map' : 'page'}-${propertiesForMap.length}`} 
                    properties={propertiesForMap}
                    center={mapCenter}
                    highlightedId={highlightedId}
                    onMarkerClick={(id) => {
                      const numId = typeof id === "number" ? id : Number(id);
                      setHighlightedId(numId);

                      const allItems = mapItems.length > 0 ? mapItems : items;
                      const clickedItem = findById(numId, allItems);

                      if (clickedItem) {
                        const indexInList = items.findIndex(item => getId(item) === numId);
                        if (indexInList !== 0) {
                          const newList = items.filter(item => getId(item) !== numId);
                          newList.unshift(clickedItem);    // 맨 위로
                          setItems(newList);
                        }
                      }

                      if (listRef.current) {
                        listRef.current.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                  />
                )}
                
                {/* 지도 위 오버레이 */}
                <div className="map-overlay">

                  {/* 조건검색 + 패널 토글을 같은 줄에 배치 */}
                  <div className="map-chip" style={{ display:"inline-flex", gap:8 }}>
                    <button
                      className="chip-button"
                      onClick={() => setShowFilters((v) => !v)}
                    >
                      🔍 조건검색{" "}
                      {activeFilters > 0 && (
                        <span
                          className="chip-badge"
                          onClick={(e) => {
                            // 버튼 토글 클릭과 분리
                            e.stopPropagation();
                            if (!activeFilterLabels.length) {
                              alert("적용된 필터가 없습니다.");
                              return;
                            }
                            alert(
                              activeFilterLabels
                                .map((label, idx) => `${idx + 1}. ${label}`)
                                .join("\n")
                            );
                          }}
                        >
                          {activeFilters}
                        </span>
                      )}
                    </button>
                    {/* 조건검색 버튼의 우측에 패널 토글 */}
                    <button className="chip-button" onClick={() => setPanelOpen(v => !v)}>
                      {panelOpen ? "패널 닫기" : "패널 열기"}
                    </button>
                  </div>

                  {/* 검색결과 마커 모두 보기 */}
                  <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 30, pointerEvents: 'auto' }}>
                    <button onClick={loadAllForMap} className="chip-button">
                      🗺️ 현 검색결과 전체보기
                    </button>
                  </div>

                </div>
              </div>

              {/* 검색결과 수 출력 줄 */}
              <div className="result-row" style={{ display:"flex", alignItems:"center", justifyContent:"flex-start", gap:0, flexWrap:"nowrap" }}>
                <div className="pager" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span> 전체 {total}건 • 필터링 {filteredItems.length}건 • 페이지 {page}/{totalPages} </span>
                  <div style={{ display: "inline-flex", gap: 8 }}>
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}> 이전 </button>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}> 다음 </button>
                  </div>
              {/* 상단: 소재지 자동완성 + 액션 버튼 (sticky) */}
              <div
                className="search-sticky"
                style={{
                  position: "sticky",
                  top: 0,                // 헤더가 있으면 그 높이만큼 조정
                  zIndex: 1000,
                  background: "#fff",
                  padding: "8px 0",
                }}
                >
                  <AddressSearch
                    key={searchResetKey}
                    onPick={(it) => {
                      if (!it || !it.estate_no) return;

                      const no = Number(it.estate_no);

                      // 검색창 아래 버튼용으로 원본 검색결과 보관
                      setPickedEstate(it);
                      // 리스트에서 하이라이트용 id 설정
                      setHighlightedId(no);

                      // 항상 목록 API로 "리스트용 완전한 데이터"를 다시 가져온다
                      fetch(`/api/properties?estate_no=${no}&pageSize=1&include_done=y&all_dates=y`)
                        .then((r) => r.json())
                        .then((j) => {
                          const item = j && j.items && j.items[0];
                          if (!item) return;

                          // 항상 맨 앞에 꽂고, 나머지는 숫자 기준으로 동일 id 제거
                          setItems((prev) => {
                            const rest = (prev || []).filter(
                              (p) => Number(getId(p)) !== no
                            );
                            return [item, ...rest];
                          });

                          // 리스트 스크롤을 맨 위로
                          if (listRef.current) {
                            listRef.current.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        })
                        .catch((e) => {
                          console.warn("AddressSearch pick fetch error:", e);
                        });
                    }}
                    onNewAddress={(addr) => {
                      if (!addr) return;
                      const roadAddress =
                        typeof addr === "string"
                          ? addr
                          : addr.roadAddress || addr.jibunAddress || "";
                      const jibunAddress =
                        typeof addr === "string"
                          ? addr
                          : addr.jibunAddress || addr.roadAddress || "";

                      if (!roadAddress && !jibunAddress) return;

                      const newEstate = {
                        estate_no: null,
                        estate_id: null,
                        branch_id: null,
                        roadAddress,
                        jibunAddress,
                        detailAddress: "",
                      };
                      openEditor("edit", newEstate);
                    }}
                  />

                  {/* {pickedEstate && (
                    <div
                      style={{
                        marginTop: 4,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        fontSize: 12,
                      }}
                    >
                      <span>
                        선택된 매물: No. {pickedEstate.estate_no} ·{" "}
                        {pickedEstate.roadAddress ||
                          pickedEstate.jibunAddress ||
                          pickedEstate.estate_name ||
                          ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const id = Number(pickedEstate.estate_no);
                          const full =
                            items.find((p) => Number(getId(p)) === id) ||
                            pickedEstate;
                          if (!full) return;
                          openEditor("edit", full);
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const id = Number(pickedEstate.estate_no);
                          const full =
                            items.find((p) => Number(getId(p)) === id) ||
                            pickedEstate;
                          if (!full) return;
                          openEditor("copy", full);
                        }}
                      >
                        복사
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const id = Number(pickedEstate.estate_no);
                          const full =
                            items.find((p) => Number(getId(p)) === id) ||
                            pickedEstate;
                          if (!full) return;
                          openEditor("contract", full);
                        }}
                      >
                        거래완료
                      </button>
                    </div>
                  )} */}
                </div>
                </div>
              
                {/* 단위변환 */}
                <div className="unit-converter" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    value={sqm}
                    onChange={onSqmChange}
                    inputMode="decimal"
                    placeholder="㎡"
                    style={{ width: 40, textAlign: "right", padding: "2px 6px" }}
                  />
                  <span>↔</span>
                  <input
                    value={pyeong}
                    onChange={onPyeongChange}
                    inputMode="decimal"
                    placeholder="평"
                    style={{ width: 40, textAlign: "right", padding: "2px 6px" }}
                  />
                </div>
              </div>

              {/* 리스트 출력 줄 */}
              <div className="list-bottom property-list" ref={listRef}>
                <PropertyList
                  properties={filteredItems}
                  loading={loading}
                  highlightedId={highlightedId}
                  onSelect={(id) => {
                    if (id == null) {
                      setHighlightedId(null);                 // 닫힘: 하이라이트 해제
                      return;
                    }
                    setHighlightedId(id);                     // 열림: 하이라이트 적용
                    const base = filteredItems.length > 0 ? filteredItems : (mapItems.length > 0 ? mapItems : items);
                    const p = findById(id, base);
                    if (p) setMapCenter({ lat: p.lat, lng: p.lng });
                  }}
                  displaySource={photoSource}
                  onEditEstate={(p) => openEditor("edit", p)}
                  onCopyEstate={(p) => openEditor("copy", p)}
                  onContractEstate={(p) => openEditor("contract", p)}
                />
              </div>
              {/* 우측 고정 오버레이 패널 */}
              <OverlayPanel inline={false} open={panelOpen} />

        <EstateEditor
          open={editorOpen}
          mode={editorMode}
          estate={editorEstate}
          onClose={closeEditor}
          onSaved={({ ok, estate_no, mode, form, estate }) => {
            console.log("[App] editor saved:", { ok, estate_no, mode, form, estate });

            // 1차: 현재 리스트에서 해당 매물만 즉시 갱신 (화면에 바로 반영)
            setItems((prev) => {
              if (!prev || !prev.length) return prev;

              // 백엔드에서 전체 estate 객체를 내려주면 그걸 우선 사용
              const updated = estate && estate.estate_no
                ? estate
                : { estate_no, ...form };

              return prev.map((p) =>
                p.estate_no === updated.estate_no ? { ...p, ...updated } : p
              );
            });

            // 2차: 서버 값과 완전히 맞추기 위해 다시 조회
            load();
          }}
        />
            </div>
          )}
        </div>
      </ErrorBoundary>
    </>
  );
}