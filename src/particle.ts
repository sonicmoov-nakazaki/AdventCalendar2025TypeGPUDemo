import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { add, mul, fract, sin, dot } from 'typegpu/std';

// unstable APIを取り出す（vertexFn, fragmentFnはまだstableではない）
const { vertexFn, fragmentFn, computeFn } = tgpu['~unstable'];

// GPU用擬似乱数関数（hash関数ベース）
// seedを元に0〜1の疑似乱数を返す
const random = tgpu['~unstable'].fn([d.vec2f], d.f32)((seed) => {
  'use gpu';
  return fract(sin(dot(seed, d.vec2f(12.9898, 78.233))) * 43758.5453);
});

// DOM要素
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const errorEl = document.getElementById('error')!;

// UI要素
const particleCountInput = document.getElementById('particleCount') as HTMLInputElement;
const particleSizeInput = document.getElementById('particleSize') as HTMLInputElement;
const gravityYInput = document.getElementById('gravityY') as HTMLInputElement;
const gravityXInput = document.getElementById('gravityX') as HTMLInputElement;
const dragInput = document.getElementById('drag') as HTMLInputElement;
const lifeDecayInput = document.getElementById('lifeDecay') as HTMLInputElement;
const spawnRangeInput = document.getElementById('spawnRange') as HTMLInputElement;
const initialVelocityInput = document.getElementById('initialVelocity') as HTMLInputElement;
const colorStartInput = document.getElementById('colorStart') as HTMLInputElement;
const colorEndInput = document.getElementById('colorEnd') as HTMLInputElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;

// 値表示要素
const particleCountValue = document.getElementById('particleCountValue')!;
const particleSizeValue = document.getElementById('particleSizeValue')!;
const gravityYValue = document.getElementById('gravityYValue')!;
const gravityXValue = document.getElementById('gravityXValue')!;
const dragValue = document.getElementById('dragValue')!;
const lifeDecayValue = document.getElementById('lifeDecayValue')!;
const spawnRangeValue = document.getElementById('spawnRangeValue')!;
const initialVelocityValue = document.getElementById('initialVelocityValue')!;

// デフォルト値
const DEFAULTS = {
  particleCount: 20000,
  particleSize: 0.002,
  gravityX: 0,
  gravityY: -9.81,
  drag: 0,
  lifeDecay: 1.0,
  spawnRange: 5,
  initialVelocity: 0.5,
  colorStart: '#00ff00',
  colorEnd: '#ff0000',
};

// 現在のパラメータ
let params = { ...DEFAULTS };

// 色をRGBに変換
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 1, b: 0 };
}

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

// UI値の更新
function updateValueDisplays() {
  particleCountValue.textContent = params.particleCount.toString();
  particleSizeValue.textContent = params.particleSize.toFixed(3);
  gravityYValue.textContent = params.gravityY.toFixed(1);
  gravityXValue.textContent = params.gravityX.toFixed(1);
  dragValue.textContent = params.drag.toFixed(1);
  lifeDecayValue.textContent = params.lifeDecay.toFixed(1);
  spawnRangeValue.textContent = params.spawnRange.toFixed(1);
  initialVelocityValue.textContent = params.initialVelocity.toFixed(1);
}

// UIから値を読み取る
function readParamsFromUI() {
  params.particleCount = parseInt(particleCountInput.value);
  params.particleSize = parseFloat(particleSizeInput.value);
  params.gravityX = parseFloat(gravityXInput.value);
  params.gravityY = parseFloat(gravityYInput.value);
  params.drag = parseFloat(dragInput.value);
  params.lifeDecay = parseFloat(lifeDecayInput.value);
  params.spawnRange = parseFloat(spawnRangeInput.value);
  params.initialVelocity = parseFloat(initialVelocityInput.value);
  params.colorStart = colorStartInput.value;
  params.colorEnd = colorEndInput.value;
  updateValueDisplays();
}

