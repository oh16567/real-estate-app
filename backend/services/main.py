import os
import requests
from dotenv import load_dotenv

# .env 파일에서 환경 변수(API 키) 불러오기
load_dotenv()
API_KEY = os.getenv('API_KEY')

# 공공데이터포털 법정동 코드 조회 API URL
BASE_URL = "http://api.vworld.kr/req/data"

def get_district_data(code=""):
    """법정동 코드 API를 호출하여 지역 데이터를 가져오는 함수"""
    params = {
        'service': 'data',
        'request': 'GetSido', # 시/도 정보 요청
        'key': API_KEY,
        'format': 'json',
        'domain': 'http://localhost:8000', # 로컬 테스트용 도메인 (실제 서비스 시 변경)
        'data': 'LT_C_ADSIDO' # 시/도 코드 데이터
    }
    
    # 시/군/구 코드를 조회하는 경우 파라미터 변경
    if code:
        params['data'] = 'LT_C_ADSIGG'
        params['attrfilter'] = f'sido_cd:={code}' # 상위 시/도 코드로 필터링

    try:
        response = requests.get(BASE_URL, params=params)
        response.raise_for_status()  # HTTP 오류 발생 시 예외 발생
        return response.json()['response']['result']['featureCollection']['features']
    except requests.exceptions.RequestException as e:
        print(f"API 요청 중 오류가 발생했습니다: {e}")
        return None
    except KeyError:
        print("API 응답 데이터 형식이 올바르지 않습니다.")
        return None

def main():
    """메인 실행 함수"""
    print(">> 전국 시/도 목록을 조회합니다...")
    sido_data = get_district_data()

    if not sido_data:
        return

    # 시/도 목록 출력 및 사용자 선택
    sido_dict = {}
    for idx, feature in enumerate(sido_data):
        props = feature['properties']
        sido_code = props['sido_cd']
        sido_name = props['sido_nm']
        sido_dict[str(idx + 1)] = {'code': sido_code, 'name': sido_name}
        print(f"  [{idx + 1}] {sido_name}")

    while True:
        try:
            choice = input("\n>> 시/군/구 정보를 조회할 시/도의 번호를 입력하세요 (종료: 0): ")
            if choice == '0':
                print("프로그램을 종료합니다.")
                break
                
            selected_sido = sido_dict.get(choice)
            if not selected_sido:
                print("잘못된 번호입니다. 다시 입력해주세요.")
                continue

            print(f"\n>> [{selected_sido['name']}]의 시/군/구 목록을 조회합니다...")
            
            sigungu_data = get_district_data(selected_sido['code'])
            
            if not sigungu_data:
                print("해당 지역의 시/군/구 정보를 가져올 수 없습니다.")
                continue

            for feature in sigungu_data:
                props = feature['properties']
                print(f"  - {props['sig_kor_nm']} (코드: {props['sig_cd']})")

        except KeyboardInterrupt:
            print("\n프로그램을 종료합니다.")
            break

if __name__ == "__main__":
    main()