// services/regionsProvider.js
// 전국 시/도 → 시/군/구 제공 Provider
// - 1단계: 시도(17개)만 먼저 안정적으로 수집 → 즉시 서비스
// - 2단계: 시군구 전량 병렬 수집 → 디스크 캐시 저장 → 이후엔 즉시 응답
// - HTTPS, 재시도/백오프, 디스크 캐시 지원

const fs = require("fs");
const path = require("path");
const axios = require("axios");

// ==== 설정값 ====
const BASE = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList";
const NUM_PER_PAGE = 500;        // 페이지당 행수 (네트워크 약하면 200~500 권장)
const TIMEOUT_MS   = 30000;      // 요청 타임아웃(ms)
const RETRIES      = 5;          // 페이지 재시도 횟수
const CONCURRENCY  = 4;          // 시군구 병렬 수집 동시 요청 수(서버 상황 따라 3~6 권장)

const CACHE_DIR  = path.join(__dirname, "..", "data");
const CACHE_FILE = path.join(CACHE_DIR, "regions.kr.cache.json");

// ==== 유틸 ====
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function normalizeSidoName(name) {
  if (!name) return name;
  const t = name.replace(/\s+/g, "");
  if (t === "경기") return "경기도";
  if (t === "제주") return "제주특별자치도";
  return name;
}

function rowsFromPayload(payload) {
  const pack = payload?.StanReginCd;
  let rows = [];
  let total = null;

  if (Array.isArray(pack)) {
    for (const obj of pack) {
      if (obj && Array.isArray(obj.row)) rows = rows.concat(obj.row);
      if (obj && Array.isArray(obj.head)) {
        const tEnt = obj.head.find(h => typeof h.totalCount !== "undefined");
        if (tEnt) total = Number(tEnt.totalCount) || total;
      }
    }
  }
  return { rows, total };
}

async function fetchPage(serviceKey, pageNo, numOfRows=NUM_PER_PAGE) {
  const url = `${BASE}?serviceKey=${encodeURIComponent(serviceKey)}&pageNo=${pageNo}&numOfRows=${numOfRows}&type=json`;
  let attempt = 0, lastErr;
  while (attempt < RETRIES) {
    try {
      const { data } = await axios.get(url, {
        timeout: TIMEOUT_MS,
        headers: { "User-Agent": "real-estate-app/1.0 (+http://210.114.19.130)" }
      });
      return data;
    } catch (e) {
      lastErr = e;
      const wait = 1000 * Math.pow(2, attempt); // 1s→2s→4s→8s→16s
      console.warn(`[regions] page ${pageNo} fetch fail (try ${attempt+1}/${RETRIES}): ${e.message}; retry in ${wait}ms`);
      await sleep(wait);
      attempt++;
    }
  }
  throw lastErr;
}

// 1단계: 시/도 17개만 빠르게 수집 (여러 페이지 돌며 찾되, 17개 모이면 즉시 종료)
async function fetchSidoOnly(serviceKey) {
  let page = 1;
  let total = null;
  const sidoMap = new Map(); // code2 -> name

  for (;;) {
    const payload = await fetchPage(serviceKey, page);
    const { rows, total: t } = rowsFromPayload(payload);
    if (total == null && t != null) {
      total = t;
      const estPages = Math.ceil(total / NUM_PER_PAGE);
      console.log(`[regions] (sido) total=${total}, est_pages≈${estPages}, rows/page=${NUM_PER_PAGE}`);
    }
    // 시/도 레벨: sgg_cd=="000" && umd_cd=="000"
    for (const r of rows) {
      if (r?.sgg_cd === "000" && r?.umd_cd === "000" && r?.sido_cd && r?.locatadd_nm) {
        const code = r.sido_cd;  // "11", "41", "49" 등
        const name = normalizeSidoName(r.locatadd_nm);
        if (!sidoMap.has(code)) sidoMap.set(code, name);
      }
    }
    console.log(`[regions] (sido) page=${page}, found=${sidoMap.size}/17`);

    if (sidoMap.size >= 17) break;
    if (!rows || rows.length === 0) break;
    page++;
  }

  // 결과 정렬: 코드순
  const sidoList = Array.from(sidoMap.entries())
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([code2, name]) => ({ code2, name }));

  return { sidoList };
}

// 2단계: 전 행정동을 전부 돌며 "시군구 레벨"만 추출해 시/도별로 그룹핑
async function fetchSigunguAll(serviceKey) {
  // 먼저 1페이지로 total 확보
  const first = await fetchPage(serviceKey, 1);
  const firstParsed = rowsFromPayload(first);
  const total = firstParsed.total || firstParsed.rows.length || 0;
  const pages = Math.ceil(total / NUM_PER_PAGE);
  let allSggRows = [];

  console.log(`[regions] (sgg) total=${total}, pages=${pages}, rows/page=${NUM_PER_PAGE}`);
  // 1페이지 포함
  allSggRows.push(...firstParsed.rows.filter(r => r?.umd_cd === "000" && r?.sgg_cd !== "000"));

  const pending = [];
  for (let p = 2; p <= pages; p++) pending.push(p);

  let donePages = 1;
  // worker
  const worker = async () => {
    while (pending.length) {
      const p = pending.shift();
      const payload = await fetchPage(serviceKey, p);
      const { rows } = rowsFromPayload(payload);
      const sggRows = rows.filter(r => r?.umd_cd === "000" && r?.sgg_cd !== "000");
      allSggRows.push(...sggRows);
      donePages++;
      if (donePages % 5 === 0 || donePages === pages) {
        console.log(`[regions] (sgg) progress: ${donePages}/${pages} pages`);
      }
    }
  };
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  // 그룹핑: sido_cd -> [시군구명]
  const sigunguBySido = {};
  for (const r of allSggRows) {
    const sido = r?.sido_cd;
    // 시군구명은 locallow_nm 에 짧은 명칭(예: "남구")가 들어있음
    const name = r?.locallow_nm || (r?.locatadd_nm?.split(" ").slice(1).join(" "));
    if (!sido || !name) continue;
    if (!sigunguBySido[sido]) sigunguBySido[sido] = [];
    if (!sigunguBySido[sido].includes(name)) sigunguBySido[sido].push(name);
  }
  // 정렬
  for (const k of Object.keys(sigunguBySido)) {
    sigunguBySido[k].sort((a,b)=>a.localeCompare(b,'ko-KR'));
  }
  return { sigunguBySido };
}

