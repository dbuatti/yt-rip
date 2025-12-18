# yt-rip 🔊

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node Version](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg?logo=node.js)
![Express](https://img.shields.io/badge/Express.js-4.x-000000?logo=express&logoColor=white)
![Cheerio](https://img.shields.io/badge/HTML-cheerio-3E63DD)

A Node.js (Express.js) application that mimics the public API behavior of `ytmp3.as` to download YouTube videos as MP3 (audio) or MP4 (video) files.  
It provides a clean, mobile‑first UI and a developer‑friendly API while keeping all reverse‑engineering logic on the backend.

## Features

- **YouTube to MP3/MP4** – Paste a YouTube URL and download as MP3 (audio) or MP4 (video).
- **Automatic progress tracking** – Mirrors the “checking / extracting / converting” flow of ytmp3.as.
- **Redirect & signature handling** – Follows the multi‑host gammacloud URLs and redirects automatically.
- **Dynamic obfuscation handling** – Scrapes and evaluates the latest obfuscated config (`gC`) from ytmp3.as (1‑hour TTL).
- **Modern UI** – Minimal, mobile‑first interface with a dark/light theme toggle.
- **CLI + API** – Use from the terminal (`cli.js`) or via a simple JSON API.
- **Test/demo mode** – Optional `TEST_MODE` flag to disable real conversions on public deployments.

## Installation

### Prerequisites

- **Node.js**: 12.0.0 or higher (LTS recommended)
- **npm**: bundled with Node.js

### Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/0xaadesh/yt-rip
   cd yt-rip
   npm install
   ```

2. **Environment configuration (optional, for demo mode)**

   Create a `.env` file in the project root if you want to enable demo/test mode (for hosted deployments):

   ```env
   TEST_MODE=true
   PORT=3000
   ```

   - `TEST_MODE=true` → demo/test mode (no real conversions, safe for public hosting)
   - `TEST_MODE=false` or unset → full functionality (real conversions)

## Usage

### Web UI (Recommended)

Start the web server:

```bash
npm run server
# or
node server.js
```

Then open your browser to `http://localhost:3000`.

The web interface features:
- Beautiful, minimalistic mobile-first design
- Dark/light mode toggle
- Simple URL input and format selection
- Real-time download progress

#### Demo vs Local Mode

- **Hosted demo / test mode (`TEST_MODE=true`)**
  - Real conversions are **disabled** – `/api/download` returns a clear test‑mode message instead of calling the third‑party API.
  - The web UI shows a **“Test mode”** badge next to the title and an extra footer message explaining:
    - This project involves reverse‑engineering a third‑party service.
    - The public deployment runs in test mode only to avoid facilitating copyright infringement.
    - Full functionality is available when run locally for educational purposes.

- **Local development / full mode (`TEST_MODE` unset or `false`)**
  - The backend dynamically scrapes the latest obfuscated config from ytmp3.as.
  - Conversions and downloads work end‑to‑end.
  - No test‑mode badge or extra footer warning is shown.

### Command Line (CLI)

```bash
node cli.js <youtube-url> [format]
```

**Examples:**

```bash
# Download as MP3 (default)
node cli.js https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Download as MP3 (explicit)
node cli.js https://www.youtube.com/watch?v=dQw4w9WgXcQ mp3

# Download as MP4
node cli.js https://www.youtube.com/watch?v=dQw4w9WgXcQ mp4

# Short URL support
node cli.js https://youtu.be/dQw4w9WgXcQ mp3

# YouTube Shorts support
node cli.js https://www.youtube.com/shorts/dQw4w9WgXcQ mp3
```

### Programmatic Usage

```javascript
const { downloadYouTubeVideo } = require('./utils/converter');

async function main() {
  try {
    const filepath = await downloadYouTubeVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'mp3'
    );
    console.log('Downloaded to:', filepath);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

## How It Works (Internals)

yt-rip mirrors the internal browser→backend flow used by ytmp3.as, but with a dynamic obfuscation layer:

1. **Dynamic config scraping (`gC`)**
   - On first use (and then at most once per hour), the backend fetches the live `AOPR` page from `ytmp3.as`.
   - It uses `cheerio` (BeautifulSoup-equivalent for Node) to locate the inline script that defines the obfuscated `gC` config and the helper `gC.d` function.
   - That script is executed in a sandbox (`vm` module) to reconstruct the current `gC` object, the active parameter name (`p`, `r`, etc.), and the exact authorization algorithm.
   - The resolved config is cached in memory for **1 hour (TTL)** so the site isn’t scraped on every request.

2. **Extract Video ID**
   - Parses the YouTube URL to extract the video ID.
   - Supports `watch`, `youtu.be`, and `shorts` formats.

3. **Initialize**
   - Calls the `init` API endpoint with:
     - The dynamically generated authorization token (derived from `gC`).
     - The current parameter name decoded from `gC` (`p`, `r`, etc.).

4. **Convert**
   - Calls the `convert` endpoint returned by `init`.
   - Handles redirects across different gammacloud subdomains.

5. **Poll Progress**
   - When the backend reports a `progressURL`, yt-rip periodically polls it until conversion is complete.

6. **Download URL**
   - Builds the final download URL and returns:
     - The **direct gammacloud URL** to the client (`directUrl`), and
     - A proxied streaming URL via this server (`downloadUrl` → `/api/stream?...`), useful for cURL or when you want to hide the direct URL.

## Supported URL Formats

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`

## Output

Files are saved in the current working directory (CLI) or your browser’s download folder (web UI) with:
- `{video-title}.mp3` or `{video-title}.mp4`
- If title is unavailable: `{video-id}.mp3` or `{video-id}.mp4`

## Requirements

- Node.js 12.0.0 or higher
- Internet connection

## API Usage (Postman/cURL)

Once the server is running, you can send requests via Postman, cURL, or any HTTP client.

### API Endpoints

- **POST** `http://localhost:3000/api/download` – Get download URLs (direct + stream)
- **GET** `http://localhost:3000/api/stream?url=...&filename=...` – Stream/download file via this server (optional)

### Request Body (for POST)

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "mp3"
}
```

### Example Flow

**Step 1: Get download URL**
```bash
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"mp3"}'
```

**Example success response:**
```json
{
  "success": true,
  "filename": "Video_Title.mp3",
  "downloadUrl": "/api/stream?url=https://...&filename=Video_Title.mp3",
  "directUrl": "https://occooo.gammacloud.net/api/v1/download?sig=..."
}
```

**Step 2: Download the file via the proxy**
```bash
DOWNLOAD_URL="/api/stream?url=https://...&filename=Video_Title.mp3"
curl -O -J "http://localhost:3000${DOWNLOAD_URL}"
```

**Or download directly from gammacloud:**
```bash
DIRECT_URL="https://occooo.gammacloud.net/api/v1/download?sig=..."
curl -O -J "${DIRECT_URL}"
```

## Project Structure

```text
yt-rip/
├── cli.js              # CLI entry point
├── server.js           # Express server (web UI + API + test mode)
├── public/
│   ├── index.html      # Main frontend (converter UI)
│   └── about.html      # About & disclaimer page
├── utils/
│   ├── config.js       # gC scraping, authorization, timestamp helpers
│   ├── http.js         # HTTP wrapper that mimics browser headers
│   ├── youtube.js      # YouTube URL parsing
│   └── converter.js    # Core init/convert/progress/download logic
├── package.json        # Node.js metadata & dependencies
├── package-lock.json   # Locked dependency versions
├── LICENSE             # MIT license + additional disclaimer
└── .env.example?       # (optional) example env file
```

## Dependencies

- **Express** – Web framework for building the HTTP server and API.
- **Cheerio** – HTML parsing and scraping (for the obfuscated config).
- **dotenv** – Environment variable loading (`.env`) for `TEST_MODE`, `PORT`, etc.

All dependencies are managed via `package.json` and `package-lock.json`.

## Important Disclaimer

**This project is created purely for educational purposes and better accessibility for developers.**

- **No Illegal Logic**: I have not written any logic that violates copyright laws or YouTube's Terms of Service. This application simply mimics the API calls that the public website ytmp3.as makes, which are already accessible through any web browser.

- **Educational Purpose**: This project serves as an educational resource to understand:
  - How web APIs work
  - Reverse engineering of public APIs
  - HTTP request/response handling
  - Node.js/Express server development
  - Web scraping and API interaction patterns

- **Better Developer Access**: The purpose is to provide developers with a programmatic interface to understand and learn from the API patterns used by existing public services, making it easier to integrate similar functionality into their own projects for legitimate use cases.

- **User Responsibility**: Users are solely responsible for:
  - Respecting YouTube's Terms of Service
  - Only downloading content they have permission to download
  - Complying with copyright laws in their jurisdiction
  - Using this tool ethically and legally

- **No Endorsement**: This project does not endorse or encourage copyright infringement. It is a technical demonstration of API interaction patterns.

**Note**: Conversion may take some time depending on video length. The server processes requests synchronously, so multiple simultaneous requests may queue.

## License

This project is licensed under the MIT License with additional disclaimers. See [LICENSE](LICENSE) file for details.

**Important**: The MIT License includes standard "AS IS" disclaimers, and we've added additional explicit disclaimers to emphasize that:

- **No Liability**: The authors and contributors are not liable for any legal consequences, damages, or losses resulting from the use or misuse of this software.
- **User Responsibility**: Users are solely responsible for ensuring their use complies with all applicable laws, terms of service, and regulations.
- **Educational Purpose**: This software is provided for educational purposes only to demonstrate API interaction patterns.

By using this software, you acknowledge that you understand and accept these terms.

