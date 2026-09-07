import { parseAllowedOrigins } from '$lib/server/origins';
import type { ProjectInput } from '$lib/server/services/projects';
import { projectNameSchema } from '$lib/server/validation';

export interface ProjectFormResult {
	values: ProjectInput & { originsText: string };
	errors: string[];
}

/** Parses and validates the shared project create/update form. */
export function parseProjectForm(form: FormData): ProjectFormResult {
	const errors: string[] = [];
	const nameResult = projectNameSchema.safeParse(String(form.get('name') ?? ''));
	if (!nameResult.success) errors.push('Project name is required (max 100 characters).');

	const originsText = String(form.get('allowedOrigins') ?? '');
	const { origins, invalid } = parseAllowedOrigins(originsText);
	if (invalid.length) {
		errors.push(`Invalid origin${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}. Use the form https://example.com or https://*.example.com.`);
	}
	if (origins.length > 100) errors.push('At most 100 allowed origins are supported.');

	return {
		values: {
			name: nameResult.success ? nameResult.data : String(form.get('name') ?? ''),
			allowedOrigins: origins,
			originsText,
			publicFeedbackVisible: form.get('publicFeedbackVisible') === 'on',
			reviewerRepliesEnabled: form.get('reviewerRepliesEnabled') === 'on',
			screenshotsEnabled: form.get('screenshotsEnabled') === 'on',
			anonymousFeedbackAllowed: form.get('anonymousFeedbackAllowed') === 'on',
			openSignups: form.get('openSignups') === 'on'
		},
		errors
	};
}