// ==== Provider ====
  class RegionsProvider {
    constructor() {
      this.cache = null;       // { sidoList:[{code2,name}], sigunguBySido:{code2:[...]}}
      this.expiresAt = 0;
    }

    loadFromDisk() {
      try {
        if (!fs.existsSync(CACHE_FILE)) return null;
        const raw = fs.readFileSync(CACHE_FILE, "utf8");
        const obj = JSON.parse(raw);
        if (!Array.isArray(obj?.sidoList)) return null;
        console.log("[regions] loaded cache from disk:",
          "sido=", obj.sidoList.length,
          "sggKeys=", obj.sigunguBySido ? Object.keys(obj.sigunguBySido).length : 0
        );
        return obj;
      } catch {
        return null;
      }
    }

    saveToDisk(data) {
      try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data), "utf8");
        console.log("[regions] saved cache to", CACHE_FILE);
      } catch (e) {
        console.warn("[regions] save cache fail:", e.message);
      }
    }

    deleteCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
        console.log("[regions] cache file deleted by API request.");
      }
      } catch (e) {
        console.warn("[regions] delete cache fail:", e.message);
        throw e; // 에러를 상위로 전달
      }
    }

    // ★ 외부 API를 호출하여 데이터를 즉시 갱신하는 함수
    async forceRefresh() {
      const key = process.env.DATA_GO_KR_KEY;
      if (!key) {
        throw new Error("DATA_GO_KR_KEY (API Key) is not configured in .env file.");
      }

      console.log("[regions] force refresh requested.");
      try {
        // Sido와 Sigungu 데이터를 모두 새로 받아옵니다.
        const { sidoList } = await fetchSidoOnly(key);
        const { sigunguBySido } = await fetchSigunguAll(key);

        const data = { sidoList, sigunguBySido };
        this.cache = data; // 메모리 캐시 갱신
        this.saveToDisk(data); // 디스크 캐시 갱신

        console.log("[regions] force refresh completed successfully.");
        return "Sido/Sigungu data has been updated successfully from the API.";
      } catch (e) {
        console.error("[regions] force refresh failed:", e.message);
        throw new Error("Failed to fetch new data from the API.");
      }
    }

    async load() {
      const key = process.env.DATA_GO_KR_KEY;
      console.log("[regions] boot: loading from cache or fallback.");
    

      // ★ 서버 시작 시에는 디스크 캐시만 읽도록 로직을 단순화합니다.
      const disk = this.loadFromDisk();
      if (disk) {
        this.cache = disk;
      }

      // ★ 캐시가 없을 경우에만 비상용 데이터를 사용합니다.
      if (!this.cache) {
          console.warn("[regions] no cache file; fallback used");
          this.cache = {
            sidoList: [
              { code2:"11", name:"서울특별시" },
              { code2:"41", name:"경기도" },
              { code2:"49", name:"제주특별자치도" },
            ],
            sigunguBySido: {
              "11": ["종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구","강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구","구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구"],
              "41": ["수원시","고양시","용인시","성남시","부천시","안산시","안양시","의정부시","파주시","광명시","군포시","과천시","여주시","화성시","김포시","시흥시","오산시","광주시","이천시","평택시","하남시","포천시","연천군","양주시","의왕시","동두천시","양평군","안성시","가평군","남양주시"],
              "49": ["제주시","서귀포시"],
            }
          };
        }
         const hours = Number(process.env.REGIONS_REFRESH_HOURS || 24);
         this.expiresAt = Date.now() + hours * 3600 * 1000;
      }



  async ensure() {
    if (!this.cache || Date.now() > this.expiresAt) {
      await this.load();
    }
    return this.cache || { sidoList: [], sigunguBySido: {} };
  }

  async getSido() {
    const d = await this.ensure();
    const list = Array.isArray(d?.sidoList) ? d.sidoList : [];
    // 이름만 배열로 반환 (프론트 요구사항)
    return list.map(s => s.name);
  }

  async getSigungu(sidoName) {
    const d = await this.ensure();
    const nameNorm = normalizeSidoName(sidoName);
    const code2 = (d.sidoList || []).find(s => s.name === nameNorm)?.code2;
    if (!code2) return [];
    return d.sigunguBySido?.[code2] || [];
  }
}

module.exports = new RegionsProvider();
