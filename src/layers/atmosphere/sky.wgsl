// Scattering coefficients are per metre.
const SKY_RADIUS = RADIUS + 100000.0;
const SCALE_HEIGHT = vec2<f32>(8000.0, 1200.0);
const BETA_R = vec3<f32>(0.0000058, 0.0000135, 0.0000331);
const BETA_M = vec3<f32>(0.000003996);
const MIE_EXTINCTION = BETA_M / 0.9;
const SKY_EXPOSURE = 12.0;
const VIEW_STEPS = 12u;

@group(1) @binding(1) var sky_output: texture_storage_2d<rgba16float, write>;
@group(1) @binding(2) var sky_texture: texture_2d<f32>;
@group(1) @binding(3) var sky_sampler: sampler;

struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) ray: vec3<f32>,
    @location(1) @interpolate(flat) camera: vec3<f32>,
    @location(2) @interpolate(flat) sun: vec3<f32>,
};

fn sky_tangent(radial: vec3<f32>) -> vec3<f32> {
    var tangent = cross(radial, vec3<f32>(0, 1, 0));
    if dot(tangent, tangent) < 0.000001 { tangent = cross(radial, vec3<f32>(1, 0, 0)); }
    return normalize(tangent);
}

fn density(position: vec3<f32>) -> vec2<f32> {
    return exp(-max(length(position) - RADIUS, 0.0) / SCALE_HEIGHT);
}

fn extinction(air: vec2<f32>) -> vec3<f32> {
    return BETA_R * air.x + MIE_EXTINCTION * air.y;
}

fn sunlight(position: vec3<f32>, sun: vec3<f32>) -> vec3<f32> {
    let ground = sphere_interval(position, sun, RADIUS);
    if ground.x > 0.0 && ground.y >= ground.x { return vec3<f32>(0); }
    // Analytic Chapman approximation replaces a nested light-ray march.
    let radius = length(position);
    let altitude = max(radius - RADIUS, 0.0);
    let mu = dot(position, sun) / radius;
    let x = abs(mu) * sqrt(radius / (2.0 * SCALE_HEIGHT));
    let scaled_erfc = 2.0 / (sqrt(PI) * (x + sqrt(x * x + 4.0 / PI)));
    let outward = 0.5 * exp(-altitude / SCALE_HEIGHT) * scaled_erfc;
    let inward = exp(min(vec2<f32>(0), -altitude / SCALE_HEIGHT + x * x)) - outward;
    let depth = sqrt(2.0 * PI * radius * SCALE_HEIGHT) * select(outward, inward, mu < 0.0);
    return exp(-extinction(depth));
}

