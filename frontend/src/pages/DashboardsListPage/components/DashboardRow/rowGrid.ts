// Literal class strings so Tailwind's scanner picks up both templates.
const WITH_UPDATED =
	'tw:grid tw:grid-cols-[40px_minmax(240px,1.6fr)_minmax(160px,1fr)_minmax(180px,220px)_minmax(150px,180px)_40px] tw:items-center tw:gap-3 tw:px-4';
const WITHOUT_UPDATED =
	'tw:grid tw:grid-cols-[40px_minmax(240px,1.6fr)_minmax(160px,1fr)_minmax(180px,220px)_40px] tw:items-center tw:gap-3 tw:px-4';

/** Column template shared by the header row and every dashboard row. */
export function rowGridClass(showUpdated: boolean): string {
	return showUpdated ? WITH_UPDATED : WITHOUT_UPDATED;
}
