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

/**
 * Server-side example that signs an identity token for the signed-in user.
 * `alg` is HS256 for shared-secret projects, otherwise the public key's algorithm.
 */
export function identityTokenSnippet(clientKey: string, alg: string): string {
	const shared = alg === 'HS256';
	return [
		`// Node.js (npm install jose). Serve this to signed-in users only, e.g. GET /api/notette-token.`,
		shared ? `import { SignJWT } from 'jose';` : `import { importPKCS8, SignJWT } from 'jose';`,
		``,
		shared
			? `const key = new TextEncoder().encode(process.env.NOTETTE_IDENTITY_SECRET);`
			: `const key = await importPKCS8(process.env.NOTETTE_IDENTITY_PRIVATE_KEY, '${alg}');`,
		``,
		`export function notetteToken(user) {`,
		`  return new SignJWT({ name: user.name, email: user.email })`,
		`    .setProtectedHeader({ alg: '${alg}' })`,
		`    .setSubject(String(user.id))`,
		`    .setAudience('${clientKey}')`,
		`    .setIssuedAt()`,
		`    .setExpirationTime('10m')`,
		`    .sign(key);`,
		`}`
	].join('\n');
}

/** Widget setup for apps that identify their users and open feedback from their own button. */
export function identityEmbedSnippet(baseUrl: string, clientKey: string, jwks: boolean): string {
	return [
		`<script src="${widgetScriptUrl(baseUrl)}" data-auto-init="false" defer></script>`,
		`<script>`,
		`  function setupNotette() {`,
		`    Notette.init({`,
		`      key: '${clientKey}',`,
		`      // Hide the floating button; open the dialog from your own UI instead.`,
		`      launcher: false,`,
		jwks
			? `      // Called whenever a fresh token is needed: your identity provider's token. Return null when signed out.`
			: `      // Called whenever a fresh token is needed. Return null when signed out.`,
		jwks
			? `      userToken: () => auth.getIdToken()`
			: `      userToken: () => fetch('/api/notette-token').then((r) => (r.ok ? r.text() : null))`,
		`    });`,
		`  }`,
		`  if (window.Notette) setupNotette();`,
		`  else window.addEventListener('notette:ready', setupNotette, { once: true });`,
		`</script>`,
		``,
		`<button type="button" onclick="Notette.feedback()">Send feedback</button>`
	].join('\n');
}
