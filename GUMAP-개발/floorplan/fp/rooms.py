"""도면 래스터에서 벽선을 뽑고 방 폴리곤을 검출한다.

모든 좌표는 도면 픽셀 좌표계다. 지리 좌표는 georef 모듈에서만 다룬다.
"""
from dataclasses import dataclass

import cv2
import numpy as np

# 방으로 인정할 면적 범위. 전체 이미지 면적 대비 비율로 잡아 해상도 변화에 견디게 한다.
MIN_AREA_RATIO = 1.5e-4
MAX_AREA_RATIO = 4.0e-2

# 벽선 검출용 형태소 커널 길이 = 이미지 변 길이 / 이 값
LINE_KERNEL_DIVISOR = 150


@dataclass
class RoomPolygon:
    points: list[tuple[int, int]]
    area_px: float
    centroid: tuple[float, float]


def extract_wall_mask(image: np.ndarray) -> np.ndarray:
    """벽선만 남긴 0/255 마스크. 글자와 해칭은 제거된다."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    binary = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 25, 15
    )
    height, width = binary.shape
    horizontal = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(2, width // LINE_KERNEL_DIVISOR), 1)),
    )
    vertical = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(2, height // LINE_KERNEL_DIVISOR))),
    )
    return cv2.bitwise_or(horizontal, vertical)


def extract_room_polygons(image: np.ndarray, close_kernel: int = 25) -> list[RoomPolygon]:
    """벽으로 둘러싸인 영역을 방 폴리곤으로 반환한다.

    close_kernel 은 문 틈을 메우는 dilate 커널 크기다. 크면 방이 붙고
    작으면 방이 새어나간다. 25 가 검증에서 가장 좋았다.
    """
    mask = extract_wall_mask(image)
    closed = cv2.dilate(mask, np.ones((close_kernel, close_kernel), np.uint8), iterations=1)
    enclosed = cv2.bitwise_not(closed)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(enclosed, 8)
    total_area = image.shape[0] * image.shape[1]
    min_area = total_area * MIN_AREA_RATIO
    max_area = total_area * MAX_AREA_RATIO

    result: list[RoomPolygon] = []
    for index in range(1, count):
        area = float(stats[index, cv2.CC_STAT_AREA])
        if not (min_area < area < max_area):
            continue
        component = (labels == index).astype(np.uint8)
        contours, _ = cv2.findContours(component, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        approx = cv2.approxPolyDP(contour, 0.006 * cv2.arcLength(contour, True), True)
        points = [(int(p[0][0]), int(p[0][1])) for p in approx]
        if len(points) < 3:
            continue
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            continue
        centroid = (moments["m10"] / moments["m00"], moments["m01"] / moments["m00"])
        result.append(
            RoomPolygon(points=points, area_px=float(cv2.contourArea(contour)), centroid=centroid)
        )
    return result
