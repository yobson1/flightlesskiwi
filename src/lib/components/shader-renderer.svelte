<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		vertShaderSource: string;
		fragShaderSource: string;
		class?: string;
	}

	let { vertShaderSource, fragShaderSource, class: className }: Props = $props();
	let canvas: HTMLCanvasElement;

	function createShader(gl: WebGLRenderingContext, type: number, source: string) {
		const shader = gl.createShader(type);
		if (!shader) return null;

		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}

		return shader;
	}

	function createProgram(
		gl: WebGLRenderingContext,
		vertexShader: WebGLShader,
		fragmentShader: WebGLShader
	) {
		const program = gl.createProgram();
		if (!program) return null;

		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error('Shader program linking error:', gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			return null;
		}

		return program;
	}

	onMount(() => {
		const context = canvas.getContext('webgl');
		if (!context) {
			console.error('WebGL not supported');
			return;
		}
		const gl: WebGLRenderingContext = context;

		gl.getExtension('OES_standard_derivatives');
		gl.getExtension('EXT_shader_texture_lod');

		const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertShaderSource);
		const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragShaderSource);
		if (!vertexShader || !fragmentShader) return;

		const shaderProgram = createProgram(gl, vertexShader, fragmentShader);
		if (!shaderProgram) return;

		const positionAttributeLocation = gl.getAttribLocation(shaderProgram, 'position');
		const resolutionUniformLocation = gl.getUniformLocation(shaderProgram, 'u_resolution');
		const timeUniformLocation = gl.getUniformLocation(shaderProgram, 'u_time');
		const vertexBuffer = gl.createBuffer();
		if (!vertexBuffer) return;

		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW
		);

		let frameId = 0;

		function render(timestamp: number) {
			gl.clearColor(0, 0, 0, 1);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(shaderProgram);
			gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
			gl.uniform1f(timeUniformLocation, timestamp / 1000);
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
			gl.enableVertexAttribArray(positionAttributeLocation);
			gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}

		function resize() {
			const pixelRatio = window.devicePixelRatio || 1;
			const width = Math.round(canvas.clientWidth * pixelRatio);
			const height = Math.round(canvas.clientHeight * pixelRatio);

			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
		}

		function animate(timestamp: number) {
			resize();
			render(timestamp);
			frameId = requestAnimationFrame(animate);
		}

		const resizeObserver = new ResizeObserver(() => {
			resize();
			render(performance.now());
		});

		resizeObserver.observe(canvas);
		frameId = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(frameId);
			resizeObserver.disconnect();
			gl.deleteBuffer(vertexBuffer);
			gl.deleteProgram(shaderProgram);
			gl.deleteShader(vertexShader);
			gl.deleteShader(fragmentShader);
		};
	});
</script>

<canvas bind:this={canvas} class={className} aria-hidden="true"></canvas>
