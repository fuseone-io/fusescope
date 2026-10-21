import { ReactNode } from 'react';
import { cn } from 'lib/utils';
import { Search } from 'lucide-react';

import styles from './InfraSearchField.module.scss';

interface InfraSearchFieldProps {
	/** A `QuerySearch` editor; the field draws its border, icon and focus ring. */
	children: ReactNode;
	className?: string;
	testId?: string;
}

function InfraSearchField({
	children,
	className,
	testId,
}: InfraSearchFieldProps): JSX.Element {
	return (
		<div className={cn(styles.field, className)} data-testid={testId}>
			<Search size={16} aria-hidden="true" className={styles.icon} />
			{children}
		</div>
	);
}

export default InfraSearchField;
