const PI = radians(180.);
const ONE = 2147483648.0;
const RADIUS = 6371000.0;
const CIRCUMFERENCE = 2.0 * PI * RADIUS;

struct Position {
    x: u32, // Mercator [0, 2^31)
    y: u32, // Mercator [0, 2^31)
    z: f32, // Altitude in meters
};

struct View {
    center: Position,
    projection: mat4x4<f32>,
    screen_size: vec2<f32>,
    distance: f32,
};

@group(0) @binding(0) var<uniform> view: View;

fn transform_flat(position: Position, center: Position) -> vec3<f32> {
    let di = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let d = vec2<f32>(di) / ONE;
    let lat = atan(sinh((f32(center.y) / ONE - 0.5) * (-2.0 * PI)));
    let cos_lat = cos(lat);
    let xy = d * CIRCUMFERENCE * cos_lat * vec2<f32>(1.0, -1.0);
    let alt = position.z - center.z;
    let drop = dot(xy, xy) / (2.0 * RADIUS);
    return vec3<f32>(xy.x, xy.y, alt - drop);
}


fn transform_spherical(position: Position, center: Position) -> vec3<f32> {
    let di = bitcast<vec2<i32>>(vec2<u32>(position.x, position.y) - vec2<u32>(center.x, center.y));
    let d_lon = f32(di.x) / ONE * (2.0 * PI);

    var lat = atan(sinh((vec2<f32>(f32(position.y), f32(center.y)) / ONE - 0.5) * (-2.0 * PI)));
    lat = select(lat, vec2<f32>(PI / 2.0, lat.y), position.y == 0);
    lat = select(lat, vec2<f32>(-PI / 2.0, lat.y), position.y == 1u << 31);

    let cos_lat = cos(lat);
    let sin_lat = sin(lat);

    let r = RADIUS + position.z;
    let cos_d_lon = cos(d_lon);

    let x = r * cos_lat.x * sin(d_lon);
    let y = r * (cos_lat.y * sin_lat.x - sin_lat.y * cos_lat.x * cos_d_lon);
    let z = r * (sin_lat.y * sin_lat.x + cos_lat.y * cos_lat.x * cos_d_lon) - RADIUS - center.z;

    return vec3<f32>(x, y, z);
}

fn transform(position: Position, center: Position, projection: mat4x4<f32>) -> vec3<f32> {
    if view.distance < 10000.0 {
        return transform_flat(position, center);
    }
    return transform_spherical(position, center);
}

fn position_from_flat_local(local: vec3<f32>, center: Position) -> Position {
    let lat = atan(sinh((f32(center.y) / ONE - 0.5) * (-2.0 * PI)));
    let cos_lat = max(1e-6, cos(lat));

    let mercator_delta = local.xy / (CIRCUMFERENCE * cos_lat * vec2<f32>(1.0, -1.0));
    let delta_i = vec2<i32>(round(mercator_delta * ONE));
    let center_i = bitcast<vec2<i32>>(vec2<u32>(center.x, center.y));
    let xy = bitcast<vec2<u32>>(center_i + delta_i);

    let drop = dot(local.xy, local.xy) / (2.0 * RADIUS);
    let z = local.z + center.z + drop;

    return Position(xy.x, xy.y, z);
}



struct Tile {
    tile: vec3<u32>,
    imagery_texture: vec2<u32>,
    elevation_texture: vec2<u32>,
}

fn sample_elevation(elevation_textures: texture_2d_array<f32>, tile: vec3<u32>, uv: vec2<f32>, index: vec2<u32>) -> f32 {
    if index.x == 0xffffffffu {
        return 0.0;
    }
    let k = 1u << index.y;
    let uv_k = (vec2<f32>(tile.xy % k) + uv) / f32(k);
    let size = textureDimensions(elevation_textures);
    let ij = vec2<i32>(clamp(uv_k * vec2<f32>(size), vec2<f32>(0.0), vec2<f32>(size) - 1.0));
    let e = textureLoad(elevation_textures, ij, index.x, 0);
    return (((256.0 * 256.0 * 255.0 * e.r) + (256.0 * 255.0 * e.g) + (255. * e.b)) / 10.0 - 10000.0);
}

struct PickOutput {
    @location(0) xy: vec2<u32>,
    @location(1) z: f32,
    @location(2) id: u32,
}

struct RenderOutput {
    @location(0) color: vec4<f32>,
    @location(1) outline: vec4<f32>,
};

fn pack_pick(local: vec3<f32>, id: u32) -> PickOutput {
    let p = position_from_flat_local(local, view.center);
    let xy = vec2<u32>(clamp(
        vec2<f32>(vec2<u32>(p.x, p.y)),
        vec2<f32>(0.0),
        vec2<f32>(ONE - 1.0),
    ));
    return PickOutput(xy, p.z, id);
}

fn pick_output(local: vec3<f32>, id: u32) -> PickOutput {
    if id == 0u { discard; }
    return pack_pick(local, id);
}
