# [클라우드 이관 기획서] GCP 유휴 서버(마인크래프트)를 활용한 딥러닝 학습 및 무중단 백엔드 가동 방안

> **클라우드 인프라 진단 결과 (IP: `34.64.137.199`)**
> * **OS**: Debian GNU/Linux 13 (Trixie) x86_64
> * **CPU**: INTEL(R) XEON(R) PLATINUM 8581C CPU @ 2.10GHz (고성능 클라우드 코어)
> * **RAM**: 16 GiB (가용 메모리: **10 GiB 여유**)
> * **Storage**: 30 GB NVMe SSD (가용 공간: **23 GB 여유**)
> * **현재 부하량**: CPU 점유율 **0.1% 미만** (유휴 상태)

---

## 1. 클라우드 유휴 서버 활용의 3대 이점 (Green & Smart AI)

### ① 로컬 PC의 발열·소음·버벅임 해소
* DQN 강화학습(30만~50만 스텝)은 CPU 멀티코어를 최대로 점유하는 고부하 연산입니다. 
* 로컬 노트북(i5-1035G7)에서 실행할 경우 팬 소음, 성능 저하, 배터리 소모가 심각하게 발생합니다.
* 이미 24시간 켜져 있는 고성능 클라우드 인스턴스로 연산을 이관하면, 본인 PC는 소음 없이 쾌적하게 유지하며 학습을 백그라운드로 추진할 수 있습니다.

### ② 24시간 무중단 FastAPI 백엔드 구축
* 로컬 PC에서 백엔드(`server.py`)를 돌릴 경우 컴퓨터를 끄면 프록시 서버도 중단되어 모바일 앱 연동 테스트가 불가능해집니다.
* 클라우드 서버에 백엔드를 무중단(Daemon)으로 켜두면, 언제 어디서든 모바일 폰(Capacitor 앱)으로 실시간 버스 도착 정보, 안심 귀갓길 경로 탐색을 필드 테스트할 수 있습니다.

### ③ 비용 부담 ZERO (기존 자원 극대화)
* 새로운 VM을 개설하지 않고, 사용율이 극도로 저조한 마크 서버의 남는 여유 메모리(10GB)와 NVMe 공간(23GB)을 재활용하므로 추가 GCP 비용 청구가 0원입니다.

---

## 2. 코드 원격 배포 및 실행 프로세스 (Deployment Runbook)

로컬의 `新GUMAP` 폴더에서 클라우드 리눅스 서버로 코드를 밀어 넣고 학습을 영구적으로 돌려놓는 순서입니다.

### 1단계: 로컬에서 클라우드로 코드 전송 (SCP 활용)
윈도우 PowerShell에서 아래 명령어를 실행하여 핵심 코드 폴더를 클라우드 홈 디렉토리로 안전하게 복사합니다.

```powershell
# 바탕화면 新GUMAP 폴더 진입 후 리눅스 서버로 핵심 코드 전송
cd "c:\Users\dryou\OneDrive\바탕 화면\新GUMAP"
scp -r -i C:\Users\dryou\.ssh\mc_key .\groute_ai .\server.py .\.env smilekim0418@34.64.137.199:~/
```

### 2단계: SSH 터미널 접속 및 리눅스 패키지 셋업
서버에 원격 접속하여 필요한 파이썬 패키지를 설치합니다.

```bash
# 1. SSH 접속
ssh -i C:\Users\dryou\.ssh\mc_key smilekim0418@34.64.137.199

# 2. 리눅스 환경 가상환경(venv) 생성 및 활성화
cd ~/groute_ai
python3 -m venv venv
source venv/bin/activate

# 3. 리눅스 환경 종속성 설치 (PIP)
pip install --upgrade pip
pip install -r requirements.txt --prefer-binary
```

### 3단계: `screen`을 통한 무중단 딥러닝 학습 및 백엔드 기동
SSH 연결이 끊어져도 백그라운드에서 학습이 계속 유지되도록 리눅스의 `screen` 도구를 활용합니다.

```bash
# 1. screen 도구 설치 (최초 1회)
sudo apt update && sudo apt install -y screen

# 2. 딥러닝 학습 전용 가상 스크린 개설
screen -S groute-train

# 3. 가상 스크린 내부에서 학습 기동
source venv/bin/activate
python 01_build_graph.py
python 02_add_congestion_weights.py
python 04_train_rl_agent.py

# 4. 스크린 백그라운드 전환 (Detach)
# 키보드 입력: Ctrl + A 누른 후 D 누르기
# (이제 터미널을 끄거나 SSH를 종료해도 클라우드가 24시간 백그라운드 학습을 수행합니다.)
```

### 4단계: 학습 현황 및 서버 모니터링
언제든지 원격으로 붙어서 학습 진척률을 다시 확인할 수 있습니다.

```bash
# 백그라운드에서 돌고 있는 훈련 스크린 다시 불러오기 (Resume)
screen -r groute-train

# 훈련 완료 후 도출된 ONNX 모델 가중치 로컬로 가져오기 (Windows PowerShell에서 실행)
scp -i C:\Users\dryou\.ssh\mc_key smilekim0418@34.64.137.199:~/groute_ai/models/groute_gnn.onnx "c:\Users\dryou\OneDrive\바탕 화면\新GUMAP\groute_ai\models\"
```
