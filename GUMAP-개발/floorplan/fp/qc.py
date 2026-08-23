"""검수용 이미지 생성. 도면 위에 추출 결과를 겹쳐 그린다."""
from pathlib import Path

import cv2
import numpy as np

COLOR_MATCHED = (0, 160, 0)      # BGR 초록: 번호까지 붙은 방
COLOR_UNLABELED = (0, 0, 230)    # BGR 빨강: 번호를 못 붙인 방


def draw_overlay(image: np.ndarray, labeled: list) -> np.ndarray:
    """원본을 건드리지 않고 폴리곤을 겹쳐 그린 새 이미지를 반환한다."""
    canvas = image.copy()
    for item in labeled:
        color = COLOR_MATCHED if item.room_id else COLOR_UNLABELED
        pts = np.array(item.polygon.points, dtype=np.int32).reshape(-1, 1, 2)
        cv2.polylines(canvas, [pts], isClosed=True, color=color, thickness=4)
        if item.room_id:
            cx, cy = item.polygon.centroid
            cv2.putText(
                canvas, item.room_id, (int(cx) - 30, int(cy)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2, cv2.LINE_AA,
            )
    return canvas


def save_image(image: np.ndarray, path: Path) -> None:
    """경로에 한글이 있어도 안전하게 저장한다."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, buffer = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError(f"PNG 인코드 실패: {path}")
    buffer.tofile(str(path))
