import { afterNavigate, beforeNavigate } from '$app/navigation';

const NAVIGATION_PENDING_CLASS = 'navigation-pending';
const NAVIGATION_PROGRESS_VISIBLE_CLASS = 'navigation-progress-visible';
const NAVIGATION_COMPLETE_CLASS = 'navigation-complete';
const PROGRESS_DELAY_MS = 150;
const COMPLETION_DURATION_MS = 220;

export function setupNavigationCursor(): void {
	let navigationCursorId = 0;
	let navigationPending = false;
	let progressVisible = false;
	let progressTimer: number | undefined;
	let completionTimer: number | undefined;

	beforeNavigate((navigation) => {
		if (navigation.shallow && navigation.type !== 'popstate') return;
		if (navigation.willUnload) return;

		const cursorId = ++navigationCursorId;
		navigationPending = true;
		progressVisible = false;
		window.clearTimeout(progressTimer);
		window.clearTimeout(completionTimer);
		document.documentElement.classList.remove(NAVIGATION_PROGRESS_VISIBLE_CLASS);
		document.documentElement.classList.remove(NAVIGATION_COMPLETE_CLASS);
		document.documentElement.classList.add(NAVIGATION_PENDING_CLASS);
		progressTimer = window.setTimeout(() => {
			if (!navigationPending || cursorId !== navigationCursorId) return;
			progressVisible = true;
			document.documentElement.classList.add(NAVIGATION_PROGRESS_VISIBLE_CLASS);
		}, PROGRESS_DELAY_MS);

		const cancel = navigation.cancel;
		navigation.cancel = () => {
			cancel();
			if (cursorId === navigationCursorId) {
				navigationPending = false;
				progressVisible = false;
				window.clearTimeout(progressTimer);
				document.documentElement.classList.remove(NAVIGATION_PENDING_CLASS);
				document.documentElement.classList.remove(NAVIGATION_PROGRESS_VISIBLE_CLASS);
			}
		};
	});

	afterNavigate(({ shallow, type }) => {
		if (shallow && type !== 'popstate') return;
		if (!navigationPending) return;

		navigationPending = false;
		window.clearTimeout(progressTimer);
		document.documentElement.classList.remove(NAVIGATION_PENDING_CLASS);
		document.documentElement.classList.remove(NAVIGATION_PROGRESS_VISIBLE_CLASS);
		if (!progressVisible) return;

		progressVisible = false;
		document.documentElement.classList.add(NAVIGATION_COMPLETE_CLASS);
		completionTimer = window.setTimeout(() => {
			document.documentElement.classList.remove(NAVIGATION_COMPLETE_CLASS);
		}, COMPLETION_DURATION_MS);
	});
}
