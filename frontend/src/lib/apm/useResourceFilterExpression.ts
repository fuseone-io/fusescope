import { useMemo } from 'react';
import useResourceAttribute from 'hooks/useResourceAttribute';

import { resourceFilterExpression } from './filters';

/** The page's environment and resource attribute filter as a v5 expression. */
export function useResourceFilterExpression(): string {
	const { queries } = useResourceAttribute();
	return useMemo(() => resourceFilterExpression(queries), [queries]);
}
