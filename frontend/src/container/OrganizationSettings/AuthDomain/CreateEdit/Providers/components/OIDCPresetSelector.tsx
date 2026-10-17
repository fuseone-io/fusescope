import { Button } from '@signozhq/ui/button';

import { OIDC_PRESETS, OIDCPreset, OIDCPresetId } from '../oidcPresets';

import styles from './OIDCPresetSelector.module.scss';

interface OIDCPresetSelectorProps {
	value: OIDCPresetId;
	onChange: (preset: OIDCPreset) => void;
}

function OIDCPresetSelector({
	value,
	onChange,
}: OIDCPresetSelectorProps): JSX.Element {
	return (
		<fieldset className={styles.selector} aria-label="Identity provider">
			{OIDC_PRESETS.map((preset) => (
				<Button
					key={preset.id}
					size="sm"
					{...(preset.id === value
						? { variant: 'solid' as const, color: 'primary' as const }
						: { variant: 'outlined' as const, color: 'secondary' as const })}
					onClick={(): void => onChange(preset)}
					testId={`oidc-preset-${preset.id}`}
				>
					{preset.label}
				</Button>
			))}
		</fieldset>
	);
}

export default OIDCPresetSelector;
