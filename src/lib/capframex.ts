import type {
	BenchmarkData,
	BenchmarkMetric,
	BenchmarkMetricKey,
	BenchmarkRun,
	BenchmarkSystemInfo
} from '$lib/benchmark-run-model';

const MAXIMUM_DATA_POINTS = 100_000;

interface CapFrameXDocument {
	Info: Record<string, unknown>;
	Runs: unknown[];
}

interface SensorMapping {
	key: BenchmarkMetricKey;
	priority: number;
	scale?: number;
}

export function parseCapFrameXSystemInfo(json: string): BenchmarkSystemInfo | null {
	const document = parseCapFrameXDocument(json);
	const info = document?.Info ?? parseCapFrameXInfoPrefix(json);
	if (!info || !looksLikeCapFrameXInfo(info)) return null;

	return buildSystemInfo(info);
}

export function parseCapFrameXBenchmarkRun(json: string): BenchmarkRun | null {
	const document = parseCapFrameXDocument(json);
	if (!document || document.Runs.length !== 1) return null;
	const data = parseBenchmarkData(document);
	if (!data) return null;

	return {
		source: 'capframex',
		systemInfo: buildSystemInfo(document.Info),
		data
	};
}

function buildSystemInfo(info: Record<string, unknown>): BenchmarkSystemInfo {
	const ramDescription = stringValue(info.SystemRam);
	return {
		os: stringValue(info.OS),
		cpu: stringValue(info.Processor),
		gpu: stringValue(info.GPU),
		ramBytes: parseMemoryDescription(ramDescription),
		ramDescription,
		kernel: '',
		driver:
			stringValue(info.GPUDriverVersion) ||
			stringValue(info.DriverPackage) ||
			stringValue(info.BaseDriverVersion),
		cpuScheduler: '',
		motherboard: stringValue(info.Motherboard)
	};
}

export function parseCapFrameXBenchmarkData(json: string): BenchmarkData | null {
	const document = parseCapFrameXDocument(json);
	if (!document || document.Runs.length !== 1) return null;
	return parseBenchmarkData(document);
}

function parseBenchmarkData(document: CapFrameXDocument): BenchmarkData | null {
	const run = recordValue(document.Runs[0]);
	if (!run) return null;
	const captureData = recordValue(run.CaptureData);
	const captureMetrics = captureData ? parseCaptureMetrics(captureData) : [];
	const captureDuration = maximumMetricTime(captureMetrics);
	const sensorData2 = recordValue(run.SensorData2);
	const legacySensorData = recordValue(run.SensorData);
	const sensorMetrics = sensorData2
		? parseSensorData2(sensorData2, captureDuration)
		: legacySensorData
			? parseLegacySensorData(legacySensorData, captureDuration)
			: [];
	const metrics = [...captureMetrics, ...sensorMetrics];

	return metrics.length > 0 ? { metrics } : null;
}

export function getCapFrameXRunCount(json: string): number | null {
	const document = parseCapFrameXDocument(json);
	return document?.Runs.length ?? null;
}

function parseCaptureMetrics(captureData: Record<string, unknown>): BenchmarkMetric[] {
	const rawTimes = numberArray(captureData.TimeInSeconds);
	const sampleIndexes = validTimeIndexes(rawTimes);
	if (sampleIndexes.length === 0) return [];

	const firstTime = rawTimes[sampleIndexes[0]!]!;
	const timeSeconds = sampleIndexes.map((index) => rawTimes[index]! - firstTime);
	const metrics: BenchmarkMetric[] = [];
	const addMetric = (
		key: BenchmarkMetricKey,
		property: string,
		transform: (value: number) => number | null = (value) => value
	) => {
		const rawValues = unknownArray(captureData[property]);
		const values = sampleIndexes.map((index) => {
			const value = finiteNumber(rawValues[index]);
			return value === null ? null : transform(value);
		});
		if (values.some((value) => value !== null)) {
			metrics.push({ key, timeSeconds: [...timeSeconds], values });
		}
	};

	addMetric('fps', 'MsBetweenPresents', (value) => (value > 0 ? 1_000 / value : null));
	addMetric('frametime', 'MsBetweenPresents');

	return metrics;
}

