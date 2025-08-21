import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	ButtonComponent,
	AbstractInputSuggest,
	requestUrl,
} from "obsidian";

interface RemoteFetchSettings {
	defaultDownloadFolder: string;
}

const DEFAULT_SETTINGS: RemoteFetchSettings = {
	defaultDownloadFolder: "",
};

// Safety constants
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_PROTOCOLS = ["https:", "http:"];
const BLOCKED_EXTENSIONS = [
	".exe",
	".bat",
	".cmd",
	".scr",
	".com",
	".pif",
	".vbs",
	".js",
	".jar",
	".app",
	".deb",
	".dmg",
	".pkg",
	".msi",
];
const ALLOWED_CONTENT_TYPES = [
	"application/pdf",
	"image/",
	"text/",
	"application/json",
	"application/zip",
	"application/x-zip-compressed",
	"application/msword",
	"application/vnd.openxmlformats-officedocument",
	"application/vnd.ms-excel",
	"video/",
	"audio/",
	"application/octet-stream",
];

export default class RemoteFetchPlugin extends Plugin {
	settings: RemoteFetchSettings;

	async onload() {
		await this.loadSettings();

		// Add command to open the download modal
		this.addCommand({
			id: "open-remote-fetch-modal",
			name: "Download file from URL",
			callback: () => {
				new RemoteFetchModal(this.app, this).open();
			},
		});

		// Add settings tab
		this.addSettingTab(new RemoteFetchSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async downloadFile(url: string, targetPath: string): Promise<void> {
		try {
			// Validate URL protocol
			if (!this.validateUrl(url)) {
				throw new Error("Only HTTP and HTTPS URLs are supported");
			}

			// Validate filename for security
			const filename = targetPath.split("/").pop() || "";
			if (!this.validateFilename(filename)) {
				throw new Error("File type not allowed for security reasons");
			}

			new Notice("Starting download...");

			const response = await requestUrl({
				url: url,
				method: "GET",
				headers: {
					"User-Agent": "Obsidian Remote Fetch Plugin",
					"Cache-Control": "no-cache",
					Pragma: "no-cache",
				},
			});

			// Validate HTTP status
			if (response.status !== 200) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			// Validate file size
			const contentLength = response.headers["content-length"];
			if (contentLength) {
				const size = parseInt(contentLength);
				if (size > MAX_FILE_SIZE) {
					throw new Error(
						`File too large: ${Math.round(
							size / (1024 * 1024)
						)}MB (max: ${MAX_FILE_SIZE / (1024 * 1024)}MB)`
					);
				}
			}

			// Validate content type
			const contentType = response.headers["content-type"] || null;
			if (!this.validateContentType(contentType)) {
				throw new Error(
					"Content type not allowed for security reasons"
				);
			}

			// Check if we got HTML instead of a file (common with share links)
			if (contentType && contentType.includes("text/html")) {
				throw new Error(
					"Server returned HTML instead of a file. This URL may not be a direct download link."
				);
			}

			// Get binary data
			const arrayBuffer = response.arrayBuffer;
			const uint8Array = new Uint8Array(arrayBuffer);

			// Validate that we got actual file data (not empty or too small)
			if (uint8Array.length === 0) {
				throw new Error("Downloaded file is empty");
			}

			// Validate actual file size after download
			if (uint8Array.length > MAX_FILE_SIZE) {
				throw new Error(
					`File too large: ${Math.round(
						uint8Array.length / (1024 * 1024)
					)}MB (max: ${MAX_FILE_SIZE / (1024 * 1024)}MB)`
				);
			}

			// If the target path doesn't have an extension and we have a content type, add one
			const finalPath = this.ensureFileExtension(targetPath, contentType);

			// Ensure the folder exists before creating the file
			const folderPath = finalPath.substring(
				0,
				finalPath.lastIndexOf("/")
			);
			if (folderPath) {
				await this.app.vault.createFolder(folderPath).catch(() => {
					// Silently ignore if folder already exists
				});
			}

			// Create the file in the vault (must pass ArrayBuffer, not Uint8Array)
			await this.app.vault.createBinary(finalPath, arrayBuffer);

			new Notice(`File downloaded successfully to ${finalPath}`);
		} catch (error) {
			console.error("Download failed:", error);

			// Provide more specific error messages
			if (
				error.message &&
				error.message.includes("not allowed for security reasons")
			) {
				new Notice(`Download failed: ${error.message}`);
			} else if (error.message && error.message.includes("too large")) {
				new Notice(`Download failed: ${error.message}`);
			} else if (
				error.message &&
				error.message.includes("Only HTTP and HTTPS")
			) {
				new Notice(`Download failed: ${error.message}`);
			} else if (error.message && error.message.includes("CORS")) {
				new Notice("Download failed: CORS error.");
			} else if (error.message && error.message.includes("Failed to fetch")) {
				new Notice(
					"Download failed: Network error. Check your internet connection."
				);
			} else if (
				error.message &&
				error.message.includes("NetworkError")
			) {
				new Notice(
					"Download failed: Network error. Check your internet connection."
				);
			} else {
				new Notice(`Download failed: ${error.message || error}`);
			}
		}
	}

	/**
	 * Ensures the file path has a proper extension based on the content type.
	 * @param path The original file path.
	 * @param contentType The MIME type of the file.
	 * @returns The file path with the correct extension if needed.
	 */
	private ensureFileExtension(
		path: string,
		contentType: string | null
	): string {
		const hasExtension =
			path.includes(".") && path.lastIndexOf(".") > path.lastIndexOf("/");

		if (!hasExtension && contentType) {
			const extension = this.getExtensionFromMimeType(contentType);
			if (extension !== "bin") {
				return `${path}.${extension}`;
			}
		}

		return path;
	}

	/**
	 * Returns the file extension for a given MIME type.
	 * @param mimeType The MIME type string.
	 * @returns The file extension (without dot), or 'bin' if unknown.
	 */
	getExtensionFromMimeType(mimeType: string): string {
		const mimeMap: { [key: string]: string } = {
			"application/pdf": "pdf",
			"image/jpeg": "jpg",
			"image/png": "png",
			"image/gif": "gif",
			"image/svg+xml": "svg",
			"text/plain": "txt",
			"text/markdown": "md",
			"application/json": "json",
			"application/zip": "zip",
			"application/x-zip-compressed": "zip",
			"application/msword": "doc",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
				"docx",
			"application/vnd.ms-excel": "xls",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
				"xlsx",
			"video/mp4": "mp4",
			"audio/mpeg": "mp3",
			"audio/wav": "wav",
		};

		return mimeMap[mimeType] || "bin";
	}

	/**
	 * Extracts a filename from a URL, removing query parameters and fragments.
	 * @param url The URL string.
	 * @returns The extracted filename, or 'downloaded-file' if not found.
	 */
	extractFilenameFromUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			const pathname = urlObj.pathname;
			const lastPart = pathname.split("/").pop() || "downloaded-file";

			const cleanName = lastPart.split("?")[0].split("#")[0];

			if (cleanName && cleanName.includes(".") && cleanName.length > 1) {
				return cleanName;
			}

			return "downloaded-file";
		} catch (e) {
			return "downloaded-file";
		}
	}

