// src/snowdome/shaders/materials.ts
// 各オブジェクトのマテリアル（フラグメントシェーダー）

import tgpu, { type TgpuBindGroupLayout } from 'typegpu';
import * as d from 'typegpu/data';
import { dot, normalize, max, pow, sub, add, reflect, textureSample, fract, sin, clamp, min } from 'typegpu/std';
import { sampleEnvironmentFn } from './common';

const { fragmentFn } = tgpu['~unstable'];

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

// 地面テクスチャ用バインドグループレイアウトの型（anyで柔軟に）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GroundTextureLayout = TgpuBindGroupLayout<any>;

/**
 * ドーム用フラグメントシェーダー（透明感のあるクリーンなガラス）
 */
export function createDomeFragmentFn(renderLayout: RenderLayout) {
  return fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const lighting = renderLayout.$.lighting;

    const normal = normalize(input.normal);
    const viewDir = normalize(sub(camera.position, input.worldPos));
    const cosTheta = max(dot(viewDir, normal), 0.0);

    // === フレネル（シンプル） ===
    const f0 = 0.04; // ガラスの基本反射率
    const fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

    // === 環境反射（控えめ） ===
    const negViewDir = d.vec3f(0.0 - viewDir.x, 0.0 - viewDir.y, 0.0 - viewDir.z);
    const reflectDir = reflect(negViewDir, normal);
    const envColor = sampleEnvironmentFn(reflectDir);

    // === スペキュラ（シャープな1点ハイライト） ===
    const lightDir = normalize(lighting.lightPos);
    const halfDir = normalize(add(lightDir, viewDir));
    const NdotH = max(dot(normal, halfDir), 0.0);
    // 鋭いハイライト
    const specular = pow(NdotH, 256.0) * 1.5;

    // === リムライト（くっきりした白い縁） ===
    // 参考画像のような、縁だけがはっきり白く光る効果
    const rimBase = 1.0 - cosTheta;
    // シャープなリム（縁のみ）
    const rimSharp = pow(rimBase, 4.0);
    // 強度調整
    const rim = rimSharp * 0.8;

    // === 最終合成 ===
    // 環境反射は控えめに（フレネルで縁だけ）
    const envStr = fresnel * 0.3;
    let finalR = envColor.x * envStr;
    let finalG = envColor.y * envStr;
    let finalB = envColor.z * envStr;

    // スペキュラハイライト（白）
    finalR = finalR + specular;
    finalG = finalG + specular;
    finalB = finalB + specular;

    // リムライト（白、縁のみ）
    finalR = finalR + rim;
    finalG = finalG + rim;
    finalB = finalB + rim;

    // === 透明度 ===
    // 基本は非常に透明、縁とハイライト部分のみ見える
    const alpha = fresnel * 0.15 + rim * 0.6 + specular * 0.8;

    return d.vec4f(
      min(finalR, 1.0),
      min(finalG, 1.0),
      min(finalB, 1.0),
      clamp(alpha, 0.0, 0.7)
    );
  }).$name('domeFragment');
}

/**
 * 土台用フラグメントシェーダー（自然な木目 + ニス風光沢）
 */
export function createPedestalFragmentFn(renderLayout: RenderLayout) {
  return fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const lighting = renderLayout.$.lighting;

    const normal = normalize(input.normal);
    const viewDir = normalize(sub(camera.position, input.worldPos));
    const lightDir = normalize(lighting.lightPos);

    // 角度ベースの木目（円柱に沿った縦線）
    const angle = input.worldPos.x * 12.0 + input.worldPos.z * 8.0;
    const grainBase = sin(angle) * 0.5 + 0.5;

    // 高さ方向の微妙な変化
    const heightVar = sin(input.worldPos.y * 25.0 + angle * 0.5) * 0.15 + 0.85;

    // 細かいノイズ（木の繊維感）
    const noiseInput = input.worldPos.x * 80.0 + input.worldPos.y * 120.0 + input.worldPos.z * 60.0;
    const fineNoise = fract(sin(noiseInput) * 43758.5453) * 0.1;

    // 木の基本色（マホガニー風の深い茶色）
    const baseWood = d.vec3f(0.35, 0.2, 0.12);
    const darkAccent = d.vec3f(0.28, 0.15, 0.08);

    // 木目による微妙な色変化（控えめに）
    const grainFactor = grainBase * 0.3 + heightVar * 0.5 + fineNoise + 0.2;
    const baseColorR = darkAccent.x + (baseWood.x - darkAccent.x) * grainFactor;
    const baseColorG = darkAccent.y + (baseWood.y - darkAccent.y) * grainFactor;
    const baseColorB = darkAccent.z + (baseWood.z - darkAccent.z) * grainFactor;

    // Diffuse（拡散反射）
    const diffuse = max(dot(normal, lightDir), 0.0);

    // Specular（鏡面反射）- ニス塗り風の光沢
    const halfDir = normalize(add(lightDir, viewDir));
    const specular = pow(max(dot(normal, halfDir), 0.0), 64.0);

    // フレネル効果（縁が少し光る）
    const fresnelBase = 1.0 - max(dot(viewDir, normal), 0.0);
    const fresnel = pow(fresnelBase, 5.0) * 0.15;

    // 環境光
    const ambient = lighting.ambientIntensity;

    // 最終色（木目 + ライティング + ニス光沢）
    const lightingFactor = ambient + diffuse * lighting.lightIntensity;
    const r = baseColorR * lightingFactor + specular * 0.2 + fresnel * 0.08;
    const g = baseColorG * lightingFactor + specular * 0.15 + fresnel * 0.06;
    const b = baseColorB * lightingFactor + specular * 0.1 + fresnel * 0.04;

    return d.vec4f(r, g, b, 1.0);
  }).$name('pedestalFragment');
}