function parseSensorData2(
	sensorData: Record<string, unknown>,
	captureDuration: number | null
): BenchmarkMetric[] {
	const measureTime = findSensor(sensorData, 'MeasureTime');
	const rawTimes = numberArray(measureTime?.Values);
	if (rawTimes.length === 0) return [];

	const selected = new Map<BenchmarkMetricKey, { mapping: SensorMapping; values: unknown[] }>();
	for (const sensor of Object.values(sensorData)) {
		const value = recordValue(sensor);
		if (!value) continue;
		const mapping = mapSensor(stringValue(value.Name), stringValue(value.Type));
		if (!mapping) continue;

		const existing = selected.get(mapping.key);
		if (!existing || mapping.priority > existing.mapping.priority) {
			selected.set(mapping.key, { mapping, values: unknownArray(value.Values) });
		}
	}

	return buildSensorMetrics(rawTimes, selected, captureDuration);
}

function parseLegacySensorData(
	sensorData: Record<string, unknown>,
	captureDuration: number | null
): BenchmarkMetric[] {
	const rawTimes = numberArray(sensorData.MeasureTime);
	if (rawTimes.length === 0) return [];

	const selected = new Map<BenchmarkMetricKey, { mapping: SensorMapping; values: unknown[] }>();
	const add = (key: BenchmarkMetricKey, property: string, scale?: number) => {
		const values = unknownArray(sensorData[property]);
		if (values.length > 0) {
			selected.set(key, { mapping: { key, priority: 1, scale }, values });
		}
	};

	add('cpu_load', 'CpuUsage');
	add('cpu_mhz', 'CpuMaxClock');
	add('cpu_power', 'CpuPower');
	add('cpu_temp', 'CpuTemp');
	add('gpu_load', 'GpuUsage');
	add('gpu_core_clock', 'GpuClock');
	add('gpu_power', 'GpuPower');
	add('gpu_temp', 'GpuTemp');
	add('process_rss', 'RamUsage');
	if (unknownArray(sensorData.VRamUsageGB).length > 0) {
		add('gpu_vram_used', 'VRamUsageGB');
	} else {
		add('gpu_vram_used', 'VRamUsage', 1 / 1_024);
	}

	return buildSensorMetrics(rawTimes, selected, captureDuration);
}

function buildSensorMetrics(
	rawTimes: number[],
	selected: Map<BenchmarkMetricKey, { mapping: SensorMapping; values: unknown[] }>,
	captureDuration: number | null
): BenchmarkMetric[] {
	const sampleIndexes = validTimeIndexes(rawTimes, captureDuration);
	if (sampleIndexes.length === 0) return [];

	return [...selected.values()].flatMap(({ mapping, values: rawValues }) => {
		const values = sampleIndexes.map((index) => {
			const value = finiteNumber(rawValues[index]);
			return value === null ? null : value * (mapping.scale ?? 1);
		});
		if (!values.some((value) => value !== null)) return [];

		return [
			{
				key: mapping.key,
				timeSeconds: sampleIndexes.map((index) => rawTimes[index]!),
				values
			}
		];
	});
}

function mapSensor(name: string, type: string): SensorMapping | null {
	const normalizedName = normalizeSensorLabel(name);
	const normalizedType = normalizeSensorLabel(type);
	if (!normalizedName) return null;

	if (normalizedType === 'load' && normalizedName.includes('cpu total')) {
		return { key: 'cpu_load', priority: 1 };
	}
	if (normalizedType === 'clock' && normalizedName.includes('cpu max')) {
		return { key: 'cpu_mhz', priority: 1 };
	}
	if (
		normalizedType === 'power' &&
		normalizedName.includes('cpu') &&
		normalizedName.includes('package')
	) {
		return { key: 'cpu_power', priority: 1 };
	}
	if (
		normalizedType === 'temperature' &&
		normalizedName.includes('cpu') &&
		normalizedName.includes('package')
	) {
		return { key: 'cpu_temp', priority: 1 };
	}
	if (normalizedType === 'load' && normalizedName.includes('gpu core')) {
		return { key: 'gpu_load', priority: 1 };
	}
	if (normalizedType === 'temperature' && normalizedName.includes('gpu core')) {
		return { key: 'gpu_temp', priority: 1 };
	}
	if (normalizedType === 'clock' && normalizedName.includes('gpu core')) {
		return { key: 'gpu_core_clock', priority: 1 };
	}
	if (normalizedType === 'clock' && normalizedName.includes('gpu memory')) {
		return { key: 'gpu_mem_clock', priority: 1 };
	}
	if (
		(normalizedType === 'data' || normalizedType === 'small data') &&
		normalizedName.includes('gpu memory dedicated') &&
		!normalizedName.includes('game')
	) {
		return {
			key: 'gpu_vram_used',
			priority: 1,
			scale: normalizedType === 'small data' ? 1 / 1_024 : 1
		};
	}
	if (
		(normalizedType === 'data' || normalizedType === 'small data') &&
		normalizedName === 'ram used'
	) {
		return {
			key: 'ram_used',
			priority: 1,
			scale: normalizedType === 'small data' ? 1 / 1_024 : 1
		};
	}
	if (
		(normalizedType === 'data' || normalizedType === 'small data') &&
		normalizedName === 'ram game used'
	) {
		return {
			key: 'process_rss',
			priority: 1,
			scale: normalizedType === 'small data' ? 1 / 1_024 : 1
		};
	}
	if (normalizedType === 'power' && normalizedName.includes('gpu')) {
		const priority = normalizedName.includes('tbp')
			? 3
			: normalizedName.includes('total') || normalizedName.includes('power')
				? 2
				: normalizedName.includes('tdp')
					? 1
					: 0;
		return priority > 0 ? { key: 'gpu_power', priority } : null;
	}

	return null;
}

