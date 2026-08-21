import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
import pickle
import os

BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
PKL_PATH = os.path.join(BASE_DIR, "data", "gumi_road_graph_multimodal.pkl")
MODEL_PT_PATH = os.path.join(MODELS_DIR, "groute_gnn_deep_final.pt")
ONNX_PATH = os.path.join(MODELS_DIR, "groute_gnn_deep.onnx")

class GumiGRouteGNNDeep(nn.Module):
    def __init__(self, in_channels=8, hidden_channels=128, out_channels=1):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden_channels)
        self.conv2 = GCNConv(hidden_channels, hidden_channels)
        self.conv3 = GCNConv(hidden_channels, hidden_channels // 2)
        self.conv4 = GCNConv(hidden_channels // 2, out_channels)
        self.dropout = nn.Dropout(0.1)

    def forward(self, x, edge_index):
        x = F.relu(self.conv1(x, edge_index))
        x = self.dropout(x)
        x = F.relu(self.conv2(x, edge_index))
        x = self.dropout(x)
        x = F.relu(self.conv3(x, edge_index))
        x = self.conv4(x, edge_index)
        return x

def main():
    print("[*] Loading graph nodes...")
    if not os.path.exists(PKL_PATH):
        print(f"[-] Graph not found at {PKL_PATH}")
        return
    with open(PKL_PATH, "rb") as f:
        G = pickle.load(f)
    num_nodes = len(G.nodes)
    print(f"[*] Nodes count: {num_nodes}")

    print("[*] Instantiating GumiGRouteGNNDeep...")
    model = GumiGRouteGNNDeep()
    
    if not os.path.exists(MODEL_PT_PATH):
        print(f"[-] State dict not found at {MODEL_PT_PATH}")
        return

    print("[*] Loading weights...")
    state_dict = torch.load(MODEL_PT_PATH, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()

    dummy_x = torch.randn(num_nodes, 8)
    dummy_edge = torch.randint(0, num_nodes, (2, num_nodes * 3))

    print("[*] Exporting to ONNX...")
    try:
        torch.onnx.export(
            model, (dummy_x, dummy_edge), ONNX_PATH,
            input_names=["x", "edge_index"],
            output_names=["node_scores"],
            dynamic_axes={"x": {0: "num_nodes"}, "edge_index": {1: "num_edges"}},
            opset_version=14
        )
        print(f"[+] ONNX export successful! -> {ONNX_PATH}")
    except Exception as e:
        print(f"[-] Export failed: {e}")

if __name__ == "__main__":
    main()