	/**
	 * Sanitizes a filename by removing illegal characters for Windows/macOS compatibility.
	 * @param filename The original filename.
	 * @returns The sanitized filename.
	 */
	sanitizeFilename(filename: string): string {
		return filename.replace(/[\\/:*?"<>|]/g, "_");
	}

	/**
	 * Validates if a URL is safe to download from.
	 * @param url The URL to validate.
	 * @returns True if the URL is safe, false otherwise.
	 */
	private validateUrl(url: string): boolean {
		try {
			const urlObj = new URL(url);
			return ALLOWED_PROTOCOLS.includes(urlObj.protocol);
		} catch {
			return false;
		}
	}

	/**
	 * Validates if a filename is safe (doesn't have blocked extensions).
	 * @param filename The filename to validate.
	 * @returns True if the filename is safe, false otherwise.
	 */
	private validateFilename(filename: string): boolean {
		const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
		return !BLOCKED_EXTENSIONS.includes(ext);
	}

	/**
	 * Validates if the content type is allowed.
	 * @param contentType The content type to validate.
	 * @returns True if the content type is allowed, false otherwise.
	 */
	private validateContentType(contentType: string | null): boolean {
		if (!contentType) return true; // Allow if no content type specified

		const lowerContentType = contentType.toLowerCase();
		return ALLOWED_CONTENT_TYPES.some((allowed) =>
			lowerContentType.includes(allowed)
		);
	}

	/**
	 * Checks if the file size is within limits.
	 * @param response The fetch response to check.
	 * @returns Promise that resolves if size is OK, rejects if too large.
	 */
	private async validateFileSize(response: Response): Promise<void> {
		const contentLength = response.headers.get("content-length");
		if (contentLength) {
			const size = parseInt(contentLength);
			if (size > MAX_FILE_SIZE) {
				throw new Error(
					`File too large: ${Math.round(
						size / (1024 * 1024)
					)}MB (max: ${MAX_FILE_SIZE / (1024 * 1024)}MB)`
				);
			}
		}
	}
}

class FolderInputSuggest extends AbstractInputSuggest<string> {
	constructor(app: App, textInputEl: HTMLInputElement) {
		super(app, textInputEl);
	}

	getSuggestions(query: string): string[] {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((file) => file instanceof TFolder)
			.map((folder) => folder.path)
			.sort();

		// Always include root folder option
		const allFolders = ["", ...folders];

		if (!query) {
			return allFolders;
		}

		return allFolders.filter((folder) =>
			folder.toLowerCase().includes(query.toLowerCase())
		);
	}

	renderSuggestion(folder: string, el: HTMLElement) {
		el.createDiv({
			text: folder || "Root folder",
		});
	}

	selectSuggestion(folder: string) {
		this.setValue(folder);
		this.close();
	}
}

class RemoteFetchModal extends Modal {
	plugin: RemoteFetchPlugin;
	urlInput: HTMLInputElement;
	filenameInput: HTMLInputElement;
	folderInput: HTMLInputElement;
	folderSuggest: FolderInputSuggest;

	constructor(app: App, plugin: RemoteFetchPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Download file from URL" });

		// URL input
		const urlContainer = contentEl.createEl("div", {
			cls: "remote-fetch-input-container",
		});
		urlContainer.createEl("label", { text: "URL:" });
		this.urlInput = urlContainer.createEl("input", {
			type: "text",
			placeholder: "https://example.com/file.pdf",
			cls: "remote-fetch-url-input",
		});

		// Filename input
		const filenameContainer = contentEl.createEl("div", {
			cls: "remote-fetch-input-container",
		});
		filenameContainer.createEl("label", { text: "Filename:" });
		this.filenameInput = filenameContainer.createEl("input", {
			type: "text",
			placeholder: "file.pdf",
			cls: "remote-fetch-filename-input",
		});

		// Auto-fill filename from URL
		this.urlInput.addEventListener("input", () => {
			const url = this.urlInput.value;
			if (url && !this.filenameInput.value) {
				const filename = this.plugin.extractFilenameFromUrl(url);
				if (filename !== "downloaded-file") {
					this.filenameInput.value = filename;
				}
			}
		});

		// Folder input with type-ahead
		const folderContainer = contentEl.createEl("div", {
			cls: "remote-fetch-input-container",
		});
		folderContainer.createEl("label", { text: "Destination folder:" });
		this.folderInput = folderContainer.createEl("input", {
			type: "text",
			placeholder: "Type to search folders... (leave empty for root)",
			cls: "remote-fetch-folder-input",
		});

		// Set default folder
		this.folderInput.value =
			this.plugin.settings.defaultDownloadFolder || "";

		// Initialize the folder suggest
		this.folderSuggest = new FolderInputSuggest(this.app, this.folderInput);

		// Download button
		const buttonContainer = contentEl.createEl("div", {
			cls: "remote-fetch-button-container",
		});

		new ButtonComponent(buttonContainer)
			.setButtonText("Download")
			.setCta()
			.onClick(async () => {
				await this.handleDownload();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close();
			});

		// Add some basic styling
		contentEl.createEl("style", {
			text: `
				.remote-fetch-input-container {
					margin-bottom: 15px;
				}
				.remote-fetch-input-container label {
					display: block;
					margin-bottom: 5px;
					font-weight: bold;
				}
				.remote-fetch-url-input,
				.remote-fetch-filename-input,
				.remote-fetch-folder-input {
					width: 100%;
					padding: 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
					color: var(--text-normal);
				}
				.remote-fetch-button-container {
					display: flex;
					justify-content: flex-end;
					gap: 10px;
					margin-top: 20px;
				}
			`,
		});
	}

	async handleDownload() {
		const url = this.urlInput.value.trim();
		let filename = this.filenameInput.value.trim();
		const selectedFolder = this.folderInput.value.trim();

		if (!url) {
			new Notice("Please enter a URL");
			return;
		}

		if (!filename) {
			new Notice("Please enter a filename");
			return;
		}

		// Validate URL format and protocol
		try {
			const urlObj = new URL(url);
			if (!["https:", "http:"].includes(urlObj.protocol)) {
				new Notice("Only HTTP and HTTPS URLs are supported");
				return;
			}
		} catch (e) {
			new Notice("Please enter a valid URL");
			return;
		}

		// Sanitize filename to prevent illegal characters
		filename = this.plugin.sanitizeFilename(filename);

		// Validate filename for security
		const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));

		if (BLOCKED_EXTENSIONS.includes(ext)) {
			new Notice("File type not allowed for security reasons");
			return;
		}

		// Construct the target path
		const targetPath = selectedFolder
			? `${selectedFolder}/${filename}`
			: filename;

		// Check if file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
		if (existingFile) {
			new Notice("File already exists at this location");
			return;
		}

		// Show loading indicator
		this.showLoadingState();

		try {
			await this.plugin.downloadFile(url, targetPath);
			this.close();
		} catch (error) {
			this.hideLoadingState();
			// Error is already handled in downloadFile method
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	showLoadingState() {
		// Just disable inputs and buttons, no loading modal
		this.urlInput.disabled = true;
		this.filenameInput.disabled = true;
		this.folderInput.disabled = true;

		// Find and disable buttons
		const buttons = this.contentEl.querySelectorAll("button");
		buttons.forEach((button) => {
			button.disabled = true;
		});
	}

	hideLoadingState() {
		// Re-enable all inputs and buttons
		this.urlInput.disabled = false;
		this.filenameInput.disabled = false;
		this.folderInput.disabled = false;

		// Find and re-enable buttons
		const buttons = this.contentEl.querySelectorAll("button");
		buttons.forEach((button) => {
			button.disabled = false;
		});
	}
}

class RemoteFetchSettingTab extends PluginSettingTab {
	plugin: RemoteFetchPlugin;

	constructor(app: App, plugin: RemoteFetchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Default download folder")
			.setDesc(
				"Default folder for downloaded files (leave empty for root folder)"
			)
			.addText((text) => {
				const inputEl = text
					.setPlaceholder("attachments")
					.setValue(this.plugin.settings.defaultDownloadFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultDownloadFolder = value;
						await this.plugin.saveSettings();
					});

				// Add folder suggest to the settings input as well
				new FolderInputSuggest(this.app, inputEl.inputEl);

				return inputEl;
			});
	}
}