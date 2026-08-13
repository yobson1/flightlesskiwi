export function formDataFromSubmitEvent(event: SubmitEvent): FormData {
	if (!(event.currentTarget instanceof HTMLFormElement)) {
		throw new TypeError('Submit event did not originate from a form');
	}
	return new FormData(event.currentTarget);
}
