
# Remote Fetch Plugin

A powerful Obsidian plugin that allows you to download files from URLs directly into your vault with CORS proxy support.

> **Note:** This plugin is **not yet available in the Obsidian Community Plugins directory**. For now, you must install it manually (see instructions below).

## Features

- **Direct URL Downloads**: Download files from any URL directly into your Obsidian vault
- **CORS Proxy Support**: Bypass cross-origin restrictions using a configurable CORS proxy
- **Smart File Naming**: Automatically extracts filenames from URLs or allows custom naming
- **Folder Selection**: Choose any folder in your vault as the download destination
- **File Type Detection**: Automatically detects file types and adds appropriate extensions
- **Error Handling**: Comprehensive error handling with informative messages
- **Caching Support**: Handles HTTP 304 responses and cache-busting for fresh downloads

## Installation

### Manual Installation (Community Plugins not available yet)
1. Download the latest release from GitHub
2. Extract the files to your vault's `.obsidian/plugins/remote-fetch/` folder
3. Enable the plugin in Obsidian's Community Plugins settings

## Usage

### Basic Usage
1. Use the command palette (Ctrl/Cmd + P) and search for "Download file from URL"
2. Or use the ribbon icon (if enabled)
3. Enter the URL of the file you want to download
4. Choose a filename (auto-filled from URL)
5. Select a destination folder
6. Click "Download"

### Command
- **Download file from URL**: Opens the download modal

## Settings

The plugin offers several configuration options:

- **Default Download Folder**: Set a default folder for all downloads (leave empty for root folder)
- **Enable CORS Proxy**: Toggle CORS proxy usage to bypass cross-origin restrictions
- **CORS Proxy URL**: Configure your custom CORS proxy URL

## CORS Proxy Setup

Many websites block direct file downloads due to CORS (Cross-Origin Resource Sharing) restrictions. This plugin includes support for CORS proxies to bypass these limitations.

### Default Proxy
The plugin comes with a default CORS proxy: `https://remote-fetch.shaharyar.dev/?url=`


### Custom Proxy
You can set up your own CORS proxy using Cloudflare Workers or similar services. The proxy should:
1. Accept a URL parameter
2. Fetch the content from that URL
3. Return it with appropriate CORS headers

#### Example: Safe Cloudflare Worker Script

The full source code for a safe CORS proxy is included in [`cors-proxy-worker.js`](./cors-proxy-worker.js) in this repository.
**This code is designed to be as safe as possible:**

- Only allows public internet URLs (blocks localhost, private IPs, etc.)
- Handles CORS preflight requests
- Limits file size (50MB max)
- Copies only safe headers
- Sets strict CORS headers on all responses
- Does NOT log, store, or analyze any data

You can review the code directly in this repository. It is safe for use as a public CORS proxy for file downloads.

```javascript
// See cors-proxy-worker.js for the full, up-to-date code
export default {
  async fetch(request) {
    // ...existing code as in cors-proxy-worker.js...
  }
};
```


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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you find this plugin useful, consider supporting its development:
- ⭐ Star the repository on GitHub
- 🐛 Report bugs or suggest features

## Changelog

### 1.0.1
- Added `cors-proxy-worker.js` to the repository for full transparency
- README updated to clarify proxy safety and provide direct code reference

### 1.0.0
- Initial release
- Basic URL download functionality
- CORS proxy support
- Folder selection
- File type detection
- Error handling
