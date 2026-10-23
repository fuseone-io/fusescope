import CodeSnippet from '../../components/CodeSnippet/CodeSnippet';
import type { Guide } from '../../guides/types';
import { docsPageUrl } from '../../utils';
import GuideStep from './GuideStep';

interface InstallStepProps {
	guide: Guide;
	done: boolean;
}

function InstallStep({ guide, done }: InstallStepProps): JSX.Element {
	const { code, hint, docsAnchor } = guide.install;

	return (
		<GuideStep number={2} id="guide-step-install" title="Install" done={done}>
			<CodeSnippet
				code={code}
				copyLabel="Copy install command"
				testId="guide-install-snippet"
			/>
			{hint && (
				<span className="tw:text-xs tw:text-subtle-foreground">
					{hint}
					{docsAnchor && (
						<>
							{' '}
							<a
								href={docsPageUrl(`${guide.docsSlug}#${docsAnchor}`)}
								target="_blank"
								rel="noopener noreferrer"
								className="tw:text-primary!"
							>
								Open the docs
							</a>
						</>
					)}
				</span>
			)}
		</GuideStep>
	);
}

export default InstallStep;
