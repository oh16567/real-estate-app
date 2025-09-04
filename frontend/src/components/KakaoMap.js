import React, { useEffect, useRef, useState } from "react";
import "./OverlayPanel.css";

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

  const dong = pick(p.estate_dong);  // ★ 건물동만 사용, 행정동은 제외
  const ho   = pick(p.estate_ho);

  const dongPart = dong ? `${dong}동` : "";
  let tail = "";

  if (ho) {
    tail = `${ho}호`;
  } else {
    const t = pick(p.floor_etc, p.floor_type1, p.floor_type2);
    if (t) tail = FLOOR_MAP[String(t).trim()] || String(t).trim();
  }

  // 건물명 + (동/호/층)
  return [p.estate_name, dongPart, tail].filter(Boolean).join(" ");
}




export default function KakaoMap(rawProps) {
  const {
    properties = [],
    center = { lat: 37.5665, lng: 126.9780, level: 4 },
    visible = true,
    highlightedId = null,
    onMarkerClick = () => {},          // ★ 추가
  } = rawProps || {};

  const [mapsReady, setMapsReady] = useState(false);
  const mapRef = useRef(null);
  const clustererRef = useRef(null);
  const markersRef = useRef([]);
  const markerByIdRef = useRef(new Map());
  const containerRef = useRef(null);
  const readyRef = useRef(false);
  const defaultIconRef = useRef(null);
  const highlightIconRef = useRef(null);
  const infoRef = useRef(null); 
  //[역할] 인포윈도우를 1개만 생성해서 모든 마커가 같이 쓰도록 재사용합니다.

  // init map (autoload=false 사용 시 kakao.maps.load로 감싸기)
  useEffect(() => {
    const w = window;
    if (!w?.kakao?.maps) {
      console.warn("[KakaoMap] Kakao Maps SDK not loaded");
      return;
    }
    const init = () => {
      if (!containerRef.current) return;
      try {
        const kakao = w.kakao;
        const options = {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: center.level ?? 7,
        };
        const map = new kakao.maps.Map(containerRef.current, options);
        mapRef.current = map;

      // [역할] 공용 InfoWindow를 1회만 생성 (removable: X 버튼 표시)
      if (!infoRef.current) {
        infoRef.current = new kakao.maps.InfoWindow({
          removable: true,
          zIndex: 10,
          // autoPan 기본값은 true → 창이 화면 밖으로 나가려 하면 지도를 자동으로 이동해서 보이게 해줌
        });
      }
      // [역할] 지도 빈 곳을 클릭하면 열린 인포윈도우 닫기
      kakao.maps.event.addListener(map, "click", () => {
        try { infoRef.current?.close(); } catch {}
      });

        // marker icons
        defaultIconRef.current = new kakao.maps.MarkerImage(
          "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png",
          new kakao.maps.Size(24, 35)
        );
        highlightIconRef.current = new kakao.maps.MarkerImage(
          "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png",
          new kakao.maps.Size(24, 35)
        );

        if (kakao.maps.MarkerClusterer) {
          const clusterer = new kakao.maps.MarkerClusterer({
            map,
            averageCenter: true,
            minLevel: 6,
          });
          clustererRef.current = clusterer;
        } else {
          console.warn("[KakaoMap] MarkerClusterer not found; fallback to plain markers");
        }
        readyRef.current = true;
        setMapsReady(true);      // ★ 초기화 완료 신호
      } catch (e) {
        console.error("[KakaoMap] init error:", e);
      }
    };

    if (typeof w.kakao.maps.load === "function") w.kakao.maps.load(init);
    else init();

    return () => {
      try { if (clustererRef.current) clustererRef.current.setMap(null); } catch {}
      try { markersRef.current.forEach(m => { try { m.setMap(null); } catch {} }); } catch {}
      markersRef.current = [];
      markerByIdRef.current.clear();
      mapRef.current = null;
      clustererRef.current = null;
      readyRef.current = false;
    };
  }, []); // 초기 1회

  // visible/center relayout
// center change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!visible) return;

    setTimeout(() => {
      try {
        if (map.relayout) map.relayout();

        const K = window?.kakao?.maps;
        const ready = readyRef.current && K?.LatLng;
        const hasCenter = center && Number.isFinite(center.lat) && Number.isFinite(center.lng);

        if (ready && hasCenter) {
          const latlng = new K.LatLng(center.lat, center.lng);
          map.setCenter(latlng);
          if (typeof center.level === "number") {
            const cur = map.getLevel();
            if (cur !== center.level) map.setLevel(center.level);
          }
        }
      } catch (e) {
        console.warn("[KakaoMap] relayout error:", e);
      }
    }, 50);
  }, [visible, center]);


  // center change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;

    try {
      const K = window?.kakao?.maps;
      if (!readyRef.current || !K?.LatLng) return;

      const latlng = new K.LatLng(center.lat, center.lng);
      map.setCenter(latlng);

      if (typeof center.level === "number") {
        const cur = map.getLevel();
        if (cur !== center.level) map.setLevel(center.level);
      }
    } catch (e) {
      console.warn("[KakaoMap] setCenter error:", e);
    }
  }, [center?.lat, center?.lng, center?.level]);


  // markers refresh
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !mapsReady) return;  // ★ 준비 전이면 종료
    const clusterer = clustererRef.current;

    try { if (clusterer?.clear) clusterer.clear(); } catch {}
    try { markersRef.current.forEach(m => { try { m.setMap(null); } catch {} }); } catch {}
    markersRef.current = [];
    markerByIdRef.current.clear();

    const w = window;
    if (!w?.kakao?.maps) return;
    const kakao = w.kakao;

    const valid = (properties || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const markers = valid.map((p) => {
      const id = p.id ?? p.estate_no ?? `${p.lat},${p.lng}`;
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(p.lat, p.lng),
        title: p.title || "",
        image: defaultIconRef.current || undefined,
      });

     // [역할] 공용 InfoWindow를 사용: 내용이 길어도 창 안에서 스크롤되도록 DOM + 클래스 사용
     kakao.maps.event.addListener(marker, "click", () => {
       try {
         const esc = (s) => String(s ?? "")
           .replace(/&/g, "&amp;")
           .replace(/</g, "&lt;")
           .replace(/>/g, "&gt;");
         const wrap = document.createElement("div");
         wrap.className = "rea-infowindow"; // CSS로 max-size/overflow 제어
         wrap.innerHTML = `
           <div class="rea-iw-title">No. ${esc(p.estate_no ?? p.id ?? "")}</div>
           <div class="rea-iw-body">
             <div class="rea-iw-line">${esc(formatResidenceSubLine(p) || p.title || "(제목 없음)")}</div>
             ${p.price ? `<div class="rea-iw-line">${esc(p.price)}</div>` : ""}
             ${p.roadAddress ? `<div class="rea-iw-line">${esc(p.roadAddress)}</div>` : ""}
             ${p.jibun ? `<div class="rea-iw-line">${esc(p.jibun)}</div>` : ""}
           </div>
         `;
         infoRef.current.setContent(wrap);                   // 내용 설정
         infoRef.current.setPosition(marker.getPosition());  // 위치 지정
         infoRef.current.setZIndex(10);
         infoRef.current.setMap(map);                        // 표시 (autoPan으로 화면 안 자동 조정)
         try { onMarkerClick(id, p); } catch {}
       } catch {}
     });

      markerByIdRef.current.set(id, marker);
      return marker;
    });

    try {
      if (clusterer?.addMarkers) clusterer.addMarkers(markers);
      else markers.forEach(m => { try { m.setMap(map); } catch {} });
    } catch (e) {
      console.warn("[KakaoMap] add markers error:", e);
      markers.forEach(m => { try { m.setMap(map); } catch {} });
    }

    markersRef.current = markers;
  }, [JSON.stringify(properties), mapsReady]);

  // highlighted marker icon swap
  useEffect(() => {
    const m = markerByIdRef.current;
    const defImg = defaultIconRef.current;
    const hiImg  = highlightIconRef.current;

    for (const marker of m.values()) {
      try { if (defImg) marker.setImage(defImg); } catch {}
    }
    if (highlightedId && m.has(highlightedId)) {
      const mk = m.get(highlightedId);
      try { if (hiImg) mk.setImage(hiImg); } catch {}
    }
  }, [highlightedId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
