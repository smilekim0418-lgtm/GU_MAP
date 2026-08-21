import zipfile
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
base_dir = os.path.dirname(SCRIPT_DIR)
source_dir = os.path.join(base_dir, "GUMAP-AI(길찾기)", "groute_ai") if os.path.exists(os.path.join(base_dir, "GUMAP-AI(길찾기)", "groute_ai")) else os.path.join(base_dir, "groute_ai")
zip_path = os.path.join(base_dir, "groute_ai.zip")

print(f"[*] Packaging {source_dir} -> {zip_path}...")

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(source_dir):
        # venv, __pycache__, models, checkpoints 폴더 전송 제외
        if 'venv' in root or '__pycache__' in root or 'models' in root or 'checkpoints' in root:
            continue
            
        for file in files:
            file_path = os.path.join(root, file)
            # zip 파일 내 상대 경로 계산
            rel_path = os.path.relpath(file_path, base_dir)
            zipf.write(file_path, rel_path)
            print(f"    [Archived] {rel_path}")

print("[+] Packaging completed successfully!")
