// Adapted from https://www.shadertoy.com/view/MdfcRS
#extension GL_EXT_shader_texture_lod : enable
#extension GL_OES_standard_derivatives : enable

precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

float noise3(vec3 x) {
	vec3 p = floor(x), f = fract(x);
	f = f * f * (3.0 - 2.0 * f);

	#define hash3(p) fract(sin(1e3 * dot(p, vec3(1, 57, -13.7))) * 4375.5453)

	return mix(
		mix(
			mix(hash3(p + vec3(0, 0, 0)), hash3(p + vec3(1, 0, 0)), f.x),
			mix(hash3(p + vec3(0, 1, 0)), hash3(p + vec3(1, 1, 0)), f.x),
			f.y
		),
		mix(
			mix(hash3(p + vec3(0, 0, 1)), hash3(p + vec3(1, 0, 1)), f.x),
			mix(hash3(p + vec3(0, 1, 1)), hash3(p + vec3(1, 1, 1)), f.x),
			f.y
		),
		f.z
	);
}

#define noise(x) (noise3(x) + noise3(x + 11.5)) / 2.0

float speed = 0.03;
float scroll_speed = 0.1;

void main() {
	vec2 position = gl_FragCoord.xy * 8.0 / u_resolution.y;
	position += u_time * scroll_speed;

	float n = noise(vec3(position, speed * u_time));
	float value = sin(6.28 * 10.0 * n);
	value = smoothstep(-1.0, 1.0, 0.7 * abs(value) / fwidth(value));

	float background_darkness = 0.9;
	gl_FragColor = vec4(vec3(1.0 - value * background_darkness), 1.0);
}
