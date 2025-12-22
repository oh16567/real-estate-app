// frontend/src/components/KakaoMap.js
import React, { useEffect, useRef, useState } from "react";
import "../styles/OverlayPanel.css";
import iconResidence from "../assets/markers/marker_residence.png";
import iconCommerce  from "../assets/markers/marker_commerce.png";
import iconBusiness  from "../assets/markers/marker_business.png";
import iconProfit    from "../assets/markers/marker_profit.png";
import iconGray      from "../assets/markers/markerGray.png";

const KAKAO_APP_KEY = "3b72256b73696ef033a88934ccd70232"; // 회원님의 카카오맵 앱 키
const KAKAO_SDK_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&libraries=services,clusterer&autoload=false`;

// ★ 각 아이콘의 url, 너비(width), 높이(height)를 함께 관리하는 객체로 변경
const MARKER_INFO = {
  residence: { url: iconResidence, width: 32, height: 32 },
  commerce:  { url: iconCommerce,  width: 32, height: 32 },
  business:  { url: iconBusiness,  width: 40, height: 40 },
  profit:    { url: iconProfit,    width: 32, height: 32 },
  gray:      { url: iconGray,      width: 32, height: 32 },
};
const HIGHLIGHT_IMAGE_URL = "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png";

const KakaoMap = ({ properties = [], center, highlightedId, onMarkerClick = () => {} }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const clustererRef = useRef(null);
  const markerMapRef = useRef(new Map());
  const iconsRef = useRef({});
  const infoWindowRef = useRef(null);
  const popupOverlayRef = useRef(null);

  // ★ 1. 지도가 완전히 준비되었는지 확인하는 상태 변수 추가
  const [isMapReady, setMapReady] = useState(false);

  // 지도 SDK 로딩 및 초기화 (최초 1회만 실행)
  useEffect(() => {
    // 스크립트가 이미 로드되어 있다면 중복 로드 방지
    if (window.kakao && window.kakao.maps) {
      if (!mapRef.current) initMap();
      return;
    }

    const script = document.createElement("script");
    script.src = KAKAO_SDK_URL;
    script.async = true;
    document.head.appendChild(script);

    script.onload = () => {
      window.kakao.maps.load(initMap);
    };

    function initMap() {
      if (!containerRef.current) return;
      const kakao = window.kakao;
      const map = new kakao.maps.Map(containerRef.current, {
        center: new kakao.maps.LatLng(center.lat, center.lng),
        level: center.level,
      });
      mapRef.current = map;

      infoWindowRef.current = new kakao.maps.InfoWindow({ removable: true, zIndex: 10 });
      popupOverlayRef.current = new kakao.maps.CustomOverlay({ 
        yAnchor: 1.12,
        zIndex: 10000
      }); // 말풍선 아래쪽 기준

      kakao.maps.event.addListener(map, "click", () => infoWindowRef.current?.close());

      // 아이콘 이미지 객체 생성
      const starMarkerSize = new kakao.maps.Size(24, 35);
      iconsRef.current.highlight = new kakao.maps.MarkerImage(HIGHLIGHT_IMAGE_URL, starMarkerSize);

      // for-in 루프를 사용해 각 마커 정보를 순회
      for (const key in MARKER_INFO) {
        const info = MARKER_INFO[key];
        const size = new kakao.maps.Size(info.width, info.height); // ★ 각자의 크기로 Size 객체 생성
        iconsRef.current[key] = new kakao.maps.MarkerImage(info.url, size);
      }
      
      clustererRef.current = new kakao.maps.MarkerClusterer({
        map: map,
        averageCenter: true,
        minLevel: 6,
      });

      setMapReady(true); // ★ 2. 모든 준비가 끝나면 상태를 true로 변경
    }
  }, []); // 빈 배열로 최초 1회만 실행되도록 보장

    // 반응형 컨테이너 크기 유지
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.width = "100%";
    containerRef.current.style.height = "100%";
  }, []);

  // 지도 중심/레벨 변경 처리
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !center) return;
    const { lat, lng, level } = center;
    const newCenter = new window.kakao.maps.LatLng(lat, lng);
    mapRef.current.setCenter(newCenter);
    if (level && mapRef.current.getLevel() !== level) {
      mapRef.current.setLevel(level);
    }
  }, [center, isMapReady]);

  // 마커 업데이트 처리
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !clustererRef.current) return;

    const clusterer = clustererRef.current;
    clusterer.clear();
    markerMapRef.current.clear();

    const newMarkers = properties
      .filter(p => p.lat && p.lng)
      .map((p) => {
        const id = p.id ?? p.estate_no;
        const iconKey = (p.contract_yn === 'n') ? 'gray' : (p.estate_type || 'business');
        const icon = iconsRef.current[iconKey] || iconsRef.current.business;
        
        const position = new window.kakao.maps.LatLng(p.lat, p.lng);
        const marker = new window.kakao.maps.Marker({ position, image: icon, title: p.title });
        marker.normalIcon = icon;
        marker.propertyId = id;

        window.kakao.maps.event.addListener(marker, "click", () => {
        const esc = (s) =>
          String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

        const name = p.estate_name || p.title || "";
        const html = `
          <div style="
            max-width:260px; box-sizing:border-box;
            background:#fff; border:1px solid #d0d3d8; border-radius:8px;
            box-shadow:0 6px 20px rgba(0,0,0,0.18);
            padding:8px 10px;
            font-size:12px; line-height:1.5; color:#16181d;
            word-break:keep-all; overflow-wrap:break-word; white-space:normal;
            transform:translateZ(0);  /* 렌더 테어링 방지 */
          ">
            <div style="font-weight:600; margin-bottom:4px;">
              ${esc(name)}${name ? " •" : ""}
            </div>
            <div>${esc(p.price ?? "")}</div>
          </div>
          <div style="
            width:0;height:0; margin:0 auto; /* 중앙 화살표 */
            border-left:8px solid transparent; border-right:8px solid transparent;
            border-top:8px solid #fff; filter: drop-shadow(0 -1px 0 #d0d3d8);
          "></div>
        `;

        popupOverlayRef.current.setContent(html);
        popupOverlayRef.current.setPosition(marker.getPosition());
        popupOverlayRef.current.setZIndex(10000);
        popupOverlayRef.current.setMap(mapRef.current);

        // 필요 시: 기존 InfoWindow는 닫기
        infoWindowRef.current.close?.();

        // 마커외 지도 클릭 시 인포윈도우 닫기
        kakao.maps.event.addListener(mapRef.current, "click", () => {
          popupOverlayRef.current?.setMap(null);
        });

        onMarkerClick(id, p);

        infoWindowRef.current.setZIndex(9999);        // 다른 요소에 가려질 때
        // infoWindowRef.current.setOptions({ disableAutoPan: false }); // 자동팬 유지
        });
        
        markerMapRef.current.set(id, marker);
        return marker;
      });

    if (newMarkers.length > 0) {
      clusterer.addMarkers(newMarkers);
    }
  }, [properties, isMapReady]); // ★ 지도가 준비된 후 properties가 변경될 때마다 실행

  // 마커 강조 효과 처리
  useEffect(() => {
    if (!isMapReady) return;
    const markerMap = markerMapRef.current;
    if (!markerMap.size) return;

    markerMap.forEach(marker => {
      if (marker.getImage() !== marker.normalIcon) {
        marker.setImage(marker.normalIcon);
      }
    });

    if (highlightedId && markerMap.has(highlightedId)) {
      const markerToHighlight = markerMap.get(highlightedId);
      markerToHighlight.setImage(iconsRef.current.highlight);
    }
  }, [highlightedId, isMapReady]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

export default KakaoMap;