/**
 * 雪の床用フラグメントシェーダー（白い雪）
 */
export function createSnowFloorFragmentFn(renderLayout: RenderLayout) {
  return fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const lighting = renderLayout.$.lighting;

    const normal = normalize(input.normal);
    const viewDir = normalize(sub(camera.position, input.worldPos));
    const lightDir = normalize(lighting.lightPos);

    // Diffuse（拡散反射）
    const diffuse = max(dot(normal, lightDir), 0.0);

    // Specular（鏡面反射）- 雪はあまり光沢がない
    const halfDir = normalize(add(lightDir, viewDir));
    const specular = pow(max(dot(normal, halfDir), 0.0), 8.0);

    // 雪の色（わずかに青みがかった白）
    const baseColor = d.vec3f(0.95, 0.97, 1.0);

    // 環境光
    const ambient = lighting.ambientIntensity;

    // 最終色
    const r = baseColor.x * (ambient + diffuse * lighting.lightIntensity) + specular * 0.1;
    const g = baseColor.y * (ambient + diffuse * lighting.lightIntensity) + specular * 0.1;
    const b = baseColor.z * (ambient + diffuse * lighting.lightIntensity) + specular * 0.1;

    return d.vec4f(r, g, b, 1.0);
  }).$name('snowFloorFragment');
}

/**
 * 幹用フラグメントシェーダー（茶色）
 */
export function createTrunkFragmentFn(renderLayout: RenderLayout) {
  return fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const lighting = renderLayout.$.lighting;

    const normal = normalize(input.normal);
    const viewDir = normalize(sub(camera.position, input.worldPos));
    const lightDir = normalize(lighting.lightPos);

    const diffuse = max(dot(normal, lightDir), 0.0);
    const halfDir = normalize(add(lightDir, viewDir));
    const specular = pow(max(dot(normal, halfDir), 0.0), 16.0);

    // 木の幹の色（茶色）
    const baseColor = d.vec3f(0.4, 0.25, 0.1);

    const ambient = lighting.ambientIntensity;
    const r = baseColor.x * (ambient + diffuse * lighting.lightIntensity) + specular * 0.05;
    const g = baseColor.y * (ambient + diffuse * lighting.lightIntensity) + specular * 0.05;
    const b = baseColor.z * (ambient + diffuse * lighting.lightIntensity) + specular * 0.05;

    return d.vec4f(r, g, b, 1.0);
  }).$name('trunkFragment');
}

/**
 * 葉用フラグメントシェーダー（針葉樹風、グラデーション + 透過光 + 霜）
 */
