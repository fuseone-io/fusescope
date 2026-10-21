import { fuseScopeDocsUrl } from 'constants/docs';

export const FUNNELS_LEARN_MORE_URL = fuseScopeDocsUrl(
	'/explore/traces/#funnels',
);

// Above antd's modal layer (1000): these menus and tooltips also render inside
// the trace details "Add span to funnel" modal.
export const FLOATING_LAYER_CLASS = 'tw:z-[1050]';
