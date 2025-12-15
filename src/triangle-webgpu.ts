const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;

async function main() {
  if (!navigator.gpu) {
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    return;
  }

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  if (!context) {
    return;
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  });

  const shaderCode = `
    struct VertexInput {
      @location(0) position: vec2f,
      @location(1) color: vec3f,
    }

    struct VertexOutput {
      @builtin(position) position: vec4f,
      @location(0) color: vec3f,
    }

    @vertex
    fn vertex(input: VertexInput) -> VertexOutput {
      var output: VertexOutput;
      output.position = vec4f(input.position, 0.0, 1.0);
      output.color = input.color;
      return output;
    }

    @fragment
    fn fragment(input: VertexOutput) -> @location(0) vec4f {
      return vec4f(input.color, 1.0);
    }
  `;

  const shaderModule = device.createShaderModule({ code: shaderCode });

  const vertices = new Float32Array([
    // position (x, y), color (r, g, b)
     0.0,  0.5,   1.0, 0.0, 0.0, // top (red)
    -0.5, -0.5,   0.0, 1.0, 0.0, // bottom-left (green)
     0.5, -0.5,   0.0, 0.0, 1.0, // bottom-right (blue)
  ]);

  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vertex',
      buffers: [
        {
          arrayStride: 20, // vec2f(8) + vec3f(12) = 20 bytes
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
            { shaderLocation: 1, offset: 8, format: 'float32x3' },  // color
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragment',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  function render() {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context!.getCurrentTexture().createView(),
          clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
  }

  render();
}

main().catch(console.error);
