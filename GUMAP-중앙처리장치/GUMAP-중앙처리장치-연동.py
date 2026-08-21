# =================================================================================
# 📁 GUMAP-중앙처리장치-연동.py
# 📌 역할: 각 GUMAP-* 모듈에서 복사해서 사용하는 보고 연동 헬퍼
# =================================================================================
#
# [사용법] 각 GUMAP-* 파일 상단에 아래 코드 블록을 붙여넣기:
#
#   # ── GUMAP 중앙처리장치 연동 ──────────────────────────
#   import sys, os as _os
#   _cpu_path = _os.path.join(_os.path.dirname(__file__), '..', 'GUMAP-중앙처리장치')
#   if _cpu_path not in sys.path:
#       sys.path.insert(0, _cpu_path)
#   try:
#       from GUMAP_중앙처리장치 import report_modification
#   except ImportError:
#       def report_modification(*a, **kw): pass  # 중앙처리장치 없을 때 무시
#   # ────────────────────────────────────────────────────
#
# [수정 시 사용법]:
#   report_modification(
#       module="GUMAP-서버-버스대중교통",
#       changes=["bus_arrival 보정 계수 변경 0.6→0.7"],
#       description="버스 예측 정확도 개선",
#       severity="normal"   # normal / important / critical
#   )
#
# =================================================================================

USAGE_TEMPLATE = '''
# ── GUMAP 중앙처리장치 연동 ──────────────────────────
import sys, os as _os
_cpu_path = _os.path.join(_os.path.dirname(__file__), '..', 'GUMAP-중앙처리장치')
if _cpu_path not in sys.path:
    sys.path.insert(0, _cpu_path)
try:
    from GUMAP_중앙처리장치 import report_modification
except ImportError:
    def report_modification(*a, **kw): pass  # 중앙처리장치 없을 때 무시
# ────────────────────────────────────────────────────
'''

REPORT_TEMPLATE = '''
# 수정 후 반드시 호출:
report_modification(
    module="[이 파일 이름]",
    changes=[
        "변경사항 1",
        "변경사항 2",
    ],
    description="변경 이유/목적",
    severity="normal"   # normal / important / critical
)
'''

if __name__ == "__main__":
    print("=== GUMAP 중앙처리장치 연동 템플릿 ===")
    print("\n[각 GUMAP-* 파일 상단에 추가할 코드:]")
    print(USAGE_TEMPLATE)
    print("\n[수정 후 호출할 코드:]")
    print(REPORT_TEMPLATE)
