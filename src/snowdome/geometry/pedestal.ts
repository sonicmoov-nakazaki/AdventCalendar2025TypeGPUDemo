// src/snowdome/geometry/pedestal.ts
// 土台（台形円柱）のジオメトリ生成

import { CONFIG } from '../config';

export interface PedestalVertex {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

export function generatePedestalVertices(): PedestalVertex[] {
  const vertices: PedestalVertex[] = [];
  const segments = CONFIG.PEDESTAL_SEGMENTS;
  const topRadius = CONFIG.PEDESTAL_TOP_RADIUS;
  const bottomRadius = CONFIG.PEDESTAL_BOTTOM_RADIUS;
  const topY = CONFIG.PEDESTAL_TOP_Y;
  const bottomY = topY - CONFIG.PEDESTAL_HEIGHT;

  // 側面の法線のY成分を計算（台形の傾き）
  const slopeAngle = Math.atan2(bottomRadius - topRadius, CONFIG.PEDESTAL_HEIGHT);
  const normalY = Math.sin(slopeAngle);
  const normalXZScale = Math.cos(slopeAngle);

  // ===== 上面 =====
  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;

    // 三角形扇: 中心, 外周i, 外周i+1
    vertices.push(
      { position: { x: 0, y: topY, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
      { position: { x: Math.cos(theta0) * topRadius, y: topY, z: Math.sin(theta0) * topRadius }, normal: { x: 0, y: 1, z: 0 } },
      { position: { x: Math.cos(theta1) * topRadius, y: topY, z: Math.sin(theta1) * topRadius }, normal: { x: 0, y: 1, z: 0 } }
    );
  }

  // ===== 側面 =====
  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;

    const cos0 = Math.cos(theta0);
    const sin0 = Math.sin(theta0);
    const cos1 = Math.cos(theta1);
    const sin1 = Math.sin(theta1);

    // 上辺の2点
    const topP0 = { x: cos0 * topRadius, y: topY, z: sin0 * topRadius };
    const topP1 = { x: cos1 * topRadius, y: topY, z: sin1 * topRadius };
    // 下辺の2点
    const botP0 = { x: cos0 * bottomRadius, y: bottomY, z: sin0 * bottomRadius };
    const botP1 = { x: cos1 * bottomRadius, y: bottomY, z: sin1 * bottomRadius };

    // 法線
    const n0 = { x: cos0 * normalXZScale, y: normalY, z: sin0 * normalXZScale };
    const n1 = { x: cos1 * normalXZScale, y: normalY, z: sin1 * normalXZScale };

    // 三角形1: topP0, topP1, botP0
    vertices.push(
      { position: topP0, normal: n0 },
      { position: topP1, normal: n1 },
      { position: botP0, normal: n0 }
    );
    // 三角形2: topP1, botP1, botP0
    vertices.push(
      { position: topP1, normal: n1 },
      { position: botP1, normal: n1 },
      { position: botP0, normal: n0 }
    );
  }

  // ===== 底面 =====
  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;

    // 三角形扇: 中心, 外周i+1, 外周i（裏向き）
    vertices.push(
      { position: { x: 0, y: bottomY, z: 0 }, normal: { x: 0, y: -1, z: 0 } },
      { position: { x: Math.cos(theta1) * bottomRadius, y: bottomY, z: Math.sin(theta1) * bottomRadius }, normal: { x: 0, y: -1, z: 0 } },
      { position: { x: Math.cos(theta0) * bottomRadius, y: bottomY, z: Math.sin(theta0) * bottomRadius }, normal: { x: 0, y: -1, z: 0 } }
    );
  }

  return vertices;
}
