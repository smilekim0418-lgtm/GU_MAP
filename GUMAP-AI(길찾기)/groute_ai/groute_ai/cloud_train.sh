#!/bin/bash
# ================================================================
# G-Route AI 대규모 연속 학습 + 실시간 수집 자동 기동 스크립트
# GCP 마인크래프트 서버의 유휴 자원에서 실행합니다.
# ================================================================

set -e
echo "======================================================================="
echo " G-Route AI Cloud Training Deployer"
echo " 구글 클라우드 유휴 서버(마인크래프트) 배포 자동화"
echo "======================================================================="

cd ~/groute_ai

# 1. Python venv 생성 및 활성화
echo "[1/5] Python 가상환경 셋업..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# 2. 종속 패키지 설치
echo "[2/5] PyTorch 및 종속 패키지 설치..."
pip install --upgrade pip -q
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu -q 2>/dev/null || pip install torch -q
pip install torch-geometric networkx numpy onnx onnxruntime httpx python-dotenv -q

# 3. 실시간 데이터 수집기 백그라운드 가동
echo "[3/5] 실시간 교통 데이터 수집 데몬 기동..."
mkdir -p data
nohup python -u groute_collector.py > logs/collector.log 2>&1 &
COLLECTOR_PID=$!
echo "    수집기 PID: $COLLECTOR_PID"

# 4. 대규모 연속 학습 파이프라인 가동
echo "[4/5] 대규모 연속 학습 파이프라인 가동..."
echo "    DQN: 3,000,000 Steps + GNN: 500,000 Epochs"
mkdir -p logs
python -u 09_deep_continuous_train.py 2>&1 | tee logs/deep_train.log

# 5. 학습 완료 후 모델 파일 확인
echo ""
echo "[5/5] 학습 완료! 생성된 모델 파일:"
ls -lh models/groute_*.pt models/groute_*.onnx 2>/dev/null || echo "  (모델 파일 확인 필요)"
echo ""
echo "======================================================================="
echo " 학습이 완료되었습니다!"
echo " 로컬 PC에서 아래 명령어로 모델을 다운로드하세요:"
echo " scp -i C:\\Users\\dryou\\.ssh\\mc_key smilekim0418@34.64.137.199:~/groute_ai/models/* ."
echo "======================================================================="
