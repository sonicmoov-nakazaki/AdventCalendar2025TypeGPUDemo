// src/snowdome/math/matrix.ts
// wgpu-matrix を使用したシンプルなラッパー

import { mat4, Mat4 as WgpuMat4 } from 'wgpu-matrix';

export type Mat4 = WgpuMat4;
export type Vec3 = [number, number, number];
export type Mat4Tuple = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

// Float32Array を TypeGPU 用のタプルに変換
export function toMat4Tuple(m: Mat4): Mat4Tuple {
  return Array.from(m) as Mat4Tuple;
}

// 透視投影行列
export function perspective(
  fov: number,
  aspect: number,
  near: number,
  far: number
): Mat4 {
  return mat4.perspective(fov, aspect, near, far);
}

// ビュー行列（lookAt）
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  return mat4.lookAt(eye, target, up);
}

// 行列の乗算
export function multiply(a: Mat4, b: Mat4): Mat4 {
  return mat4.multiply(a, b);
}
