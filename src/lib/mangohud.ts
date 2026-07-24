export interface MangoHudSystemInfo {
	os: string;
	cpu: string;
	gpu: string;
	ramKiB: number | null;
	kernel: string;
	driver: string;
	cpuScheduler: string;
}

const REQUIRED_SYSTEM_HEADERS = ['os', 'cpu', 'gpu', 'ram', 'kernel'] as const;

export function parseMangoHudSystemInfo(csv: string): MangoHudSystemInfo | null {
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
		ramKiB: Number.isFinite(parsedRam) && parsedRam > 0 ? parsedRam : null,
		kernel: value('kernel'),
		driver: value('driver'),
		cpuScheduler: value('cpuscheduler')
	};
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
