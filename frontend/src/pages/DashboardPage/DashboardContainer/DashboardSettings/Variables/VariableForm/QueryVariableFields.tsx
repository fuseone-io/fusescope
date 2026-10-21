import { useEffect, useRef, useState } from 'react';
import { Button } from 'components/ui/button';
import { cn } from 'lib/utils';
import { Loader2, Play } from 'lucide-react';
import logEvent from 'api/common/logEvent';
import dashboardVariablesQuery from 'api/dashboard/variables/dashboardVariablesQuery';
import Editor from 'components/Editor';
import { DashboardDetailEvents } from 'pages/DashboardPage/constants/events';
import type { PayloadVariables } from 'types/api/dashboard/variables/query';

import { BUTTON_SM } from '../../components/settingsClassNames';
import DisabledReason from '../../components/DisabledReason';
import SettingsField from '../../components/SettingsField';

interface QueryVariableFieldsProps {
	queryValue: string;
	/** Sibling variable selections, so dependent `$vars` in the query resolve. */
	variables: PayloadVariables;
	onChange: (queryValue: string) => void;
	onPreview: (values: (string | number)[]) => void;
	onError: (message: string | null) => void;
}

/** Query-variable body: SQL editor + "Test Run Query" that previews the values. */
function QueryVariableFields({
	queryValue,
	variables,
	onChange,
	onPreview,
	onError,
}: QueryVariableFieldsProps): JSX.Element {
	const [isRunning, setIsRunning] = useState(false);
	const hasAutoRun = useRef(false);

	const runTest = async (): Promise<void> => {
		setIsRunning(true);
		onError(null);
		let success = false;
		try {
			const res = await dashboardVariablesQuery({ query: queryValue, variables });
			if (res.statusCode === 200 && res.payload) {
				onPreview(res.payload.variableValues ?? []);
				success = true;
			} else {
				onError(res.error || 'Failed to run query');
				onPreview([]);
			}
		} catch (err) {
			// `dashboardVariablesQuery` throws `{ message, details: { error } }`.
			const detail = (err as { details?: { error?: string } }).details?.error;
			const message =
				detail && detail.includes('Syntax error:')
					? 'Please make sure query is valid and dependent variables are selected'
					: detail || (err as Error).message || 'Failed to run query';
			onError(message);
			onPreview([]);
		} finally {
			setIsRunning(false);
			void logEvent(DashboardDetailEvents.VariableQueryTested, {
				variableType: 'query',
				success,
			});
		}
	};

	// Fetch options on load so the Default Value dropdown is populated without a
	// manual Test Run — once, and only when there's a query to run.
	useEffect(() => {
		if (!hasAutoRun.current && queryValue) {
			hasAutoRun.current = true;
			void runTest();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [queryValue]);

	return (
		<SettingsField label="Query">
			<div className="tw:h-60 tw:overflow-hidden tw:rounded-lg tw:border tw:border-input">
				<Editor
					language="sql"
					value={queryValue}
					onChange={(value): void => onChange(value)}
					height="240px"
					options={{
						fontSize: 13,
						wordWrap: 'on',
						lineNumbers: 'off',
						glyphMargin: false,
						folding: false,
						lineDecorationsWidth: 0,
						lineNumbersMinChars: 0,
						minimap: { enabled: false },
					}}
				/>
			</div>
			<DisabledReason reason={queryValue ? undefined : 'Enter a query first'}>
				<Button
					type="button"
					size="sm"
					className={cn(BUTTON_SM, 'tw:hover:bg-primary-strong')}
					disabled={!queryValue || isRunning}
					onClick={runTest}
					data-testid="variable-test-run"
				>
					{isRunning ? (
						<Loader2 className="tw:animate-spin" aria-hidden="true" />
					) : (
						<Play aria-hidden="true" />
					)}
					<span>Test Run Query</span>
				</Button>
			</DisabledReason>
		</SettingsField>
	);
}

export default QueryVariableFields;
