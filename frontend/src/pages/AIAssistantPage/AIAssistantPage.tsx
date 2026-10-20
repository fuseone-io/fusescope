import { useCallback, useEffect, useRef } from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';

import logEvent from 'api/common/logEvent';
import ROUTES from 'constants/routes';

import ConversationView from 'container/AIAssistant/ConversationView';
import { AIAssistantEvents } from 'container/AIAssistant/events';
import { normalizePage } from 'container/AIAssistant/hooks/useAIAssistantAnalyticsContext';
import { useAIAssistantStore } from 'container/AIAssistant/store/useAIAssistantStore';
import { VariantContext } from 'container/AIAssistant/VariantContext';
import Noz from 'components/Noz/Noz';

import { useAIAssistantStripInfo } from './useAIAssistantStripInfo';

import ConversationsList from 'container/AIAssistant/components/ConversationsList';

interface RouteParams {
	conversationId: string;
}

export default function AIAssistantPage(): JSX.Element {
	const history = useHistory();
	const location = useLocation<{ fromInApp?: boolean } | undefined>();
	const { pathname } = location;
	const { conversationId } = useParams<RouteParams>();

	// Skip the mount-time Opened fire when the user expanded an already-open
	// drawer/modal — that surface already emitted Opened with the right source.
	// Router state (vs a module flag) survives page remounts and aborted
	// navigations.
	const fromInApp = location.state?.fromInApp === true;
	useEffect(() => {
		if (fromInApp) {
			return;
		}
		void logEvent(AIAssistantEvents.Opened, {
			source: 'deeplink',
			currentPage: normalizePage(pathname),
		});
		// Only on mount; route param changes inside the same page aren't a re-open.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useAIAssistantStripInfo();

	const conversations = useAIAssistantStore((s) => s.conversations);
	const activeConversationId = useAIAssistantStore(
		(s) => s.activeConversationId,
	);
	const setActiveConversation = useAIAssistantStore(
		(s) => s.setActiveConversation,
	);
	const startNewConversation = useAIAssistantStore(
		(s) => s.startNewConversation,
	);

	// Keep refs so the effect can read the latest store state without re-firing
	// when it mutates the store mid-effect (it only depends on the URL param).
	const conversationsRef = useRef(conversations);
	conversationsRef.current = conversations;
	const activeConversationIdRef = useRef(activeConversationId);
	activeConversationIdRef.current = activeConversationId;

	useEffect(() => {
		// URL points at a known conversation → just activate it.
		if (conversationId && conversationsRef.current[conversationId]) {
			setActiveConversation(conversationId);
			return;
		}

		// The URL has no usable conversation id (bare `/ai-assistant`, or a stale
		// param). Prefer resuming the active conversation — including the
		// rehydrating placeholder for the persisted thread — over minting a new
		// one. This is what stops a throwaway blank chat from flashing as a
		// second thread during load, and stops a duplicate when the page
		// remounts during startup route churn (the active id is already set, so
		// we resume instead of create). Starting fresh is the last resort, only
		// when there is genuinely nothing to resume.
		const activeId = activeConversationIdRef.current;
		const resumeId =
			activeId && conversationsRef.current[activeId]
				? activeId
				: startNewConversation();
		history.replace(ROUTES.AI_ASSISTANT.replace(':conversationId', resumeId));
		// Only re-run when the URL param changes, not when conversations mutates.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [conversationId]);

	// Keep the URL in lock-step with `activeConversationId`. The first send on a
	// new conversation re-keys the store entry from the local client UUID to the
	// backend threadId; without this sync the URL would still point at the now-
	// deleted client UUID, leaving `<ConversationView>` unmounted until reload.
	useEffect(() => {
		if (
			activeConversationId &&
			activeConversationId !== conversationId &&
			conversations[activeConversationId]
		) {
			history.replace(
				ROUTES.AI_ASSISTANT.replace(':conversationId', activeConversationId),
			);
		}
	}, [activeConversationId, conversationId, conversations, history]);

	// When conversations sidebar selects a thread, navigate to it
	const handleHistorySelect = useCallback(
		(id: string) => {
			history.push(ROUTES.AI_ASSISTANT.replace(':conversationId', id));
		},
		[history],
	);

	const handleNewConversation = useCallback(() => {
		void logEvent(AIAssistantEvents.NewChatClicked, {
			page: normalizePage(pathname),
			mode: 'full_screen',
			source: 'history_list',
		});
		const newId = startNewConversation();
		history.push(ROUTES.AI_ASSISTANT.replace(':conversationId', newId));
	}, [startNewConversation, history, pathname]);

	// Prefer the URL param, but fall back to the store's `activeConversationId`
	// for the brief render after a re-key (client UUID → backend threadId), so
	// the chat doesn't unmount while the URL sync effect catches up.
	let activeId: string | null = null;
	if (conversations[conversationId]) {
		activeId = conversationId;
	} else if (activeConversationId && conversations[activeConversationId]) {
		activeId = activeConversationId;
	}

	return (
		<VariantContext.Provider value="page">
			<div className="tw:flex tw:h-full tw:flex-col tw:bg-background">
				<div className="fs-ui tw:flex tw:flex-none tw:items-center tw:border-b tw:border-border tw:bg-surface-raised tw:px-4 tw:py-3 tw:font-sans tw:md:px-6">
					<div className="noz-wave tw:flex tw:items-center tw:gap-3">
						<span
							aria-hidden="true"
							className="tw:flex tw:size-8 tw:flex-none tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary-soft"
						>
							<Noz size={18} />
						</span>
						<h1 className="tw:text-base tw:font-semibold tw:tracking-[-0.01em] tw:text-foreground">
							Noz
						</h1>
					</div>
				</div>

				<div className="tw:flex tw:w-full tw:flex-1 tw:flex-row tw:overflow-hidden">
					<ConversationsList
						onSelect={handleHistorySelect}
						onNewConversation={handleNewConversation}
						showAddNewConversation
					/>

					<div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden">
						{activeId && <ConversationView conversationId={activeId} />}
					</div>
				</div>
			</div>
		</VariantContext.Provider>
	);
}
