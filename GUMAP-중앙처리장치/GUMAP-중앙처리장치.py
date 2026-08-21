# =================================================================================
# 📁 GUMAP-중앙처리장치.py
# 📌 역할: GUMAP 전체 모듈의 변경 보고서를 수집·관리하는 중앙처리 시스템
# =================================================================================
#
# [사용 방법]
# 각 GUMAP-* 모듈 파일의 상단에 아래를 추가:
#
#   import sys, os
#   sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'GUMAP-중앙처리장치'))
#   from GUMAP-중앙처리장치 import report_modification
#
# 그리고 수정이 발생하는 함수에서 호출:
#
#   report_modification(
#       module="GUMAP-서버-버스대중교통",
#       changes=["bus_arrival 로직 수정", "LSTM 보정 계수 0.6→0.7"],
#       description="버스 도착 예측 정확도 개선"
#   )
#
# =================================================================================

import os
import sys
import json
import hashlib
from datetime import datetime
from pathlib import Path

# Safe console output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# 보고서 저장 경로 (이 파일 기준)
REPORTS_DIR = Path(__file__).parent / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

# 전체 요약 파일
SUMMARY_FILE = Path(__file__).parent / "GUMAP-변경이력-요약.json"


def report_modification(
    module: str,
    changes: list[str],
    description: str = "",
    author: str = "AI",
    severity: str = "normal"  # normal | important | critical
) -> dict:
    """
    GUMAP 모듈 변경사항을 중앙처리장치에 보고합니다.

    Args:
        module     : 변경된 모듈 이름 (예: "GUMAP-서버-버스대중교통")
        changes    : 변경 사항 목록 (예: ["함수명 변경", "로직 수정"])
        description: 변경 요약 설명
        author     : 변경자 (기본값: "AI")
        severity   : 중요도 - normal / important / critical

    Returns:
        생성된 보고서 dict
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    timestamp_file = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_id = hashlib.md5(f"{module}{timestamp}".encode()).hexdigest()[:8]

    report = {
        "report_id":   report_id,
        "timestamp":   timestamp,
        "module":      module,
        "author":      author,
        "severity":    severity,
        "description": description,
        "changes":     changes,
        "change_count": len(changes)
    }

    # 개별 보고서 파일 저장
    report_filename = REPORTS_DIR / f"{timestamp_file}_{module}_{report_id}.json"
    with open(report_filename, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # 전체 요약 파일 업데이트
    _update_summary(report)

    # 콘솔 출력
    severity_icon = {"normal": "📝", "important": "⚠️", "critical": "🚨"}.get(severity, "📝")
    print(f"\n{'='*60}")
    print(f"{severity_icon} [GUMAP 중앙처리장치] 변경 보고서 수신")
    print(f"{'='*60}")
    print(f"  보고 ID : {report_id}")
    print(f"  시각    : {timestamp}")
    print(f"  모듈    : {module}")
    print(f"  작성자  : {author}")
    print(f"  중요도  : {severity.upper()}")
    print(f"  설명    : {description}")
    print(f"  변경사항 ({len(changes)}건):")
    for i, change in enumerate(changes, 1):
        print(f"    {i}. {change}")
    print(f"  보고서  : {report_filename.name}")
    print(f"{'='*60}\n")

    return report


def get_recent_reports(limit: int = 10) -> list[dict]:
    """최근 보고서 N개를 반환합니다."""
    report_files = sorted(REPORTS_DIR.glob("*.json"), reverse=True)[:limit]
    reports = []
    for f in report_files:
        with open(f, encoding="utf-8") as fp:
            reports.append(json.load(fp))
    return reports


def get_module_history(module: str) -> list[dict]:
    """특정 모듈의 변경 이력을 반환합니다."""
    all_files = sorted(REPORTS_DIR.glob(f"*_{module}_*.json"), reverse=True)
    history = []
    for f in all_files:
        with open(f, encoding="utf-8") as fp:
            history.append(json.load(fp))
    return history


def print_summary():
    """전체 변경 이력 요약을 출력합니다."""
    if not SUMMARY_FILE.exists():
        print("아직 보고서가 없습니다.")
        return

    with open(SUMMARY_FILE, encoding="utf-8") as f:
        summary = json.load(f)

    print(f"\n{'='*60}")
    print(f"📊 GUMAP 중앙처리장치 - 전체 변경 이력 요약")
    print(f"{'='*60}")
    print(f"  총 변경 보고서: {summary.get('total_reports', 0)}건")
    print(f"  마지막 업데이트: {summary.get('last_updated', '-')}")
    print(f"\n  모듈별 변경 횟수:")
    for module, count in sorted(summary.get("modules", {}).items(), key=lambda x: -x[1]):
        print(f"    {module}: {count}회")
    print(f"\n  최근 10건:")
    for r in summary.get("recent", [])[:10]:
        icon = {"normal": "📝", "important": "⚠️", "critical": "🚨"}.get(r.get("severity"), "📝")
        print(f"    {icon} [{r['timestamp']}] {r['module']} - {r['description']}")
    print(f"{'='*60}\n")


def _update_summary(report: dict):
    """전체 요약 파일 업데이트 (내부 함수)"""
    summary = {"total_reports": 0, "modules": {}, "recent": [], "last_updated": ""}

    if SUMMARY_FILE.exists():
        with open(SUMMARY_FILE, encoding="utf-8") as f:
            try:
                summary = json.load(f)
            except Exception:
                pass

    summary["total_reports"] = summary.get("total_reports", 0) + 1
    summary["modules"][report["module"]] = summary.get("modules", {}).get(report["module"], 0) + 1
    summary["last_updated"] = report["timestamp"]

    recent = summary.get("recent", [])
    recent.insert(0, {
        "report_id": report["report_id"],
        "timestamp": report["timestamp"],
        "module": report["module"],
        "description": report["description"],
        "severity": report["severity"],
        "change_count": report["change_count"]
    })
    summary["recent"] = recent[:50]  # 최근 50건만 유지

    with open(SUMMARY_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)


# ==========================================
# 직접 실행 시 요약 출력
# ==========================================
if __name__ == "__main__":
    print_summary()
