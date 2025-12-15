// src/snowdome/shaders/glass.ts

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { cos, sin, mul, dot, normalize, max } from 'typegpu/std';
import { renderLayout } from '../types';
import { CONFIG } from '../config';

const { vertexFn, fragmentFn } = tgpu['~unstable'];

const SEGMENTS = CONFIG.DOME_SEGMENTS;
const RINGS = CONFIG.DOME_RINGS;

// 頂点シェーダー
export const glassVertexFn = vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
  },
  out: {
    position: d.builtin.position,
    worldNormal: d.vec3f,
  },
})((input) => {
  'use gpu';

  const camera = renderLayout.$.camera;
  const vertexId = d.i32(input.vertexIndex);

  // デバッグ: 最初の3頂点だけで三角形を描画
  let x = 0.0;
  let y = 0.0;
  let z = 0.0;

  if (vertexId == 0) {
    x = 0.0;
    y = 0.5;
    z = 0.0;
  }
  if (vertexId == 1) {
    x = -0.5;
    y = -0.5;
    z = 0.0;
  }
  if (vertexId == 2) {
    x = 0.5;
    y = -0.5;
    z = 0.0;
  }

  // カメラ行列を適用せず、直接クリップ座標として出力
  return {
    position: d.vec4f(x, y, z, 1.0),
    worldNormal: d.vec3f(0.0, 0.0, 1.0),
  };
}).$name('glassVertex');

// フラグメントシェーダー（単色）
export const glassFragmentFn = fragmentFn({
  in: {
    worldNormal: d.vec3f,
  },
  out: d.vec4f,
})((_input) => {
  'use gpu';

  // デバッグ: 固定色を表示
  return d.vec4f(1.0, 0.5, 0.2, 1.0); // オレンジ色
}).$name('glassFragment');
