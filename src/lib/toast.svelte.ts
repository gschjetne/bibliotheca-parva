// App-level toast notifications. The state lives in this module rather than in
// the component that raises a toast, so a toast survives the navigation its
// trigger kicks off: BookEditor shows "Book saved" and immediately navigates
// back to the previous page, but the toast is rendered by the root layout and
// stays put. (showToast is only ever called from a browser event handler, so
// this module-level state is never populated during SSR.)

export type Toast = {
	id: number;
	message: string;
	href?: string;
	linkText?: string;
};

let nextId = 0;
export const toasts = $state<Toast[]>([]);

/** Show a toast. Auto-dismisses after `timeout` ms; pass 0 to keep it until clicked. */
export function showToast(toast: Omit<Toast, 'id'>, timeout = 6000): number {
	const id = nextId++;
	toasts.push({ id, ...toast });
	if (timeout > 0) setTimeout(() => dismissToast(id), timeout);
	return id;
}

export function dismissToast(id: number): void {
	const i = toasts.findIndex((t) => t.id === id);
	if (i !== -1) toasts.splice(i, 1);
}
