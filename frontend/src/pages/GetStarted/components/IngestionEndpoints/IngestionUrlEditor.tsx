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
	onDone: () => void;
}

/** Sets or clears the organization's OTLP/HTTP URL. Admins only. */
function IngestionUrlEditor({
	ingestion,
	onDone,
}: IngestionUrlEditorProps): JSX.Element {
	const queryClient = useQueryClient();
	const [url, setUrl] = useState(
		ingestion.organizationUrl ?? ingestion.otlpHttpEndpoint,
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
		mutate({ data: { ingestionUrl } });
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
			aria-label="OTLP HTTP endpoint"
		>
			<Input
				autoFocus
				value={url}
				onChange={(event): void => setUrl(event.target.value)}
				placeholder="https://otlp.example.com"
				aria-label="OTLP HTTP endpoint"
				aria-invalid={Boolean(message)}
				data-testid="ingestion-url-input"
				className="tw:h-9 tw:bg-surface-raised tw:font-mono tw:text-xs tw:md:text-xs tw:dark:bg-surface-raised"
			/>
			{message && (
				<span
					role="alert"
					data-testid="ingestion-url-error"
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
					data-testid="ingestion-url-save"
				>
					Save
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onDone}
					disabled={isLoading}
					data-testid="ingestion-url-cancel"
				>
					Cancel
				</Button>
				{ingestion.organizationUrl && (
					<Button
						type="button"
						variant="link"
						size="sm"
						onClick={(): void => save('')}
						disabled={isLoading}
						data-testid="ingestion-url-reset"
						className="tw:ml-auto tw:px-0"
					>
						Use the default
					</Button>
				)}
			</div>
			<span className="tw:text-xs tw:text-subtle-foreground">
				The OTLP/HTTP address your apps reach. The gRPC endpoint follows its host.
			</span>
		</form>
	);
}

export default IngestionUrlEditor;
