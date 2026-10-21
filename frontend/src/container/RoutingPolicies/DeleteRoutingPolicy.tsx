import { Button } from 'components/ui/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from 'components/ui/dialog';
import { Loader2, Trash2, X } from 'lucide-react';

import { DeleteRoutingPolicyProps } from './types';

function DeleteRoutingPolicy({
	handleClose,
	handleDelete,
	routingPolicy,
	isDeletingRoutingPolicy,
}: DeleteRoutingPolicyProps): JSX.Element {
	return (
		<Dialog
			open
			onOpenChange={(open): void => {
				if (!open) {
					handleClose();
				}
			}}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Delete Routing Policy</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<DialogDescription>
						Are you sure you want to delete <strong>{routingPolicy?.name}</strong>{' '}
						routing policy? Deleting a routing policy is irreversible and cannot be
						undone.
					</DialogDescription>
				</DialogBody>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleClose}
						disabled={isDeletingRoutingPolicy}
					>
						<X aria-hidden="true" />
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={isDeletingRoutingPolicy}
						aria-busy={isDeletingRoutingPolicy}
					>
						{isDeletingRoutingPolicy ? (
							<Loader2 aria-hidden="true" className="tw:animate-spin" />
						) : (
							<Trash2 aria-hidden="true" />
						)}
						<span className="translate-safe">Delete Routing Policy</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default DeleteRoutingPolicy;
