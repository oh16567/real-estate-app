#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json, os, time
import requests
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

API_KEY = "191f20ccbb42f0f7868e7e9fcf30f9d3366b96c41b6c04ee92bc822091864cf1"  # data.go.kr 발급키
BASE = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList"
NUM_PER_PAGE = 500          # 1000 → 500으로 낮춰 타임아웃 완화 (필요 시 200까지 낮춰보세요)
TIMEOUT = 30                # 초 (연결/응답 타임아웃)
MAX_PAGES = 200             # 안전장치 (실제는 42페이지 내외)
CACHE_FILE = "sido.cache.json"  # 선택적 캐시

def make_session():
    s = requests.Session()
    retry = Retry(
        total=5,                # 전체 재시도 횟수
        connect=5,              # 연결 실패 재시도
        read=5,                 # 읽기 실패 재시도
        backoff_factor=1,       # 1s, 2s, 4s, 8s, ...
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    s.headers.update({"User-Agent": "sido-tester/1.0"})
    return s

def fetch_page(session, page):
    params = {
        "serviceKey": API_KEY,
        "pageNo": page,
        "numOfRows": NUM_PER_PAGE,
        "type": "json",
    }
    r = session.get(BASE, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def rows_from_payload(payload):
    pack = payload.get("StanReginCd", [])
    rows = []
    for obj in pack:
        if "row" in obj and isinstance(obj["row"], list):
            rows.extend(obj["row"])
    total = None
    for obj in pack:
        if "head" in obj and isinstance(obj["head"], list):
            for h in obj["head"]:
                if "totalCount" in h:
                    try:
                        total = int(h["totalCount"])
                    except Exception:
                        pass
    return rows, total

def main():
    # 캐시가 있으면 먼저 보여주기(옵션)***
    if os.path.exists(CACHE_FILE):
        try:
            cache = json.load(open(CACHE_FILE, "r", encoding="utf-8"))
            if isinstance(cache, dict) and len(cache) == 17:
                print("캐시된 시도(17):", list(cache.values()))
        except Exception:
            pass

    session = make_session()
    sido = {}   # {'11': '서울특별시', ...}
    page = 1
    total = None

    while page <= MAX_PAGES:
        try:
            data = fetch_page(session, page)
            rows, t = rows_from_payload(data)
            if total is None and t is not None:
                total = t
                # 총 건수로 대략 페이지 수 추정
                est_pages = (total + NUM_PER_PAGE - 1) // NUM_PER_PAGE
                print(f"[INFO] total={total}, est_pages≈{est_pages}, rows/page={NUM_PER_PAGE}")

            # 시/도 레벨만 수집: sgg_cd=="000" and umd_cd=="000"
            got_new = 0
            for r in rows:
                if r.get("sgg_cd") == "000" and r.get("umd_cd") == "000":
                    code = r.get("sido_cd")
                    name = r.get("locatadd_nm")
                    if code and name and code not in sido:
                        sido[code] = name
                        got_new += 1

            print(f"[PAGE {page}] rows={len(rows)}, 누적 시도={len(sido)} (이번에 추가 {got_new})")

            # 17개 모두 모이면 즉시 종료
            if len(sido) >= 17:
                break

            # 더 이상 row가 없으면 종료
            if not rows:
                break

            page += 1

        except requests.exceptions.RequestException as e:
            # 네트워크/타임아웃 등 일시 오류 → 조금 쉬고 재시도(같은 페이지)
            print(f"[WARN] page {page} 요청 실패: {e} → 2초 후 재시도")
            time.sleep(2)
            continue

    # 정렬해서 출력
    result = [sido[k] for k in sorted(sido.keys())]
    print("\n최종 시도 목록({}/17):".format(len(result)), result)

    # 캐시 저장
    try:
        json.dump(sido, open(CACHE_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"[INFO] 캐시 저장: {CACHE_FILE}")
    except Exception as e:
        print(f"[WARN] 캐시 저장 실패: {e}")

if __name__ == "__main__":
    main()


