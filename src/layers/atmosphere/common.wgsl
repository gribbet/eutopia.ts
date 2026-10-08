// Atmosphere distances are metres.
@group(1) @binding(0) var<uniform> sun_ecef: vec4<f32>;

fn camera_position() -> vec3<f32> {
    let up = vec3<f32>(view.projection[0][1], view.projection[1][1], view.projection[2][1]);
    let forward = vec3<f32>(view.projection[0][3], view.projection[1][3], view.projection[2][3]);
    let distance = view.distance * tan(PI / 8.0) * length(up);
    return -forward * distance + vec3<f32>(0, 0, RADIUS + view.center.z);
}

fn local_sun() -> vec3<f32> {
    let lon = (f32(view.center.x) / ONE - 0.5) * 2.0 * PI;
    let lat = atan(sinh((f32(view.center.y) / ONE - 0.5) * -2.0 * PI));
    return vec3<f32>(
        dot(vec3<f32>(-sin(lon), cos(lon), 0), sun_ecef.xyz),
        dot(vec3<f32>(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat)), sun_ecef.xyz),
        dot(vec3<f32>(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)), sun_ecef.xyz),
    );
}

fn sphere_interval(origin: vec3<f32>, ray: vec3<f32>, radius: f32) -> vec2<f32> {
    let along = dot(origin, ray);
    let perpendicular = origin - ray * along;
    let discriminant = radius * radius - dot(perpendicular, perpendicular);
    if discriminant < 0.0 { return vec2<f32>(1, -1); }
    let root = sqrt(discriminant);
    return vec2<f32>(-along - root, -along + root);
}

fn fullscreen_ray(ndc: vec2<f32>) -> vec3<f32> {
    let right = vec3<f32>(view.projection[0][0], view.projection[1][0], view.projection[2][0]);
    let up = vec3<f32>(view.projection[0][1], view.projection[1][1], view.projection[2][1]);
    let forward = vec3<f32>(view.projection[0][3], view.projection[1][3], view.projection[2][3]);
    return forward + right * ndc.x / dot(right, right) + up * ndc.y / dot(up, up);
}

fn linear_to_srgb(linear: vec3<f32>) -> vec3<f32> {
    let clamped = clamp(linear, vec3<f32>(0), vec3<f32>(1));
    return select(
        1.055 * pow(clamped, vec3<f32>(1.0 / 2.4)) - 0.055,
        12.92 * clamped,
        clamped <= vec3<f32>(0.0031308),
    );
}
