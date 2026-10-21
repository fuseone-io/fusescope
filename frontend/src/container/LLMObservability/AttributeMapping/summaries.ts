import { isEqual } from 'lodash-es';

import type { ConditionKey, DraftGroup, DraftMapper } from './types';

const MAX_LISTED_KEYS = 3;

const plural = (count: number, noun: string): string =>
	`${count} ${noun}${count === 1 ? '' : 's'}`;

export function summarizeConditions(
	attributes: ConditionKey[],
	resource: ConditionKey[],
): string {
	const keys = [...attributes, ...resource].map((entry) => entry.value);
	if (keys.length === 0) {
		return 'No conditions';
	}

	let scope = 'an attribute or resource key';
	if (resource.length === 0) {
		scope = 'an attribute key';
	} else if (attributes.length === 0) {
		scope = 'a resource key';
	}

	const listed = keys.slice(0, MAX_LISTED_KEYS).join(', ');
	const rest = keys.length - MAX_LISTED_KEYS;
	const more = rest > 0 ? ` +${rest} more` : '';
	return `Runs when ${scope} contains ${listed}${more}`;
}

/** Null while a saved group's mappings have not been fetched yet. */
export function mappingCountLabel(group: DraftGroup): string | null {
	if (group.mappers.length === 0 && group.serverId !== null) {
		return null;
	}
	return plural(group.mappers.length, 'mapping');
}

const groupFields = (
	group: DraftGroup,
): Omit<DraftGroup, 'mappers' | 'localId' | 'serverId'> => ({
	name: group.name,
	attributes: group.attributes,
	resource: group.resource,
	enabled: group.enabled,
});

function countMapperChanges(
	before: DraftMapper[],
	after: DraftMapper[],
): number {
	const beforeById = new Map(before.map((entry) => [entry.localId, entry]));
	const afterIds = new Set(after.map((entry) => entry.localId));
	const removed = before.filter((entry) => !afterIds.has(entry.localId)).length;
	const addedOrChanged = after.filter(
		(entry) => !isEqual(beforeById.get(entry.localId), entry),
	).length;
	return removed + addedOrChanged;
}

/** One line for the unsaved-changes bar; null when the draft matches. */
export function summarizeDraftChanges(
	snapshot: DraftGroup[],
	draft: DraftGroup[],
): string | null {
	const snapshotById = new Map(snapshot.map((entry) => [entry.localId, entry]));
	const draftIds = new Set(draft.map((entry) => entry.localId));

	let groupChanges = snapshot.filter(
		(entry) => !draftIds.has(entry.localId),
	).length;
	let mappingChanges = 0;
	const groupsWithMappingChanges: string[] = [];

	draft.forEach((entry) => {
		const before = snapshotById.get(entry.localId);
		if (!before) {
			groupChanges += 1;
			return;
		}
		if (!isEqual(groupFields(before), groupFields(entry))) {
			groupChanges += 1;
		}
		const changed = countMapperChanges(before.mappers, entry.mappers);
		if (changed > 0) {
			mappingChanges += changed;
			groupsWithMappingChanges.push(entry.name);
		}
	});

	if (groupChanges === 0 && mappingChanges === 0) {
		return null;
	}
	if (mappingChanges === 0) {
		return `${plural(groupChanges, 'group')} changed`;
	}
	if (groupChanges > 0) {
		return `${plural(groupChanges, 'group')} and ${plural(mappingChanges, 'mapping')} changed`;
	}
	const where =
		groupsWithMappingChanges.length === 1
			? groupsWithMappingChanges[0]
			: plural(groupsWithMappingChanges.length, 'group');
	return `${plural(mappingChanges, 'mapping')} changed in ${where}`;
}
