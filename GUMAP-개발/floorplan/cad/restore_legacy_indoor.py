"""백업해 둔 도면 이미지 기반 실내지도를 프로젝트에 되돌린다.

  python GUMAP-개발/floorplan/cad/restore_legacy_indoor.py           # 무엇이 바뀌는지만 본다
  python GUMAP-개발/floorplan/cad/restore_legacy_indoor.py --write   # 실제로 덮어쓴다

기본이 미리보기인 이유: 이 스크립트는 지금 서비스 중인 프론트 번들을 덮어쓴다.
실수로 한 번 돌리면 그날 작업이 날아간다.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKUP_ROOT = ROOT / "backup"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pick_backup(argv: list[str]) -> Path:
    named = [a for a in argv if not a.startswith("--")]
    if named:
        chosen = Path(named[0])
        return chosen if chosen.is_absolute() else BACKUP_ROOT / chosen
    found = sorted(p for p in BACKUP_ROOT.glob("실내지도-도면기반-*") if (p / "manifest.json").exists())
    if not found:
        raise SystemExit(f"백업을 찾지 못했다: {BACKUP_ROOT}/실내지도-도면기반-*")
    return found[-1]


def main(argv: list[str]) -> int:
    write = "--write" in argv
    backup = pick_backup(argv)
    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
    print(f"백업: {backup.name} ({manifest['created']}, 파일 {len(manifest['files'])}개)")

    planned, damaged = [], []
    for record in manifest["files"]:
        source = backup / record["path"]
        if not source.exists():
            damaged.append(f"{record['path']}: 백업본 없음")
            continue
        if digest(source) != record["sha256"]:
            damaged.append(f"{record['path']}: 백업본 해시 불일치")
            continue
        target = ROOT / record["path"]
        state = "새로 만듦" if not target.exists() else (
            "그대로" if digest(target) == record["sha256"] else "덮어씀")
        planned.append((source, target, state, record["sha256"]))

    if damaged:
        print("\n백업이 손상됐다. 복구하지 않는다:")
        for line in damaged:
            print(f"  {line}")
        return 1

    changes = [p for p in planned if p[2] != "그대로"]
    print(f"바뀔 파일 {len(changes)}개 / 전체 {len(planned)}개")
    for _, target, state, _ in changes[:40]:
        print(f"  [{state}] {target.relative_to(ROOT).as_posix()}")
    if len(changes) > 40:
        print(f"  … 외 {len(changes) - 40}개")

    if not write:
        print("\n미리보기만 했다. 실제로 되돌리려면 --write 를 붙여라.")
        return 0

    for source, target, state, expected in planned:
        if state == "그대로":
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        if digest(target) != expected:
            raise SystemExit(f"복구 후 해시가 다르다: {target}")
    print(f"\n복구 완료. {len(changes)}개 파일을 백업 상태로 되돌렸다.")
    print("브라우저가 옛 js 를 캐시하고 있을 수 있다. 강제 새로고침(Ctrl+F5)하라.")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main(sys.argv[1:]))
