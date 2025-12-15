// src/snowdome/config.ts

export const CONFIG = {
  // ドーム（球体）
  DOME_RADIUS: 0.7,
  DOME_SEGMENTS: 32,
  DOME_RINGS: 24,       // 球体全体をカバー
  DOME_CENTER_Y: 0.35,  // 球の中心Y座標（PEDESTAL_TOP_Y + DOME_RADIUS で計算）

  // カメラ
  CAMERA_DISTANCE: 3.5,        // 全体が収まる距離
  CAMERA_HEIGHT: 0.8,          // 上から見下ろす
  CAMERA_FOV: Math.PI / 4,     // 標準視野
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 100.0,
  CAMERA_ROTATION_SPEED: 0.1,  // ゆっくり回転

  // 土台（台形円柱）
  PEDESTAL_TOP_RADIUS: 0.5,
  PEDESTAL_BOTTOM_RADIUS: 0.65,
  PEDESTAL_HEIGHT: 0.35,
  PEDESTAL_TOP_Y: -0.15,  // 土台上面のY座標（球の下部に埋まる）
  PEDESTAL_SEGMENTS: 32,

  // 地面（設置面）
  GROUND_SIZE: 4.0,       // 地面の広さ
  GROUND_Y: -0.5,         // 地面のY座標（土台底面と同じ）

  // ライティング
  LIGHT_POSITION: [2.0, 3.5, 1.5] as const,  // やや斜め上から
  LIGHT_COLOR: [1.0, 0.92, 0.8] as const,    // 暖かみのある白
  LIGHT_INTENSITY: 1.2,
  AMBIENT_INTENSITY: 0.4,  // 影とのバランス

  // ガラス
  GLASS_IOR: 1.5,  // 屈折率

  // リムライト
  RIM_COLOR: [0.5, 0.6, 0.8] as const,       // 控えめに
  RIM_POWER: 2.5,

  // 雪片
  SNOWFLAKE_COUNT: 3000,
  SNOWFLAKE_SIZE_MIN: 0.008,
  SNOWFLAKE_SIZE_MAX: 0.025,

  // 物理
  GRAVITY: 0.15,           // 弱い重力でゆっくり落下
  DRAG_COEFFICIENT: 2.0,   // 空気抵抗を強く
  TURBULENCE: 0.4,         // 乱流を強くして漂う感じに
  RESTITUTION: 0.1,
  FLOOR_Y: -0.15,  // ドーム底面のY座標（雪の床）

  // GPU
  WORKGROUP_SIZE: 64,
} as const;
