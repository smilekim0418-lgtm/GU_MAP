// =================================================================================
// 📁 파일명: sync_assets.js
// 📌 역할: 모바일 하이브리드 앱 빌드 자동화 스크립트 (빌드 에셋 동기화)
// =================================================================================
//
// [파일 설명]
// 모바일 기기(Android/iOS)에서 애플리케이션을 구동하기 전, 로컬에서 작업한 
// 웹 자원(HTML, CSS, JS)을 모바일 빌드 폴더(www/)로 복사하고 동기화하는 자동화 스크립트입니다.
//
// [주요 기능]
// 1. 자산 복사: 작업 공간의 최신 js, css, assets 폴더를 www/ 폴더로 복사합니다.
// 2. HTML 변환: index.html 파일을 복사하는 과정에서 모바일 환경에 맞는
//    설정값(예: 프록시 서버 주소, ngrok 연동 도메인 등)을 주입(Injection)합니다.
//
// [실행 시점]
// 모바일 앱을 빌드하거나 동기화(npx cap sync)하기 직전에 Node.js 환경에서 실행됩니다.
// (동봉된 `.bat` 실행 스크립트 내부에서 자동으로 호출되므로 수동 실행할 필요는 없습니다.)
// =================================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');

const srcJs = path.join(__dirname, 'js');
const destJs = path.join(__dirname, 'www', 'js');
const srcCss = path.join(__dirname, 'css');
const destCss = path.join(__dirname, 'www', 'css');

// Helper to recursively copy directories
function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        if (fs.lstatSync(fromPath).isDirectory()) {
            copyFolderSync(fromPath, toPath);
        } else {
            fs.copyFileSync(fromPath, toPath);
        }
    });
}

// Helper to get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Check for IPv4 and skip internal/loopback
            if (iface.family === 'IPv4' && !iface.internal) {
                // Focus on common private LAN networks (192.168.x.x, 172.16-31.x.x, 10.x.x.x)
                if (iface.address.startsWith('192.168.') || 
                    iface.address.startsWith('172.') || 
                    iface.address.startsWith('10.')) {
                    return iface.address;
                }
            }
        }
    }
    return '127.0.0.1'; // fallback
}

try {
    console.log("Starting asset synchronization to www/ folder...");

    // 1. Copy js folder
    if (fs.existsSync(destJs)) {
        fs.rmSync(destJs, { recursive: true, force: true });
    }
    copyFolderSync(srcJs, destJs);
    console.log("✔ Copied 'js/' to 'www/js/'");

    // 1.1 Copy css folder
    if (fs.existsSync(srcCss)) {
        if (fs.existsSync(destCss)) {
            fs.rmSync(destCss, { recursive: true, force: true });
        }
        copyFolderSync(srcCss, destCss);
        console.log("✔ Copied 'css/' to 'www/css/'");
    }

    // 1.5 Inject Ngrok Permanent Domain into config.js for the mobile build
    const proxyUrl = "https://custard-channel-desolate.ngrok-free.dev";
    const configPath = path.join(destJs, 'config.js');
    if (fs.existsSync(configPath)) {
        let content = fs.readFileSync(configPath, 'utf8');
        content = content.replace(
            /window\.PROXY_URL\s*=\s*['"][^'"]*['"];/,
            `window.PROXY_URL = "${proxyUrl}";`
        );
        fs.writeFileSync(configPath, content, 'utf8');
        console.log(`✔ Automatically injected Ngrok Permanent Domain into mobile config: ${proxyUrl}`);
    } else {
        console.warn("⚠️ config.js not found in destJs directory!");
    }

    // 2. Copy index.html as www/index.html
    const srcHtml = path.join(__dirname, 'index.html');
    fs.copyFileSync(
        srcHtml,
        path.join(__dirname, 'www', 'index.html')
    );
    console.log("✔ Copied 'index.html' to 'www/index.html'");

    // 3. Copy bus_stations.js
    fs.copyFileSync(
        path.join(__dirname, 'bus_stations.js'),
        path.join(__dirname, 'www', 'bus_stations.js')
    );
    console.log("✔ Copied 'bus_stations.js' to 'www/bus_stations.js'");

    // 4. Copy app_icon.png
    if (fs.existsSync(path.join(__dirname, 'app_icon.png'))) {
        fs.copyFileSync(
            path.join(__dirname, 'app_icon.png'),
            path.join(__dirname, 'www', 'app_icon.png')
        );
        console.log("✔ Copied 'app_icon.png' to 'www/app_icon.png'");
    }

    // 5. Copy 그리기.svg
    if (fs.existsSync(path.join(__dirname, '그리기.svg'))) {
        fs.copyFileSync(
            path.join(__dirname, '그리기.svg'),
            path.join(__dirname, 'www', '그리기.svg')
        );
        console.log("✔ Copied '그리기.svg' to 'www/그리기.svg'");
    }

    console.log("🎉 Asset synchronization completed successfully!");
} catch (err) {
    console.error("❌ Error syncing assets:", err);
    process.exit(1);
}