function validTimeIndexes(rawTimes: number[], maximumTime?: number | null): number[] {
	const indexes: number[] = [];
	let previousTime = -Infinity;

	for (let index = 0; index < rawTimes.length && indexes.length < MAXIMUM_DATA_POINTS; index++) {
		const time = rawTimes[index]!;
		if (!Number.isFinite(time) || time < 0 || time < previousTime) continue;
		if (maximumTime !== undefined && maximumTime !== null && time > maximumTime) continue;
		indexes.push(index);
		previousTime = time;
	}

	return indexes;
}

function findSensor(
	sensorData: Record<string, unknown>,
	name: string
): Record<string, unknown> | null {
	const direct = recordValue(sensorData[name]);
	if (direct) return direct;
	return (
		Object.values(sensorData)
			.map(recordValue)
			.find((sensor) => sensor && stringValue(sensor.Name) === name) ?? null
	);
}

function maximumMetricTime(metrics: BenchmarkMetric[]): number | null {
	let maximum: number | null = null;
	for (const metric of metrics) {
		const last = metric.timeSeconds.at(-1);
		if (last !== undefined && Number.isFinite(last)) {
			maximum = maximum === null ? last : Math.max(maximum, last);
		}
	}
	return maximum;
}

function parseCapFrameXDocument(json: string): CapFrameXDocument | null {
	try {
		const value = JSON.parse(json.replace(/^\uFEFF/, ''));
		const document = recordValue(value);
		const info = recordValue(document?.Info);
		const runs = document?.Runs;
		return info && Array.isArray(runs) && looksLikeCapFrameXInfo(info)
			? { Info: info, Runs: runs }
			: null;
	} catch {
		return null;
	}
}

function parseCapFrameXInfoPrefix(json: string): Record<string, unknown> | null {
	const propertyMatch = /"Info"\s*:/.exec(json);
	if (!propertyMatch) return null;
	const start = json.indexOf('{', propertyMatch.index + propertyMatch[0].length);
	if (start === -1) return null;

	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let index = start; index < json.length; index++) {
		const character = json[index]!;
		if (quoted) {
			if (escaped) escaped = false;
			else if (character === '\\') escaped = true;
			else if (character === '"') quoted = false;
			continue;
		}
		if (character === '"') quoted = true;
		else if (character === '{') depth++;
		else if (character === '}' && --depth === 0) {
			try {
				return recordValue(JSON.parse(json.slice(start, index + 1)));
			} catch {
				return null;
			}
		}
	}
	return null;
}

function looksLikeCapFrameXInfo(info: Record<string, unknown>): boolean {
	return (
		typeof info.AppVersion === 'string' &&
		(typeof info.Processor === 'string' ||
			typeof info.GPU === 'string' ||
			typeof info.ProcessName === 'string')
	);
}

function parseMemoryDescription(value: string): number | null {
	const match = /(\d+(?:\.\d+)?)\s*(TiB|TB|GiB|GB|MiB|MB)\b/i.exec(value);
	if (!match) return null;
	const amount = Number(match[1]);
	if (!Number.isFinite(amount) || amount <= 0) return null;

	const unit = match[2]!.toLowerCase();
	const multiplier =
		unit === 'tib' || unit === 'tb'
			? 1024 ** 4
			: unit === 'mib' || unit === 'mb'
				? 1024 ** 2
				: 1024 ** 3;
	return amount * multiplier;
}

function normalizeSensorLabel(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function numberArray(value: unknown): number[] {
	return unknownArray(value).map((item) => finiteNumber(item) ?? Number.NaN);
}

function unknownArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value.slice(0, MAXIMUM_DATA_POINTS) : [];
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function recordValue(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}
