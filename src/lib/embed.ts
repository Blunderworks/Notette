/** Generates ready-to-copy embed snippets for a project. */

export function widgetScriptUrl(baseUrl: string): string {
	return `${baseUrl}/notette.js`;
}

export function basicEmbedSnippet(baseUrl: string, clientKey: string): string {
	return `<script src="${widgetScriptUrl(baseUrl)}" data-key="${clientKey}" defer></script>`;
}

export function deploymentEmbedSnippet(baseUrl: string, clientKey: string): string {
	return [
		`<script`,
		`  src="${widgetScriptUrl(baseUrl)}"`,
		`  data-key="${clientKey}"`,
		`  data-environment="preview"`,
		`  data-branch="feature/my-branch"`,
		`  data-commit="abc1234"`,
		`  data-deployment-url="https://my-app-abc1234.example.com"`,
		`  defer`,
		`></script>`
	].join('\n');
}

export function programmaticEmbedSnippet(baseUrl: string, clientKey: string): string {
	return [
		`<script src="${widgetScriptUrl(baseUrl)}" data-auto-init="false" defer></script>`,
		`<script>`,
		`  function setupNotette() {`,
		`    Notette.init({`,
		`      key: '${clientKey}',`,
		`      deployment: {`,
		`        environment: 'preview',`,
		`        branch: 'feature/my-branch',`,
		`        commit: 'abc1234',`,
		`        url: location.origin`,
		`      },`,
		`      // Optional: pre-fill the reviewer identity if your app knows the user.`,
		`      user: { name: 'Jane Reviewer', email: 'jane@example.com' },`,
		`      // Optional: any extra JSON attached to every feedback item.`,
		`      metadata: { appVersion: '1.4.2' }`,
		`    });`,
		`  }`,
		`  if (window.Notette) setupNotette();`,
		`  else window.addEventListener('notette:ready', setupNotette, { once: true });`,
		`</script>`
	].join('\n');
}
