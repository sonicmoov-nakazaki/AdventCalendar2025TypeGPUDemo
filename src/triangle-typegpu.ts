import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const { vertexFn, fragmentFn } = tgpu['~unstable'];

const canvas = document.getElementById('canvas-typegpu') as HTMLCanvasElement;

async function main() {
  if (!navigator.gpu) {
    return;
  }

  const root = await tgpu.init();

  const context = canvas.getContext('webgpu');
  if (!context) {
    return;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: root.device,
    format,
    alphaMode: 'premultiplied',
  });

  const Vertex = d.struct({
    position: d.vec2f,
    color: d.vec3f,
  });

  const vertices = [
    { position: d.vec2f(0.0, 0.5), color: d.vec3f(1, 0, 0) },
    { position: d.vec2f(-0.5, -0.5), color: d.vec3f(0, 1, 0) },
    { position: d.vec2f(0.5, -0.5), color: d.vec3f(0, 0, 1) },
  ];

  const vertexBuffer = root
    .createBuffer(d.arrayOf(Vertex, 3), vertices)
    .$usage('vertex');

  const myVertexFn = vertexFn({
    in: { position: d.vec2f, color: d.vec3f },
    out: { position: d.builtin.position, color: d.vec3f },
  })((input) => {
    'use gpu';
    return {
      position: d.vec4f(input.position, 0.0, 1.0),
      color: input.color,
    };
  }).$name('vertex');

  const myFragmentFn = fragmentFn({
    in: { color: d.vec3f },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    return d.vec4f(input.color, 1.0);
  }).$name('fragment');

  const myVertexLayout = tgpu.vertexLayout((n) => d.arrayOf(Vertex, n));

  const pipeline = root['~unstable']
    .withVertex(myVertexFn, myVertexLayout.attrib)
    .withFragment(myFragmentFn, { format })
    .createPipeline();

  function render() {
    pipeline.withColorAttachment({
      view: context!.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(myVertexLayout, vertexBuffer)
    .draw(3);
  }

  render();
}

main().catch(console.error);
