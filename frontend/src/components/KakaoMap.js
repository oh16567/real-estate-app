// frontend/src/components/KakaoMap.js
import React, { useEffect, useRef, useState } from "react";
import "./OverlayPanel.css";

const KAKAO_APP_KEY = "3b72256b73696ef033a88934ccd70232"; // 회원님의 카카오맵 앱 키
const KAKAO_SDK_URL = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_APP_KEY}&libraries=services,clusterer&autoload=false`;

// ★ 각 아이콘의 url, 너비(width), 높이(height)를 함께 관리하는 객체로 변경
const MARKER_INFO = {
  residence: { url: "/images/marker_residence.png", width: 32, height: 32 },
  commerce:  { url: "/images/marker_commerce.png",  width: 32, height: 32 },
  business:  { url: "/images/marker_business.png",  width: 40, height: 40 },
  profit:    { url: "/images/marker_profit.png",    width: 32, height: 32 },
};
const HIGHLIGHT_IMAGE_URL = "https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png";

const KakaoMap = ({ properties = [], center, highlightedId, onMarkerClick = () => {} }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const clustererRef = useRef(null);
  const markerMapRef = useRef(new Map());
  const iconsRef = useRef({});
  const infoWindowRef = useRef(null);

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
        const icon = iconsRef.current[p.estate_type] || iconsRef.current.business;
        const position = new window.kakao.maps.LatLng(p.lat, p.lng);
        
        const marker = new window.kakao.maps.Marker({ position, image: icon, title: p.title });
        marker.normalIcon = icon;
        marker.propertyId = id;

        window.kakao.maps.event.addListener(marker, "click", () => {
          infoWindowRef.current.setContent(`<div style="padding:5px;font-size:12px;">${p.title}<br/>${p.price}</div>`);
          infoWindowRef.current.open(mapRef.current, marker);
          onMarkerClick(id, p);
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