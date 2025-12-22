import React, { useEffect, useState } from "react";
import { API_BASE } from "../api/base";

export default function RegionSelector({ value, onChange }) {
  const [sidos, setSidos] = useState([]);
  const [sigungu, setSigungu] = useState([]);
  
  //state 초기값을 localStorage에서 읽기
  const [selSido, setSelSido] = useState(() => localStorage.getItem("lastSido") || "");
  const [selSigungu, setSelSigungu] = useState(() => localStorage.getItem("lastSigungu") || "");


  async function getJson(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    if (!ct.includes("application/json")) {
      throw new Error(`[RegionSelector] Not JSON: ${ct} body=${text.slice(0,200)}`);
    }
    return JSON.parse(text);
  }

  useEffect(() => {
    (async () => {
      try {
        const data = await getJson(`${API_BASE}/api/regions/sido`);
        setSidos(Array.isArray(data.items) ? data.items : []);
      } catch (e) {
        console.error("[RegionSelector] /sido error:", e);
        setSidos([]);
      }
    })();
  }, []);

// //목록 로드 후 자동 복원(지도로 이동)
//   useEffect(() => {
//   if (!sidos.length) return;
//   const savedSido = localStorage.getItem("lastSido");
//   const savedSigungu = localStorage.getItem("lastSigungu");
//   if (savedSido) {
//     setSelSido(savedSido);
//     if (savedSigungu) {
//       setSelSigungu(savedSigungu);
//       moveToAddress(`${savedSido} ${savedSigungu}`);
//     } else {
//       moveToAddress(savedSido);
//     }
//   }
// }, [sidos]);

  useEffect(() => {
    if (!selSido) { setSigungu([]); setSelSigungu(""); return; }
    (async () => {
      try {
        const data = await getJson(`${API_BASE}/api/regions/sigungu?sido=${encodeURIComponent(selSido)}`);
        const list = Array.isArray(data.items) ? data.items : [];
        setSigungu(list);

        // 기존 선택 또는 저장된 선택 유지 로직
        const saved = localStorage.getItem("lastSigungu") || "";
        setSelSigungu(prev => {
          // 1) 이전 선택이 유효하면 유지
          if (prev && list.includes(prev)) return prev;
          // 2) 저장된 값이 유효하면 복원
          if (saved && list.includes(saved)) return saved;
          // 3) 아니면 초기화
          return "";
        });
      } catch (e) {
        console.error("[RegionSelector] /sigungu error:", e);
        setSigungu([]);
      }
    })();
  }, [selSido]);

  const moveToAddress = (addr) => {
    const w = window;
    if (!w?.kakao?.maps?.services) return;
    const geocoder = new w.kakao.maps.services.Geocoder();
    geocoder.addressSearch(addr, (result, status) => {
      if (status === w.kakao.maps.services.Status.OK && result[0]) {
        const lat = parseFloat(result[0].y);
        const lng = parseFloat(result[0].x);
        onChange && onChange({ lat, lng, level: selSigungu ? 5 : 7 });
      }
    });
  };

  const onChangeSido = (e) => {
    const v = e.target.value;
    setSelSido(v);
    localStorage.setItem("lastSido", v);         // ★ 추가 바꿀 때 저장

    if (v) moveToAddress(v);
  };
  const onChangeSigungu = (e) => {
    const v = e.target.value;
    setSelSigungu(v);
    localStorage.setItem("lastSigungu", v);      // ★ 추가 바꿀 때 저장
    if (selSido && v) moveToAddress(`${selSido} ${v}`);
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={selSido} onChange={onChangeSido}>
        <option value="">시/도 선택</option>
        {sidos.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={selSigungu} onChange={onChangeSigungu} disabled={!selSido}>
        <option value="">시/군/구 선택</option>
        {sigungu.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
    </div>
  );
}
