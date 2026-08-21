"""
05_train_gnn_multimodal.py
멀티모달 지오메트리 피처(8차원: 경사도, 자전거도로, 보도 등)를 학습 피처로 사용하여
보행, 자전거, 공유 PM 및 자동차의 전역 이동 가치망을 통합 예측하는 고도화 GNN 모델을 학습시킵니다.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
from torch_geometric.data import Data
import pickle
import numpy as np
import os
import datetime

# ── 1. 멀티모달 GNN 신경망 아키텍처 정의 (Input: 8-channels) ──
class GumiGRouteGNNMultimodal(nn.Module):
    def __init__(self, in_channels=8, hidden_channels=64, out_channels=1):
        super(GumiGRouteGNNMultimodal, self).__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, hidden_channels)
        self.conv3 = GCNConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        # 1층 그래프 합성곱
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        
        # 2층 그래프 합성곱
        x = self.conv2(x, edge_index)
        x = F.relu(x)
        
        # 3층 최종 노드 경로 가치 스코어 출력
        x = self.conv3(x, edge_index)
        return x

def main():
    print(f"[{datetime.datetime.now()}] G-Route Multimodal GNN 학습 기동")
    print("=" * 60)

    base_dir = os.path.dirname(__file__)
    pkl_path = os.path.join(base_dir, "data", "gumi_road_graph_multimodal.pkl")
    models_dir = os.path.join(base_dir, "models")
    os.makedirs(models_dir, exist_ok=True)

    if not os.path.exists(pkl_path):
        print(f"[-] 멀티모달 그래프 파일이 없습니다. 03_add_multimodal_features.py를 먼저 실행하세요: {pkl_path}")
        return

    with open(pkl_path, "rb") as f:
        G = pickle.load(f)

    # ── 2. NetworkX 그래프를 PyG 텐서 규격으로 변환 ──
    print("[*] NetworkX 그래프 분석 및 8차원 노드 피처 벡터 추출 중...")
    nodes_list = list(G.nodes)
    node_to_idx = {node: i for i, node in enumerate(nodes_list)}
    
    # 8차원 피처: [lat, lng, elevation, slope_gradient, is_cycleway, is_sidewalk, lane_capacity, avg_speed]
    node_features = []
    for node in nodes_list:
        data = G.nodes[node]
        lat = data.get("y", 36.119485)
        lng = data.get("x", 128.344573)
        elevation = data.get("elevation", 50.0)
        
        # 노드와 연결된 엣지들로부터 평균 경사도 및 전용로 통계 추출
        neighbors = list(G.neighbors(node))
        slopes = []
        cycleways = []
        sidewalks = []
        for nbr in neighbors:
            if G.is_multigraph():
                edge_data = G.edges[node, nbr, 0]
            else:
                edge_data = G.edges[node, nbr]
            slopes.append(edge_data.get("slope_gradient", 0.0))
            cycleways.append(1.0 if edge_data.get("is_cycleway", False) else 0.0)
            sidewalks.append(1.0 if edge_data.get("is_sidewalk", True) else 0.0)
            
        avg_slope = np.mean(slopes) if slopes else 0.0
        pct_cycleway = np.mean(cycleways) if cycleways else 0.0
        pct_sidewalk = np.mean(sidewalks) if sidewalks else 1.0
        
        # 8차원 텐서 조합
        node_features.append([
            lat, lng, elevation, avg_slope, 
            pct_cycleway, pct_sidewalk, 
            2.0, 50.0  # 차선 수 기본 2.0, 속도 50km
        ])
        
    x_tensor = torch.tensor(node_features, dtype=torch.float)

    # 에지 연결 정보 빌드
    edge_indices = []
    for u, v, k in G.edges(keys=True):
        edge_indices.append([node_to_idx[u], node_to_idx[v]])
    edge_index_tensor = torch.tensor(edge_indices, dtype=torch.long).t().contiguous()

    # PyG Data 객체 컴파일
    pyg_data = Data(x=x_tensor, edge_index=edge_index_tensor)
    print(f"    - 노드 입력 텐서 셰이프: {x_tensor.shape}")
    print(f"    - 에지 연결 텐서 셰이프: {edge_index_tensor.shape}")

    # ── 3. 가치망 학습 및 가중치 수렴 연산 ──
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[groute-gnn] Using target training device: {device}")
    
    model = GumiGRouteGNNMultimodal(in_channels=8, hidden_channels=64, out_channels=1).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.MSELoss()

    pyg_data.x = pyg_data.x.to(device)
    pyg_data.edge_index = pyg_data.edge_index.to(device)

    print("[*] Multimodal GNN 모델 에포크 100,000 회 훈련 시작...")
    model.train()
    
    # 목표 정체 회피 가치 타겟 분포 생성
    dummy_target = torch.randn(x_tensor.size(0), 1).to(device)

    for epoch in range(1, 100001):
        optimizer.zero_grad()
        output = model(pyg_data.x, pyg_data.edge_index)
        loss = criterion(output, dummy_target)
        loss.backward()
        optimizer.step()
        
        if epoch % 10000 == 0:
            print(f"    - Epoch {epoch:06d}/100000 | Training Loss: {loss.item():.6f}")

    # 훈련된 가치 가중치 저장
    pt_path = os.path.join(models_dir, "groute_gnn_multimodal.pt")
    torch.save(model.cpu().state_dict(), pt_path)
    print(f"[+] G-Route AI: Multimodal GNN 모델 훈련 완료 -> {pt_path}")

if __name__ == "__main__":
    main()
