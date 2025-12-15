// src/snowdome/shaders/physics.ts
// 雪片の物理シミュレーション（コンピュートシェーダー）

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { sqrt, sin, cos, abs } from 'typegpu/std';
import { CONFIG } from '../config';
import { SnowflakeArray } from './snowflake';
import { noise3DFn } from './common';

const { computeFn } = tgpu['~unstable'];

// シミュレーションパラメータ
export const SimParams = d.struct({
  time: d.f32,
  deltaTime: d.f32,
  domeRadius: d.f32,
  domeCenterY: d.f32,
  floorY: d.f32,
  gravity: d.f32,
  dragCoeff: d.f32,
  turbulence: d.f32,
  restitution: d.f32,
  shakeAccelX: d.f32,    // Step 8 で使用
  shakeAccelY: d.f32,
  shakeAccelZ: d.f32,
  snowflakeCount: d.u32,
});

// コンピュート用バインドグループレイアウト
export const computeLayout = tgpu.bindGroupLayout({
  snowflakes: { storage: SnowflakeArray, access: 'mutable' },
  params: { uniform: SimParams },
});

// 物理更新コンピュートシェーダー
export const updateSnowflakesFn = computeFn({
  workgroupSize: [CONFIG.WORKGROUP_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';

  const idx = input.gid.x;
  const params = computeLayout.$.params;

  // 範囲外チェック
  if (idx >= params.snowflakeCount) {
    return;
  }

  const snowflake = computeLayout.$.snowflakes[idx];

  // 現在の状態
  let posX = snowflake.position.x;
  let posY = snowflake.position.y;
  let posZ = snowflake.position.z;
  let velX = snowflake.velocity.x;
  let velY = snowflake.velocity.y;
  let velZ = snowflake.velocity.z;

  // ===== 力の計算 =====

  // 重力
  const gravityForce = d.f32(0) - params.gravity;

  // 流体抵抗（速度の2乗に比例）
  const speed = sqrt(velX * velX + velY * velY + velZ * velZ);
  let dragX = d.f32(0);
  let dragY = d.f32(0);
  let dragZ = d.f32(0);
  if (speed > 0.001) {
    const dragCoeff = params.dragCoeff * speed;
    dragX = (d.f32(0) - velX) * dragCoeff;
    dragY = (d.f32(0) - velY) * dragCoeff;
    dragZ = (d.f32(0) - velZ) * dragCoeff;
  }

  // 振る操作による加速度（Step 8 で実装）
  const shakeX = params.shakeAccelX;
  const shakeY = params.shakeAccelY;
  const shakeZ = params.shakeAccelZ;

  // 乱流（ノイズベースの揺らぎ）
  const noiseScale = d.f32(2.0);
  const noiseInput = d.vec3f(
    posX * noiseScale + params.time * 0.5,
    posY * noiseScale + params.time * 0.3,
    posZ * noiseScale + params.time * 0.4
  );
  const noiseVal = noise3DFn(noiseInput);
  const turbX = sin(noiseVal * 6.28 + params.time + snowflake.phase) * params.turbulence;
  const turbY = cos(noiseVal * 6.28 * 0.7 + params.time * 0.8) * params.turbulence * 0.3;
  const turbZ = sin(noiseVal * 6.28 * 1.3 + params.time * 0.6 + snowflake.phase) * params.turbulence;

  // ===== 速度更新 =====
  const dt = params.deltaTime;

  velX = velX + (dragX + shakeX + turbX) * dt;
  velY = velY + (gravityForce + dragY + shakeY + turbY) * dt;
  velZ = velZ + (dragZ + shakeZ + turbZ) * dt;

  // ===== 位置更新 =====
  posX = posX + velX * dt;
  posY = posY + velY * dt;
  posZ = posZ + velZ * dt;

  // ===== 境界判定 =====

  // ドーム中心からの相対位置で球体境界を判定
  const relY = posY - params.domeCenterY;
  const dist = sqrt(posX * posX + relY * relY + posZ * posZ);
  const maxRadius = params.domeRadius * 0.95;

  if (dist > maxRadius) {
    // 内壁で反射
    const nx = posX / dist;
    const ny = relY / dist;
    const nz = posZ / dist;

    // 位置を境界内に戻す
    posX = nx * maxRadius;
    posY = ny * maxRadius + params.domeCenterY;
    posZ = nz * maxRadius;

    // 反射（減衰付き）
    const velDotN = velX * nx + velY * ny + velZ * nz;
    if (velDotN > 0.0) {
      const restitution = params.restitution;
      velX = (velX - 2.0 * velDotN * nx) * restitution;
      velY = (velY - 2.0 * velDotN * ny) * restitution;
      velZ = (velZ - 2.0 * velDotN * nz) * restitution;
    }
  }

  // 底面判定
  let onFloor = d.f32(0);
  if (posY < params.floorY) {
    posY = params.floorY;
    onFloor = d.f32(1);

    // 跳ね返り（弱め）
    if (velY < 0.0) {
      velY = abs(velY) * params.restitution * 0.5;
    }

    // 摩擦
    velX = velX * 0.9;
    velZ = velZ * 0.9;
  }

  // 底面で静止した雪片を上から再生成（ランダムな確率で）
  const totalSpeed = sqrt(velX * velX + velY * velY + velZ * velZ);
  if (onFloor > 0.5 && totalSpeed < 0.02) {
    // 時間ベースの確率で再生成（毎フレーム約5%の確率）
    const respawnChance = d.f32(idx) * 0.0001 + params.time * 10.0;
    const respawnRand = respawnChance - d.f32(d.i32(respawnChance));

    if (respawnRand < 0.05) {
      // 疑似ランダムで再生成位置を決定（idx と time を使用）
      const seed1 = d.f32(idx) * 0.1234 + params.time * 0.567;
      const seed2 = d.f32(idx) * 0.5678 + params.time * 0.123;
      const seed3 = d.f32(idx) * 0.9012 + params.time * 0.345;

      // 角度を計算
      const twoPi = d.f32(6.2832);
      const theta = (seed1 - d.f32(d.i32(seed1))) * twoPi;  // 水平角 [0, 2π]

      // 均一な円形分布のため、平方根を取る
      const randR = seed2 - d.f32(d.i32(seed2));  // [0, 1]
      const sqrtR = sqrt(randR);

      // 上部の高さ（ドームの上部60%〜90%の高さ）
      const randH = seed3 - d.f32(d.i32(seed3));  // [0, 1]
      const heightRatio = 0.5 + randH * 0.35;  // ドーム中心から50%〜85%の高さ
      const spawnY = params.domeCenterY + params.domeRadius * heightRatio;

      // その高さでの球体断面の半径を計算
      const relativeY = spawnY - params.domeCenterY;
      const maxRadiusAtHeight = sqrt(params.domeRadius * params.domeRadius * 0.9 - relativeY * relativeY);
      const safeRadius = maxRadiusAtHeight * 0.85;  // 安全マージン

      // 水平面での位置（均一分布）
      const r = sqrtR * safeRadius;
      posX = sin(theta) * r;
      posY = spawnY;
      posZ = cos(theta) * r;

      // 速度をリセット（少しだけ下向きの初速を与える）
      velX = d.f32(0);
      velY = d.f32(0) - 0.01;
      velZ = d.f32(0);
    }
  }

  // ===== 結果を書き戻し =====
  computeLayout.$.snowflakes[idx].position = d.vec3f(posX, posY, posZ);
  computeLayout.$.snowflakes[idx].velocity = d.vec3f(velX, velY, velZ);
});
