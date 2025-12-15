// src/snowdome/geometry/ground.ts
// 地面と雪床のジオメトリ生成

import { CONFIG } from '../config';

export interface GroundVertex {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

export interface GroundVertexWithUV extends GroundVertex {
  uv: { u: number; v: number };
}

/**
 * ドーム内の雪床（円盤）の頂点を生成
 */
export function generateSnowFloorVertices(): GroundVertex[] {
  const vertices: GroundVertex[] = [];
  const snowFloorY = CONFIG.FLOOR_Y;
  const snowFloorRadius = CONFIG.DOME_RADIUS * 0.7;
  const segments = 32;

  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;

    // 中心点
    vertices.push({
      position: { x: 0, y: snowFloorY, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });
    // 外周点1
    vertices.push({
      position: { x: Math.cos(theta0) * snowFloorRadius, y: snowFloorY, z: Math.sin(theta0) * snowFloorRadius },
      normal: { x: 0, y: 1, z: 0 },
    });
    // 外周点2
    vertices.push({
      position: { x: Math.cos(theta1) * snowFloorRadius, y: snowFloorY, z: Math.sin(theta1) * snowFloorRadius },
      normal: { x: 0, y: 1, z: 0 },
    });
  }

  return vertices;
}

/**
 * 地面（テクスチャ付き平面）の頂点を生成
 */
export function generateGroundVertices(uvScale: number = 2.0): GroundVertexWithUV[] {
  const groundY = CONFIG.PEDESTAL_TOP_Y - CONFIG.PEDESTAL_HEIGHT;
  const groundSize = CONFIG.GROUND_SIZE;

  return [
    // 三角形1
    { position: { x: -groundSize, y: groundY, z: -groundSize }, normal: { x: 0, y: 1, z: 0 }, uv: { u: 0, v: 0 } },
    { position: { x: groundSize, y: groundY, z: -groundSize }, normal: { x: 0, y: 1, z: 0 }, uv: { u: uvScale, v: 0 } },
    { position: { x: -groundSize, y: groundY, z: groundSize }, normal: { x: 0, y: 1, z: 0 }, uv: { u: 0, v: uvScale } },
    // 三角形2
    { position: { x: groundSize, y: groundY, z: -groundSize }, normal: { x: 0, y: 1, z: 0 }, uv: { u: uvScale, v: 0 } },
    { position: { x: groundSize, y: groundY, z: groundSize }, normal: { x: 0, y: 1, z: 0 }, uv: { u: uvScale, v: uvScale } },
    { position: { x: -groundSize, y: groundY, z: groundSize }, normal: { x: 0, y: 1, z: 0 }, uv: { u: 0, v: uvScale } },
  ];
}
