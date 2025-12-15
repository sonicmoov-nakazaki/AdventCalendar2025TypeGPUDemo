// src/snowdome/shaders/vertex.ts
// 共通頂点シェーダー

import tgpu, { type TgpuBindGroupLayout } from 'typegpu';
import * as d from 'typegpu/data';
import { mul } from 'typegpu/std';

const { vertexFn } = tgpu['~unstable'];

// Camera 型定義
const Camera = d.struct({
  viewProjMatrix: d.mat4x4f,
  viewMatrix: d.mat4x4f,
  position: d.vec3f,
  _padding: d.f32,
});

// Lighting 型定義
const Lighting = d.struct({
  lightPos: d.vec3f,
  lightIntensity: d.f32,
  lightColor: d.vec3f,
  ambientIntensity: d.f32,
  rimColor: d.vec3f,
  rimPower: d.f32,
});

// バインドグループレイアウトの型
type RenderLayout = TgpuBindGroupLayout<{
  camera: { uniform: typeof Camera };
  lighting: { uniform: typeof Lighting };
}>;

/**
 * 共通の頂点シェーダーを作成
 */
export function createCommonVertexFn(renderLayout: RenderLayout) {
  return vertexFn({
    in: { position: d.vec3f, normal: d.vec3f },
    out: { position: d.builtin.position, worldPos: d.vec3f, normal: d.vec3f },
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const worldPos = d.vec4f(input.position, 1.0);
    const clipPos = mul(camera.viewProjMatrix, worldPos);

    return {
      position: clipPos,
      worldPos: input.position,
      normal: input.normal,
    };
  }).$name('commonVertex');
}


/**
 * 地面用の頂点シェーダーを作成（UV座標付き）
 */
export function createGroundVertexFn(renderLayout: RenderLayout) {
  return vertexFn({
    in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f },
    out: { position: d.builtin.position, worldPos: d.vec3f, normal: d.vec3f, uv: d.vec2f },
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const worldPos = d.vec4f(input.position, 1.0);
    const clipPos = mul(camera.viewProjMatrix, worldPos);

    return {
      position: clipPos,
      worldPos: input.position,
      normal: input.normal,
      uv: input.uv,
    };
  }).$name('groundVertex');
}

// 型をエクスポート
export { Camera, Lighting };
export type { RenderLayout };
