// ============================================================
// 📁 파일명: js/utils/api-client.js
// 📌 역할: API 통신 장애 대응용 자동 재시도(Retry) 래퍼 함수
// ============================================================
//
// [파일 설명]
//   공공데이터포털 등 외부 API는 간헐적으로 타임아웃이나 5xx 에러를
//   반환합니다. 이 모듈은 fetch() 호출을 감싸서 실패 시 자동으로
//   지수 백오프(Exponential Backoff) 방식으로 재시도합니다.
//   - fetchWithRetry(url, options, retries)
//   - 1차 실패 → 1초 후 재시도 → 2차 실패 → 2초 후 재시도
//   - 모든 재시도 실패 시 최종 에러를 throw
//
// [의존 관계]
//   - 의존하는 파일: 없음 (독립 유틸리티)
//   - 이 파일을 참조하는 파일: config.js (fetchAPI 함수 내부에서 사용)
//
// [사용된 설계 패턴]
//   - 지수 백오프 재시도 패턴 (Exponential Backoff Retry)
// ============================================================

(function() {
    /**
     * API 통신 실패 시 지수 백오프 방식으로 자동 재시도를 수행하는 fetch wrapper
     * @param {string} url - 호출할 API 주소
     * @param {object} options - Fetch API 옵션
     * @param {number} retries - 최대 재시도 횟수
     * @returns {Promise<any>} JSON 파싱된 결과 객체
     */
    window.fetchWithRetry = async function(url, options = {}, retries = 2) {
        for (var attempt = 0; attempt <= retries; attempt++) {
            try {
                var res = await fetch(url, options);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }
                return await res.json();
            } catch (err) {
                if (attempt === retries) {
                    throw err; // 모든 재시도가 실패하면 최종 에러를 throw
                }
                var delay = 1000 * Math.pow(2, attempt); // 1초, 2초, 4초 ... 지수 백오프
                console.warn(`[API Client] Attempt ${attempt + 1} failed for ${url}. Retrying in ${delay}ms... Error:`, err);
                await new Promise(function(resolve) {
                    setTimeout(resolve, delay);
                });
            }
        }
    };
})();
