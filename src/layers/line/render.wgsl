struct VertexIn {
    position: Position,
    width: f32,
    color: vec4<f32>,
    min_width_pixels: f32,
    max_width_pixels: f32,
    flags: u32,
    pick_id: u32,
    outline: vec4<f32>,
};

@group(1) @binding(0) var<storage, read> vertices: array<VertexIn>;

struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) local: vec3<f32>,
    @location(2) @interpolate(flat) id: u32,
    @location(3) outline: vec4<f32>,
};

fn pixels_per_unit(local: vec3<f32>) -> f32 {
    let f = length(vec3(view.projection[0][1], view.projection[1][1], view.projection[2][1]));
    let clip_pos = view.projection * vec4(local, 1.0);
    return f * view.screen_size.y * 0.5 / max(abs(clip_pos.w), 1e-6);
}

fn safe_normalize(v: vec2<f32>) -> vec2<f32> {
    let l = length(v);
    if l > 1e-6 { return v / l; }
    return vec2<f32>(0.0);
}

fn to_screen(clip: vec4<f32>) -> vec2<f32> {
    return (clip.xy / max(abs(clip.w), 1e-6)) * view.screen_size * 0.5;
}

fn join_offset(
    screen_prev: vec2<f32>,
    screen_current: vec2<f32>,
    screen_next: vec2<f32>,
    has_prev: bool,
    has_next: bool,
    corner_x: f32,
    side: f32,
) -> vec2<f32> {
    if !has_prev || !has_next {
        var tangent = vec2<f32>(1.0, 0.0);
        if has_next {
            tangent = safe_normalize(screen_next - screen_current);
        } else if has_prev {
            tangent = safe_normalize(screen_current - screen_prev);
        }

        let normal = vec2<f32>(-tangent.y, tangent.x);
        return normal * side;
    }

    var a = safe_normalize(screen_current - screen_prev);
    var b = safe_normalize(screen_next - screen_current);

    if length(a) <= 1e-6 { a = b; }
    if length(b) <= 1e-6 { b = a; }

    var direction = a;
    if length(a + b) > 1e-6 { direction = safe_normalize(a + b); }

    let point = safe_normalize(a - b);
    let normal = vec2<f32>(-direction.y, direction.x);

    if sign(side * dot(normal, point)) > 0.0 {
        let ap = vec2<f32>(-a.y, a.x);
        let bp = vec2<f32>(-b.y, b.x);
        return 0.5 * side * (corner_x * (bp - ap) + ap + bp);
    }

    let cosine = clamp(dot(a, b), -1.0, 1.0);
    let distance = clamp(1.0 / cos(acos(cosine) * 0.5), 0.0, 1.0);
    return normal * distance * side;
}

// Computes the 4 clip-space corners and view-space local position for vertex[idx].
// Corner layout: 0=(-1,-1), 1=(-1,+1), 2=(+1,-1), 3=(+1,+1)
struct Corners {
    clips: array<vec4<f32>, 4>,
    local: vec3<f32>,
};

fn compute_corners(idx: u32) -> Corners {
    let v = vertices[idx];
    let is_first = (v.flags & 1u) != 0u;
    let is_last = (v.flags & 2u) != 0u;
    let has_prev = !is_first;
    let has_next = !is_last;

    let local_curr = transform(v.position, view.center, view.projection);
    var local_prev = local_curr;
    if has_prev { local_prev = transform(vertices[idx - 1u].position, view.center, view.projection); }
    var local_next = local_curr;
    if has_next { local_next = transform(vertices[idx + 1u].position, view.center, view.projection); }

    let clip_curr = view.projection * vec4(local_curr, 1.0);
    let screen_prev = to_screen(view.projection * vec4(local_prev, 1.0));
    let screen_curr = to_screen(clip_curr);
    let screen_next = to_screen(view.projection * vec4(local_next, 1.0));

    var width_px = v.width * pixels_per_unit(local_curr);
    width_px = clamp(width_px, v.min_width_pixels, v.max_width_pixels);
    let half_px = width_px * 0.5;
    let half_screen = view.screen_size * 0.5;

    var corner_xs = array<f32, 4>(-1.0, -1.0, 1.0, 1.0);
    var sides = array<f32, 4>(-1.0, 1.0, -1.0, 1.0);

    var out: Corners;
    out.local = local_curr;
    for (var i = 0u; i < 4u; i++) {
        let offset = join_offset(
            screen_prev, screen_curr, screen_next,
            has_prev, has_next,
            corner_xs[i], sides[i],
        );
        out.clips[i] = clip_curr + vec4(offset * half_px / half_screen * clip_curr.w, 0.0, 0.0);
    }
    return out;
}

@vertex
fn vertex(
    @builtin(instance_index) inst: u32,
    @builtin(vertex_index) vert: u32,
) -> VertexOut {
    // Vertices 0-5:  own quad,    corners [0,2,1, 1,2,3]
    // Vertices 6-11: bridge quad, [curr2,next0,curr3, curr3,next0,next1]
    //                Degenerate when isLast: [curr2,curr2,curr3, curr3,curr2,curr3]
    let is_last = (vertices[inst].flags & 2u) != 0u;
    let curr = compute_corners(inst);

    var own_seq = array<u32, 6>(0u, 2u, 1u, 1u, 2u, 3u);
    var degen_seq = array<u32, 6>(2u, 2u, 3u, 3u, 2u, 3u);
    var curr_seq = array<u32, 6>(2u, 0u, 3u, 3u, 0u, 0u);
    var next_seq = array<u32, 6>(0u, 0u, 0u, 0u, 0u, 1u);
    var from_next = array<bool, 6>(false, true, false, false, true, true);

    var clip_pos = curr.clips[0];
    var local_pos = curr.local;
    var color = vertices[inst].color;
    var pick_id = vertices[inst].pick_id;
    var outline = vertices[inst].outline;

    if vert < 6u {
        let corner = own_seq[vert];
        clip_pos = curr.clips[corner];
    } else {
        let bi = vert - 6u;
        if is_last {
            let corner = degen_seq[bi];
            clip_pos = curr.clips[corner];
        } else if from_next[bi] {
            let next = compute_corners(inst + 1u);
            let corner = next_seq[bi];
            clip_pos = next.clips[corner];
            local_pos = next.local;
            color = vertices[inst + 1u].color;
            pick_id = vertices[inst + 1u].pick_id;
            outline = vertices[inst + 1u].outline;
        } else {
            let corner = curr_seq[bi];
            clip_pos = curr.clips[corner];
        }
    }

    var out: VertexOut;
    out.position = clip_pos;
    out.color = color;
    out.local = local_pos;
    out.id = pick_id;
    out.outline = outline;
    return out;
}

@fragment
fn render(in: VertexOut) -> RenderOutput {
    if in.color.a < 0.01 { discard; }
    return RenderOutput(in.color, in.outline);
}

@fragment
fn pick(in: VertexOut) -> PickOutput {
    if in.color.a < 0.01 { discard; }
    return pick_output(in.local, in.id);
}
