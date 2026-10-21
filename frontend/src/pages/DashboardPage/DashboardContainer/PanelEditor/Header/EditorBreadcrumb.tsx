import { Fragment } from 'react';

import type { PanelEditorCrumbs } from './breadcrumb';

import styles from './Header.module.scss';

/** Dashboard › section › panel, as plain text above the editor's title. */
function EditorBreadcrumb({
	crumbs,
}: {
	crumbs: PanelEditorCrumbs;
}): JSX.Element {
	const parts = [
		{ level: 'dashboard', label: crumbs.dashboard },
		...(crumbs.section ? [{ level: 'section', label: crumbs.section }] : []),
		{ level: 'panel', label: crumbs.panel },
	];

	return (
		<nav
			className={styles.crumbs}
			aria-label="Breadcrumb"
			data-testid="panel-editor-breadcrumb"
		>
			{parts.map(({ level, label }, index) => (
				<Fragment key={level}>
					{index > 0 && (
						<span aria-hidden="true" className={styles.crumbSeparator}>
							›
						</span>
					)}
					<span
						className={styles.crumb}
						title={label}
						aria-current={index === parts.length - 1 ? 'page' : undefined}
					>
						{label}
					</span>
				</Fragment>
			))}
		</nav>
	);
}

export default EditorBreadcrumb;
