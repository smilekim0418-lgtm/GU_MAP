"""
07_export_onnx_multimodal.py
훈련 완료된 PyTorch Multimodal GNN 모델 가중치를 ONNX 표준 바이너리 모델로 익스포트합니다.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
import os

# ── 1. GNN 모델 클래스 바인딩 ──
class GumiGRouteGNNMultimodal(nn.Module):
    def __init__(self, in_channels=8, hidden_channels=64, out_channels=1):
        super(GumiGRouteGNNMultimodal, self).__init__()
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
    print("[*] G-Route AI: Multimodal GNN -> ONNX 컴파일러 가동")
    print("=" * 60)

    base_dir = os.path.dirname(__file__)
    pt_path = os.path.join(base_dir, "models", "groute_gnn_multimodal.pt")
    onnx_path = os.path.join(base_dir, "models", "groute_gnn_multimodal.onnx")

    if not os.path.exists(pt_path):
        print(f"[-] PyTorch 가중치 모델 파일이 없습니다: {pt_path}")
        return

    # 모델 구조 생성 및 가중치 복원
    model = GumiGRouteGNNMultimodal(in_channels=8, hidden_channels=64, out_channels=1)
    model.load_state_dict(torch.load(pt_path, map_location=torch.device('cpu')))
    model.eval()

    # ONNX 내보내기를 위한 가상 입력 데이터셋(Dummy Inputs) 설계
    # 7,505개 노드를 모사한 100개 노드, 8차원 피처
    dummy_x = torch.randn(100, 8, dtype=torch.float)
    # 300개의 에지 연결
    dummy_edge_index = torch.randint(0, 100, (2, 300), dtype=torch.long)

    # ONNX 익스포트 기동
    print("[*] PyTorch -> ONNX Graph tracing 컴파일 진행 중...")
    
    # 윈도우 인코딩 우회
    import sys
    os.environ["PYTHONIOENCODING"] = "utf-8"
    
    torch.onnx.export(
        model,
        (dummy_x, dummy_edge_index),
        onnx_path,
        export_params=True,
        opset_version=14, # PyG GCNConv 호환성 레벨
        do_constant_folding=True,
        input_names=["x", "edge_index"],
        output_names=["output"],
        dynamic_axes={
            "x": {0: "num_nodes"},
            "edge_index": {1: "num_edges"},
            "output": {0: "num_nodes"}
        }
    )

    print("=" * 60)
    print(f"[+] G-Route AI: ONNX 바이너리 추출 성공! -> {onnx_path}")
    print("=" * 60)

if __name__ == "__main__":
    main()
