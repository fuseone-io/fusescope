import { render, screen } from '@testing-library/react';
import { fuseScopeDocsUrl } from 'constants/docs';

import { InfraMonitoringEntity } from '../../constants';
import { K8sEmptyState } from '../K8sEmptyState';

describe('K8sEmptyState', () => {
	it.each([
		{
			name: 'a Kubernetes list with no filter',
			entity: InfraMonitoringEntity.PODS,
			hasFilters: false,
			title: 'No Kubernetes metrics yet',
			setupLink: 'Set up Kubernetes monitoring',
		},
		{
			name: 'the host list with no filter',
			entity: InfraMonitoringEntity.HOSTS,
			hasFilters: false,
			title: 'No host metrics yet',
			setupLink: 'Set up host metrics',
		},
		{
			name: 'a filtered list',
			entity: InfraMonitoringEntity.DEPLOYMENTS,
			hasFilters: true,
			title: 'No deployments match this filter',
			setupLink: null,
		},
	])(
		'shows the right state for $name',
		({ entity, hasFilters, title, setupLink }) => {
			render(<K8sEmptyState entity={entity} hasFilters={hasFilters} />);

			expect(screen.getByText(title)).toBeInTheDocument();

			if (setupLink) {
				expect(screen.getByRole('link', { name: setupLink })).toHaveAttribute(
					'href',
					fuseScopeDocsUrl('/sending-data/kubernetes/'),
				);
			} else {
				expect(screen.queryByRole('link')).not.toBeInTheDocument();
			}
		},
	);

	it('explains a range that ends before retention', () => {
		render(
			<K8sEmptyState
				entity={InfraMonitoringEntity.PODS}
				hasFilters={false}
				endTimeBeforeRetention
			/>,
		);

		expect(
			screen.getByText(/Queried time range is before earliest K8s metrics/i),
		).toBeInTheDocument();
	});

	it('renders nothing while loading', () => {
		const { container } = render(
			<K8sEmptyState entity={InfraMonitoringEntity.PODS} isLoading />,
		);

		expect(container).toBeEmptyDOMElement();
	});
});
