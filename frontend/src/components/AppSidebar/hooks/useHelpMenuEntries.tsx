import { useMemo } from 'react';
import { FeatureKeys } from 'constants/features';
import { fuseScopeDocsUrl } from 'constants/docs';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { Github } from '@signozhq/icons';
import {
	Book,
	Bug,
	GitCommitVertical,
	LampDesk,
	MessageSquareText,
	Plus,
	ScrollText,
} from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

import {
	FUSESCOPE_NEW_ISSUE_URL,
	FUSESCOPE_RELEASES_URL,
	FUSESCOPE_REPO_URL,
} from '../constants';
import { HelpMenuEntry } from '../types';

const LINKS: HelpMenuEntry[] = [
	{
		type: 'item',
		key: 'documentation',
		label: 'Documentation',
		icon: <Book />,
		url: fuseScopeDocsUrl(),
	},
	{
		type: 'item',
		key: 'github',
		label: 'GitHub',
		icon: <Github size={16} />,
		url: FUSESCOPE_REPO_URL,
	},
	{
		type: 'item',
		key: 'report-issue',
		label: 'Report an issue',
		icon: <Bug />,
		url: FUSESCOPE_NEW_ISSUE_URL,
	},
];

/** Help & Support rows: links, gated support/invite rows, then what's new. */
export function useHelpMenuEntries(): HelpMenuEntry[] {
	const { user, featureFlags, trialInfo, isLoggedIn, changelog } =
		useAppContext();
	const { isCloudUser, isEnterpriseSelfHostedUser } = useGetTenantLicense();

	const isFlagActive = (key: FeatureKeys): boolean =>
		featureFlags?.find((flag) => flag.name === key)?.active ?? false;

	const needsCard =
		!isFlagActive(FeatureKeys.PREMIUM_SUPPORT) &&
		!trialInfo?.trialConvertedToSubscription;
	const canChat =
		isLoggedIn &&
		isFlagActive(FeatureKeys.CHAT_SUPPORT) &&
		!needsCard &&
		(isCloudUser || isEnterpriseSelfHostedUser);
	const isAdmin = user.role === USER_ROLES.ADMIN;

	return useMemo((): HelpMenuEntry[] => {
		const entries = [...LINKS];
		if (canChat) {
			entries.push({
				type: 'item',
				key: 'chat-support',
				label: 'Chat with Support',
				icon: <MessageSquareText />,
			});
		}
		if (isAdmin) {
			entries.push({
				type: 'item',
				key: 'invite-collaborators',
				label: 'Invite a Team Member',
				icon: <Plus />,
			});
		}
		if (!changelog) {
			return entries;
		}

		entries.push({ type: 'separator', key: 'changelog-separator' });
		const features = changelog.features.slice(0, 2);
		if (features.length > 0) {
			entries.push({ type: 'label', key: 'whats-new', label: "What's new" });
			features.forEach((feature, idx) =>
				entries.push({
					type: 'item',
					key: `changelog-${idx + 1}`,
					label: feature.title,
					icon: idx === 0 ? <LampDesk /> : <GitCommitVertical />,
				}),
			);
		}
		entries.push({
			type: 'item',
			key: 'full-changelog',
			label: 'Full Changelog',
			icon: <ScrollText />,
			url: FUSESCOPE_RELEASES_URL,
		});
		return entries;
	}, [canChat, isAdmin, changelog]);
}
