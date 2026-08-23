"""04_build_imdf.py 의 실행 순서 계약.

모듈 이름이 숫자로 시작해 평범한 import 가 안 되므로 파일 경로로 읽어들인다.
"""
import importlib.util
import json
from pathlib import Path

import pytest

from fp import config, excel, georef

CLI_PATH = Path(__file__).resolve().parents[1] / "04_build_imdf.py"


def _load_cli():
    spec = importlib.util.spec_from_file_location("build_imdf_cli", CLI_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_labeled(work_dir: Path, floor: str) -> None:
    (work_dir / f"{floor}_labeled.json").write_text(
        json.dumps(
            {
                "floor": floor,
                "size": [100, 100],
                "polygons": [
                    {
                        "points": [[0, 0], [10, 0], [10, 10], [0, 10]],
                        "area_px": 100.0,
                        "centroid": [5, 5],
                        "room_id": "201",
                        "candidates": ["201"],
                        "drawing_name": None,
                    }
                ],
                "report": {},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_an_uncalibrated_floor_is_refused_before_its_origin_is_looked_up(tmp_path, monkeypatch):
    """보정 안 된 층은 원시 KeyError 가 아니라 친절한 GeoRefError 로 막아야 한다.

    load_labeled_in_meters 가 floor_origin_px/floor_px_per_mm 를 층별로 뒤지기
    전에 assert_calibrated 가 먼저 돌아야 한다. 순서가 뒤집히면 사용자는
    "무엇을 어디서 찍어야 하는지" 대신 KeyError: '2F' 만 보게 된다.
    """
    cli = _load_cli()
    work = tmp_path / "work"
    work.mkdir()
    _write_labeled(work, "2F")

    monkeypatch.setattr(config, "WORK_DIR", work)  # cli.config 와 같은 모듈 객체다
    monkeypatch.setattr(
        cli.georef,
        "load",
        lambda path=None: {
            "transform": {"theta_deg": 12.5, "scale": 1.0, "t_lon": 128.39, "t_lat": 36.146},
            "floor_origin_px": {},   # 2F 없음
            "floor_px_per_mm": {},   # 2F 없음
        },
    )
    monkeypatch.setattr(
        cli.excel,
        "load_rooms",
        lambda path=None: {"2F": [excel.Room(room_id="201", floor="2F", name="A")]},
    )
    monkeypatch.setattr(cli.sys, "argv", ["04_build_imdf.py"])

    with pytest.raises(georef.GeoRefError) as caught:
        cli.main()
    assert "2F" in str(caught.value)
