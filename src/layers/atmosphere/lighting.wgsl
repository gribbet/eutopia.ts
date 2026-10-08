struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) ray: vec3<f32>,
    @location(1) @interpolate(flat) camera: vec3<f32>,
    @location(2) @interpolate(flat) sun: vec3<f32>,
};

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOut {
    let corners = array<vec2<f32>, 3>(vec2<f32>(-1, -1), vec2<f32>(3, -1), vec2<f32>(-1, 3));
    let ndc = corners[index];
    var output: VertexOut;
    output.position = vec4<f32>(ndc, 0, 1);
    output.ray = fullscreen_ray(ndc);
    output.camera = camera_position();
    output.sun = normalize(local_sun());
    return output;
}

@fragment
fn render(input: VertexOut) -> RenderOutput {
    let ray = normalize(input.ray);
    let ground = sphere_interval(input.camera, ray, RADIUS);
    if ground.x <= 0.0 || ground.y < ground.x { discard; }

    let surface = normalize(input.camera + ray * ground.x);
    let sunlit = smoothstep(-0.15, 0.15, dot(surface, input.sun));
    let color = mix(vec3<f32>(0.004, 0.008, 0.025), vec3<f32>(0.12, 0.22, 0.36), sunlit);
    let zoom = smoothstep(10000.0, 80000.0, view.distance);
    let distance = smoothstep(15000.0, 250000.0, ground.x);
    let alpha = 0.55 * zoom * distance;
    if alpha <= 0.0001 { discard; }

    return RenderOutput(vec4<f32>(linear_to_srgb(color), alpha), vec4<f32>(0));
}

@fragment
fn pick() -> PickOutput {
    return pick_output(vec3<f32>(0), 0u);
}
