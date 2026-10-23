import SegmentedControl from 'components/PageTemplate/components/SegmentedControl';

import CodeSnippet from '../../components/CodeSnippet/CodeSnippet';
import type { Guide, GuideRuntime, SnippetInput } from '../../guides/types';
import type { GuideForm } from '../hooks/useGuideForm';
import GuideStep from './GuideStep';

const RUNTIME_OPTIONS: {
	value: GuideRuntime;
	label: string;
	testId: string;
}[] = [
	{ value: 'shell', label: 'Shell', testId: 'guide-runtime-shell' },
	{ value: 'docker', label: 'Dockerfile', testId: 'guide-runtime-docker' },
	{ value: 'k8s', label: 'Kubernetes', testId: 'guide-runtime-k8s' },
];

const LOCAL_HINTS: Record<GuideRuntime, string> = {
	shell: 'Sends to a collector on this machine.',
	docker:
		'Sends to the otel-collector service on the same Compose network as your app.',
	k8s: 'Sends to the collector service in the cluster.',
};

interface RunStepProps {
	guide: Guide;
	form: GuideForm;
	input: SnippetInput;
	done: boolean;
}

function RunStep({ guide, form, input, done }: RunStepProps): JSX.Element {
	const snippets = guide.run(input);
	const hint = guide.runHints?.[form.runtime];

	return (
		<GuideStep
			number={3}
			id="guide-step-run"
			title="Configure and run"
			done={done}
		>
			<SegmentedControl
				label="Where it runs"
				options={RUNTIME_OPTIONS}
				value={form.runtime}
				onChange={form.setRuntime}
				className="tw:self-start"
			/>
			{snippets.map((snippet) => (
				<CodeSnippet
					key={snippet.id}
					label={snippet.label}
					code={snippet.code}
					copyLabel={`Copy ${snippet.label ?? 'commands'}`}
					testId={`guide-run-snippet-${snippet.id}`}
				/>
			))}
			{(hint || form.route === 'local') && (
				<span className="tw:flex tw:flex-col tw:gap-1 tw:text-xs tw:text-subtle-foreground">
					{form.route === 'local' && <span>{LOCAL_HINTS[form.runtime]}</span>}
					{hint && <span>{hint}</span>}
				</span>
			)}
		</GuideStep>
	);
}

export default RunStep;
