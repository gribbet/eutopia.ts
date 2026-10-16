@group(0) @binding(0) var outline_texture: texture_2d<f32>;
@group(0) @binding(1) var outline_sampler: sampler;

override device_pixel_ratio: f32 = 1.0;

const OUTLINE_WIDTH: f32 = 1.5;

struct Vertex {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> Vertex {
    let positions = array(
        vec2(-1.0, -1.0),
        vec2(3.0, -1.0),
        vec2(-1.0, 3.0),
    );
    var output: Vertex;
    output.position = vec4(positions[index], 0.0, 1.0);
    return output;
}

fn stronger(a: vec4<f32>, b: vec4<f32>) -> vec4<f32> {
    // Keep the first sample on equal alpha.
    return select(a, b, b.a > a.a);
}

@fragment
fn fragment(input: Vertex) -> @location(0) vec4<f32> {
    let texel = 1.0 / vec2<f32>(textureDimensions(outline_texture));
    let uv = input.position.xy * texel;
    let radius = OUTLINE_WIDTH * device_pixel_ratio * texel;
    let outside = 1.0 - textureLoad(outline_texture, vec2<i32>(input.position.xy), 0).a;

    let a = textureSampleLevel(outline_texture, outline_sampler, uv + vec2(radius.x, 0.0), 0.0);
    let b = textureSampleLevel(outline_texture, outline_sampler, uv + vec2(0.309017, 0.951057) * radius, 0.0);
    let c = textureSampleLevel(outline_texture, outline_sampler, uv + vec2(-0.809017, 0.587785) * radius, 0.0);
    let d = textureSampleLevel(outline_texture, outline_sampler, uv + vec2(-0.809017, -0.587785) * radius, 0.0);
    let e = textureSampleLevel(outline_texture, outline_sampler, uv + vec2(0.309017, -0.951057) * radius, 0.0);
    let outline = stronger(stronger(stronger(a, b), stronger(c, d)), e);

    return outline * outside;
}
