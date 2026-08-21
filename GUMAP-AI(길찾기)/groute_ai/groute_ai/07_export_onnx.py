"""
07_export_onnx.py
학습 완료된 PyTorch GNN 모델을 ONNX 바이너리 형식으로 직렬화 및 출력합니다.
"""
import torch
import os
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv

# unpickler 클래스 정의 정합을 위해 직접 클래스 구조 바인딩
class GumiGRouteGNN(nn.Module):
    def __init__(self, in_channels=5, hidden_channels=64, out_channels=1):
        super(GumiGRouteGNN, self).__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, hidden_channels)
        self.conv3 = GCNConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = self.conv2(x, edge_index)
        x = F.relu(x)
        x = self.conv3(x, edge_index)
        return x

def main():
    base_dir = os.path.dirname(__file__)
    model_in = os.path.join(base_dir, "models", "groute_gnn_best.pt")
    onnx_out = os.path.join(base_dir, "models", "groute_gnn.onnx")

    if not os.path.exists(model_in):
        print(f"[-] PyTorch 훈련 모델 파일이 존재하지 않습니다: {model_in}")
        print("    05_train_gnn.py를 먼저 가동하여 모델을 훈련해 주십시오.")
        return

    print(f"[*] PyTorch 모델 로드 중: {model_in}")
    # weights_only=False를 명시적으로 전달하여 직렬화 복원 승인
    try:
        model = torch.load(model_in, map_location="cpu", weights_only=False)
        model.eval()
    except Exception as e:
        print(f"[-] 모델 로드 오류: {e}")
        return

    print("[*] ONNX 직렬화를 위한 더미 가상 텐서(Dummy Inputs) 생성...")
    # 모델 입력 차원에 부합하는 더미 텐서 생성
    # 5차원 노드 벡터 100개, 노드 간 연결선 엣지 인덱스 300쌍
    dummy_x = torch.randn(100, 5)
    dummy_edge_index = torch.randint(0, 100, (2, 300), dtype=torch.long)

    print("[*] ONNX 직렬화 익스포트(Export) 진행 중...")
    try:
        torch.onnx.export(
            model,
            (dummy_x, dummy_edge_index),
            onnx_out,
            input_names=["node_features", "edge_index"],
            output_names=["next_node_scores"],
            # 임의 크기의 노드 개수 및 연결선 엣지 개수를 수용하도록 동적 축 선언
            dynamic_axes={
                "node_features": {0: "num_nodes"},
                "edge_index": {1: "num_edges"}
            },
            opset_version=15 # 표준 opset_version 셋업
        )
        print("=" * 60)
        print(f"[+] ONNX 가속화 모델 변환 완료!")
        print(f"    - 출력파일: {onnx_out}")
        print(f"    - 파일크기: {os.path.getsize(onnx_out)/1024:.1f} KB")
        print("=" * 60)
    except Exception as e:
        print(f"[-] ONNX 내보내기 실패: {e}")

if __name__ == "__main__":
    main()
