// src/snowdome/geometry/tree.ts
// クリスマスツリー（幹・葉・星）のジオメトリ生成

import { CONFIG } from '../config';

export interface TreeVertex {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

// ツリーのパラメータ
const TREE_BASE_Y = CONFIG.FLOOR_Y;
const TRUNK_RADIUS = 0.045;
const TRUNK_HEIGHT = 0.12;
const TREE_SEGMENTS = 32;

// 円錐の設定
const CONE_CONFIGS = [
  { baseY: TREE_BASE_Y + TRUNK_HEIGHT, height: 0.35, radius: 0.26 },  // 下段
  { baseY: TREE_BASE_Y + TRUNK_HEIGHT + 0.22, height: 0.30, radius: 0.20 },  // 中段
  { baseY: TREE_BASE_Y + TRUNK_HEIGHT + 0.40, height: 0.25, radius: 0.14 },  // 上段
];

/**
 * 幹（円柱）の頂点を生成
 */
export function generateTrunkVertices(): TreeVertex[] {
  const vertices: TreeVertex[] = [];

  for (let i = 0; i < TREE_SEGMENTS; i++) {
    const theta0 = (i / TREE_SEGMENTS) * Math.PI * 2;
    const theta1 = ((i + 1) / TREE_SEGMENTS) * Math.PI * 2;
    const cos0 = Math.cos(theta0);
    const sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1);
    const sin1 = Math.sin(theta1);

    const topY = TREE_BASE_Y + TRUNK_HEIGHT;
    const botY = TREE_BASE_Y;

    vertices.push(
      { position: { x: cos0 * TRUNK_RADIUS, y: topY, z: sin0 * TRUNK_RADIUS }, normal: { x: cos0, y: 0, z: sin0 } },
      { position: { x: cos1 * TRUNK_RADIUS, y: topY, z: sin1 * TRUNK_RADIUS }, normal: { x: cos1, y: 0, z: sin1 } },
      { position: { x: cos0 * TRUNK_RADIUS, y: botY, z: sin0 * TRUNK_RADIUS }, normal: { x: cos0, y: 0, z: sin0 } },
      { position: { x: cos1 * TRUNK_RADIUS, y: topY, z: sin1 * TRUNK_RADIUS }, normal: { x: cos1, y: 0, z: sin1 } },
      { position: { x: cos1 * TRUNK_RADIUS, y: botY, z: sin1 * TRUNK_RADIUS }, normal: { x: cos1, y: 0, z: sin1 } },
      { position: { x: cos0 * TRUNK_RADIUS, y: botY, z: sin0 * TRUNK_RADIUS }, normal: { x: cos0, y: 0, z: sin0 } },
    );
  }

  return vertices;
}

/**
 * 葉（3段の円錐）の頂点を生成（スムーズシェーディング対応）
 */
export function generateLeavesVertices(): TreeVertex[] {
  const vertices: TreeVertex[] = [];

  for (const cone of CONE_CONFIGS) {
    const tipY = cone.baseY + cone.height;

    // 円錐の側面法線の傾き（斜め上向き）
    const slopeAngle = Math.atan2(cone.radius, cone.height);
    const ny = Math.cos(slopeAngle);
    const nxzScale = Math.sin(slopeAngle);

    for (let i = 0; i < TREE_SEGMENTS; i++) {
      const theta0 = (i / TREE_SEGMENTS) * Math.PI * 2;
      const theta1 = ((i + 1) / TREE_SEGMENTS) * Math.PI * 2;
      // 三角形の中心角（頂点の法線用）
      const thetaMid = ((i + 0.5) / TREE_SEGMENTS) * Math.PI * 2;

      const cos0 = Math.cos(theta0);
      const sin0 = Math.sin(theta0);
      const cos1 = Math.cos(theta1);
      const sin1 = Math.sin(theta1);
      const cosMid = Math.cos(thetaMid);
      const sinMid = Math.sin(thetaMid);

      // 頂点の法線（三角形の中心方向）
      const tipNormal = { x: cosMid * nxzScale, y: ny, z: sinMid * nxzScale };

      // 底辺の頂点は、その頂点の角度に基づいた法線（隣接三角形と共有）
      vertices.push(
        { position: { x: 0, y: tipY, z: 0 }, normal: tipNormal },
        { position: { x: cos0 * cone.radius, y: cone.baseY, z: sin0 * cone.radius }, normal: { x: cos0 * nxzScale, y: ny, z: sin0 * nxzScale } },
        { position: { x: cos1 * cone.radius, y: cone.baseY, z: sin1 * cone.radius }, normal: { x: cos1 * nxzScale, y: ny, z: sin1 * nxzScale } },
      );
    }
  }

  return vertices;
}

