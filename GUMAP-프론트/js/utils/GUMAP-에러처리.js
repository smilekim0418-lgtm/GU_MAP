// ============================================================
// 📁 파일명: js/utils/error-handler.js
// 📌 역할: 통합 에러 핸들링 및 사용자 알림 토스트 UI
// ============================================================
//
// [파일 설명]
//   애플리케이션 전체에서 발생하는 예외를 일관된 방식으로 처리합니다.
//   에러 심각도를 4단계로 분류하여 적절한 사용자 피드백을 제공합니다.
//   - SILENT (0): 콘솔에만 기록, 사용자에게 표시하지 않음
//   - TOAST (1): 화면 하단에 3초간 빨간색 토스트 알림 표시
//   - PANEL (2): 정보 패널에 에러 상세 내용 표시 (예약)
//   - FATAL (3): 전체 화면 에러 오버레이 표시 (예약)
//   - 토스트 UI는 등장/퇴장 CSS 애니메이션이 적용됨
//
// [의존 관계]
//   - 의존하는 파일: 없음 (독립 유틸리티)
//   - 이 파일을 참조하는 파일: config.js (fetchAPI 에러 처리에서 사용)
//
// [사용된 설계 패턴]
//   - 싱글턴 에러 핸들러 객체
//   - 단계별 에러 에스컬레이션 패턴
// ============================================================

(function() {
    const ErrorHandler = {
        LEVEL: {
            SILENT: 0,
            TOAST: 1,
            PANEL: 2,
            FATAL: 3
        },

        /**
         * 시스템 예외 및 에러를 통제하고 레벨별로 전파/표시합니다.
         * @param {Error|object} err - 발생한 예외 객체
         * @param {string} context - 에러가 발생한 상황 또는 기능 맥락
         * @param {number} [level=1] - 에러 대응 레벨 (0: SILENT, 1: TOAST, 2: PANEL, 3: FATAL)
         */
        handle(err, context, level = 1) {
            console.error(`[GUMAP Error - ${context}]`, err);

            if (level === this.LEVEL.SILENT) return;

            if (level === this.LEVEL.TOAST) {
                var displayMsg = err.message || '알 수 없는 네트워크 오류가 발생했습니다.';
                this.showToast(`🚨 ${context} 실패: ${displayMsg}`);
            }
        },

        /**
         * 화면 하단에 3초 동안 노출되는 비차단형 에러 토스트 팝업을 띄웁니다.
         * @param {string} msg - 노출할 에러 메시지
         */
        showToast(msg, tone) {
            var colors = tone === 'info'
                ? { bg: 'rgba(30, 41, 59, 0.95)', shadow: 'rgba(15, 23, 42, 0.3)' }
                : { bg: 'rgba(239, 68, 68, 0.95)', shadow: 'rgba(239, 68, 68, 0.3)' };
            var container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                Object.assign(container.style, {
                    position: 'fixed',
                    bottom: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: '20002', // 모달 뒤에 숨지 않도록 충분히 높은 z-index
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    pointerEvents: 'none'
                });
                document.body.appendChild(container);
            }

            var toast = document.createElement('div');
            Object.assign(toast.style, {
                background: colors.bg,
                backdropFilter: 'blur(10px)',
                webkitBackdropFilter: 'blur(10px)',
                color: '#ffffff',
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '700',
                boxShadow: '0 8px 24px ' + colors.shadow,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                opacity: '0',
                transform: 'translateY(15px)',
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: 'auto',
                maxWidth: 'calc(100vw - 32px)',
                textAlign: 'center',
                fontFamily: 'Noto Sans KR, sans-serif'
            });
            toast.textContent = msg;
            container.appendChild(toast);

            // 등장 애니메이션
            setTimeout(function() {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            }, 50);

            // 3초 후 페이드아웃 및 제거
            setTimeout(function() {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-15px)';
                setTimeout(function() {
                    toast.remove();
                }, 350);
            }, 3000);
        }
    };

    window.ErrorHandler = ErrorHandler;

    // 일반 안내 토스트. 여러 모듈이 if (window.showToast) 로 부르는데 정작 정의가 없어서
    // "출발 위치를 지도에서 눌러 주세요" 같은 안내가 한 번도 뜨지 않았다.
    window.showToast = function(msg) {
        ErrorHandler.showToast(msg, 'info');
    };
})();
