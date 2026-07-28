import {
	createBenchmarkMetric,
	isBenchmarkMetricKey,
	type BenchmarkData,
	type BenchmarkMetricKey,
	type BenchmarkRun,
	type BenchmarkSystemInfo
} from '$lib/benchmark-run-model';

const REQUIRED_SYSTEM_HEADERS = ['os', 'cpu', 'gpu', 'ram', 'kernel'] as const;
const MAXIMUM_DATA_RECORDS = 100_000;

interface MangoHudMetricColumn {
	key: BenchmarkMetricKey;
	index: number;
	values: Array<number | null>;
}

export function parseMangoHudSystemInfo(csv: string): BenchmarkSystemInfo | null {
	const records: string[][] = [];
	visitCsvRecords(csv, 2, (record) => {
		records.push(record);
	});
	return buildMangoHudSystemInfo(records);
}

export function parseMangoHudBenchmarkRun(csv: string): BenchmarkRun | null {
	const parsed = parseMangoHudCsv(csv);
	return parsed ? { source: 'mangohud', ...parsed } : null;
}

export function parseMangoHudBenchmarkData(csv: string): BenchmarkData | null {
	return parseMangoHudCsv(csv)?.data ?? null;
}

function buildMangoHudSystemInfo(records: string[][]): BenchmarkSystemInfo | null {
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

function parseMangoHudCsv(
	csv: string
): { systemInfo: BenchmarkSystemInfo; data: BenchmarkData } | null {
	const systemRecords: string[][] = [];
	let systemInfo: BenchmarkSystemInfo | null = null;
	let metricColumns: MangoHudMetricColumn[] | null = null;
	let parsedValues: Array<number | null> = [];
	let elapsedIndex = -1;
	let frametimeIndex = -1;
	const timeSeconds: number[] = [];
	let firstElapsed: number | null = null;
	let previousTime = 0;

	visitCsvRecords(csv, MAXIMUM_DATA_RECORDS + 3, (record, recordIndex) => {
		if (recordIndex < 2) {
			systemRecords.push(record);
			if (recordIndex === 1) {
				systemInfo = buildMangoHudSystemInfo(systemRecords);
				if (systemInfo === null) return false;
			}
			return;
		}

		if (metricColumns === null) {
			const headers = record.map(normalizeHeader);
			if (!headers.includes('fps') && !headers.includes('frametime')) return;

			elapsedIndex = headers.indexOf('elapsed');
			frametimeIndex = headers.indexOf('frametime');
			const seenMetrics = new Set<string>();
			metricColumns = [];
			for (const [index, key] of headers.entries()) {
				if (!isBenchmarkMetricKey(key) || seenMetrics.has(key)) continue;
				seenMetrics.add(key);
				metricColumns.push({ key, index, values: [] });
			}
			if (metricColumns.length === 0) return false;
			parsedValues = new Array<number | null>(metricColumns.length);
			return;
		}

		let hasMetricValue = false;
		for (let index = 0; index < metricColumns.length; index++) {
			const value = parseNumber(record[metricColumns[index]!.index]);
			parsedValues[index] = value;
			if (value !== null) hasMetricValue = true;
		}
		if (!hasMetricValue) return;

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
		for (let index = 0; index < metricColumns.length; index++) {
			metricColumns[index]!.values.push(parsedValues[index] ?? null);
		}
	});

	const completedMetricColumns = metricColumns as MangoHudMetricColumn[] | null;
	if (systemInfo === null || completedMetricColumns === null || timeSeconds.length === 0) {
		return null;
	}

	const metrics = completedMetricColumns
		.map(({ key, values }) => createBenchmarkMetric(key, [...timeSeconds], values))
		.filter(({ values }) => values.some((value) => value !== null));
	if (metrics.length === 0) return null;

	return { systemInfo, data: { metrics } };
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

function visitCsvRecords(
	csv: string,
	maximumRecords: number,
	visit: (record: string[], recordIndex: number) => boolean | void
): void {
	let record: string[] = [];
	let field = '';
	let fieldStart = 0;
	let quoted = false;
	let wasQuoted = false;
	let recordCount = 0;

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

		if (character === '"' && index === fieldStart) {
			quoted = true;
			wasQuoted = true;
		} else if (character === ',') {
			record.push(wasQuoted ? field : csv.slice(fieldStart, index));
			field = '';
			fieldStart = index + 1;
			wasQuoted = false;
		} else if (character === '\n' || character === '\r') {
			record.push(wasQuoted ? field : csv.slice(fieldStart, index));
			if (visit(record, recordCount) === false) return;
			recordCount++;
			if (recordCount === maximumRecords) return;
			record = [];
			field = '';
			if (character === '\r' && csv[index + 1] === '\n') index++;
			fieldStart = index + 1;
			wasQuoted = false;
		} else if (wasQuoted) {
			field += character;
		} else {
			continue;
		}
	}

	if (!quoted && (field.length > 0 || fieldStart < csv.length || record.length > 0)) {
		record.push(wasQuoted ? field : csv.slice(fieldStart));
		visit(record, recordCount);
	}
}
