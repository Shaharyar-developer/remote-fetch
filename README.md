# Remote Fetch Plugin

A powerful Obsidian plugin that allows you to download files from URLs directly into your vault.

> **Note:** This plugin is **not yet available in the Obsidian Community Plugins directory**. For now, you must install it manually (see instructions below).

## Features

- **Direct URL Downloads**: Download files from any HTTP or HTTPS URL directly into your Obsidian vault.
- **Smart File Naming**: Automatically extracts filenames from URLs or allows custom naming.
- **Folder Selection**: Choose any folder in your vault as the download destination, with type-ahead support.
- **File Type Detection**: Automatically detects file types and adds appropriate extensions.
- **Error Handling**: Comprehensive error handling with informative messages.
- **Security**: Blocks dangerous file types and enforces file size/content-type restrictions.

## Installation

### Manual Installation
1. Download the latest release from GitHub.
2. Extract the files to your vault's `.obsidian/plugins/remote-fetch/` folder.
3. Enable the plugin in Obsidian's Community Plugins settings.

## Usage

1. Use the command palette (Ctrl/Cmd + P) and search for **"Download file from URL"**.
2. Enter the URL of the file you want to download.
3. Choose a filename (auto-filled from URL).
4. Select a destination folder (type-ahead supported).
5. Click **Download**.

### Command
- **Download file from URL**: Opens the download modal.

## Settings

- **Default download folder**: Set a default folder for all downloads (leave empty for root folder). Type-ahead is supported for folder selection.

## Supported File Types

The plugin automatically detects and handles various file types:
- Documents: PDF, DOC, DOCX, XLS, XLSX
- Images: JPG, PNG, GIF, SVG
- Text: TXT, MD, JSON
- Archives: ZIP
- Media: MP4, MP3, WAV
- And many more...

## Error Handling

The plugin provides detailed error messages for common issues:
- Network connectivity problems
- CORS-related errors
- Invalid URLs
- File already exists
- Empty or invalid downloads
- Blocked file types or oversized files

## Development

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Setup
1. Clone the repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. For development: `npm run dev`

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

This will start the compiler in watch mode, automatically rebuilding when files change.

> **UI/UX Notes:**  
> - Use sentence case for all UI labels and headings, except for product/brand names which should follow their official casing.  
> - Do not add a top-level heading in the settings tab (such as "General", "Settings", or the plugin name).  
> - Place all custom styles in `styles.css` instead of inline in TypeScript files.  
> - Use `AbstractInputSuggest` for folder selection to provide type-ahead support.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Copyright (C) 2020-2025 Shaharyar Lalani

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you find this plugin useful, consider supporting its development:
- ⭐ Star the repository on GitHub
- 🐛 Report bugs or suggest features

## Changelog

### 1.0.1
- Switched to Obsidian’s `requestUrl` API for downloads (handles CORS automatically, proxy not required)
- Removed proxy settings and related UI
- Improved folder selection with type-ahead (using `AbstractInputSuggest`)
- Updated UI to use sentence case
- Moved inline styles to `styles.css`
- Copyright updated

### 1.0.0
- Initial release
- Basic URL download functionality
- Folder selection
- File type detection