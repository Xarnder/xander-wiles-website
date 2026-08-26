export function parseAllowlist(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(/[,;\n]/)
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
}

export function isEmailAllowed(email: string | undefined, allowlist: string[]): boolean {
	if (!email || allowlist.length === 0) return false;
	return allowlist.includes(email.trim().toLowerCase());
}
