import { useMemo } from 'react';
import { FeatureKeys } from 'constants/features';
import { signozDocsUrl } from 'constants/docs';
import { useGetTenantLicense } from 'hooks/useGetTenantLicense';
import { Github, Slack } from '@signozhq/icons';
import {
	Book,
	GitCommitVertical,
	LampDesk,
	MessageSquareText,
	Plus,
	ScrollText,
} from 'lucide-react';
import { useAppContext } from 'providers/App/App';
import { USER_ROLES } from 'types/roles';

import { HelpMenuEntry } from '../types';

const CHANGELOG_URL = 'https://signoz.io/changelog/';

const LINKS: HelpMenuEntry[] = [
	{
		type: 'item',
		key: 'documentation',
		label: 'Documentation',
		icon: <Book />,
		url: signozDocsUrl(),
	},
	{
		type: 'item',
		key: 'github',
		label: 'GitHub',
		icon: <Github size={16} />,
		url: 'https://github.com/signoz/signoz',
	},
	{
		type: 'item',
		key: 'slack',
		label: 'Community Slack',
		icon: <Slack size={16} />,
		url: 'https://signoz.io/slack',
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
			url: CHANGELOG_URL,
		});
		return entries;
	}, [canChat, isAdmin, changelog]);
}
