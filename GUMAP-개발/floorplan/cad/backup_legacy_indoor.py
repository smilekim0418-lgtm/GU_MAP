"""도면 이미지 기반 실내지도 전체를 날짜 폴더로 통째 백업한다.

CAD 기반 지도를 메인 GUMAP 에 얹기 전에, 지금 서비스되고 있는 실내지도를
되돌릴 수 있게 남겨 둔다. cad/legacy_snapshot 은 CAD 작업이 건드리지 않았음을
증명하려고 고른 핵심 24개 파일만 갖고 있어서, 실제 복구본으로는 부족하다.
여기서는 도면 → 폴리곤 → IMDF → 프론트 번들 로 이어지는 사슬을 통째로 뜬다.

  python GUMAP-개발/floorplan/cad/backup_legacy_indoor.py

이미 있는 백업 폴더는 덮어쓰지 않는다. 백업은 한 번 뜨면 끝이어야 한다.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STAMP = date.today().isoformat()
DEST = ROOT / "backup" / f"실내지도-도면기반-{STAMP}"

# 실내지도를 다시 만들 수 있는 최소 집합. 산출물(IMDF·프론트 번들)뿐 아니라
# 그것을 만든 중간 산출물(폴리곤·라벨·좌표변환)까지 넣는다. 중간 산출물이
# 없으면 백업을 되돌려도 다음 빌드가 곧바로 덮어써 버린다.
TREES = [
    "GUMAP-개발/floorplan/work",
    "GUMAP-학교지도/data/imdf/techno",
]
FILES = [
    "GUMAP-개발/floorplan/techno_georef.json",
    "GUMAP-프론트/js/map/map-techno-imdf-data.js",
    "GUMAP-프론트/js/map/map-techno-indoor.js",
    "GUMAP-프론트/js/map/map-techno-nav-data.js",
    "GUMAP-프론트/js/map/map-techno-route.js",
    "GUMAP-프론트/js/map/map-techno-route-core.js",
    "GUMAP-프론트/js/map/map-techno-b1.js",
    "GUMAP-프론트/js/map/map-layers.js",
    "GUMAP-프론트/js/map/map-click.js",
    "GUMAP-일반지도/map/map-techno-imdf-data.js",
    "GUMAP-일반지도/map/map-techno-indoor.js",
    "GUMAP-일반지도/map/map-techno-nav-data.js",
    "GUMAP-일반지도/map/map-techno-route.js",
    "GUMAP-일반지도/map/map-techno-route-core.js",
    "GUMAP-일반지도/map/map-techno-b1.js",
    "GUMAP-일반지도/map/map-layers.js",
    "GUMAP-일반지도/map/map-click.js",
    "index.html",
    "GUMAP-일반지도/index.html",
    "3d-viewer.html",
]

README = """# 도면 이미지 기반 테크노관 실내지도 백업 ({stamp})

DWG(CAD) 기반 지도를 메인 GUMAP 에 얹기 직전의 상태 그대로다. 이 폴더만으로
CAD 작업 이전의 실내지도로 되돌아갈 수 있다.

되돌리려면 `manifest.json` 의 `path` 대로 프로젝트 루트에 덮어쓴다.

```powershell
$env:PYTHONUTF8 = '1'
python GUMAP-개발/floorplan/cad/restore_legacy_indoor.py
```

`manifest.json` 에 각 파일의 SHA-256 과 바이트 수가 있다. 복구 스크립트는
복사 후 해시를 다시 확인한다.

담긴 것: 층별 폴리곤·라벨·래스터(`work/`), 좌표 변환(`techno_georef.json`),
IMDF 8종 geojson, 프론트 실내지도·길찾기 번들 양쪽(`GUMAP-프론트`,
`GUMAP-일반지도`), 진입 HTML 3개.

담기지 않은 것: 원본 PDF 도면과 엑셀 방 정보(`GIS_DATA/`,
`GUMAP-학교지도/엑셀정보`). 이 둘은 읽기 전용 입력이라 이번 작업에서
건드리지 않는다.
"""


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def collect() -> list[Path]:
    found: list[Path] = []
    for tree in TREES:
        base = ROOT / tree
        if not base.exists():
            raise SystemExit(f"백업 대상 폴더가 없다: {tree}")
        found += sorted(p for p in base.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    for name in FILES:
        path = ROOT / name
        if not path.exists():
            raise SystemExit(f"백업 대상 파일이 없다: {name}")
        found.append(path)
    return found


def main() -> int:
    if DEST.exists():
        print(f"이미 백업이 있다. 덮어쓰지 않는다: {DEST}")
        return 0
    records = []
    staging = DEST.with_name(DEST.name + ".partial")
    if staging.exists():
        shutil.rmtree(staging)
    for source in collect():
        relative = source.relative_to(ROOT)
        target = staging / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        # 복사본을 해시한다. 원본을 해시하면 복사가 잘렸을 때 못 잡는다.
        records.append({"path": relative.as_posix(), "sha256": digest(target),
                        "bytes": target.stat().st_size})
    manifest = {"created": STAMP, "purpose": "CAD 연동 이전 도면 이미지 기반 실내지도 전체 백업",
                "root": "프로젝트 루트 기준 상대 경로", "files": records,
                "total_bytes": sum(r["bytes"] for r in records)}
    (staging / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (staging / "README.md").write_text(README.format(stamp=STAMP), encoding="utf-8")
    staging.rename(DEST)
    print(f"백업 완료: {DEST}")
    print(f"파일 {len(records)}개 · {manifest['total_bytes'] / 1048576:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
