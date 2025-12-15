// src/snowdome/index.ts

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { createCommonVertexFn, createGroundVertexFn, Camera, Lighting } from './shaders/vertex';
import {
  createDomeFragmentFn,
  createPedestalFragmentFn,
  createSnowFloorFragmentFn,
  createTrunkFragmentFn,
  createLeavesFragmentFn,
  createStarFragmentFn,
  createGroundFragmentFn,
} from './shaders/materials';
import {
  SnowflakeArray,
  snowflakeRenderLayout,
  snowflakeVertexFn,
  snowflakeFragmentFn,
} from './shaders/snowflake';
import { SimParams, computeLayout, updateSnowflakesFn } from './shaders/physics';
import { CONFIG } from './config';
import { perspective, lookAt, multiply, toMat4Tuple } from './math/matrix';
import { generatePedestalVertices } from './geometry/pedestal';
import { generateDomeVertices } from './geometry/dome';
import { generateTrunkVertices, generateLeavesVertices, generateStarVertices } from './geometry/tree';
import { generateSnowFloorVertices, generateGroundVertices } from './geometry/ground';

import woodTextureUrl from '/wood_texture.webp?url';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// テクスチャをロードする関数
async function loadTexture(device: GPUDevice, url: string): Promise<GPUTexture> {
  const response = await fetch(url);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  const texture = device.createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture },
    [imageBitmap.width, imageBitmap.height]
  );

  return texture;
}

