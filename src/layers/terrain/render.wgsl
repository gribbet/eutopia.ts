@group(1) @binding(0) var<storage, read> tiles: array<Tile>;
@group(1) @binding(1) var imagery_textures: texture_2d_array<f32>;
@group(1) @binding(2) var elevation_textures: texture_2d_array<f32>;
@group(1) @binding(3) var sample: sampler;

struct TerrainUniforms {
    color: vec4<f32>,
    saturation: f32,
    outline: vec4<f32>,
    pick_id: u32,
};

@group(1) @binding(4) var<uniform> uniforms: TerrainUniforms;

struct VertexIn {
    @builtin(instance_index) instance_index: u32,
    @location(0) uvw: vec3<u32>,
};

struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) instance_index: u32,
    @location(1) uv: vec2<f32>,
    @location(2) local: vec3<f32>,
};


@vertex
fn vertex(input: VertexIn) -> VertexOut {
    var output: VertexOut;
    let i = input.instance_index;
    let tile = tiles[i].tile;
    let index = tiles[i].elevation_texture;
    let uv = vec2<f32>(input.uvw.xy) / ONE;
    let alt = sample_elevation(elevation_textures, tile, uv, index);
    let tile_xy = tile.xy << vec2<u32>(31u - tile.z);
    let tile_size = f32(1u << (31u - tile.z));
    let offset = vec2<u32>(round(uv * tile_size));
    let xy = tile_xy + offset;
    let skirt = select(0.0, -0.1 * tile_size * CIRCUMFERENCE / ONE, input.uvw.z > 0);
    let world = Position(xy.x, xy.y, alt + skirt);
    let local = transform(world, view.center, view.projection);
    output.position = view.projection * vec4<f32>(local, 1.0);
    output.instance_index = input.instance_index;
    output.uv = uv;
    output.local = local;

    return output;
}


@fragment
fn render(input: VertexOut) -> RenderOutput {
    let uv_dx = dpdx(input.uv);
    let uv_dy = dpdy(input.uv);
    let i = input.instance_index;
    let tile = tiles[i].tile;
    let index = tiles[i].imagery_texture;
    if index.x == 0xffffffffu {
        discard;
    }
    let k = 1u << index.y;
    let uv = (vec2<f32>(tile.xy & vec2<u32>(k - 1u)) + input.uv) / f32(k);
    let scale = tile_split_threshold(imagery_textures) / f32(k);
    let dx = length(uv_dx * scale);
    let dy = length(uv_dy * scale);
    let lod = max(0.5 * (log2(dx) + log2(dy)), 0.0);
    let tinted = textureSampleLevel(imagery_textures, sample, uv, index.x, lod) * uniforms.color;
    let luminance = dot(tinted.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    let rgb = mix(vec3<f32>(luminance), tinted.rgb, max(uniforms.saturation, 0.0));
    let color = vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), tinted.a);
    return RenderOutput(color, vec4(uniforms.outline.rgb, uniforms.outline.a * color.a));
}

@fragment
fn pick(input: VertexOut) -> PickOutput {
    return pack_pick(input.local, uniforms.pick_id);
}
