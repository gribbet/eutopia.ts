@group(1) @binding(0) var<storage, read> billboards: array<Billboard>;
@group(1) @binding(1) var textures: texture_2d_array<f32>;
@group(1) @binding(2) var sample: sampler;

struct Billboard {
    position: Position,
    size: f32,
    color: vec4<f32>,
    texture: i32,
    width: u32,
    height: u32,
    min_scale: f32,
    max_scale: f32,
    pick_id: u32,
    outline: vec4<f32>,
};

struct Vertex {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) @interpolate(flat) texture: i32,
    @location(3) local: vec3<f32>,
    @location(4) @interpolate(flat) id: u32,
    @location(5) outline: vec4<f32>,
};

@vertex
fn vertex(
    @builtin(instance_index) instance_index: u32,
    @builtin(vertex_index) vertex_index: u32
) -> Vertex {
    let billboard = billboards[instance_index];

    let local = transform(billboard.position, view.center, view.projection);

    let corners = array(
        vec2(-1.0, 1.0),
        vec2(1.0, 1.0),
        vec2(-1.0, -1.0),
        vec2(1.0, -1.0)
    );

    let width = f32(billboard.width);
    let height = f32(billboard.height);
    let uv_scale = vec2<f32>(width, height) / vec2<f32>(textureDimensions(textures));
    let uv = (corners[vertex_index] * 0.5 + 0.5) * uv_scale;

    let aspect = width / height;
    let screen_aspect = view.screen_size.x / view.screen_size.y;

    let clip = view.projection * vec4(local, 1.0);
    var scale = clamp(billboard.size / clip.w / height * view.screen_size.y, billboard.min_scale, billboard.max_scale);
    let offset = corners[vertex_index] * vec2(aspect / screen_aspect, -1.0) * scale * height / view.screen_size.y;
    let position = view.projection * vec4(local, 1.0) + vec4(offset * clip.w, 0.0, 0.0);


    var output: Vertex;
    output.position = position;
    output.color = billboard.color;
    output.uv = uv;
    output.texture = billboard.texture;
    output.local = local;
    output.id = billboard.pick_id;
    output.outline = billboard.outline;
    return output;
}

@fragment
fn render(input: Vertex) -> RenderOutput {
    let texel = textureSampleBias(textures, sample, input.uv, input.texture, -1.0);
    let color = texel * input.color;
    if color.a < 0.01 {
        discard;
    }
    return RenderOutput(color, vec4(input.outline.rgb, input.outline.a * texel.a));
}

@fragment
fn pick(input: Vertex) -> PickOutput {
    let color = textureSampleBias(textures, sample, input.uv, input.texture, -1.0);
    if color.a * input.color.a < 0.01 {
        discard;
    }
    return pick_output(input.local, input.id);
}
