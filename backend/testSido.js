// testSido.js
const axios = require("axios");

async function fetchSido() {
  const serviceKey =191f20ccbb42f0f7868e7e9fcf30f9d3366b96c41b6c04ee92bc822091864cf1; // data.go.kr 키
  const url = `https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList`;

  try {
    // 1페이지 1000건만 가져오기 → 시도 코드만 추출
    const { data } = await axios.get(url, {
      params: {
        serviceKey,
        pageNo: 1,
        numOfRows: 1000,
        type: "json"
      },
      timeout: 20000
    });

    // 응답 구조에서 행(row) 꺼내기
    const pack = data?.StanReginCd;
    const rowObj = pack?.find(o => o.row);
    const rows = rowObj?.row || [];

    // sido_cd, locatadd_nm(시/도명)만 추출 (umd_cd = "000", sgg_cd = "000" 이 시도 레벨)
    const sido = rows.filter(r => r.sgg_cd === "000" && r.umd_cd === "000")
                     .map(r => ({ code: r.sido_cd, name: r.locatadd_nm }));

    console.log("시도 목록:", sido);
  } catch (e) {
    console.error("API 호출 실패:", e.message);
  }
}

fetchSido();