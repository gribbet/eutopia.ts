struct Instance {
    position: Position,
    orientation: vec4<f32>,
    scale: f32,
    min_scale_pixels: f32,
    max_scale_pixels: f32,
    color: vec4<f32>,
    pick_id: u32,
    diffuse: vec4<f32>,
    outline: vec4<f32>,
};

@group(1) @binding(0) var<storage, read> instances: array<Instance>;

struct Vertex {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) normal: vec3<f32>,
    @location(3) local: vec3<f32>,
    @location(4) @interpolate(flat) id: u32,
    @location(5) diffuse: vec4<f32>,
    @location(6) outline: vec4<f32>,
};

fn rotate_quat(v: vec3<f32>, q: vec4<f32>) -> vec3<f32> {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

fn compute_local_basis(position: Position, center: Position) -> mat3x3<f32> {
    if view.distance < 10000.0 {
        // X→North, Y→West (−East), Z→Up
        return mat3x3<f32>(
            vec3<f32>(0.0, 1.0, 0.0),
            vec3<f32>(-1.0, 0.0, 0.0),
            vec3<f32>(0.0, 0.0, 1.0),
        );
    }
    let di = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let d_lon = f32(di.x) / ONE * (2.0 * PI);

    var lat = atan(sinh((vec2<f32>(f32(position.y), f32(center.y)) / ONE - 0.5) * (-2.0 * PI)));
    lat = select(lat, vec2<f32>(PI / 2.0, lat.y), position.y == 0);
    lat = select(lat, vec2<f32>(-PI / 2.0, lat.y), position.y == 1u << 31);

    let cos_lat = cos(lat);
    let sin_lat = sin(lat);
    let cos_d_lon = cos(d_lon);
    let sin_d_lon = sin(d_lon);

    let east = vec3<f32>(cos_d_lon, sin_lat.y * sin_d_lon, -cos_lat.y * sin_d_lon);
    let up = vec3<f32>(
        sin_d_lon * cos_lat.x,
        cos_lat.y * sin_lat.x - sin_lat.y * cos_lat.x * cos_d_lon,
        sin_lat.y * sin_lat.x + cos_lat.y * cos_lat.x * cos_d_lon,
    );
    let north = cross(up, east);
    // X→North, Y→West (−East), Z→Up
    return mat3x3<f32>(north, cross(up, north), up);
}

fn compute_pixels_per_unit(origin: vec3<f32>) -> f32 {
    let f = length(vec3(view.projection[0][1], view.projection[1][1], view.projection[2][1]));
    let clip_pos = view.projection * vec4(origin, 1.0);
    return f * view.screen_size.y * 0.5 / clip_pos.w;
}

fn compute_scale(instance: Instance, pixels_per_unit: f32) -> f32 {
    var s = instance.scale;
    s = select(s, max(s, instance.min_scale_pixels / pixels_per_unit), instance.min_scale_pixels > 0.0);
    s = select(s, min(s, instance.max_scale_pixels / pixels_per_unit), instance.max_scale_pixels > 0.0);
    return s;
}

@vertex
fn vertex(
    @builtin(instance_index) instance_index: u32,
    @location(0) position: vec3<f32>,
    @location(1) color: vec4<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) normal: vec3<f32>,
) -> Vertex {
    let instance = instances[instance_index];

    let origin = transform(instance.position, view.center, view.projection);
    let pixels_per_unit = compute_pixels_per_unit(origin);
    let s = compute_scale(instance, pixels_per_unit);

    let basis = compute_local_basis(instance.position, view.center);
    let local = origin + basis * rotate_quat(position * s, instance.orientation);

    var output: Vertex;
    output.position = view.projection * vec4(local, 1.0);
    output.color = color * instance.color;
    output.uv = uv;
    output.normal = basis * rotate_quat(normal, instance.orientation);
    output.local = local;
    output.id = instance.pick_id;
    output.diffuse = instance.diffuse;
    output.outline = instance.outline;
    return output;
}

@fragment
fn render(input: Vertex) -> RenderOutput {
    if input.color.a < 0.01 {
        discard;
    }
    let intensity = max(0.0, dot(input.normal, vec3<f32>(0.0, 0.0, 1.0)));
    let color = vec4<f32>(input.color.rgb + input.diffuse.rgb * intensity, input.color.a);
    return RenderOutput(color, input.outline);
}

@fragment
fn pick(input: Vertex) -> PickOutput {
    if input.color.a < 0.01 {
        discard;
    }
    return pick_output(input.local, input.id);
}
