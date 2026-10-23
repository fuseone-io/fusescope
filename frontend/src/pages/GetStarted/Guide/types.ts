import type { OnboardingtypesStatusDTO } from 'api/generated/services/fuseScope.schemas';

/** Step 4: before "I started my app", then polling from that moment. */
export type VerifyPhase =
	| { status: 'idle' }
	| { status: 'waiting'; since: number };

export type VerifyState =
	| { status: 'idle' }
	| {
			status: 'waiting';
			since: number;
			data: OnboardingtypesStatusDTO | undefined;
	  }
	| { status: 'receiving'; since: number; data: OnboardingtypesStatusDTO };
