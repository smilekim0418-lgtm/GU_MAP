# G-Route AI: 구미시 특화 딥러닝 경로 탐색 엔진 개발 폴더

본 디렉토리는 외부 T-map API 의존성과 과금 비용을 낮추고, 구미시 특화 시내 도로교통 데이터에 스스로 적응하여 최적 경로를 추론하는 **그래프 신경망(GNN) 및 강화학습(RL) 기반 경로 엔진**의 개발 모듈입니다.

---

## 📂 파일 구성 및 역할

1. **`requirements.txt`**: G-Route AI 구동을 위한 필요 라이브러리 세트 (CPU 바이너리 중심)
2. **`run_groute_init.bat`**: 1~2단계 도로 그래프 구축 및 실시간 교통 가중치 계산 일괄 실행 스크립트
3. **`01_build_graph.py`**: 오픈스트리트맵(OSM) 연계 구미시 전체 도로 격자망 그래프 다운로드 및 정제
4. **`02_add_congestion_weights.py`**: 24시간 혼잡 프로필 및 정체구간(인동네거리, 공단로 등) 가중치 부여
5. **`env/gumi_routing_env.py`**: 에이전트 주행 시뮬레이션을 위한 커스텀 Gymnasium 가상 환경 클래스
6. **`04_train_rl_agent.py`**: CPU 리소스 맞춤형 DQN 강화학습 에이전트 트레이닝 기동 스크립트
7. **`05_train_gnn.py`**: DQN 에이전트의 성공 경로 이력을 학습하여 가치를 추론하는 3-layer GCN GNN 모델 훈련
8. **`06_benchmark.py`**: G-Route AI vs Dijkstra 알고리즘 연산 속도 및 경로 효율성 비교 벤치마킹
9. **`07_export_onnx.py`**: 훈련된 GNN 모델을 초고속 C++ 추론용 ONNX 바이너리 형식으로 직렬화/익스포트

---

## 🚀 파이프라인 가동 순서 (How to Run)

### 1단계: 필요 종속성 패키지 설치
새 가상환경을 잡고 터미널에서 아래의 패키지를 우선 설치합니다.
```bash
# 가상환경 활성화 (Powershell 기준)
venv\Scripts\activate
# C++ 컴파일 실패 오류 예방을 위해 미리 빌드된 바이너리 휠 우선 설치 적용
pip install -r requirements.txt --prefer-binary
```

### 2단계: 구미시 도로 그래프 및 실시간 교통 가중치 구축 (1~2단계)
동봉된 배치 파일 `run_groute_init.bat`을 더블클릭하거나 터미널에서 다음 스크립트를 기동합니다.
```bash
python 01_build_graph.py
python 02_add_congestion_weights.py
```
* **결과**: `data/gumi_road_graph_weighted.pkl` 파일이 생성됩니다.

### 3단계: DQN 강화학습 에이전트 훈련 (3단계)
서버/PC 리소스를 야간 시간대에 켜놓아 가상 환경 상에서 주행 에이전트를 양성합니다.
```bash
python 04_train_rl_agent.py
```
* **결과**: 30만~50만 스텝 훈련을 거치며 `models/groute_dqn_final.zip` 파일이 생성됩니다.

### 4단계: GNN 학습 및 ONNX 변환 (최종 단계)
DQN 경험 데이터를 기반으로 공간적 경로 선호도를 학습하는 GNN 모델을 훈련시키고 ONNX 가속 버전으로 변환합니다.
```bash
python 05_train_gnn.py
python 07_export_onnx.py
```
* **결과**: `models/groute_gnn.onnx` 파일이 도출됩니다.

### 5단계: FastAPI 백엔드 통합 및 서비스
도출된 `groute_gnn.onnx` 파일을 `server.py`의 ONNX Runtime 인스턴스에 로드하여 대시민 경로 추론 API인 `/groute-api`로 사용자에게 서비스합니다.
