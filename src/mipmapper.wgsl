@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var image_sampler: sampler;
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOut {
  let positions = array(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  let xy = positions[index];
  return VertexOut(vec4(xy, 0.0, 1.0), xy * vec2(0.5, -0.5) + vec2(0.5));
}
@fragment
fn fragment(input: VertexOut) -> @location(0) vec4<f32> {
  return textureSampleLevel(image, image_sampler, input.uv, 0.0);
}
