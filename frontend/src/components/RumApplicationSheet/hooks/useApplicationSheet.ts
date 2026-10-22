import { Dispatch, SetStateAction, useState } from 'react';
import type { RumtypesApplicationDTO } from 'api/generated/services/fuseScope.schemas';
import { useCanManageRum } from 'lib/rum/useCanManageRum';

import { SheetTab, SheetTarget } from '../types';
import { SheetData, useSheetData } from './useSheetData';
import { SheetMutations, useSheetMutations } from './useSheetMutations';

/** Plaintext key just issued in this sheet, shown once. */
export interface RevealedKey {
	keyId: string;
	key: string;
}

export interface ApplicationSheetState extends SheetData {
	/** The create flow, also after the application exists. */
	isNew: boolean;
	applicationId?: string;
	/** Set once the create flow has created the application. */
	setCreated: (application: RumtypesApplicationDTO) => void;
	tab: SheetTab;
	setTab: (tab: SheetTab) => void;
	revealed?: RevealedKey;
	setRevealed: Dispatch<SetStateAction<RevealedKey | undefined>>;
	/** A refused origin to add to the allowed list on the settings tab. */
	pendingOrigin?: string;
	setPendingOrigin: (origin: string | undefined) => void;
	mutations: SheetMutations;
}

export function useApplicationSheet(
	target: SheetTarget,
	initialTab?: SheetTab,
): ApplicationSheetState {
	const [created, setCreated] = useState<RumtypesApplicationDTO>();
	const applicationId =
		target.mode === 'edit' ? target.applicationId : created?.id;
	const [tab, setTab] = useState<SheetTab>(initialTab ?? 'settings');
	const [revealed, setRevealed] = useState<RevealedKey>();
	const [pendingOrigin, setPendingOrigin] = useState<string>();

	const data = useSheetData(applicationId, tab === 'install', useCanManageRum());
	const mutations = useSheetMutations();

	return {
		isNew: target.mode === 'new',
		applicationId,
		setCreated,
		tab,
		setTab,
		revealed,
		setRevealed,
		pendingOrigin,
		setPendingOrigin,
		...data,
		application: data.application ?? created,
		mutations,
	};
}
