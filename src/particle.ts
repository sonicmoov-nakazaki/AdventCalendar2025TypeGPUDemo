import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { add, mul, fract, sin, dot, sub } from 'typegpu/std';

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

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}

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

  const Particle = d.struct({
    position: d.vec3f,
    velocity: d.vec3f,
    life: d.f32,
  });

  const PARTICLE_COUNT = 1000;
  const WORKGROUP_SIZE = 64;  // GPUに最適化された一般的なサイズ
  const ParticleArray = d.arrayOf(Particle, PARTICLE_COUNT);

  const initData = Array.from({ length: PARTICLE_COUNT }, () => ({
    position: d.vec3f(
      Math.random() * 10 - 5,
      Math.random() * 10 - 5,
      Math.random() * 10 - 5
    ),
    velocity: d.vec3f(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ),
    life: Math.random(),
  }));

  // storageとvertex両方で使用するため両方指定
  const particleBuffer = root.createBuffer(ParticleArray, initData).$usage('storage', 'vertex');

  const Params = d.struct({
    deltaTime: d.f32,
    gravity: d.vec3f,
    time: d.f32,  // 乱数シード用の時間
  });

  const paramsBuffer = root
    .createBuffer(Params, { deltaTime: 0.016, gravity: d.vec3f(0, -9.81, 0), time: 0 })
    .$usage('uniform');

  const layout = tgpu.bindGroupLayout({
    particles: { storage: ParticleArray, access: 'mutable' },
    params: { uniform: Params },
  });

  const bindGroup = root.createBindGroup(layout, {
    particles: particleBuffer,
    params: paramsBuffer,
  });

  const updateParticlesFn = computeFn({
    workgroupSize: [WORKGROUP_SIZE],
    in: {
      gid: d.builtin.globalInvocationId,
    },
  })((input) => {
    'use gpu';

    const idx = input.gid.x;

    // 範囲外チェック
    if (idx >= PARTICLE_COUNT) {
      return;
    }

    // 現在のパーティクルを取得
    const particle = layout.$.particles[idx];

    if (particle.life <= 0) {
      // ライフが0以下なら新規作成
      // 乱数シード: パーティクルインデックス + 時間で異なる値を生成
      // idx(u32)をf32に明示的に変換
      const idxF = d.f32(idx);
      const seedBase = idxF + layout.$.params.time * 1000;
      const r1 = random(d.vec2f(seedBase, seedBase * 0.1));
      const r2 = random(d.vec2f(seedBase * 0.2, seedBase * 0.3));
      const r3 = random(d.vec2f(seedBase * 0.4, seedBase * 0.5));
      const r4 = random(d.vec2f(seedBase * 0.6, seedBase * 0.7));
      const r5 = random(d.vec2f(seedBase * 0.8, seedBase * 0.9));
      const r6 = random(d.vec2f(seedBase * 1.1, seedBase * 1.2));

      // 各フィールドを個別に代入（オブジェクトリテラル直接代入は不可）
      layout.$.particles[idx].position = d.vec3f(
        r1 * 10 - 5,
        r2 * 10 - 5,
        r3 * 10 - 5
      );
      layout.$.particles[idx].velocity = d.vec3f(
        r4 - 0.5,
        r5 - 0.5,
        r6 - 0.5
      );
      layout.$.particles[idx].life = 1.0;
      return;
    }

    // 重力を速度に加算: velocity + gravity * deltaTime
    const newVelocity = add(
      particle.velocity,
      mul(layout.$.params.gravity, layout.$.params.deltaTime)
    );

    // 速度を位置に加算: position + velocity * deltaTime
    const newPosition = add(
      particle.position,
      mul(newVelocity, layout.$.params.deltaTime)
    );

    // ライフを減少
    const newLife = particle.life - layout.$.params.deltaTime;

    // 結果を書き戻し
    layout.$.particles[idx].position = newPosition;
    layout.$.particles[idx].velocity = newVelocity;
    layout.$.particles[idx].life = newLife;
  });

  // コンピュートパイプライン作成
  const computePipeline = root['~unstable']
    .withCompute(updateParticlesFn)
    .createPipeline();

  // dispatch時のワークグループ数（切り上げ）
  const workgroupCount = Math.ceil(PARTICLE_COUNT / WORKGROUP_SIZE);

  // 描画用レイアウト（パーティクルデータを読み取り専用で参照）
  const renderLayout = tgpu.bindGroupLayout({
    particles: { storage: ParticleArray },  // 読み取り専用
  });

  const renderBindGroup = root.createBindGroup(renderLayout, {
    particles: particleBuffer,
  });

  // パーティクルサイズ（NDC座標系での大きさ）
  const PARTICLE_SIZE = 0.002;

  // 頂点シェーダー: パーティクルをクワッド（四角形）として描画
  // 6頂点（2三角形）でクワッドを構成
  const particleVertexFn = vertexFn({
    in: {
      vertexIndex: d.builtin.vertexIndex,
      instanceIndex: d.builtin.instanceIndex,
    },
    out: {
      position: d.builtin.position,
      color: d.vec4f,
    },
  })((input) => {
    'use gpu';

    const particle = renderLayout.$.particles[input.instanceIndex];

    // クワッドの頂点オフセット（2三角形 = 6頂点）
    // 0: 左下, 1: 右下, 2: 左上, 3: 左上, 4: 右下, 5: 右上
    const vertexId = input.vertexIndex;

    // 各頂点のオフセットを計算（f32で明示的に初期化）
    let offsetX = d.f32(0);
    let offsetY = d.f32(0);

    const size = d.f32(PARTICLE_SIZE);
    const negSize = d.f32(-PARTICLE_SIZE);

    // 三角形1: 左下(0), 右下(1), 左上(2)
    // 三角形2: 左上(3), 右下(4), 右上(5)
    if (vertexId == 0) {
      offsetX = negSize;
      offsetY = negSize;
    }
    if (vertexId == 1 || vertexId == 4) {
      offsetX = size;
      offsetY = negSize;
    }
    if (vertexId == 2 || vertexId == 3) {
      offsetX = negSize;
      offsetY = size;
    }
    if (vertexId == 5) {
      offsetX = size;
      offsetY = size;
    }

    // パーティクルの位置を正規化デバイス座標に変換
    const scale = 0.1;
    const pos = d.vec4f(
      particle.position.x * scale + offsetX,
      particle.position.y * scale + offsetY,
      particle.position.z * scale,
      1.0
    );

    // ライフに応じた色（緑→赤へフェード）
    const color = d.vec4f(
      1.0 - particle.life,  // R: ライフが減ると赤く
      particle.life,        // G: ライフが多いと緑
      0.2,                  // B: 少し青
      particle.life         // A: ライフに応じて透明に
    );

    return { position: pos, color };
  }).$name('particleVertex');

  // フラグメントシェーダー
  const particleFragmentFn = fragmentFn({
    in: { color: d.vec4f },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    return input.color;
  }).$name('particleFragment');

  // レンダーパイプライン作成
  const renderPipeline = root['~unstable']
    .withVertex(particleVertexFn, {})
    .withFragment(particleFragmentFn, { format })
    .withPrimitive({ topology: 'triangle-list' })  // クワッド用に三角形リスト
    .createPipeline();

  // ===== アニメーションループ =====
  let lastTime = performance.now();
  let totalTime = 0;

  function animate() {
    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000;  // 秒に変換
    lastTime = now;
    totalTime += deltaTime;

    // パラメータ更新
    paramsBuffer.write({ deltaTime, gravity: d.vec3f(0, -9.81, 0), time: totalTime });

    // コンピュートシェーダー実行（パーティクル更新）
    computePipeline
      .with(bindGroup)
      .dispatchWorkgroups(workgroupCount);

    // レンダリング
    renderPipeline
      .withColorAttachment({
        view: context!.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      })
      .with(renderBindGroup)
      .draw(6, PARTICLE_COUNT);  // 6頂点（クワッド）× PARTICLE_COUNT インスタンス

    requestAnimationFrame(animate);
  }

  // アニメーション開始
  animate();
  console.log('Particle simulation started!');
}

main().catch(console.error);