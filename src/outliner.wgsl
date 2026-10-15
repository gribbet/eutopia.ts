@group(0) @binding(0) var outline_texture: texture_2d<f32>;
@group(0) @binding(1) var outline_sampler: sampler;

override device_pixel_ratio: f32 = 1.0;

const DIRECTIONS = array(
    vec2<f32>(-1.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(-0.5, -0.866),
    vec2<f32>(0.5, 0.866),
    vec2<f32>(0.5, -0.866),
    vec2<f32>(-0.5, 0.866)
);

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

fn outline_sample(xy: vec2<f32>) -> vec4<f32> {
    let size = vec2<f32>(textureDimensions(outline_texture));
    let uv = (xy + vec2<f32>(0.5)) / size;
    return textureSampleLevel(outline_texture, outline_sampler, uv, 0.0);
}

@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let xy = vec2<i32>(position.xy);
    let outline_xy = vec2<f32>(xy);
    let center = outline_sample(outline_xy);

    let radius = 1.5 * device_pixel_ratio;
    var outline = vec4<f32>(0.0);
    var alpha = 0.0;

    for (var i = 0u; i < 6u; i++) {
        let sample = outline_sample(outline_xy + DIRECTIONS[i] * radius);
        let sample_alpha = sample.a * (1.0 - center.a);
        if sample_alpha > alpha {
            outline = vec4(sample.rgb / max(sample.a, 1e-6), sample.a);
            alpha = sample_alpha;
        }
    }

    if alpha == 0.0 {
        discard;
    }

    return vec4(outline.rgb, alpha);
}
