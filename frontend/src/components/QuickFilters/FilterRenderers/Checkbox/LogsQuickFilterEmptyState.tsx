import { Color } from '@signozhq/design-tokens';
import { Button } from 'antd';
import EmptyQuickFilterIcon from 'assets/CustomIcons/EmptyQuickFilterIcon';
import { fuseScopeDocsUrl } from 'constants/docs';
import { ArrowUpRight } from '@signozhq/icons';
import { openInNewTab } from 'utils/navigation';

const LOG_PIPELINES_PROCESSORS_DOCS = fuseScopeDocsUrl(
	'/sending-data/log-pipelines/#processors',
);

function LogsQuickFilterEmptyState(): JSX.Element {
	const handleLearnMoreClick = (): void => {
		openInNewTab(LOG_PIPELINES_PROCESSORS_DOCS);
	};
	return (
		<section className="go-to-docs">
			<div className="go-to-docs__container">
				<div className="go-to-docs__container-icon">
					<EmptyQuickFilterIcon />
				</div>
				<div className="go-to-docs__container-message">
					{`You'd need to parse out this attribute to start getting them as a fast
            filter.`}
				</div>
			</div>
			<Button
				type="link"
				className="go-to-docs__button"
				onClick={handleLearnMoreClick}
			>
				<div className="go-to-docs__button-text">Learn more</div>
				<ArrowUpRight size={14} color={Color.BG_ROBIN_400} />
			</Button>
		</section>
	);
}

export default LogsQuickFilterEmptyState;