fn scatter(camera: vec3<f32>, ray: vec3<f32>, sun: vec3<f32>) -> vec4<f32> {
    let radius = length(camera);
    if radius < RADIUS { return vec4<f32>(0); }
    let radial = camera / radius;
    let sine = min((RADIUS + 1.0) / radius, 1.0);
    let horizon_mu = -sqrt(max(1.0 - sine * sine, 0.0));
    var direction = ray;
    let mu_up = dot(radial, ray);
    if mu_up < horizon_mu {
        // Extend the sky under terrain so filtering never meets a black horizon cutoff.
        var tangent = ray - radial * mu_up;
        if dot(tangent, tangent) < 0.000001 { tangent = sky_tangent(radial); }
        direction = normalize(tangent) * sine + radial * horizon_mu;
    }
    let sky = sphere_interval(camera, direction, SKY_RADIUS);
    let start = max(sky.x, 0.0);
    let end = sky.y;
    if end <= start { return vec4<f32>(0); }
    let mu = clamp(dot(direction, sun), -1.0, 1.0);
    let phase_r = 3.0 * (1.0 + mu * mu) / (16.0 * PI);
    let g = 0.8;
    let phase_m = 3.0 * (1.0 - g * g) * (1.0 + mu * mu) / (8.0 * PI * (2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    var transmittance = vec3<f32>(1);
    var radiance = vec3<f32>(0);
    for (var i = 0u; i < VIEW_STEPS; i += 1u) {
        var a = f32(i) / f32(VIEW_STEPS);
        var b = f32(i + 1u) / f32(VIEW_STEPS);
        if sky.x < 0.0 { a *= a; b *= b; }
        let step = (b - a) * (end - start);
        let position = camera + direction * (start + (a + b) * 0.5 * (end - start));
        let air = density(position);
        let sigma = extinction(air);
        let segment = exp(-sigma * step);
        radiance += transmittance * sunlight(position, sun) * (BETA_R * air.x * phase_r + BETA_M * air.y * phase_m) * (1.0 - segment) / max(sigma, vec3<f32>(1e-11));
        transmittance *= segment;
    }
    let color = 1.0 - exp(-radiance * SKY_EXPOSURE);
    let opacity = 1.0 - dot(transmittance, vec3<f32>(0.2126, 0.7152, 0.0722));
    return vec4<f32>(color, max(opacity, max(color.r, max(color.g, color.b))));
}

fn sky_render_output(sky: vec4<f32>) -> RenderOutput {
    let linear = clamp(sky.rgb, vec3<f32>(0), vec3<f32>(1));
    let color = linear_to_srgb(linear);
    let alpha = max(sky.a, max(color.r, max(color.g, color.b)));
    return RenderOutput(vec4<f32>(color / max(alpha, 0.000001), alpha), vec4<f32>(0));
}

fn sample_sky(camera: vec3<f32>, ray: vec3<f32>) -> vec4<f32> {
    let radius = length(camera);
    if radius < RADIUS { return vec4<f32>(0); }
    let radial = camera / radius;
    let tangent = sky_tangent(radial);
    let north = cross(radial, tangent);
    let mu = dot(radial, ray);
    var elevation = 0.0;
    if radius >= SKY_RADIUS {
        let impact = length(camera - ray * dot(camera, ray));
        if mu >= 0.0 || impact >= SKY_RADIUS { return vec4<f32>(0); }
        elevation = sqrt(clamp((impact - RADIUS) / (SKY_RADIUS - RADIUS), 0.0, 1.0));
    } else {
        let sine = min((RADIUS + 1.0) / radius, 1.0);
        let horizon_mu = -sqrt(max(1.0 - sine * sine, 0.0));
        elevation = sqrt(clamp((mu - horizon_mu) / (1.0 - horizon_mu), 0.0, 1.0));
    }
    let horizontal = vec2<f32>(dot(ray, tangent), dot(ray, north));
    var azimuth = 0.0;
    if dot(horizontal, horizontal) > 1e-12 {
        azimuth = fract(atan2(horizontal.y, horizontal.x) / (2.0 * PI) + 1.0);
    }
    let size = vec2<f32>(textureDimensions(sky_texture));
    return textureSampleLevel(sky_texture, sky_sampler,
        vec2<f32>(azimuth, (elevation * (size.y - 1.0) + 0.5) / size.y), 0.0);
}

@compute @workgroup_size(8, 8)
fn compute(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = textureDimensions(sky_output);
    if any(id.xy >= size) { return; }
    let camera = camera_position();
    let radius = length(camera);
    if radius < RADIUS {
        textureStore(sky_output, id.xy, vec4<f32>(0));
        return;
    }
    let radial = camera / radius;
    let tangent = sky_tangent(radial);
    let elevation = f32(id.y) / f32(size.y - 1u);
    var mu = 0.0;
    if radius >= SKY_RADIUS {
        let impact = min(RADIUS + elevation * elevation * (SKY_RADIUS - RADIUS), radius);
        mu = -sqrt(max(1.0 - impact * impact / (radius * radius), 0.0));
    } else {
        let sine = min((RADIUS + 1.0) / radius, 1.0);
        let horizon_mu = -sqrt(max(1.0 - sine * sine, 0.0));
        mu = horizon_mu + elevation * elevation * (1.0 - horizon_mu);
    }
    let azimuth = (f32(id.x) + 0.5) / f32(size.x) * 2.0 * PI;
    let ray = (tangent * cos(azimuth) + cross(radial, tangent) * sin(azimuth)) * sqrt(max(1.0 - mu * mu, 0.0)) + radial * mu;
    textureStore(sky_output, id.xy, scatter(camera, normalize(ray), normalize(local_sun())));
}

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOut {
    let corners = array<vec2<f32>, 3>(vec2<f32>(-1, -1), vec2<f32>(3, -1), vec2<f32>(-1, 3));
    let ndc = corners[index];
    var output: VertexOut;
    output.position = vec4<f32>(ndc, 0.999999, 1);
    output.ray = fullscreen_ray(ndc);
    output.camera = camera_position();
    output.sun = normalize(local_sun());
    return output;
}

@fragment
fn render(input: VertexOut) -> RenderOutput {
    let ray = normalize(input.ray);
    let sky = sample_sky(input.camera, ray);
    let sun_cosine = dot(ray, input.sun);
    let sun_angle = acos(clamp(sun_cosine, -1.0, 1.0));
    let sun_radius = 0.45 * PI / 180.0;
    let edge_width = max(fwidth(sun_angle), 0.00001);
    let disk = 1.0 - smoothstep(
        sun_radius - edge_width * 0.5,
        sun_radius + edge_width * 0.5,
        sun_angle,
    );
    let limb = 0.75 + 0.25 * sqrt(max(1.0 - pow(sun_angle / sun_radius, 2.0), 0.0));
    let inner_halo = exp(-sun_angle / (0.7 * PI / 180.0));
    let outer_halo = exp(-sun_angle / (2.0 * PI / 180.0));
    let sun_color = vec3<f32>(2.0, 1.85, 1.55) * disk * limb + vec3<f32>(0.13, 0.075, 0.035) * inner_halo + vec3<f32>(0.025, 0.035, 0.06) * outer_halo;
    let output = sky_render_output(vec4<f32>(sky.rgb + sun_color, sky.a));
    if output.color.a <= 0.0001 { discard; }
    return output;
}

@fragment
fn pick() -> PickOutput {
    return pick_output(vec3<f32>(0), 0u);
}
