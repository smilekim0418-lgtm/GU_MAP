"""
08_train_bus_lstm.py
구미시 시내버스의 노선별 정류소 간 통행 시간 데이터를 바탕으로
시간대, 요일, 기상 요인을 반영해 정밀 도착 시각을 예측하는 LSTM 시계열 모델을 학습하고 컴파일합니다.
"""
import torch
import torch.nn as nn
import numpy as np
import os
import datetime

# ── 1. 버스 도착 시간 예측 LSTM 아키텍처 정의 ──
class GumiBusLSTM(nn.Module):
    def __init__(self, input_size=5, hidden_size=32, num_layers=2, output_size=1):
        super(GumiBusLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        # LSTM 레이어 (입력 피처: [시간대, 요일, 기상여부, 정류소인덱스, 직전정류소소요시간])
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        # 최종 소요시간(초) 예측을 위한 Fully Connected 레이어
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        # 초기 Hidden State & Cell State 설정 (CPU 연산용)
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size)
        
        # LSTM 순방향 패스
        out, _ = self.lstm(x, (h0, c0))
        # 마지막 시퀀스 스텝의 출력값만 매핑
        out = self.fc(out[:, -1, :])
        return out

def generate_synthetic_bus_data():
    """
    구미시 버스 운행 데이터셋 시뮬레이션 생성기
    """
    print("[*] G-Route AI: 버스 시계열 통행이력 데이터셋 시뮬레이션 생성 중...")
    np.random.seed(42)
    num_samples = 3000
    seq_length = 5
    
    # 피처: [시간대(0~23), 요일(0~6), 비여부(0/1), 정류소인덱스(1~20), 직전구간소요시간(초)]
    X = []
    y = []
    
    for _ in range(num_samples):
        seq = []
        # 노선 1개의 순차 정류장 운행 시나리오 조립
        hour = np.random.randint(0, 24)
        day = np.random.randint(0, 7)
        rain = 1.0 if np.random.rand() < 0.15 else 0.0 # 구미시 강수 확률 연동
        
        prev_time = 120.0 # 직전구간 평균 120초
        
        for stop_idx in range(1, seq_length + 1):
            # 출퇴근 시간대 정체 요인 가산
            congestion_factor = 1.0
            if hour in [8, 9, 17, 18, 19]:
                congestion_factor = 1.8 + np.random.rand() * 0.4
            
            # 주말 혼잡도 및 기상 벌점 적용
            rain_delay = 30.0 if rain > 0 else 0.0
            
            # 실제 소요시간 (참값)
            base_time = 100.0 + (stop_idx * 5.0)
            actual_time = base_time * congestion_factor + rain_delay + np.random.normal(0, 10)
            
            seq.append([hour, day, rain, float(stop_idx), prev_time])
            prev_time = actual_time
            
        X.append(seq)
        y.append([prev_time]) # 최종 목적 정류장의 도착 소요시간 예측 대상
        
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)

def main():
    print(f"[{datetime.datetime.now()}] G-Route 버스 LSTM 정밀도 훈련기 시작")
    print("=" * 60)

    base_dir = os.path.dirname(__file__)
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)
    
    pt_path = os.path.join(models_dir, "groute_bus_lstm.pt")
    onnx_path = os.path.join(models_dir, "groute_bus_lstm.onnx")

    # 1. 학습 데이터 로드
    X, y = generate_synthetic_bus_data()
    X_tensor = torch.from_numpy(X)
    y_tensor = torch.from_numpy(y)

    print(f"    - 입력 텐서 규격: {X_tensor.shape} (배치, 시퀀스길이, 피처수)")
    print(f"    - 출력 타겟 규격: {y_tensor.shape}")

    # 2. LSTM 모델 및 옵티마이저 선언
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[groute-lstm] Using target training device: {device}")
    
    model = GumiBusLSTM(input_size=5, hidden_size=32, num_layers=2, output_size=1).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.002)
    criterion = nn.MSELoss()

    X_tensor = X_tensor.to(device)
    y_tensor = y_tensor.to(device)

    # 3. 훈련 루프 가동 (100,000 에포크)
    print("[*] LSTM 시계열 모델 학습 루프 시작 (Epoch 100,000)...")
    model.train()
    
    batch_size = 64
    num_batches = len(X) // batch_size

    for epoch in range(1, 100001):
        epoch_loss = 0.0
        for i in range(num_batches):
            start_idx = i * batch_size
            end_idx = start_idx + batch_size
            
            batch_x = X_tensor[start_idx:end_idx]
            batch_y = y_tensor[start_idx:end_idx]
            
            optimizer.zero_grad()
            output = model(batch_x)
            loss = criterion(output, batch_y)
            loss.backward()
            optimizer.step()
            
            epoch_loss += loss.item()
            
        if epoch % 10000 == 0:
            print(f"    - Epoch {epoch:06d}/100000 | Avg Loss: {epoch_loss/num_batches:.6f}")

    # 4. PyTorch 가중치 추출 저장
    torch.save(model.cpu().state_dict(), pt_path)
    print(f"[+] PyTorch LSTM 가중치 모델 저장 완료: {pt_path}")

    # 5. ONNX 시계열 모델 익스포트
    print("[*] LSTM -> ONNX 바이너리 컴파일 진행 중...")
    model.eval()
    
    # 윈도우 인코딩 설정 선언
    import sys
    os.environ["PYTHONIOENCODING"] = "utf-8"
    
    dummy_input = torch.randn(1, 5, 5, dtype=torch.float)
    
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "output": {0: "batch_size"}
        }
    )
    print("=" * 60)
    print(f"[+] G-Route AI: 버스 LSTM ONNX 바이너리 추출 성공! -> {onnx_path}")
    print("=" * 60)

if __name__ == "__main__":
    main()
