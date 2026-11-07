/*
 * 카카오 JavaScript 키 설정
 *
 * 1. https://developers.kakao.com → 내 애플리케이션 → 앱 만들기
 * 2. 앱 설정 → 플랫폼 → Web → 사이트 도메인에 http://localhost:8000 (배포 주소도) 등록
 * 3. 앱 키 → "JavaScript 키"를 아래에 붙여넣기 (REST API 키 아님)
 * 4. 제품 설정 → 카카오맵 → 사용 설정 ON
 *
 * JavaScript 키는 등록한 도메인에서만 동작하므로 공개 저장소에 올려도 됩니다.
 * 비워 두면 기존처럼 OpenStreetMap(Overpass)으로 식당을 찾습니다.
 */
window.KAKAO_JS_KEY = "00d3405881592e40dfc8e16af6ddb3cc";
