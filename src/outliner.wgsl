@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var outlineTexture: texture_2d<f32>;
@group(0) @binding(2) var outlineSampler: sampler;

override devicePixelRatio: f32 = 1.0;

const directions = array(
    vec2<f32>(-1.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(-0.5, -0.866),
    vec2<f32>(0.5, 0.866),
    vec2<f32>(0.5, -0.866),
    vec2<f32>(-0.5, 0.866)
);

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let positions = array(
        vec2(-1.0, -1.0),
        vec2(3.0, -1.0),
        vec2(-1.0, 3.0),
    );
    var output: VertexOutput;
    output.position = vec4(positions[index], 0.0, 1.0);
    return output;
}

fn outlineSample(xy: vec2<f32>) -> vec4<f32> {
    let size = vec2<f32>(textureDimensions(outlineTexture));
    let uv = (xy + vec2<f32>(0.5)) / size;
    return textureSample(outlineTexture, outlineSampler, uv);
}

@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let xy = vec2<i32>(position.xy);
    let outlineXY = vec2<f32>(xy);
    let scene = textureLoad(sceneTexture, xy, 0);
    let center = outlineSample(outlineXY);
    let radius = 1.5 * devicePixelRatio;
    var outline = vec4<f32>(0.0);
    var alpha = 0.0;

    for (var i = 0u; i < 6u; i++) {
        let sample = outlineSample(outlineXY + directions[i] * radius);
        let sampleAlpha = sample.a * (1.0 - center.a);
        if sampleAlpha > alpha {
            outline = vec4(sample.rgb / max(sample.a, 1e-6), sample.a);
            alpha = sampleAlpha;
        }
    }

    return vec4(mix(scene.rgb, outline.rgb, alpha), 1.0);
}
