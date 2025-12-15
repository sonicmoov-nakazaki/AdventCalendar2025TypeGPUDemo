// src/snowdome/geometry/dome.ts
// ドーム（球体）のジオメトリ生成

import { CONFIG } from '../config';

export interface DomeVertex {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

/**
 * 球体の頂点を生成する
 */
export function generateSphereVertices(
  radius: number,
  segments: number,
  rings: number,
  centerY: number
): DomeVertex[] {
  const vertices: DomeVertex[] = [];

  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const i0 = seg;
      const i1 = (seg + 1) % segments;
      const j0 = ring;
      const j1 = ring + 1;

      // 球体全体: phi は -π/2 から π/2 まで
      const getVertex = (segIdx: number, ringIdx: number): DomeVertex => {
        const theta = (segIdx / segments) * Math.PI * 2;
        const phi = (ringIdx / rings) * Math.PI - Math.PI / 2; // -90° to +90°

        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);

        const x = cosTheta * cosPhi * radius;
        const y = sinPhi * radius + centerY;
        const z = sinTheta * cosPhi * radius;

        // 法線（球の中心から外向き）
        const nx = cosTheta * cosPhi;
        const ny = sinPhi;
        const nz = sinTheta * cosPhi;

        return {
          position: { x, y, z },
          normal: { x: nx, y: ny, z: nz },
        };
      };

      const v00 = getVertex(i0, j0);
      const v10 = getVertex(i1, j0);
      const v01 = getVertex(i0, j1);
      const v11 = getVertex(i1, j1);

      vertices.push(v00, v10, v01);
      vertices.push(v10, v11, v01);
    }
  }

  return vertices;
}

/**
 * デフォルト設定でドームの頂点を生成
 */
export function generateDomeVertices(): DomeVertex[] {
  return generateSphereVertices(
    CONFIG.DOME_RADIUS,
    CONFIG.DOME_SEGMENTS,
    CONFIG.DOME_RINGS,
    CONFIG.DOME_CENTER_Y
  );
}
