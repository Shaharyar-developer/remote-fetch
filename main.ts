import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	TFile,
	ButtonComponent,
	SuggestModal,
} from "obsidian";

interface RemoteFetchSettings {
	defaultDownloadFolder: string;
	enableCorsProxy: boolean;
	corsProxyUrl: string;
}

const DEFAULT_SETTINGS: RemoteFetchSettings = {
	defaultDownloadFolder: "",
	enableCorsProxy: true,
	corsProxyUrl: "https://remote-fetch.shaharyar.dev/?url=",
};

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
			new Notice("Starting download...");

			let fetchUrl = url;
			let fetchOptions: RequestInit = {};

			// Use CORS proxy if enabled
			if (this.settings.enableCorsProxy) {
				fetchUrl = this.settings.corsProxyUrl + encodeURIComponent(url);
				console.log("Using CORS proxy:", fetchUrl);

				// Add CORS headers for the proxy request
				fetchOptions = {
					method: "GET",
					headers: {
						Accept: "*/*",
						"User-Agent": "Obsidian Remote Fetch Plugin",
						"Cache-Control": "no-cache",
						Pragma: "no-cache",
					},
					mode: "cors",
				};
			}

			const response = await fetch(fetchUrl, fetchOptions);

			// Handle different HTTP status codes
			if (!response.ok && response.status !== 304) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			// Handle 304 Not Modified - try to get fresh content
			if (response.status === 304) {
				new Notice(
					"Server returned cached response, retrying with fresh request..."
				);

				// Retry with cache-busting headers
				const freshFetchOptions = {
					...fetchOptions,
					headers: {
						...fetchOptions.headers,
						"Cache-Control": "no-cache, no-store, must-revalidate",
						Pragma: "no-cache",
						Expires: "0",
						"If-None-Match": "", // Clear any ETag
						"If-Modified-Since": "", // Clear any Last-Modified
					},
				};

				const freshResponse = await fetch(fetchUrl, freshFetchOptions);
				if (!freshResponse.ok) {
					throw new Error(
						`HTTP error on retry! status: ${freshResponse.status}`
					);
				}

				// Use the fresh response
				const freshArrayBuffer = await freshResponse.arrayBuffer();
				const freshUint8Array = new Uint8Array(freshArrayBuffer);

				if (freshUint8Array.length === 0) {
					throw new Error("Downloaded file is empty after retry");
				}

				const freshContentType =
					freshResponse.headers.get("content-type");
				const freshFinalPath = this.ensureFileExtension(
					targetPath,
					freshContentType
				);

				// Ensure the folder exists
				const freshFolderPath = freshFinalPath.substring(
					0,
					freshFinalPath.lastIndexOf("/")
				);
				if (freshFolderPath) {
					await this.app.vault
						.createFolder(freshFolderPath)
						.catch(() => {});
				}

				await this.app.vault.createBinary(
					freshFinalPath,
					freshUint8Array
				);
				new Notice(`File downloaded successfully to ${freshFinalPath}`);
				return;
			}

			// Check if we got HTML instead of a file (common with share links)
			const contentType = response.headers.get("content-type");
			if (contentType && contentType.includes("text/html")) {
				throw new Error(
					"Server returned HTML instead of a file. This URL may not be a direct download link."
				);
			}

			const arrayBuffer = await response.arrayBuffer();
			const uint8Array = new Uint8Array(arrayBuffer);

			// Validate that we got actual file data (not empty or too small)
			if (uint8Array.length === 0) {
				throw new Error("Downloaded file is empty");
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

			// Create the file in the vault
			await this.app.vault.createBinary(finalPath, uint8Array);

			new Notice(`File downloaded successfully to ${finalPath}`);
		} catch (error) {
			console.error("Download failed:", error);

			// Provide more specific error messages
			if (
				error.message.includes("CORS") ||
				error.message.includes("fetch")
			) {
				new Notice(
					"Download failed: CORS error. Make sure your Workers proxy includes proper CORS headers."
				);
			} else if (error.message.includes("Failed to fetch")) {
				new Notice(
					"Download failed: Network error. Check if your Workers proxy is accessible."
				);
			} else if (error.message.includes("NetworkError")) {
				new Notice(
					"Download failed: Network error. Check your internet connection."
				);
			} else {
				new Notice(`Download failed: ${error.message}`);
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
}

class RemoteFetchModal extends Modal {
	plugin: RemoteFetchPlugin;
	urlInput: HTMLInputElement;
	filenameInput: HTMLInputElement;
	selectedFolder: string;
	folderDisplay: HTMLElement;

	constructor(app: App, plugin: RemoteFetchPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Download File from URL" });

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

		// Folder selection
		const folderContainer = contentEl.createEl("div", {
			cls: "remote-fetch-folder-container",
		});
		folderContainer.createEl("label", { text: "Destination folder:" });

		this.selectedFolder = this.plugin.settings.defaultDownloadFolder || "";
		
		this.folderDisplay = folderContainer.createEl("div", {
			cls: "remote-fetch-folder-display",
			text: this.selectedFolder || "Root folder",
		});

		new ButtonComponent(folderContainer)
			.setButtonText("Choose Folder")
			.onClick(() => {
				new FolderSuggestModal(this.app, (folder: string) => {
					this.selectedFolder = folder;
					this.folderDisplay.textContent = folder || "Root folder";
				}).open();
			});

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
				.remote-fetch-filename-input {
					width: 100%;
					padding: 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
					color: var(--text-normal);
				}
				.remote-fetch-folder-container {
					margin-bottom: 15px;
				}
				.remote-fetch-folder-display {
					padding: 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-secondary);
					margin-bottom: 10px;
				}
				.remote-fetch-button-container {
					display: flex;
					justify-content: flex-end;
					gap: 10px;
					margin-top: 20px;
				}
				.folder-suggestion {
					display: flex;
					align-items: center;
					padding: 4px 0;
				}
				.folder-icon {
					margin-right: 8px;
					font-size: 14px;
				}
				.folder-text {
					color: var(--text-normal);
				}
			`,
		});
	}

	async handleDownload() {
		const url = this.urlInput.value.trim();
		let filename = this.filenameInput.value.trim();

		if (!url) {
			new Notice("Please enter a URL");
			return;
		}

		if (!filename) {
			new Notice("Please enter a filename");
			return;
		}

		// Validate URL
		try {
			new URL(url);
		} catch (e) {
			new Notice("Please enter a valid URL");
			return;
		}

		// Sanitize filename to prevent illegal characters
		filename = this.plugin.sanitizeFilename(filename);

		// Construct the target path
		const folderPath = this.selectedFolder;
		const targetPath = folderPath ? `${folderPath}/${filename}` : filename;

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

		// Find and re-enable buttons
		const buttons = this.contentEl.querySelectorAll("button");
		buttons.forEach((button) => {
			button.disabled = false;
		});
	}

}

class FolderSuggestModal extends SuggestModal<string> {
	onSelectFolder: (folder: string) => void;

	constructor(app: App, onSelectFolder: (folder: string) => void) {
		super(app);
		this.onSelectFolder = onSelectFolder;
		this.setPlaceholder("Type to search folders...");
		this.setInstructions([
			{
				command: "↑↓",
				purpose: "to navigate"
			},
			{
				command: "↵",
				purpose: "to select"
			},
			{
				command: "esc",
				purpose: "to dismiss"
			}
		]);
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
		const container = el.createDiv({ cls: "folder-suggestion" });
		container.createSpan({ 
			cls: "folder-text", 
			text: folder || "Root folder" 
		});
	}

	onChooseSuggestion(folder: string, evt: MouseEvent | KeyboardEvent) {
		this.onSelectFolder(folder);
		this.close();
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

		containerEl.createEl("h2", { text: "Remote Fetch Settings" });

		new Setting(containerEl)
			.setName("Default download folder")
			.setDesc(
				"Default folder for downloaded files (leave empty for root folder)"
			)
			.addText((text) =>
				text
					.setPlaceholder("attachments")
					.setValue(this.plugin.settings.defaultDownloadFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultDownloadFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable CORS proxy")
			.setDesc("Use a CORS proxy to bypass cross-origin restrictions")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCorsProxy)
					.onChange(async (value) => {
						this.plugin.settings.enableCorsProxy = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("CORS proxy URL")
			.setDesc(
				"URL of the CORS proxy service (uses your custom Workers proxy by default)"
			)
			.addText((text) =>
				text
					.setPlaceholder(
						"https://remote-fetch.shaharyar321321.workers.dev/?url="
					)
					.setValue(this.plugin.settings.corsProxyUrl)
					.onChange(async (value) => {
						this.plugin.settings.corsProxyUrl = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