// UIをデフォルト値にリセット
function resetUI() {
  particleCountInput.value = DEFAULTS.particleCount.toString();
  particleSizeInput.value = DEFAULTS.particleSize.toString();
  gravityXInput.value = DEFAULTS.gravityX.toString();
  gravityYInput.value = DEFAULTS.gravityY.toString();
  dragInput.value = DEFAULTS.drag.toString();
  lifeDecayInput.value = DEFAULTS.lifeDecay.toString();
  spawnRangeInput.value = DEFAULTS.spawnRange.toString();
  initialVelocityInput.value = DEFAULTS.initialVelocity.toString();
  colorStartInput.value = DEFAULTS.colorStart;
  colorEndInput.value = DEFAULTS.colorEnd;
  params = { ...DEFAULTS };
  updateValueDisplays();
}

const WORKGROUP_SIZE = 64;

// シミュレーション状態を管理するクラス
class ParticleSimulation {
  private root: TgpuRoot;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private animationId: number | null = null;
  private lastTime = performance.now();
  private totalTime = 0;

  // GPU リソース (動的に型が変わるためanyを使用)
  private particleBuffer: any = null;
  private paramsBuffer: any = null;
  private computePipeline: any = null;
  private renderPipeline: any = null;
  private bindGroup: any = null;
  private renderBindGroup: any = null;
  private workgroupCount = 0;
  private currentParticleCount = 0;

  constructor(root: TgpuRoot, context: GPUCanvasContext, format: GPUTextureFormat) {
    this.root = root;
    this.context = context;
    this.format = format;
  }

