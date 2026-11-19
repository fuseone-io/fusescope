import { getBaseUrl } from 'utils/basePath';
import { FormEvent, useState } from 'react';
import { useQueryClient } from 'react-query';
import { convertToApiError } from 'api/ErrorResponseHandlerForGeneratedAPIs';
import {
	invalidateGetOnboardingIngestion,
	useUpdateOnboardingIngestion,
} from 'api/generated/services/onboarding';
import type { OnboardingtypesIngestionDTO } from 'api/generated/services/fuseScope.schemas';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';

interface IngestionUrlEditorProps {
	ingestion: OnboardingtypesIngestionDTO;
	kind?: 'otlp' | 'rum';
	onDone: () => void;
}

/** Sets or clears the organization's selected ingestion URL. Admins only. */
function IngestionUrlEditor({
	ingestion,
	kind = 'otlp',
	onDone,
}: IngestionUrlEditorProps): JSX.Element {
	const rum = kind === 'rum';
	const prefix = rum ? 'rum-ingestion' : 'ingestion';
	const label = rum ? 'RUM endpoint' : 'OTLP HTTP endpoint';
	const override = rum
		? ingestion.rumOrganizationUrl
		: ingestion.organizationUrl;
	const queryClient = useQueryClient();
	const [url, setUrl] = useState(
		override ??
			(rum
				? ingestion.rumEndpoint || new URL(getBaseUrl()).origin
				: ingestion.otlpHttpEndpoint),
	);
	const { mutate, isLoading, error } = useUpdateOnboardingIngestion({
		mutation: {
			onSuccess: async (): Promise<void> => {
				await invalidateGetOnboardingIngestion(queryClient);
				onDone();
			},
		},
	});

	const save = (ingestionUrl: string): void => {
		mutate({
			data: rum
				? { ingestionUrl: ingestion.organizationUrl ?? '', rumUrl: ingestionUrl }
				: { ingestionUrl },
		});
	};

	const onSubmit = (event: FormEvent): void => {
		event.preventDefault();
		save(url.trim());
	};

	const message = error
		? convertToApiError(error)?.getErrorMessage()
		: undefined;

	return (
		<form
			onSubmit={onSubmit}
			className="tw:flex tw:min-w-0 tw:flex-col tw:gap-2"
			aria-label={label}
		>
			<Input
				autoFocus
				value={url}
				onChange={(event): void => setUrl(event.target.value)}
				placeholder={rum ? 'https://rum.example.com' : 'https://otlp.example.com'}
				aria-label={label}
				aria-invalid={Boolean(message)}
				data-testid={`${prefix}-url-input`}
				className="tw:h-9 tw:bg-surface-raised tw:font-mono tw:text-xs tw:md:text-xs tw:dark:bg-surface-raised"
			/>
			{message && (
				<span
					role="alert"
					data-testid={`${prefix}-url-error`}
					className="tw:text-xs tw:text-error-ink"
				>
					{message}
				</span>
			)}
			<div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
				<Button
					type="submit"
					size="sm"
					disabled={isLoading || !url.trim()}
					data-testid={`${prefix}-url-save`}
				>
					Save
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onDone}
					disabled={isLoading}
					data-testid={`${prefix}-url-cancel`}
				>
					Cancel
				</Button>
				{override && (
					<Button
						type="button"
						variant="link"
						size="sm"
						onClick={(): void => save('')}
						disabled={isLoading}
						data-testid={`${prefix}-url-reset`}
						className="tw:ml-auto tw:px-0"
					>
						Use the default
					</Button>
				)}
			</div>
			<span className="tw:text-xs tw:text-subtle-foreground">
				{rum
					? 'The collector RUM listener your apps reach, separate from OTLP. Use a base URL; the SDK appends /rum/v1.'
					: 'The OTLP/HTTP address your apps reach. The gRPC endpoint follows its host.'}
			</span>
		</form>
	);
}

export default IngestionUrlEditor;
