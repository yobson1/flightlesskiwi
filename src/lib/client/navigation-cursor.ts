import { afterNavigate, beforeNavigate } from '$app/navigation';

const NAVIGATION_PENDING_CLASS = 'navigation-pending';

export function setupNavigationCursor(): void {
	let navigationCursorId = 0;

	beforeNavigate((navigation) => {
		if (navigation.willUnload) return;

		const cursorId = ++navigationCursorId;
		document.documentElement.classList.add(NAVIGATION_PENDING_CLASS);

		const cancel = navigation.cancel;
		navigation.cancel = () => {
			cancel();
			if (cursorId === navigationCursorId) {
				document.documentElement.classList.remove(NAVIGATION_PENDING_CLASS);
			}
		};
	});

	afterNavigate(() => {
		document.documentElement.classList.remove(NAVIGATION_PENDING_CLASS);
	});
}
