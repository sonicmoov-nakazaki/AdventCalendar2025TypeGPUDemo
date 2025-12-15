// src/snowdome/shaders/snowflake.ts
// 雪片のビルボードシェーダー

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { mul, sqrt, exp, smoothstep, discard } from 'typegpu/std';
import { CONFIG } from '../config';

const { vertexFn, fragmentFn } = tgpu['~unstable'];

// 雪片データ構造
export const Snowflake = d.struct({
  position: d.vec3f,   // 位置
  velocity: d.vec3f,   // 速度（Step 7 で使用）
  size: d.f32,         // サイズ
  phase: d.f32,        // アニメーション位相
  alpha: d.f32,        // 透明度
  rotation: d.f32,     // 回転角
});

export const SnowflakeArray = d.arrayOf(Snowflake, CONFIG.SNOWFLAKE_COUNT);

// カメラ構造体（index.ts と同じ）
const Camera = d.struct({
  viewProjMatrix: d.mat4x4f,
  viewMatrix: d.mat4x4f,
  position: d.vec3f,
  _padding: d.f32,
});

// 雪片レンダリング用バインドグループレイアウト
export const snowflakeRenderLayout = tgpu.bindGroupLayout({
  snowflakes: { storage: SnowflakeArray, access: 'readonly' },
  camera: { uniform: Camera },
});

// 頂点シェーダー（ビルボードクワッド）
export const snowflakeVertexFn = vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: {
    position: d.builtin.position,
    uv: d.vec2f,
    alpha: d.f32,
  },
})((input) => {
  'use gpu';

  const camera = snowflakeRenderLayout.$.camera;
  const snowflake = snowflakeRenderLayout.$.snowflakes[input.instanceIndex];

  // クワッドの頂点（2三角形 = 6頂点）
  // 0--1
  // |\ |
  // | \|
  // 2--3
  // 三角形1: 0, 1, 2
  // 三角形2: 1, 3, 2

  let localX = d.f32(0.0);
  let localY = d.f32(0.0);
  let u = d.f32(0.0);
  let v = d.f32(0.0);

  const vid = input.vertexIndex;

  if (vid == 0) { localX = d.f32(-0.5); localY = d.f32(0.5);  u = d.f32(0.0); v = d.f32(0.0); }
  if (vid == 1) { localX = d.f32(0.5);  localY = d.f32(0.5);  u = d.f32(1.0); v = d.f32(0.0); }
  if (vid == 2) { localX = d.f32(-0.5); localY = d.f32(-0.5); u = d.f32(0.0); v = d.f32(1.0); }
  if (vid == 3) { localX = d.f32(0.5);  localY = d.f32(0.5);  u = d.f32(1.0); v = d.f32(0.0); }
  if (vid == 4) { localX = d.f32(0.5);  localY = d.f32(-0.5); u = d.f32(1.0); v = d.f32(1.0); }
  if (vid == 5) { localX = d.f32(-0.5); localY = d.f32(-0.5); u = d.f32(0.0); v = d.f32(1.0); }

  // サイズ適用
  localX = localX * snowflake.size;
  localY = localY * snowflake.size;

  // ビルボード: カメラに向ける
  // viewMatrix から右ベクトルと上ベクトルを抽出
  // TypeGPUでは columns プロパティでアクセス
  const col0 = camera.viewMatrix.columns[0];
  const col1 = camera.viewMatrix.columns[1];
  const col2 = camera.viewMatrix.columns[2];

  // 右ベクトル（ビュー行列の1行目 = 各列の0番目の要素）
  const rightX = col0.x;
  const rightY = col1.x;
  const rightZ = col2.x;

  // 上ベクトル（ビュー行列の2行目 = 各列の1番目の要素）
  const upX = col0.y;
  const upY = col1.y;
  const upZ = col2.y;

  // ワールド位置 = 雪片位置 + ローカルオフセット（ビルボード）
  const worldX = snowflake.position.x + localX * rightX + localY * upX;
  const worldY = snowflake.position.y + localX * rightY + localY * upY;
  const worldZ = snowflake.position.z + localX * rightZ + localY * upZ;

  const worldPos = d.vec4f(worldX, worldY, worldZ, 1.0);
  const clipPos = mul(camera.viewProjMatrix, worldPos);

  return {
    position: clipPos,
    uv: d.vec2f(u, v),
    alpha: snowflake.alpha,
  };
}).$name('snowflakeVertex');

// フラグメントシェーダー（丸い雪片）
export const snowflakeFragmentFn = fragmentFn({
  in: {
    uv: d.vec2f,
    alpha: d.f32,
  },
  out: d.vec4f,
})((input) => {
  'use gpu';

  // 中心からの距離
  const cx = input.uv.x - 0.5;
  const cy = input.uv.y - 0.5;
  const dist = sqrt(cx * cx + cy * cy);

  // 円の外は描画しない
  if (dist > 0.5) {
    discard();
  }

  // ソフトエッジ（端に向かって透明に）
  const edge = 1.0 - smoothstep(0.3, 0.5, dist);

  // 中心が明るいグロー効果
  const glow = exp(0.0 - dist * 4.0);

  // 雪片の色（わずかに青みがかった白）
  const colorR = 0.95 + glow * 0.05;
  const colorG = 0.97 + glow * 0.03;
  const colorB = 1.0;

  // 最終アルファ
  const finalAlpha = input.alpha * edge * (0.7 + glow * 0.3);

  return d.vec4f(colorR, colorG, colorB, finalAlpha);
}).$name('snowflakeFragment');
