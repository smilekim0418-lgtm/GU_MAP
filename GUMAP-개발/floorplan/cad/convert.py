"""Local, read-only DWG conversion. Never upload or overwrite the DWG."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[2]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--converter',type=Path,default=BASE/'source/libredwg/dwg2dxf.exe')
    args=parser.parse_args()
    source=ROOT/'GIS_DATA/001.테크노관.dwg'
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    target=BASE/'source/techno.dxf'
    target.parent.mkdir(exist_ok=True)
    result=subprocess.run([str(args.converter),'-y','-o',str(target),str(source)],capture_output=True)
    (BASE/'source/conversion.log').write_bytes(result.stdout+result.stderr)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==before,'Source DWG changed'
    if result.returncode or not target.is_file():
        raise RuntimeError(f'Conversion failed: exit {result.returncode}; see source/conversion.log')
    log=(result.stdout+result.stderr).decode('utf-8',errors='replace')
    audit=dict(source_sha256=before,dxf_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),exit_code=result.returncode,
               errors=[line for line in log.splitlines() if line.startswith('ERROR')],converter=str(args.converter))
    (BASE/'source/conversion.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Converted locally. {len(audit["errors"])} conversion errors recorded; inspect the audit before publishing.')

if __name__=='__main__':main()
