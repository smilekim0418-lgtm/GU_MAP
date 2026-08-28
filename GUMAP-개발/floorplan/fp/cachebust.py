"""번들을 갱신했으면 HTML 의 ?v= 도 같이 올린다.

프론트는 <script src="....js?v=112"> 로 캐시를 관리하고, 서버는 js 에
Cache-Control: public, max-age=3600 을 준다. 그래서 파일 내용만 바꾸고
?v= 를 그대로 두면 브라우저가 한 시간 동안 옛 코드를 쓴다. 서버를 다시
띄워도 소용없다 - 브라우저가 아예 물어보질 않기 때문이다.

손으로 올리면 반드시 빼먹는다(실제로 빼먹어서 새 길찾기가 브라우저에
반영되지 않았다). 그래서 빌드가 내용 해시로 자동으로 올린다.
"""
from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path


# 빌드 시각은 동작을 바꾸지 않는다. 빼고 세지 않으면 빌드할 때마다 버전이
# 흔들려서 index.html 이 매번 diff 에 뜬다.
_VOLATILE = re.compile(rb'"built_at"\s*:\s*"[^"]*"')


def _short_hash(path: Path) -> str:
    body = _VOLATILE.sub(b'"built_at":""', path.read_bytes())
    return hashlib.sha1(body).hexdigest()[:8]


def stamp(bundle_paths: list[Path], html_paths: list[Path]) -> list[str]:
    """HTML 들에서 각 번들의 ?v= 를 그 파일 내용 해시로 바꾼다.

    바뀐 항목을 사람이 읽을 문장으로 돌려준다. 아무것도 안 바뀌면 빈 목록.
    """
    versions = {}
    for bundle in bundle_paths:
        if bundle.exists():
            versions[bundle.name] = _short_hash(bundle)
    if not versions:
        return []

    changed = []
    for html in html_paths:
        if not html.exists():
            continue
        text = io.open(html, encoding="utf-8").read()
        original = text

        for name, version in versions.items():
            # src="…/map-techno-route.js?v=1"  또는  ?v= 가 아예 없는 경우
            pattern = re.compile(
                r'(src="[^"]*?' + re.escape(name) + r')(\?v=[^"]*)?(")')

            def replace(match):
                return f"{match.group(1)}?v={version}{match.group(3)}"

            text, count = pattern.subn(replace, text)
            if count and f"?v={version}" not in original:
                changed.append(f"{html.name}: {name} → v={version}")

        if text != original:
            io.open(html, "w", encoding="utf-8", newline="").write(text)
    return changed
