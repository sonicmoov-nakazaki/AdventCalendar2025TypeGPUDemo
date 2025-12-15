// src/snowdome/shaders/common.ts
// 共通のGPU関数

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { cos, dot, max, pow } from 'typegpu/std';

// フレネル効果（Schlick近似）
export const fresnelFn = tgpu.fn([d.vec3f, d.vec3f, d.f32], d.f32)((viewDir, normal, ior) => {
  'use gpu';
  const cosTheta = max(dot(viewDir, normal), 0.0);
  const r0Base = (1.0 - ior) / (1.0 + ior);
  const r0 = r0Base * r0Base;
  const fresnel = r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
  return fresnel;
}).$name('fresnel');

// 二層フレネル（外側ガラス + 内側空気境界）
export const doubleLayerFresnelFn = tgpu.fn([d.vec3f, d.vec3f, d.f32], d.f32)(
  (viewDir, normal, ior) => {
    'use gpu';
    const cosTheta = max(dot(viewDir, normal), 0.0);

    // 外側: 空気→ガラス
    const r0Base = (1.0 - ior) / (1.0 + ior);
    const r0 = r0Base * r0Base;
    const fresnelOuter = r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);

    // 内側からの反射も少し加味（ドーム内部の反射）
    const innerReflect = pow(1.0 - cosTheta, 3.0) * 0.15;

    return fresnelOuter + innerReflect;
  }
).$name('doubleLayerFresnel');

export const sampleEnvironmentFn = tgpu.fn([d.vec3f], d.vec3f)((dir) => {
  'use gpu';

  // === 基本の空/天井 ===
  const t = dir.y * 0.5 + 0.5;

  // 室内なので暗めの天井と暖色の照明
  const ceilingR = d.f32(0.15);
  const ceilingG = d.f32(0.12);
  const ceilingB = d.f32(0.1);

  // 下方向はテーブル（木目の暖色）
  const tableR = d.f32(0.4);
  const tableG = d.f32(0.25);
  const tableB = d.f32(0.1);

  // === 窓からの光（右上方向） ===
  const windowDirX = d.f32(0.6);
  const windowDirY = d.f32(0.5);
  const windowDirZ = d.f32(0.6);
  const windowDot = max(
    dir.x * windowDirX + dir.y * windowDirY + dir.z * windowDirZ,
    0.0
  );
  // 窓の光（青白い外光）
  const windowGlow = pow(windowDot, 8.0) * 0.6;
  const windowHighlight = pow(windowDot, 64.0) * 1.5;

  // === 室内照明（暖色、上方向） ===
  const lampDot = max(dir.y, 0.0);
  const lampGlow = pow(lampDot, 4.0) * 0.3;

  // === 反対側の壁の反射（暗め） ===
  const wallDot = max(-dir.z, 0.0);
  const wallReflect = wallDot * 0.1;

  // ベースカラー補間
  let r = tableR + (ceilingR - tableR) * t;
  let g = tableG + (ceilingG - tableG) * t;
  let b = tableB + (ceilingB - tableB) * t;

  // 窓の光を追加（青白い）
  r = r + windowGlow * 0.7 + windowHighlight;
  g = g + windowGlow * 0.85 + windowHighlight;
  b = b + windowGlow * 1.0 + windowHighlight;

  // 室内照明（暖色）
  r = r + lampGlow * 1.0;
  g = g + lampGlow * 0.8;
  b = b + lampGlow * 0.5;

  // 壁の反射
  r = r + wallReflect;
  g = g + wallReflect * 0.9;
  b = b + wallReflect * 0.8;

  return d.vec3f(r, g, b);
}).$name('sampleEnvironment');

// リムライト
export const rimLightFn = tgpu.fn([d.vec3f, d.vec3f, d.vec3f, d.f32], d.vec3f)((normal, viewDir, rimColor, rimPower) => {
  'use gpu';
  const rim = 1.0 - max(dot(normal, viewDir), 0.0);
  const rimFactor = pow(rim, rimPower);
  return d.vec3f(
    rimColor.x * rimFactor,
    rimColor.y * rimFactor,
    rimColor.z * rimFactor
  );
}).$name('rimLight');

// 3Dノイズ関数（乱流用）- 簡易的なハッシュベースのノイズ
export const noise3DFn = tgpu.fn([d.vec3f], d.f32)((p) => {
  'use gpu';
  // 簡易的なハッシュ関数
  const px = p.x * 127.1 + p.y * 311.7 + p.z * 74.7;
  const py = p.x * 269.5 + p.y * 183.3 + p.z * 246.1;
  const pz = p.x * 113.5 + p.y * 271.9 + p.z * 124.6;

  // sin をハッシュとして使用
  const twoPi = d.f32(6.2832);
  const sinPx = px - d.f32(d.i32(px / twoPi)) * twoPi;
  const sinPy = py - d.f32(d.i32(py / twoPi)) * twoPi;
  const sinPz = pz - d.f32(d.i32(pz / twoPi)) * twoPi;

  // 疑似ランダム値を生成
  const h1 = sinPx * sinPx * 43758.5453;
  const h2 = sinPy * sinPy * 43758.5453;
  const h3 = sinPz * sinPz * 43758.5453;

  const frac1 = h1 - d.f32(d.i32(h1));
  const frac2 = h2 - d.f32(d.i32(h2));
  const frac3 = h3 - d.f32(d.i32(h3));

  // -1 から 1 の範囲に正規化
  return (frac1 + frac2 + frac3) / 1.5 - 1.0;
}).$name('noise3D');

export const thinFilmIridescenceFn = tgpu.fn([d.f32], d.vec3f)((cosTheta) => {
  'use gpu';
  // 視角に応じて色相がシフト
  const phase = (1.0 - cosTheta) * 3.14159 * 2.0;

  // 微妙な虹色（強度は控えめ）
  const r = 0.5 + 0.5 * cos(phase);
  const g = 0.5 + 0.5 * cos(phase + 2.094); // +120度
  const b = 0.5 + 0.5 * cos(phase + 4.189); // +240度

  // 強度を抑えて自然に
  return d.vec3f(r * 0.08, g * 0.08, b * 0.08);
}).$name('thinFilmIridescence');
