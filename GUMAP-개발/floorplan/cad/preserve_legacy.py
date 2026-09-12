"""Create an immutable byte-for-byte snapshot before the CAD migration."""
import hashlib
import json
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[2]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    dest = BASE / 'legacy_snapshot'
    if (dest/'manifest.json').exists():
        print('Existing snapshot retained.')
        return
    files = list((BASE.parent/'work').glob('*_labeled.json'))
    files += [BASE.parent/'techno_georef.json', BASE.parent/'work/techno_nav.json']
    files += list((ROOT/'GUMAP-학교지도/data/imdf/techno').glob('*'))
    files += list((ROOT/'GUMAP-프론트/js/map').glob('map-techno-*.js'))
    entries = []
    for src in files:
        if not src.is_file():
            continue
        rel = src.relative_to(ROOT)
        target = dest/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(src,target)
        entries.append(dict(path=rel.as_posix(),sha256=digest(src),bytes=src.stat().st_size))
    source = ROOT/'GIS_DATA/001.테크노관.dwg'
    (dest/'manifest.json').write_text(json.dumps(dict(files=entries,dwg_sha256=digest(source)),indent=2,ensure_ascii=False),encoding='utf-8')
    print(f'Preserved {len(entries)} files; DWG SHA-256: {digest(source)}')

if __name__ == '__main__':
    main()
