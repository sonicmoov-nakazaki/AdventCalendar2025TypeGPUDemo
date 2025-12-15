// src/snowdome/types.ts

import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// カメラデータ
export const Camera = d.struct({
  viewProjMatrix: d.mat4x4f,
  position: d.vec3f,
  _padding: d.f32,
});

// バインドグループレイアウト
export const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
});
