struct VertexIn {
    position: Position,
    color: vec4<f32>,
    uv: vec2<f32>,
    pick_id: u32,
    outline: vec4<f32>,
};

@group(1) @binding(0) var<storage, read> vertices: array<VertexIn>;
@group(1) @binding(1) var image: texture_2d<f32>;
@group(1) @binding(2) var image_sampler: sampler;

struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) local: vec3<f32>,
    @location(3) @interpolate(flat) id: u32,
    @location(4) outline: vec4<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOut {
    let v = vertices[index];
    let local = transform(v.position, view.center, view.projection);
    var out: VertexOut;
    out.position = view.projection * vec4(local, 1.0);
    out.color = v.color;
    out.uv = v.uv;
    out.local = local;
    out.id = v.pick_id;
    out.outline = v.outline;
    return out;
}

@fragment
fn render(in: VertexOut) -> RenderOutput {
    let color = in.color * textureSample(image, image_sampler, in.uv);
    return RenderOutput(color, in.outline);
}

@fragment
fn pick(in: VertexOut) -> PickOutput {
    if in.color.a < 0.01 {
        discard;
    }
    return pick_output(in.local, in.id);
}
