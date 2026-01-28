export function validateShortcutName(name: string): void {
	if (!name || typeof name !== "string") {
		throw new Error("Shortcut name must be a non-empty string");
	}

	if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
		throw new Error(
			"Shortcut name can only contain letters, numbers, dashes, and underscores",
		);
	}

	if (name.length > 100) {
		throw new Error("Shortcut name must be 100 characters or less");
	}
}

export function validateInputText(text: string): void {
	if (typeof text !== "string") {
		throw new Error("Input text must be a string");
	}

	if (text.length > 10000) {
		throw new Error("Input text must be 10,000 characters or less");
	}

	for (let i = 0; i < text.length; i++) {
		const charCode = text.charCodeAt(i);
		if (
			charCode < 9 ||
			(charCode > 10 && charCode < 13) ||
			(charCode > 13 && charCode < 32) ||
			charCode === 127
		) {
			throw new Error("Input text contains invalid control characters");
		}
	}
}