/**
 * トップスター（5角星）の頂点を生成
 */
export function generateStarVertices(): TreeVertex[] {
  const vertices: TreeVertex[] = [];

  // 星の位置（最上段の円錐の頂点に少し埋まる）
  const topCone = CONE_CONFIGS[CONE_CONFIGS.length - 1];
  const starCenterY = topCone.baseY + topCone.height + 0.005;
  const starSize = 0.08;
  const starThickness = 0.02;

  const starPoints = 5;
  const outerRadius = starSize;
  const innerRadius = starSize * 0.4;

  // 星の頂点座標を計算（XY平面上、上向きに開始）
  const starCoords: { x: number; y: number }[] = [];
  for (let i = 0; i < starPoints * 2; i++) {
    const angle = (i * Math.PI) / starPoints + Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    starCoords.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }

  // 表面（前向き法線、Z+方向）
  for (let i = 0; i < starPoints * 2; i++) {
    const next = (i + 1) % (starPoints * 2);
    vertices.push(
      { position: { x: 0, y: starCenterY, z: starThickness / 2 }, normal: { x: 0, y: 0, z: 1 } },
      { position: { x: starCoords[i].x, y: starCenterY + starCoords[i].y, z: starThickness / 2 }, normal: { x: 0, y: 0, z: 1 } },
      { position: { x: starCoords[next].x, y: starCenterY + starCoords[next].y, z: starThickness / 2 }, normal: { x: 0, y: 0, z: 1 } },
    );
  }

  // 裏面（後向き法線、Z-方向）
  for (let i = 0; i < starPoints * 2; i++) {
    const next = (i + 1) % (starPoints * 2);
    vertices.push(
      { position: { x: 0, y: starCenterY, z: -starThickness / 2 }, normal: { x: 0, y: 0, z: -1 } },
      { position: { x: starCoords[next].x, y: starCenterY + starCoords[next].y, z: -starThickness / 2 }, normal: { x: 0, y: 0, z: -1 } },
      { position: { x: starCoords[i].x, y: starCenterY + starCoords[i].y, z: -starThickness / 2 }, normal: { x: 0, y: 0, z: -1 } },
    );
  }

  // 側面（各エッジ）
  for (let i = 0; i < starPoints * 2; i++) {
    const next = (i + 1) % (starPoints * 2);
    const dx = starCoords[next].x - starCoords[i].x;
    const dy = starCoords[next].y - starCoords[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dy / len;
    const ny = -dx / len;

    vertices.push(
      { position: { x: starCoords[i].x, y: starCenterY + starCoords[i].y, z: starThickness / 2 }, normal: { x: nx, y: ny, z: 0 } },
      { position: { x: starCoords[next].x, y: starCenterY + starCoords[next].y, z: starThickness / 2 }, normal: { x: nx, y: ny, z: 0 } },
      { position: { x: starCoords[i].x, y: starCenterY + starCoords[i].y, z: -starThickness / 2 }, normal: { x: nx, y: ny, z: 0 } },
      { position: { x: starCoords[next].x, y: starCenterY + starCoords[next].y, z: starThickness / 2 }, normal: { x: nx, y: ny, z: 0 } },
      { position: { x: starCoords[next].x, y: starCenterY + starCoords[next].y, z: -starThickness / 2 }, normal: { x: nx, y: ny, z: 0 } },
      { position: { x: starCoords[i].x, y: starCenterY + starCoords[i].y, z: -starThickness / 2 }, normal: { x: nx, y: ny, z: 0 } },
    );
  }

  return vertices;
}