  init(particleCount: number) {
    // 既存のアニメーションを停止
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.currentParticleCount = particleCount;
    this.workgroupCount = Math.ceil(particleCount / WORKGROUP_SIZE);

    const Particle = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
      life: d.f32,
    });

    const ParticleArray = d.arrayOf(Particle, particleCount);

    // 初期データ生成
    const initData = Array.from({ length: particleCount }, () => ({
      position: d.vec3f(
        Math.random() * params.spawnRange * 2 - params.spawnRange,
        Math.random() * params.spawnRange * 2 - params.spawnRange,
        Math.random() * params.spawnRange * 2 - params.spawnRange
      ),
      velocity: d.vec3f(
        (Math.random() - 0.5) * params.initialVelocity * 2,
        (Math.random() - 0.5) * params.initialVelocity * 2,
        (Math.random() - 0.5) * params.initialVelocity * 2
      ),
      life: Math.random(),
    }));

    // バッファ作成
    this.particleBuffer = this.root
      .createBuffer(ParticleArray, initData)
      .$usage('storage', 'vertex');

    const Params = d.struct({
      deltaTime: d.f32,
      gravity: d.vec3f,
      time: d.f32,
      drag: d.f32,
      lifeDecay: d.f32,
      spawnRange: d.f32,
      initialVelocity: d.f32,
      colorStart: d.vec3f,
      colorEnd: d.vec3f,
      particleSize: d.f32,
    });

    this.paramsBuffer = this.root
      .createBuffer(Params, {
        deltaTime: 0.016,
        gravity: d.vec3f(params.gravityX, params.gravityY, 0),
        time: 0,
        drag: params.drag,
        lifeDecay: params.lifeDecay,
        spawnRange: params.spawnRange,
        initialVelocity: params.initialVelocity,
        colorStart: d.vec3f(hexToRgb(params.colorStart).r, hexToRgb(params.colorStart).g, hexToRgb(params.colorStart).b),
        colorEnd: d.vec3f(hexToRgb(params.colorEnd).r, hexToRgb(params.colorEnd).g, hexToRgb(params.colorEnd).b),
        particleSize: params.particleSize,
      })
      .$usage('uniform');

    // レイアウト定義
    const layout = tgpu.bindGroupLayout({
      particles: { storage: ParticleArray, access: 'mutable' },
      params: { uniform: Params },
    });

    this.bindGroup = this.root.createBindGroup(layout, {
      particles: this.particleBuffer,
      params: this.paramsBuffer,
    });

    // コンピュートシェーダー
    const updateParticlesFn = computeFn({
      workgroupSize: [WORKGROUP_SIZE],
      in: {
        gid: d.builtin.globalInvocationId,
      },
    })((input) => {
      'use gpu';

      const idx = input.gid.x;
      const count = d.u32(particleCount);

      if (idx >= count) {
        return;
      }

      const particle = layout.$.particles[idx];
      const p = layout.$.params;

      if (particle.life <= 0) {
        // 各乱数に異なるシードを使用して相関を排除
        const idxF = d.f32(idx);
        const time = p.time;
        // 黄金比を使って各シードを十分に分散させる
        const phi = 1.618033988749;
        const r1 = random(d.vec2f(idxF * phi, time * 17.13));
        const r2 = random(d.vec2f(idxF * phi * 2.0, time * 31.71));
        const r3 = random(d.vec2f(idxF * phi * 3.0, time * 47.29));
        const r4 = random(d.vec2f(idxF * phi * 5.0, time * 67.83));
        const r5 = random(d.vec2f(idxF * phi * 7.0, time * 89.57));
        const r6 = random(d.vec2f(idxF * phi * 11.0, time * 113.19));

        const range = p.spawnRange;
        const vel = p.initialVelocity;

        layout.$.particles[idx].position = d.vec3f(
          r1 * range * 2 - range,
          r2 * range * 2 - range,
          r3 * range * 2 - range
        );
        layout.$.particles[idx].velocity = d.vec3f(
          (r4 - 0.5) * vel * 2,
          (r5 - 0.5) * vel * 2,
          (r6 - 0.5) * vel * 2
        );
        layout.$.particles[idx].life = 1.0;
        return;
      }

      // ドラッグ（空気抵抗）を適用
      const dragFactor = 1.0 - p.drag * p.deltaTime;
      const draggedVelocity = mul(particle.velocity, dragFactor);

      // 重力を速度に加算
      const newVelocity = add(draggedVelocity, mul(p.gravity, p.deltaTime));

      // 速度を位置に加算
      const newPosition = add(particle.position, mul(newVelocity, p.deltaTime));

      // ライフを減少（lifeDecayで速度調整）
      const newLife = particle.life - p.deltaTime * p.lifeDecay;

      layout.$.particles[idx].position = newPosition;
      layout.$.particles[idx].velocity = newVelocity;
      layout.$.particles[idx].life = newLife;
    });

    this.computePipeline = this.root['~unstable']
      .withCompute(updateParticlesFn)
      .createPipeline();

    // 描画用レイアウト
    const renderLayout = tgpu.bindGroupLayout({
      particles: { storage: ParticleArray },
      params: { uniform: Params },
    });

    this.renderBindGroup = this.root.createBindGroup(renderLayout, {
      particles: this.particleBuffer,
      params: this.paramsBuffer,
    });

    // 頂点シェーダー
    const particleVertexFn = vertexFn({
      in: {
        vertexIndex: d.builtin.vertexIndex,
        instanceIndex: d.builtin.instanceIndex,
      },
      out: {
        position: d.builtin.position,
        color: d.vec4f,
        uv: d.vec2f, // UV座標を追加（円形マスク用）
      },
    })((input) => {
      'use gpu';

      const particle = renderLayout.$.particles[input.instanceIndex];
      const p = renderLayout.$.params;
      const vertexId = input.vertexIndex;

      let offsetX = d.f32(0);
      let offsetY = d.f32(0);
      let uvX = d.f32(0);
      let uvY = d.f32(0);

      const size = p.particleSize;
      const negSize = -p.particleSize;

      // 頂点ごとにオフセットとUV座標を設定
      // UV: (0,0)が左下、(1,1)が右上
      if (vertexId == 0) {
        offsetX = negSize;
        offsetY = negSize;
        uvX = 0.0;
        uvY = 0.0;
      }
      if (vertexId == 1 || vertexId == 4) {
        offsetX = size;
        offsetY = negSize;
        uvX = 1.0;
        uvY = 0.0;
      }
      if (vertexId == 2 || vertexId == 3) {
        offsetX = negSize;
        offsetY = size;
        uvX = 0.0;
        uvY = 1.0;
      }
      if (vertexId == 5) {
        offsetX = size;
        offsetY = size;
        uvX = 1.0;
        uvY = 1.0;
      }

      const scale = 0.1;
      const pos = d.vec4f(
        particle.position.x * scale + offsetX,
        particle.position.y * scale + offsetY,
        particle.position.z * scale,
        1.0
      );

      // ライフに応じた色補間（colorStart → colorEnd）
      const t = 1.0 - particle.life;
      const colorR = p.colorStart.x + (p.colorEnd.x - p.colorStart.x) * t;
      const colorG = p.colorStart.y + (p.colorEnd.y - p.colorStart.y) * t;
      const colorB = p.colorStart.z + (p.colorEnd.z - p.colorStart.z) * t;

      const color = d.vec4f(colorR, colorG, colorB, particle.life);
      const uv = d.vec2f(uvX, uvY);

      return { position: pos, color, uv };
    }).$name('particleVertex');

    // フラグメントシェーダー（円形マスク適用）
    const particleFragmentFn = fragmentFn({
      in: { color: d.vec4f, uv: d.vec2f },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      // UVを中心(0.5, 0.5)からの距離に変換
      const center = d.vec2f(0.5, 0.5);
      const diff = d.vec2f(input.uv.x - center.x, input.uv.y - center.y);
      const dist = diff.x * diff.x + diff.y * diff.y;

      // 半径0.5の円の外側は透明に（0.25 = 0.5^2）
      if (dist > 0.25) {
        return d.vec4f(0, 0, 0, 0);
      }

      // エッジをソフトにするためのスムーズなフォールオフ
      const softness = 0.05;
      const edgeDist = 0.25 - dist;
      const alpha = input.color.w;

      let softAlpha = alpha;
      if (edgeDist < softness) {
        softAlpha = alpha * (edgeDist / softness);
      }

      return d.vec4f(input.color.x, input.color.y, input.color.z, softAlpha);
    }).$name('particleFragment');

    this.renderPipeline = this.root['~unstable']
      .withVertex(particleVertexFn, {})
      .withFragment(particleFragmentFn, { format: this.format })
      .withPrimitive({ topology: 'triangle-list' })
      .createPipeline();

    // アニメーション開始
    this.lastTime = performance.now();
    this.totalTime = 0;
    this.animate();
  }


  private animate = () => {
    const now = performance.now();
    const deltaTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.totalTime += deltaTime;

    const colorStart = hexToRgb(params.colorStart);
    const colorEnd = hexToRgb(params.colorEnd);

    // パラメータ更新
    this.paramsBuffer!.write({
      deltaTime,
      gravity: d.vec3f(params.gravityX, params.gravityY, 0),
      time: this.totalTime,
      drag: params.drag,
      lifeDecay: params.lifeDecay,
      spawnRange: params.spawnRange,
      initialVelocity: params.initialVelocity,
      colorStart: d.vec3f(colorStart.r, colorStart.g, colorStart.b),
      colorEnd: d.vec3f(colorEnd.r, colorEnd.g, colorEnd.b),
      particleSize: params.particleSize,
    });

    // コンピュートシェーダー実行
    this.computePipeline
      .with(this.bindGroup)
      .dispatchWorkgroups(this.workgroupCount);

    // レンダリング
    this.renderPipeline
      .withColorAttachment({
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      })
      .with(this.renderBindGroup)
      .draw(6, this.currentParticleCount);

    this.animationId = requestAnimationFrame(this.animate);
  };

  restart() {
    this.init(params.particleCount);
  }
}