async function main(): Promise<void> {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported');
  }

  const root = await tgpu.init();
  console.log('TypeGPU initialized');

  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get WebGPU context');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: root.device,
    format,
    alphaMode: 'premultiplied',
  });

  // ===== MSAA設定 =====
  const sampleCount = 4; // 4x MSAA

  // MSAAカラーテクスチャ
  const msaaColorTexture = root.device.createTexture({
    size: [canvas.width, canvas.height],
    format,
    sampleCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const msaaColorView = msaaColorTexture.createView();

  // ===== 深度テクスチャ（MSAA対応） =====
  const depthTexture = root.device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    sampleCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const depthTextureView = depthTexture.createView();

  // 頂点データの定義
  const Vertex = d.struct({
    position: d.vec3f,
    normal: d.vec3f,
  });

  // 地面用の頂点データ（UV座標付き）
  const GroundVertex = d.struct({
    position: d.vec3f,
    normal: d.vec3f,
    uv: d.vec2f,
  });

  // ===== ドーム（球体）の頂点 =====
  const domeVerticesRaw = generateDomeVertices();
  const domeVertices = domeVerticesRaw.map((v) => ({
    position: d.vec3f(v.position.x, v.position.y, v.position.z),
    normal: d.vec3f(v.normal.x, v.normal.y, v.normal.z),
  }));
  const domeVertexCount = domeVertices.length;
  console.log('Dome vertex count:', domeVertexCount);

  const domeVertexBuffer = root
    .createBuffer(d.arrayOf(Vertex, domeVertexCount), domeVertices)
    .$usage('vertex');

  // ===== ドーム内の地面（雪の床）=====
  const snowFloorVerticesRaw = generateSnowFloorVertices();
  const snowFloorVerticesTyped = snowFloorVerticesRaw.map((v) => ({
    position: d.vec3f(v.position.x, v.position.y, v.position.z),
    normal: d.vec3f(v.normal.x, v.normal.y, v.normal.z),
  }));
  const snowFloorVertexCount = snowFloorVerticesTyped.length;
  console.log('Snow floor vertex count:', snowFloorVertexCount);

  const snowFloorVertexBuffer = root
    .createBuffer(d.arrayOf(Vertex, snowFloorVertexCount), snowFloorVerticesTyped)
    .$usage('vertex');

  // ===== クリスマスツリー =====
  // 幹
  const trunkVerticesRaw = generateTrunkVertices();
  const trunkVerticesTyped = trunkVerticesRaw.map((v) => ({
    position: d.vec3f(v.position.x, v.position.y, v.position.z),
    normal: d.vec3f(v.normal.x, v.normal.y, v.normal.z),
  }));
  const trunkVertexCount = trunkVerticesTyped.length;
  console.log('Trunk vertex count:', trunkVertexCount);

  const trunkVertexBuffer = root
    .createBuffer(d.arrayOf(Vertex, trunkVertexCount), trunkVerticesTyped)
    .$usage('vertex');

  // 葉
  const leavesVerticesRaw = generateLeavesVertices();
  const leavesVerticesTyped = leavesVerticesRaw.map((v) => ({
    position: d.vec3f(v.position.x, v.position.y, v.position.z),
    normal: d.vec3f(v.normal.x, v.normal.y, v.normal.z),
  }));
  const leavesVertexCount = leavesVerticesTyped.length;
  console.log('Leaves vertex count:', leavesVertexCount);

  const leavesVertexBuffer = root
    .createBuffer(d.arrayOf(Vertex, leavesVertexCount), leavesVerticesTyped)
    .$usage('vertex');

  // トップスター
  const starVerticesRaw = generateStarVertices();
  const starVerticesTyped = starVerticesRaw.map((v) => ({
    position: d.vec3f(v.position.x, v.position.y, v.position.z),
    normal: d.vec3f(v.normal.x, v.normal.y, v.normal.z),
  }));
  const starVertexCount = starVerticesTyped.length;
  console.log('Star vertex count:', starVertexCount);

  const starVertexBuffer = root
    .createBuffer(d.arrayOf(Vertex, starVertexCount), starVerticesTyped)
    .$usage('vertex');

  // ===== 土台の頂点 =====
  const pedestalVerticesRaw = generatePedestalVertices();
  const pedestalVertices = pedestalVerticesRaw.map((v) => ({
    position: d.vec3f(v.position.x, v.position.y, v.position.z),
    normal: d.vec3f(v.normal.x, v.normal.y, v.normal.z),
  }));
  const pedestalVertexCount = pedestalVertices.length;
  console.log('Pedestal vertex count:', pedestalVertexCount);

  const pedestalVertexBuffer = root
    .createBuffer(d.arrayOf(Vertex, pedestalVertexCount), pedestalVertices)
    .$usage('vertex');

  // ===== 地面の頂点（UV座標付き） =====
  const groundVerticesRaw = generateGroundVertices();
  const groundVertices = groundVerticesRaw.map((v) => ({
    position: d.vec3f(v.position.x, v.position.y, v.position.z),
    normal: d.vec3f(v.normal.x, v.normal.y, v.normal.z),
    uv: d.vec2f(v.uv.u, v.uv.v),
  }));
  const groundVertexCount = groundVertices.length;
  console.log('Ground vertex count:', groundVertexCount);

  const groundVertexBuffer = root
    .createBuffer(d.arrayOf(GroundVertex, groundVertexCount), groundVertices)
    .$usage('vertex');

  // バインドグループレイアウト（Camera, Lightingはshaders/vertex.tsからインポート）
  const renderLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
    lighting: { uniform: Lighting },
  });

  // 地面テクスチャ用のバインドグループレイアウト
  const groundTextureLayout = tgpu.bindGroupLayout({
    groundTexture: { texture: 'float' },
    groundSampler: { sampler: 'filtering' },
  });

  // カメラ行列を計算
  const aspect = canvas.width / canvas.height;
  const projMatrix = perspective(
    CONFIG.CAMERA_FOV,
    aspect,
    CONFIG.CAMERA_NEAR,
    CONFIG.CAMERA_FAR
  );

  // カメラ回転角度
  let cameraAngle = 0;

  function getCameraPosition(angle: number): [number, number, number] {
    const x = Math.sin(angle) * CONFIG.CAMERA_DISTANCE;
    const y = CONFIG.CAMERA_HEIGHT;
    const z = Math.cos(angle) * CONFIG.CAMERA_DISTANCE;
    return [x, y, z];
  }

  function getCameraViewMatrix(angle: number) {
    const pos = getCameraPosition(angle);
    // ターゲットをスノードームの中心あたりに設定
    return lookAt(pos, [0, 0.1, 0], [0, 1, 0]);
  }

  function getCameraViewProjMatrix(angle: number) {
    const viewMatrix = getCameraViewMatrix(angle);
    return multiply(projMatrix, viewMatrix);
  }

  const initialCameraPos = getCameraPosition(cameraAngle);
  const initialViewMatrix = getCameraViewMatrix(cameraAngle);
  const viewProjMatrix = getCameraViewProjMatrix(cameraAngle);

  const cameraBuffer = root
    .createBuffer(Camera, {
      viewProjMatrix: d.mat4x4f(...toMat4Tuple(viewProjMatrix)),
      viewMatrix: d.mat4x4f(...toMat4Tuple(initialViewMatrix)),
      position: d.vec3f(initialCameraPos[0], initialCameraPos[1], initialCameraPos[2]),
      _padding: 0,
    })
    .$usage('uniform');

  // ライティングバッファ
  const lightingBuffer = root
    .createBuffer(Lighting, {
      lightPos: d.vec3f(CONFIG.LIGHT_POSITION[0], CONFIG.LIGHT_POSITION[1], CONFIG.LIGHT_POSITION[2]),
      lightIntensity: CONFIG.LIGHT_INTENSITY,
      lightColor: d.vec3f(CONFIG.LIGHT_COLOR[0], CONFIG.LIGHT_COLOR[1], CONFIG.LIGHT_COLOR[2]),
      ambientIntensity: CONFIG.AMBIENT_INTENSITY,
      rimColor: d.vec3f(CONFIG.RIM_COLOR[0], CONFIG.RIM_COLOR[1], CONFIG.RIM_COLOR[2]),
      rimPower: CONFIG.RIM_POWER,
    })
    .$usage('uniform');

  const bindGroup = root.createBindGroup(renderLayout, {
    camera: cameraBuffer,
    lighting: lightingBuffer,
  });

  // ===== 地面テクスチャのロード =====
  const groundTexture = await loadTexture(root.device, woodTextureUrl);
  const groundTextureView = groundTexture.createView();

  const groundSampler = root.device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
  });

  // ===== シェーダー =====
  const commonVertexFn = createCommonVertexFn(renderLayout);
  const groundVertexFn = createGroundVertexFn(renderLayout);
  const domeFragmentFn = createDomeFragmentFn(renderLayout);
  const pedestalFragmentFn = createPedestalFragmentFn(renderLayout);
  const snowFloorFragmentFn = createSnowFloorFragmentFn(renderLayout);
  const trunkFragmentFn = createTrunkFragmentFn(renderLayout);
  const leavesFragmentFn = createLeavesFragmentFn(renderLayout);
  const starFragmentFn = createStarFragmentFn(renderLayout);
  const groundFragmentFn = createGroundFragmentFn(renderLayout, groundTextureLayout);

  const vertexLayout = tgpu.vertexLayout((n) => d.arrayOf(Vertex, n));
  const groundVertexLayout = tgpu.vertexLayout((n) => d.arrayOf(GroundVertex, n));

  // ブレンド設定（透明オブジェクト用）
  const blendState: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };

  // ===== ドーム背面パイプライン（cullMode: 'front'、透明） =====
  const domeBackPipeline = root['~unstable']
    .withVertex(commonVertexFn, vertexLayout.attrib)
    .withFragment(domeFragmentFn, {
      format,
      blend: blendState,
    })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'front',
    })
    .withDepthStencil({
      depthWriteEnabled: false,  // 透明なので深度書き込みOFF
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  // ===== ドーム前面パイプライン（cullMode: 'back'、透明） =====
  const domeFrontPipeline = root['~unstable']
    .withVertex(commonVertexFn, vertexLayout.attrib)
    .withFragment(domeFragmentFn, {
      format,
      blend: blendState,
    })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'back',  // 前面を描画
    })
    .withDepthStencil({
      depthWriteEnabled: false,  // 透明なので深度書き込みOFF
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  // ===== 土台パイプライン（深度テスト有効） =====
  const pedestalPipeline = root['~unstable']
    .withVertex(commonVertexFn, vertexLayout.attrib)
    .withFragment(pedestalFragmentFn, { format })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'back',
    })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  // ===== 地面パイプライン =====
  const groundPipeline = root['~unstable']
    .withVertex(groundVertexFn, groundVertexLayout.attrib)
    .withFragment(groundFragmentFn, { format })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'none',
    })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  // 地面テクスチャ用バインドグループ
  const groundTextureBindGroup = root.createBindGroup(groundTextureLayout, {
    groundTexture: groundTextureView,
    groundSampler,
  });

  // ===== 雪の床パイプライン =====
  const snowFloorPipeline = root['~unstable']
    .withVertex(commonVertexFn, vertexLayout.attrib)
    .withFragment(snowFloorFragmentFn, { format })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'none',
    })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  // ===== 幹パイプライン =====
  const trunkPipeline = root['~unstable']
    .withVertex(commonVertexFn, vertexLayout.attrib)
    .withFragment(trunkFragmentFn, { format })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'back',
    })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  // ===== 葉パイプライン =====
  const leavesPipeline = root['~unstable']
    .withVertex(commonVertexFn, vertexLayout.attrib)
    .withFragment(leavesFragmentFn, { format })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'none',
    })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  // ===== 星パイプライン =====
  const starPipeline = root['~unstable']
    .withVertex(commonVertexFn, vertexLayout.attrib)
    .withFragment(starFragmentFn, { format })
    .withPrimitive({
      topology: 'triangle-list',
      cullMode: 'none',
    })
    .withDepthStencil({
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  console.log('Pipelines created');

  // ===== 雪片の初期データ生成 =====
  function generateInitialSnowflakes() {
    return Array.from({ length: CONFIG.SNOWFLAKE_COUNT }, () => {
      // 球体内部に均一にランダム分布
      // 球体座標で均一に分布させるため、cosθを[-1,1]の範囲でランダムに取る
      const theta = Math.random() * Math.PI * 2;  // 水平角 [0, 2π]
      const cosTheta = Math.random() * 2 - 1;     // cos(φ) を [-1, 1] で均一に
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);

      // 半径は立方根で均一に分布（球体内部に均一に）
      const r = Math.cbrt(Math.random()) * CONFIG.DOME_RADIUS * 0.85;

      const x = sinTheta * Math.cos(theta) * r;
      const y = cosTheta * r + CONFIG.DOME_CENTER_Y;  // ドームの中心を基準に
      const z = sinTheta * Math.sin(theta) * r;

      // 初速度（わずかにランダム）
      const vx = (Math.random() - 0.5) * 0.1;
      const vy = -CONFIG.GRAVITY * 0.1 * (0.5 + Math.random() * 0.5);
      const vz = (Math.random() - 0.5) * 0.1;

      return {
        position: d.vec3f(x, y, z),
        velocity: d.vec3f(vx, vy, vz),
        size: CONFIG.SNOWFLAKE_SIZE_MIN +
          Math.random() * (CONFIG.SNOWFLAKE_SIZE_MAX - CONFIG.SNOWFLAKE_SIZE_MIN),
        phase: Math.random() * Math.PI * 2,
        alpha: 0.6 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
      };
    });
  }

  const snowflakeBuffer = root
    .createBuffer(SnowflakeArray, generateInitialSnowflakes())
    .$usage('storage');

  const snowflakeBindGroup = root.createBindGroup(snowflakeRenderLayout, {
    snowflakes: snowflakeBuffer,
    camera: cameraBuffer,
  });

  // 雪片パイプライン
  const snowflakePipeline = root['~unstable']
    .withVertex(snowflakeVertexFn, {})
    .withFragment(snowflakeFragmentFn, {
      format,
      blend: blendState,
    })
    .withPrimitive({ topology: 'triangle-list' })
    .withDepthStencil({
      depthWriteEnabled: false,
      depthCompare: 'less',
      format: 'depth24plus',
    })
    .withMultisample({ count: sampleCount })
    .createPipeline();

  console.log('Snowflake pipeline created');

  // ===== 物理シミュレーション =====
  const simParamsBuffer = root
    .createBuffer(SimParams, {
      time: 0,
      deltaTime: 0.016,
      domeRadius: CONFIG.DOME_RADIUS,
      domeCenterY: CONFIG.DOME_CENTER_Y,
      floorY: CONFIG.FLOOR_Y,
      gravity: CONFIG.GRAVITY,
      dragCoeff: CONFIG.DRAG_COEFFICIENT,
      turbulence: CONFIG.TURBULENCE,
      restitution: CONFIG.RESTITUTION,
      shakeAccelX: 0,
      shakeAccelY: 0,
      shakeAccelZ: 0,
      snowflakeCount: CONFIG.SNOWFLAKE_COUNT,
    })
    .$usage('uniform');

  const computeBindGroup = root.createBindGroup(computeLayout, {
    snowflakes: snowflakeBuffer,
    params: simParamsBuffer,
  });

  const computePipeline = root['~unstable']
    .withCompute(updateSnowflakesFn)
    .createPipeline();

  const workgroupCount = Math.ceil(CONFIG.SNOWFLAKE_COUNT / CONFIG.WORKGROUP_SIZE);

  console.log('Compute pipeline created');

  // ===== アニメーションループ =====
  let lastTime = performance.now();
  let totalTime = 0;

  function render(): void {
    const now = performance.now();
    const deltaTime = Math.min((now - lastTime) / 1000, 0.1);  // 最大100msに制限
    lastTime = now;
    totalTime += deltaTime;

    // SimParams 更新
    simParamsBuffer.write({
      time: totalTime,
      deltaTime,
      domeRadius: CONFIG.DOME_RADIUS,
      domeCenterY: CONFIG.DOME_CENTER_Y,
      floorY: CONFIG.FLOOR_Y,
      gravity: CONFIG.GRAVITY,
      dragCoeff: CONFIG.DRAG_COEFFICIENT,
      turbulence: CONFIG.TURBULENCE,
      restitution: CONFIG.RESTITUTION,
      shakeAccelX: 0,
      shakeAccelY: 0,
      shakeAccelZ: 0,
      snowflakeCount: CONFIG.SNOWFLAKE_COUNT,
    });

    // コンピュートシェーダー実行（雪片の物理更新）
    computePipeline
      .with(computeBindGroup)
      .dispatchWorkgroups(workgroupCount);

    // カメラ回転を更新
    cameraAngle += CONFIG.CAMERA_ROTATION_SPEED * deltaTime;
    const newCameraPos = getCameraPosition(cameraAngle);
    const newViewMatrix = getCameraViewMatrix(cameraAngle);
    const newViewProjMatrix = getCameraViewProjMatrix(cameraAngle);
    cameraBuffer.write({
      viewProjMatrix: d.mat4x4f(...toMat4Tuple(newViewProjMatrix)),
      viewMatrix: d.mat4x4f(...toMat4Tuple(newViewMatrix)),
      position: d.vec3f(newCameraPos[0], newCameraPos[1], newCameraPos[2]),
      _padding: 0,
    });

    const textureView = context!.getCurrentTexture().createView();

    // 地面（背景クリア + 深度クリア）- MSAAテクスチャに描画
    groundPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        clearValue: { r: 0.02, g: 0.04, b: 0.08, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .with(groundVertexLayout, groundVertexBuffer)
      .with(bindGroup)
      .with(groundTextureBindGroup)
      .draw(groundVertexCount);

    // 土台
    pedestalPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(vertexLayout, pedestalVertexBuffer)
      .with(bindGroup)
      .draw(pedestalVertexCount);

    // 雪の床
    snowFloorPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(vertexLayout, snowFloorVertexBuffer)
      .with(bindGroup)
      .draw(snowFloorVertexCount);

    // ツリーの幹
    trunkPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(vertexLayout, trunkVertexBuffer)
      .with(bindGroup)
      .draw(trunkVertexCount);

    // ツリーの葉
    leavesPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(vertexLayout, leavesVertexBuffer)
      .with(bindGroup)
      .draw(leavesVertexCount);

    // トップスター
    starPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(vertexLayout, starVertexBuffer)
      .with(bindGroup)
      .draw(starVertexCount);

    // ドーム背面（透明）
    domeBackPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(vertexLayout, domeVertexBuffer)
      .with(bindGroup)
      .draw(domeVertexCount);

    // 雪片
    snowflakePipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(snowflakeBindGroup)
      .draw(6, CONFIG.SNOWFLAKE_COUNT);

    // ドーム前面
    domeFrontPipeline
      .withColorAttachment({
        view: msaaColorView,
        resolveTarget: textureView,
        loadOp: 'load',
        storeOp: 'store',
      })
      .withDepthStencilAttachment({
        view: depthTextureView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(vertexLayout, domeVertexBuffer)
      .with(bindGroup)
      .draw(domeVertexCount);

    requestAnimationFrame(render);
  }

  render();
  console.log('Animation started');
}

main().catch(console.error);
