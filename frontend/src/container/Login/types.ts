import APIError from 'types/api/error';
import {
	OrgSessionContext,
	SessionsContext,
} from 'types/api/v2/sessions/context/get';

export interface OrgAuthN {
	password: boolean;
	callbackUrl?: string;
}

export interface LoginState {
	email: string;
	setEmail: (email: string) => void;
	password: string;
	setPassword: (password: string) => void;
	isEmailValid: boolean;
	isVersionLoading: boolean;
	isContextLoading: boolean;
	isSubmitting: boolean;
	sessionsContext?: SessionsContext;
	selectedOrg?: OrgSessionContext;
	selectOrg: (orgId: string) => void;
	authN: OrgAuthN;
	error?: APIError;
	onContinue: () => Promise<void>;
	onChangeEmail: () => void;
	onPasswordSignIn: () => Promise<void>;
	onSingleSignOn: () => void;
	onForgotPassword: () => void;
}