export function createLeavesFragmentFn(renderLayout: RenderLayout) {
  return fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const lighting = renderLayout.$.lighting;

    const normal = normalize(input.normal);
    const viewDir = normalize(sub(camera.position, input.worldPos));
    const lightDir = normalize(lighting.lightPos);

    // 高さベースのグラデーション（0.0〜0.8の範囲を0〜1に正規化）
    const heightFactor = clamp((input.worldPos.y + 0.15) / 0.65, 0.0, 1.0);

    // 下段: 濃い緑、上段: 明るい緑
    const darkGreen = d.vec3f(0.05, 0.25, 0.08);
    const lightGreen = d.vec3f(0.15, 0.5, 0.2);
    const baseColorR = darkGreen.x + (lightGreen.x - darkGreen.x) * heightFactor;
    const baseColorG = darkGreen.y + (lightGreen.y - darkGreen.y) * heightFactor;
    const baseColorB = darkGreen.z + (lightGreen.z - darkGreen.z) * heightFactor;

    // 基本ライティング
    const diffuse = max(dot(normal, lightDir), 0.0);
    const halfDir = normalize(add(lightDir, viewDir));
    const specular = pow(max(dot(normal, halfDir), 0.0), 32.0);

    // サブサーフェス風透過光（光の裏側が少し明るくなる）
    const backLight = max(dot(normal, d.vec3f(0.0 - lightDir.x, 0.0 - lightDir.y, 0.0 - lightDir.z)), 0.0);
    const subsurface = pow(backLight, 2.0) * 0.3;

    // 霜のキラキラ効果（ノイズベース）
    const noiseInput = input.worldPos.x * 50.0 + input.worldPos.y * 73.0 + input.worldPos.z * 91.0;
    const noise = fract(sin(noiseInput) * 43758.5453);
    const frostSparkle = pow(noise, 8.0) * specular * 2.0;

    // リムライト（縁の霜が光る）
    const rimDot = 1.0 - max(dot(viewDir, normal), 0.0);
    const rim = pow(rimDot, 3.0) * 0.15;

    // 環境光
    const ambient = lighting.ambientIntensity;

    // 最終色の計算
    const lightingFactor = ambient + diffuse * lighting.lightIntensity + subsurface;
    const r = baseColorR * lightingFactor + specular * 0.1 + frostSparkle * 0.8 + rim * 0.5;
    const g = baseColorG * lightingFactor + specular * 0.1 + frostSparkle * 0.9 + rim * 0.6;
    const b = baseColorB * lightingFactor + specular * 0.1 + frostSparkle * 1.0 + rim * 0.8;

    return d.vec4f(r, g, b, 1.0);
  }).$name('leavesFragment');
}

/**
 * 星用フラグメントシェーダー（金色、メタリック光沢 + キラキラ）
 */
export function createStarFragmentFn(renderLayout: RenderLayout) {
  return fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f },
    out: d.vec4f,
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const lighting = renderLayout.$.lighting;

    const normal = normalize(input.normal);
    const viewDir = normalize(sub(camera.position, input.worldPos));
    const lightDir = normalize(lighting.lightPos);

    // 基本のディフューズ
    const diffuse = max(dot(normal, lightDir), 0.0);

    // 強いスペキュラー（金属光沢）
    const halfDir = normalize(add(lightDir, viewDir));
    const specularBase = pow(max(dot(normal, halfDir), 0.0), 128.0);

    // フレネル効果（エッジがより光る）
    const fresnelBase = 1.0 - max(dot(viewDir, normal), 0.0);
    const fresnel = pow(fresnelBase, 3.0) * 0.4;

    // キラキラ効果（ノイズベース）
    const noiseInput = input.worldPos.x * 200.0 + input.worldPos.y * 317.0 + input.worldPos.z * 419.0;
    const noise = fract(sin(noiseInput) * 43758.5453);
    const sparkle = pow(noise, 12.0) * specularBase * 3.0;

    // 金色（より鮮やかに）
    const baseColor = d.vec3f(1.0, 0.82, 0.15);
    const highlightColor = d.vec3f(1.0, 0.95, 0.7);  // ハイライトは明るい金

    // ライティング計算
    const ambient = lighting.ambientIntensity;
    const lightingFactor = ambient + diffuse * lighting.lightIntensity;

    // 金属的な反射（スペキュラーに金色を載せる）
    const specular = specularBase + sparkle;
    const r = baseColor.x * lightingFactor + highlightColor.x * specular * 0.9 + fresnel * 0.3;
    const g = baseColor.y * lightingFactor + highlightColor.y * specular * 0.7 + fresnel * 0.25;
    const b = baseColor.z * lightingFactor + highlightColor.z * specular * 0.3 + fresnel * 0.1;

    return d.vec4f(r, g, b, 1.0);
  }).$name('starFragment');
}

/**
 * 地面用フラグメントシェーダー（木のテーブル風 + テクスチャ + 影）
 */
