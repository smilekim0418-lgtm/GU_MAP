"""
04_train_rl_agent.py
DQN(Deep Q-Network) 에이전트를 12시간 시간 제한 조건(크레딧 보호 조치)으로 학습시킵니다.
"""
from stable_baselines3 import DQN
from stable_baselines3.common.callbacks import CheckpointCallback, EvalCallback, BaseCallback
from env.gumi_routing_env import GumiRoutingEnv
import os
import time
import datetime

# ── 12시간 시간 제약 강제 종료 커스텀 콜백 ──
class TimeLimitCallback(BaseCallback):
    def __init__(self, max_seconds, verbose=0):
        super(TimeLimitCallback, self).__init__(verbose)
        self.max_seconds = max_seconds
        self.start_time = None

    def _on_training_start(self) -> None:
        self.start_time = time.time()

    def _on_step(self) -> bool:
        elapsed = time.time() - self.start_time
        if elapsed >= self.max_seconds:
            print(f"\n[!] 경보: 설정된 {self.max_seconds/3600:.1f}시간 제한에 도달했습니다. 학습을 중단하고 모델을 저장합니다.")
            return False  # False를 반환하면 훈련이 조기 종료됩니다.
        return True

def main():
    print(f"[{datetime.datetime.now()}] G-Route AI 12시간 집중 훈련 시작")
    print("=" * 60)

    try:
        env = GumiRoutingEnv(max_steps=150)
        eval_env = GumiRoutingEnv(max_steps=150)
    except FileNotFoundError as e:
        print(f"[-] 초기화 에러: {e}")
        return

    base_dir = os.path.dirname(__file__)
    models_dir = os.path.join(base_dir, "models")
    logs_dir = os.path.join(base_dir, "logs")
    
    os.makedirs(models_dir, exist_ok=True)
    os.makedirs(logs_dir, exist_ok=True)

    # 1. 체크포인트 콜백: 10만 스텝마다 저장
    checkpoint_callback = CheckpointCallback(
        save_freq=100000,
        save_path=os.path.join(models_dir, "checkpoints"),
        name_prefix="groute_dqn_cp"
    )

    # 2. 평가 콜백: 5만 스텝마다 평가 후 최고 성능 모델 저장
    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=os.path.join(models_dir, "best"),
        log_path=os.path.join(logs_dir, "eval"),
        eval_freq=50000,
        n_eval_episodes=20,
        deterministic=True
    )

    # 3. 시간 제약 콜백: 11시간 50분(42,600초) 설정 (12시간 한계선 돌파 방지 안전장치)
    time_limit_callback = TimeLimitCallback(max_seconds=42600)

    # 4. DQN 에이전트 설정 (CPU 전용 학습 최적화)
    model = DQN(
        "MlpPolicy",
        env,
        learning_rate=1e-4,
        buffer_size=150000,        # 16GB RAM 여유 용량 최적화 크기
        learning_starts=10000,
        batch_size=64,
        gamma=0.99,
        exploration_fraction=0.2,  # 30만 스텝 지점에서 탐색을 마치고 수렴 모드 돌입
        exploration_final_eps=0.05,
        target_update_interval=5000,
        train_freq=4,
        verbose=1,
        tensorboard_log=None,
        device="cpu"
    )

    # 5. 훈련 돌입: 150만 스텝 (12시간 연산 최대치)
    TOTAL_TIMESTEPS = 1500000
    print(f"[*] 최대 목표 스텝: {TOTAL_TIMESTEPS:,} steps")
    print(f"[*] 시간 제한 안전 장치: 11시간 50분 (42,600초)")
    print("=" * 60)

    model.learn(
        total_timesteps=TOTAL_TIMESTEPS,
        callback=[checkpoint_callback, eval_callback, time_limit_callback],
        progress_bar=True
    )

    # 6. 최종 훈련 모델 가중치 저장
    final_path = os.path.join(models_dir, "groute_dqn_final")
    model.save(final_path)
    print("=" * 60)
    print(f"[{datetime.datetime.now()}] AI 경로 탐색 훈련 조기 차단/정상 완료! -> {final_path}.zip")

if __name__ == "__main__":
    main()