let simulation: ParticleSimulation | null = null;

async function main() {
  // WebGPU対応チェック
  if (!navigator.gpu) {
    showError(
      'WebGPUがサポートされていません。Chrome 113以降またはEdge 113以降をお使いください。'
    );
    return;
  }

  const root = await tgpu.init();

  // キャンバス設定
  const context = canvas.getContext('webgpu');
  if (!context) {
    showError('WebGPUコンテキストを取得できませんでした。');
    return;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: root.device,
    format,
    alphaMode: 'premultiplied',
  });

  // シミュレーション初期化
  simulation = new ParticleSimulation(root, context, format);
  readParamsFromUI();
  simulation.init(params.particleCount);

  console.log('Particle simulation started!');
}

// イベントリスナー設定

// パーティクル数変更時は再初期化が必要
particleCountInput.addEventListener('change', () => {
  readParamsFromUI();
  simulation?.restart();
});

// その他のパラメータはリアルタイム更新
const realtimeInputs = [
  particleSizeInput,
  gravityYInput,
  gravityXInput,
  dragInput,
  lifeDecayInput,
  spawnRangeInput,
  initialVelocityInput,
  colorStartInput,
  colorEndInput,
];

realtimeInputs.forEach((input) => {
  input.addEventListener('input', () => {
    readParamsFromUI();
  });
});

// リセットボタン
resetBtn.addEventListener('click', () => {
  resetUI();
  simulation?.restart();
});

main().catch(console.error);
