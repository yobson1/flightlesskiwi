import {
	createBenchmarkMetric,
	isBenchmarkMetricKey,
	type BenchmarkData,
	type BenchmarkMetricKey,
	type BenchmarkSystemInfo
} from '$lib/benchmark-run-model';

const REQUIRED_SYSTEM_HEADERS = ['os', 'cpu', 'gpu', 'ram', 'kernel'] as const;
const MAXIMUM_DATA_RECORDS = 100_000;

export function parseMangoHudSystemInfo(csv: string): BenchmarkSystemInfo | null {
	const records = parseCsvRecords(csv, 2);
	const headerRecord = records[0];
	const valueRecord = records[1];
	if (!headerRecord || !valueRecord) return null;

	const headers = headerRecord.map((header, index) =>
		(index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase()
	);
	if (!REQUIRED_SYSTEM_HEADERS.every((header) => headers.includes(header))) return null;

	const value = (header: string) => {
		const index = headers.indexOf(header);
		return index === -1 ? '' : (valueRecord[index]?.trim() ?? '');
	};
	const os = value('os');
	const cpu = value('cpu');
	const gpu = value('gpu');
	if (!os && !cpu && !gpu) return null;

	const rawRam = value('ram');
	const parsedRam = Number(rawRam);

	return {
		os,
		cpu,
		gpu,
		ramBytes: Number.isFinite(parsedRam) && parsedRam > 0 ? parsedRam * 1_024 : null,
		ramDescription: '',
		kernel: value('kernel'),
		driver: value('driver'),
		cpuScheduler: value('cpuscheduler'),
		motherboard: ''
	};
}

export function parseMangoHudBenchmarkData(csv: string): BenchmarkData | null {
	if (parseMangoHudSystemInfo(csv) === null) return null;

	const records = parseCsvRecords(csv, MAXIMUM_DATA_RECORDS + 3);
	const headerIndex = records.findIndex((record, index) => {
		if (index < 2) return false;
		const headers = record.map(normalizeHeader);
		return headers.includes('fps') || headers.includes('frametime');
	});
	if (headerIndex === -1) return null;

	const headers = records[headerIndex]!.map(normalizeHeader);
	const elapsedIndex = headers.indexOf('elapsed');
	const frametimeIndex = headers.indexOf('frametime');
	const metricColumns: Array<{ key: BenchmarkMetricKey; index: number }> = [];
	const seenMetrics = new Set<string>();

	for (const [index, key] of headers.entries()) {
		if (!isBenchmarkMetricKey(key) || seenMetrics.has(key)) continue;
		seenMetrics.add(key);
		metricColumns.push({ key, index });
	}
	if (metricColumns.length === 0) return null;

	const timeSeconds: number[] = [];
	const metricValues = new Map(metricColumns.map(({ key }) => [key, [] as Array<number | null>]));
	let firstElapsed: number | null = null;
	let previousTime = 0;

	for (const record of records.slice(headerIndex + 1, headerIndex + 1 + MAXIMUM_DATA_RECORDS)) {
		const parsedValues = metricColumns.map(({ index }) => parseNumber(record[index]));
		if (parsedValues.every((value) => value === null)) continue;

		const elapsed = elapsedIndex === -1 ? null : parseNumber(record[elapsedIndex]);
		const frametime = frametimeIndex === -1 ? null : parseNumber(record[frametimeIndex]);
		let sampleTime: number;

		if (elapsed !== null) {
			firstElapsed ??= elapsed;
			const elapsedSeconds = (elapsed - firstElapsed) / 1_000_000_000;
			sampleTime =
				Number.isFinite(elapsedSeconds) && elapsedSeconds >= previousTime
					? elapsedSeconds
					: fallbackSampleTime(timeSeconds.length, previousTime, frametime);
		} else {
			sampleTime = fallbackSampleTime(timeSeconds.length, previousTime, frametime);
		}

		timeSeconds.push(sampleTime);
		previousTime = sampleTime;
		for (const [index, { key }] of metricColumns.entries()) {
			metricValues.get(key)!.push(parsedValues[index] ?? null);
		}
	}

	if (timeSeconds.length === 0) return null;

	const metrics = metricColumns
		.map(({ key }) => createBenchmarkMetric(key, [...timeSeconds], metricValues.get(key)!))
		.filter(({ values }) => values.some((value) => value !== null));
	if (metrics.length === 0) return null;

	return { metrics };
}

function normalizeHeader(header: string, index: number): string {
	return (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase();
}

function parseNumber(value: string | undefined): number | null {
	if (value === undefined || value.trim() === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function fallbackSampleTime(sampleCount: number, previousTime: number, frametime: number | null) {
	if (sampleCount === 0) return 0;
	return previousTime + (frametime !== null && frametime > 0 ? frametime / 1_000 : 1);
}

function parseCsvRecords(csv: string, maximumRecords: number): string[][] {
	const records: string[][] = [];
	let record: string[] = [];
	let field = '';
	let quoted = false;

	for (let index = 0; index < csv.length; index++) {
		const character = csv[index]!;

		if (quoted) {
			if (character === '"' && csv[index + 1] === '"') {
				field += '"';
				index++;
			} else if (character === '"') {
				quoted = false;
			} else {
				field += character;
			}
			continue;
		}

		if (character === '"' && field.length === 0) {
			quoted = true;
		} else if (character === ',') {
			record.push(field);
			field = '';
		} else if (character === '\n' || character === '\r') {
			record.push(field);
			records.push(record);
			if (records.length === maximumRecords) return records;
			record = [];
			field = '';
			if (character === '\r' && csv[index + 1] === '\n') index++;
		} else {
			field += character;
		}
	}

	if (!quoted && (field.length > 0 || record.length > 0)) {
		record.push(field);
		records.push(record);
	}

	return records;
}
