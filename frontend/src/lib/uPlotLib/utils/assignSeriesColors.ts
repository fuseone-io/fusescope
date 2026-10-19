import { FS_SERIES_FAMILIES } from 'constants/fuseScopeColors';

import { paletteIndex } from './generateColor';

const SINGLE_SERVICE_LABEL =
	/^\{(?:service\.name|service_name|serviceName)="([^"]*)"\}$/;

/** A series grouped only by service is keyed by the service name, as on the trace page. */
export function seriesColorKey(label: string): string {
	return SINGLE_SERVICE_LABEL.exec(label)?.[1] ?? label;
}

const withoutBlanks = (
	colors: Record<string, string>,
): Record<string, string> =>
	Object.fromEntries(Object.entries(colors).filter(([, color]) => color));

/**
 * Colours a chart's series so each gets its own palette slot and no hue
 * family repeats while another is unused. A series keeps its hashed slot when
 * free; otherwise it probes forward for the least-used slot and family.
 * Labels are placed in sorted order, so the same set always gets the same
 * colours. Overrides win without moving any other series.
 */
export function assignSeriesColors(
	labels: readonly string[],
	palette: Record<string, string>,
	overrides: Record<string, string> = {},
	families: Record<string, string> = FS_SERIES_FAMILIES,
): Record<string, string> {
	const slots = Object.keys(palette);
	if (slots.length === 0) {
		return withoutBlanks(overrides);
	}

	const unique = Array.from(new Set(labels)).sort();
	const slotUse: number[] = new Array(slots.length).fill(0);
	const familyUse = new Map<string, number>();
	const familyOf = (slot: number): string =>
		families[slots[slot]] ?? slots[slot];
	const assigned = new Map<string, number>();
	const take = (label: string, slot: number): void => {
		assigned.set(label, slot);
		slotUse[slot] += 1;
		familyUse.set(familyOf(slot), (familyUse.get(familyOf(slot)) ?? 0) + 1);
	};
	const preferred = new Map(
		unique.map((label) => [
			label,
			paletteIndex(seriesColorKey(label), slots.length),
		]),
	);

	unique.forEach((label) => {
		const slot = preferred.get(label) ?? 0;
		if (slotUse[slot] === 0 && !familyUse.get(familyOf(slot))) {
			take(label, slot);
		}
	});

	unique.forEach((label) => {
		if (assigned.has(label)) {
			return;
		}
		const start = preferred.get(label) ?? 0;
		let best = start;
		for (let step = 1; step < slots.length; step += 1) {
			const slot = (start + step) % slots.length;
			const fewerSlotUses = slotUse[slot] < slotUse[best];
			const fewerFamilyUses =
				slotUse[slot] === slotUse[best] &&
				(familyUse.get(familyOf(slot)) ?? 0) < (familyUse.get(familyOf(best)) ?? 0);
			if (fewerSlotUses || fewerFamilyUses) {
				best = slot;
			}
		}
		take(label, best);
	});

	const colors: Record<string, string> = {};
	assigned.forEach((slot, label) => {
		colors[label] = overrides[label] || palette[slots[slot]];
	});
	return { ...withoutBlanks(overrides), ...colors };
}
