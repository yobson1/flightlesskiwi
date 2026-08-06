const MAXIMUM_TASKS_PER_FRAME = 3;
const FRAME_BUDGET_MILLISECONDS = 12;

interface ScheduledChartTask {
	cancelled: boolean;
	run: () => void;
}

const tasks: ScheduledChartTask[] = [];
let frameId: number | undefined;

export function scheduleBenchmarkChartTask(run: () => void, priority = false): () => void {
	const task = { cancelled: false, run };
	if (priority) tasks.unshift(task);
	else tasks.push(task);
	scheduleFrame();

	return () => {
		task.cancelled = true;
	};
}

function scheduleFrame(): void {
	if (frameId !== undefined) return;
	frameId = requestAnimationFrame(runFrame);
}

function runFrame(): void {
	frameId = undefined;
	const frameStart = performance.now();
	let completedTasks = 0;

	try {
		while (tasks.length > 0 && completedTasks < MAXIMUM_TASKS_PER_FRAME) {
			const task = tasks.shift()!;
			if (task.cancelled) continue;

			task.run();
			completedTasks++;
			if (performance.now() - frameStart >= FRAME_BUDGET_MILLISECONDS) break;
		}
	} finally {
		if (tasks.length > 0) scheduleFrame();
	}
}
