import {
	createBenchmarkMetric,
	type BenchmarkData,
	type BenchmarkMetric,
	type BenchmarkMetricKey,
	type BenchmarkRun,
	type BenchmarkSystemInfo
} from '$lib/benchmark-run-model';
import { isNonArrayObject } from '$lib/utils';
import * as v from 'valibot';

const MAXIMUM_DATA_POINTS = 100_000;

const optionalString = v.optional(v.nullable(v.string()));
const capFrameXInfoSchema = v.object({
	AppVersion: v.string(),
	Processor: optionalString,
	GPU: optionalString,
	ProcessName: optionalString,
	OS: optionalString,
	SystemRam: optionalString,
	Motherboard: optionalString,
	GPUDriverVersion: optionalString,
	DriverPackage: optionalString,
	BaseDriverVersion: optionalString
});
const capFrameXDocumentSchema = v.object({
	Info: capFrameXInfoSchema,
	Runs: v.array(v.unknown())
});
const numericSamplesSchema = v.pipe(
	v.array(v.unknown()),
	v.transform((values) =>
		values
			.slice(0, MAXIMUM_DATA_POINTS)
			.map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN))
	)
);
const optionalNumericSamples = v.fallback(v.optional(numericSamplesSchema, []), []);
const captureDataSchema = v.object({
	TimeInSeconds: optionalNumericSamples,
	MsBetweenPresents: optionalNumericSamples
});
const sensorSchema = v.object({
	Name: v.string(),
	Type: v.string(),
	StableIdentifier: optionalString,
	Values: numericSamplesSchema
});
const legacySensorDataSchema = v.object({
	MeasureTime: optionalNumericSamples,
	CpuUsage: optionalNumericSamples,
	CpuMaxClock: optionalNumericSamples,
	CpuPower: optionalNumericSamples,
	CpuTemp: optionalNumericSamples,
	GpuUsage: optionalNumericSamples,
	GpuClock: optionalNumericSamples,
	GpuPower: optionalNumericSamples,
	GpuTemp: optionalNumericSamples,
	RamUsage: optionalNumericSamples,
	VRamUsageGB: optionalNumericSamples,
	VRamUsage: optionalNumericSamples
});
const capFrameXRunSchema = v.object({
	CaptureData: v.optional(v.unknown()),
	SensorData2: v.optional(v.unknown()),
	SensorData: v.optional(v.unknown())
});

type CapFrameXDocument = v.InferOutput<typeof capFrameXDocumentSchema>;
type CapFrameXInfo = v.InferOutput<typeof capFrameXInfoSchema>;
type CaptureData = v.InferOutput<typeof captureDataSchema>;
type Sensor = v.InferOutput<typeof sensorSchema>;
type SensorData2 = Record<string, Sensor>;
type LegacySensorData = v.InferOutput<typeof legacySensorDataSchema>;

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

function buildSystemInfo(info: CapFrameXInfo): BenchmarkSystemInfo {
	const ramDescription = normalizedString(info.SystemRam);
	return {
		os: normalizedString(info.OS),
		cpu: normalizedString(info.Processor),
		gpu: normalizedString(info.GPU),
		ramBytes: parseMemoryDescription(ramDescription),
		ramDescription,
		kernel: '',
		driver:
			normalizedString(info.GPUDriverVersion) ||
			normalizedString(info.DriverPackage) ||
			normalizedString(info.BaseDriverVersion),
		cpuScheduler: '',
		motherboard: normalizedString(info.Motherboard)
	};
}

export function parseCapFrameXBenchmarkData(json: string): BenchmarkData | null {
	const document = parseCapFrameXDocument(json);
	if (!document || document.Runs.length !== 1) return null;
	return parseBenchmarkData(document);
}

function parseBenchmarkData(document: CapFrameXDocument): BenchmarkData | null {
	const result = v.safeParse(capFrameXRunSchema, document.Runs[0]);
	if (!result.success) return null;
	const run = result.output;
	const captureResult = v.safeParse(captureDataSchema, run.CaptureData);
	const captureData = captureResult.success ? captureResult.output : null;
	const captureMetrics = captureData ? parseCaptureMetrics(captureData) : [];
	const captureDuration = maximumMetricTime(captureMetrics);
	const sensorData2 = parseSensorData2Value(run.SensorData2);
	const legacySensorResult = v.safeParse(legacySensorDataSchema, run.SensorData);
	const legacySensorData = legacySensorResult.success ? legacySensorResult.output : null;
	const sensorMetrics = sensorData2
		? parseSensorData2(sensorData2, captureDuration)
		: legacySensorData
			? parseLegacySensorData(legacySensorData, captureDuration)
			: [];
	const metrics = [...captureMetrics, ...sensorMetrics];

	return metrics.length > 0 ? { metrics } : null;
}

function parseSensorData2Value(value: unknown): SensorData2 | null {
	if (!isNonArrayObject(value)) return null;

	const sensors: SensorData2 = {};
	for (const [key, sensor] of Object.entries(value)) {
		const result = v.safeParse(sensorSchema, sensor);
		if (result.success) sensors[key] = result.output;
	}
	return sensors;
}

export function getCapFrameXRunCount(json: string): number | null {
	const document = parseCapFrameXDocument(json);
	return document?.Runs.length ?? null;
}

