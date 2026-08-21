import os
import zipfile

def make_submission_zip():
    zip_name = "G-map_Submission.zip"
    print(f"[*] Packaging ONLY the absolute minimum files for G-map execution...")
    
    # Strictly allowed root folders
    allowed_root_folders = {
        "js",
        "css",
        "tests",
        "www",
        "android"
    }
    
    # Strictly allowed root files
    allowed_root_files = {
        "server.py",
        "index.html",
        "bus_stations.js",
        "app_icon.png",
        "그리기.svg",
        "package.json",
        "package-lock.json",
        ".env.example",
        "README.md",
        "3_실행_온라인접속.bat",
        "2_실행_웹브라우저.bat",
        "1_실행_프록시서버.bat",
        "sync_assets.js",
        "capacitor.config.json"
    }

    # Subfolders within allowed folders to ignore (like Android build cache)
    blacklisted_subfolders = {
        ".gradle",
        ".idea",
        "build",
        "__pycache__",
        "node_modules"
    }

    count = 0
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # 1. Package allowed root files
        for file in os.listdir('.'):
            if os.path.isfile(file) and file in allowed_root_files:
                zipf.write(file, file)
                count += 1

        # 2. Package allowed root folders recursively
        for folder in allowed_root_folders:
            if not os.path.exists(folder):
                continue
                
            for root, dirs, files in os.walk(folder):
                # Filter out blacklisted directories in-place
                dirs[:] = [d for d in dirs if d not in blacklisted_subfolders]
                
                for file in files:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, '.')
                    zipf.write(file_path, rel_path)
                    count += 1

    print("====================================================")
    print(f"[+] Minimum Package Completed Successfully!")
    print(f"[+] Output: {os.path.abspath(zip_name)}")
    print(f"[+] Total files zipped: {count} files")
    print("====================================================")

if __name__ == "__main__":
    make_submission_zip()