export function createGroundFragmentFn(
  renderLayout: RenderLayout,
  groundTextureLayout: GroundTextureLayout
) {
  return fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f, uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    'use gpu';

    const camera = renderLayout.$.camera;
    const lighting = renderLayout.$.lighting;

    const normal = normalize(input.normal);
    const viewDir = normalize(sub(camera.position, input.worldPos));
    const lightDir = normalize(lighting.lightPos);

    // Diffuse（拡散反射）
    const diffuse = max(dot(normal, lightDir), 0.0);

    // Specular（鏡面反射）- 少し光沢のある木
    const halfDir = normalize(add(lightDir, viewDir));
    const specular = pow(max(dot(normal, halfDir), 0.0), 32.0);

    // テクスチャからサンプリング
    const texColor = textureSample(
      groundTextureLayout.$.groundTexture,
      groundTextureLayout.$.groundSampler,
      input.uv
    );

    // テクスチャカラーを使用
    const baseColor = d.vec3f(texColor.x, texColor.y, texColor.z);

    // 環境光
    const ambient = lighting.ambientIntensity;

    // ===== スノードームの影 =====
    // 土台の位置と半径（CONFIG値をハードコード、f32として明示）
    const pedestalCenterX = d.f32(0.0);
    const pedestalCenterZ = d.f32(0.0);
    const pedestalBottomRadius = d.f32(0.65);
    const pedestalTopY = -0.15;
    const groundY = -0.5;

    // ライト位置から影のオフセットを計算
    // ライトが高い位置にあるので、影は土台の下に少しずれる
    const lightHeight = lighting.lightPos.y - pedestalTopY;
    const objectHeight = pedestalTopY - groundY;
    const shadowScale = objectHeight / lightHeight;

    // 影の中心位置（ライト方向と反対にオフセット）
    const shadowOffsetX = 0.0 - lighting.lightPos.x * shadowScale * 0.3;
    const shadowOffsetZ = 0.0 - lighting.lightPos.z * shadowScale * 0.3;
    const shadowCenterX = pedestalCenterX + shadowOffsetX;
    const shadowCenterZ = pedestalCenterZ + shadowOffsetZ;

    // 影の半径（土台より少し大きく、距離によって拡大）
    const shadowRadius = pedestalBottomRadius * (1.0 + shadowScale * 0.2);

    // フラグメントから影の中心までの距離
    const dx = input.worldPos.x - shadowCenterX;
    const dz = input.worldPos.z - shadowCenterZ;
    const distFromShadowCenter = pow(dx * dx + dz * dz, 0.5);

    // 影の強度（中心が濃く、エッジでフェードアウト）
    // smoothstep風の計算
    const shadowEdge = shadowRadius * 0.85;
    const shadowOuter = shadowRadius * 1.1;
    const shadowT = clamp((distFromShadowCenter - shadowEdge) / (shadowOuter - shadowEdge), 0.0, 1.0);
    const shadowFade = shadowT * shadowT * (3.0 - 2.0 * shadowT);  // smoothstep
    const shadowIntensity = (1.0 - shadowFade) * 0.45;  // 最大45%の影

    // 土台の真下（円形の濃い影）
    const distFromPedestal = pow(
      (input.worldPos.x - pedestalCenterX) * (input.worldPos.x - pedestalCenterX) +
      (input.worldPos.z - pedestalCenterZ) * (input.worldPos.z - pedestalCenterZ),
      0.5
    );
    const pedestalShadowT = clamp((distFromPedestal - pedestalBottomRadius * 0.9) / (pedestalBottomRadius * 0.2), 0.0, 1.0);
    const pedestalShadowFade = pedestalShadowT * pedestalShadowT * (3.0 - 2.0 * pedestalShadowT);
    const pedestalShadow = (1.0 - pedestalShadowFade) * 0.3;

    // 影を合成（最大値を取る）
    const totalShadow = max(shadowIntensity, pedestalShadow);

    // 最終色（影を適用）
    const lightingFactor = ambient + diffuse * lighting.lightIntensity * (1.0 - totalShadow * 0.7);
    const shadowDarken = 1.0 - totalShadow * 0.5;

    const r = baseColor.x * lightingFactor * shadowDarken + specular * 0.15 * (1.0 - totalShadow);
    const g = baseColor.y * lightingFactor * shadowDarken + specular * 0.15 * (1.0 - totalShadow);
    const b = baseColor.z * lightingFactor * shadowDarken + specular * 0.15 * (1.0 - totalShadow);

    return d.vec4f(r, g, b, 1.0);
  }).$name('groundFragment');
}