function parseCaptureMetrics(captureData: CaptureData): BenchmarkMetric[] {
	const rawTimes = limitedValues(captureData.TimeInSeconds);
	const sampleIndexes = validTimeIndexes(rawTimes);
	if (sampleIndexes.length === 0) return [];

	const firstTime = rawTimes[sampleIndexes[0]!]!;
	const timeSeconds = sampleIndexes.map((index) => rawTimes[index]! - firstTime);
	const metrics: BenchmarkMetric[] = [];
	const addMetric = (
		key: BenchmarkMetricKey,
		rawValues: number[] | undefined,
		transform: (value: number) => number | null = (value) => value
	) => {
		const valuesSource = limitedValues(rawValues);
		const values = sampleIndexes.map((index) => {
			const value = valuesSource[index];
			return value === undefined || !Number.isFinite(value) ? null : transform(value);
		});
		if (values.some((value) => value !== null)) {
			metrics.push(createBenchmarkMetric(key, [...timeSeconds], values));
		}
	};

	addMetric('fps', captureData.MsBetweenPresents, (value) => (value > 0 ? 1_000 / value : null));
	addMetric('frametime', captureData.MsBetweenPresents);

	return metrics;
}

function parseSensorData2(
	sensorData: SensorData2,
	captureDuration: number | null
): BenchmarkMetric[] {
	const measureTime = findSensor(sensorData, 'MeasureTime');
	const rawTimes = limitedValues(measureTime?.Values);
	if (rawTimes.length === 0) return [];

	const selected = new Map<BenchmarkMetricKey, { mapping: SensorMapping; values: number[] }>();
	for (const sensor of Object.values(sensorData)) {
		const mapping = mapSensor(sensor.Name, sensor.Type);
		if (!mapping) continue;

		const existing = selected.get(mapping.key);
		if (!existing || mapping.priority > existing.mapping.priority) {
			selected.set(mapping.key, { mapping, values: limitedValues(sensor.Values) });
		}
	}

	return buildSensorMetrics(rawTimes, selected, captureDuration);
}

function parseLegacySensorData(
	sensorData: LegacySensorData,
	captureDuration: number | null
): BenchmarkMetric[] {
	const rawTimes = limitedValues(sensorData.MeasureTime);
	if (rawTimes.length === 0) return [];

	const selected = new Map<BenchmarkMetricKey, { mapping: SensorMapping; values: number[] }>();
	const add = (key: BenchmarkMetricKey, values: number[] | undefined, scale?: number) => {
		const limited = limitedValues(values);
		if (limited.length > 0) {
			selected.set(key, { mapping: { key, priority: 1, scale }, values: limited });
		}
	};

	add('cpu_load', sensorData.CpuUsage);
	add('cpu_mhz', sensorData.CpuMaxClock);
	add('cpu_power', sensorData.CpuPower);
	add('cpu_temp', sensorData.CpuTemp);
	add('gpu_load', sensorData.GpuUsage);
	add('gpu_core_clock', sensorData.GpuClock);
	add('gpu_power', sensorData.GpuPower);
	add('gpu_temp', sensorData.GpuTemp);
	add('process_rss', sensorData.RamUsage);
	if (limitedValues(sensorData.VRamUsageGB).length > 0) {
		add('gpu_vram_used', sensorData.VRamUsageGB);
	} else {
		add('gpu_vram_used', sensorData.VRamUsage, 1 / 1_024);
	}

	return buildSensorMetrics(rawTimes, selected, captureDuration);
}

function buildSensorMetrics(
	rawTimes: number[],
	selected: Map<BenchmarkMetricKey, { mapping: SensorMapping; values: number[] }>,
	captureDuration: number | null
): BenchmarkMetric[] {
	const sampleIndexes = validTimeIndexes(rawTimes, captureDuration);
	if (sampleIndexes.length === 0) return [];

	return [...selected.values()].flatMap(({ mapping, values: rawValues }) => {
		const values = sampleIndexes.map((index) => {
			const value = rawValues[index];
			return value === undefined || !Number.isFinite(value) ? null : value * (mapping.scale ?? 1);
		});
		if (!values.some((value) => value !== null)) return [];

		return [
			createBenchmarkMetric(
				mapping.key,
				sampleIndexes.map((index) => rawTimes[index]!),
				values
			)
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

function findSensor(sensorData: SensorData2, name: string): Sensor | null {
	const direct = sensorData[name];
	if (direct) return direct;
	return Object.values(sensorData).find((sensor) => sensor.Name === name) ?? null;
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
		const result = v.safeParse(capFrameXDocumentSchema, JSON.parse(json.replace(/^\uFEFF/, '')));
		return result.success && looksLikeCapFrameXInfo(result.output.Info) ? result.output : null;
	} catch {
		return null;
	}
}

function parseCapFrameXInfoPrefix(json: string): CapFrameXInfo | null {
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
				const result = v.safeParse(capFrameXInfoSchema, JSON.parse(json.slice(start, index + 1)));
				return result.success ? result.output : null;
			} catch {
				return null;
			}
		}
	}
	return null;
}

function looksLikeCapFrameXInfo(info: CapFrameXInfo): boolean {
	return (
		info.AppVersion.length > 0 &&
		(info.Processor !== null && info.Processor !== undefined
			? true
			: info.GPU !== null && info.GPU !== undefined
				? true
				: info.ProcessName !== null && info.ProcessName !== undefined)
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

function limitedValues(values: number[] | undefined): number[] {
	return values?.slice(0, MAXIMUM_DATA_POINTS) ?? [];
}

function normalizedString(value: string | null | undefined): string {
	return value?.trim() ?? '';
}
