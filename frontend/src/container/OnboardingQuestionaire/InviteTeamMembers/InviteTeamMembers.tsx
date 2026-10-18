import { useMemo } from 'react';
import logEvent from 'api/common/logEvent';
import InviteMembers from 'components/InviteMembers/InviteMembers';
import { InviteMemberRow, InviteResult } from 'components/InviteMembers/types';
import { useRoles } from 'components/RolesSelect/RolesSelect';
import { useNotifications } from 'hooks/useNotifications';
import { getBaseUrl } from 'utils/basePath';

import OnboardingNavButton from '../components/OnboardingNavButton';
import QuestionStep from '../components/QuestionStep';

interface TeamMember {
	email: string;
	roles: string[];
	name: string;
	frontendBaseUrl: string;
	id: string;
}

interface InviteTeamMembersProps {
	isLoading: boolean;
	onNext: () => void;
}

function InviteTeamMembers({
	isLoading,
	onNext,
}: InviteTeamMembersProps): JSX.Element {
	const { notifications } = useNotifications();
	const { roles } = useRoles();

	const roleIdToName = useMemo(() => {
		const map: Record<string, string> = {};
		roles.forEach((role) => {
			if (role.id && role.name) {
				map[role.id] = role.name;
			}
		});
		return map;
	}, [roles]);

	const toTeamMembers = (rows: InviteMemberRow[]): TeamMember[] =>
		rows.map((row) => ({
			email: row.email,
			roles: row.roleIds.map((roleId) => roleIdToName[roleId] ?? roleId),
			name: '',
			frontendBaseUrl: getBaseUrl(),
			id: row.id,
		}));

	const handleSuccess = (
		_results: InviteResult[],
		rows: InviteMemberRow[],
	): void => {
		logEvent('Org Onboarding: Invite Team Members Success', {
			teamMembers: toTeamMembers(rows),
		});
		notifications.success({
			message: 'Invites sent successfully!',
		});
		setTimeout(() => {
			onNext();
		}, 1000);
	};

	const handlePartialSuccess = (
		_results: InviteResult[],
		rows: InviteMemberRow[],
	): void => {
		logEvent('Org Onboarding: Invite Team Members Partial Success', {
			teamMembers: toTeamMembers(rows),
		});
		notifications.warning({
			message: 'Some invites failed. Check the errors above.',
		});
	};

	const handleAllFailed = (
		_results: InviteResult[],
		rows: InviteMemberRow[],
	): void => {
		logEvent('Org Onboarding: Invite Team Members Failed', {
			teamMembers: toTeamMembers(rows),
		});
	};

	const handleDoLater = (): void => {
		logEvent('Org Onboarding: Clicked Do Later', {
			currentPageID: 4,
		});
		onNext();
	};

	return (
		<QuestionStep
			title="Invite your team"
			subtitle="FuseScope is a lot more useful with collaborators on board."
		>
			<p className="fs-ui tw:text-sm tw:font-semibold tw:text-foreground">
				Invite your team to the FuseScope workspace
			</p>

			<InviteMembers
				onSuccess={handleSuccess}
				onPartialSuccess={handlePartialSuccess}
				onAllFailed={handleAllFailed}
				showHeader
				renderFooter={({ submit, canSubmit, isSubmitting }): JSX.Element => {
					const isButtonDisabled = isSubmitting || isLoading;

					return (
						<div className="fs-ui tw:flex tw:w-full tw:flex-col tw:gap-2 tw:font-sans">
							<OnboardingNavButton
								onClick={(): void => {
									void submit();
								}}
								loading={isButtonDisabled}
								disabled={!canSubmit}
								disabledTooltip="Add at least one team member to invite"
								testId="send-invites-button"
								showArrow
							>
								Send Invites
							</OnboardingNavButton>
							<OnboardingNavButton
								variant="secondary"
								onClick={handleDoLater}
								loading={isLoading}
								disabled={isSubmitting}
								disabledTooltip="Wait for the invites to be sent"
								testId="do-later-button"
							>
								I&apos;ll do this later
							</OnboardingNavButton>
						</div>
					);
				}}
			/>
		</QuestionStep>
	);
}

export default InviteTeamMembers;
