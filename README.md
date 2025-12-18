# yt-rip

A Node.js (Express.js) application that mimics the ytmp3.as API to download YouTube videos as MP3 (audio) or MP4 (video) files.

## Features

- Download YouTube videos as MP3 or MP4
- Automatic progress tracking
- Handles API redirects
- Simple CLI interface
- Dynamically mimics the latest obfuscated auth challenge from ytmp3.as (auto-updates)

## Installation

1. **Clone the repository** (or download the source).
2. **Install dependencies** (Express, Cheerio, etc.):

```bash
npm install
```

3. Make sure you have **Node.js 12.0.0 or higher** installed (preferably a modern LTS).

## Usage

### Web UI (Recommended)

Start the web server:

```bash
npm run server
# or
node server.js
```

Then open your browser to `http://localhost:3000`

The web interface features:
- Beautiful, minimalistic mobile-first design
- Dark/light mode toggle
- Simple URL input and format selection
- Real-time download progress

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

## How It Works

The application mimics the exact API flow used by ytmp3.as and keeps up with their obfuscation:

1. **Dynamic config scraping (gC)**  
   - On first use (and then at most once per hour), the backend fetches the live `AOPR` page from `ytmp3.as`.
   - It uses `cheerio` (BeautifulSoup-equivalent for Node) to locate the inline script that defines the obfuscated `gC` config and the helper `gC.d` function.
   - That script is executed in a sandbox (`vm` module) to reconstruct the current `gC` object, the active parameter name (`p`, `r`, etc.), and the exact authorization algorithm.
   - The resolved config is cached in memory for **1 hour (TTL)** so the site isn’t scraped on every request.

2. **Extract Video ID** – Parses the YouTube URL to extract the video ID (watch, youtu.be, shorts)
3. **Initialize** – Calls the init API endpoint with the dynamically generated authorization token and current parameter name
4. **Convert** – Calls the convert API endpoint (handles redirects if needed)
5. **Poll Progress** – Continuously checks conversion progress when required
6. **Download** – Builds the final download URL and either:
   - Returns the **direct gammacloud URL** to the client, or
   - Uses the internal streaming endpoint as a proxy (useful for cURL, testing, or if you want to hide the direct URL)

## Supported URL Formats

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`

## Output

Files are saved in the current working directory with the format:
- `{video-title}.mp3` or `{video-title}.mp4`
- If title is unavailable: `{video-id}.mp3` or `{video-id}.mp4`

## Requirements

- Node.js 12.0.0 or higher
- Internet connection

## API Usage (Postman/cURL)

Yes! Once the server is running, you can send requests via Postman, cURL, or any HTTP client. The API uses a two-step process:

1. **POST to `/api/download`** - Gets the download URL
2. **GET the stream URL** - Downloads the file directly to your client

### API Endpoints

**POST** `http://localhost:3000/api/download` - Get download URLs (direct + stream)  
**GET** `http://localhost:3000/api/stream?url=...&filename=...` - Stream/download file via this server (optional)

### Request Body (for POST)

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "mp3"
}
```

### cURL Examples

#### Two-Step Process (Recommended)

**Step 1: Get download URL**
```bash
curl -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"mp3"}'
```

**Response:**
```json
{
  "success": true,
  "filename": "Video_Title.mp3",
  "downloadUrl": "/api/stream?url=https://...&filename=Video_Title.mp3"
}
```

**Step 2: Download the file**
```bash
# Use the downloadUrl from step 1
curl -O -J "http://localhost:3000/api/stream?url=https://...&filename=Video_Title.mp3"
```

#### One-Liner (Bash)

**Download as MP3:**
```bash
# Get URL and download in one command
DOWNLOAD_URL=$(curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"mp3"}' \
  | grep -o '"downloadUrl":"[^"]*' | cut -d'"' -f4)

curl -O -J "http://localhost:3000${DOWNLOAD_URL}"
```

**Download as MP4:**
```bash
DOWNLOAD_URL=$(curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"mp4"}' \
  | grep -o '"downloadUrl":"[^"]*' | cut -d'"' -f4)

curl -O -J "http://localhost:3000${DOWNLOAD_URL}"
```

**With YouTube Shorts:**
```bash
DOWNLOAD_URL=$(curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/shorts/VIDEO_ID","format":"mp3"}' \
  | grep -o '"downloadUrl":"[^"]*' | cut -d'"' -f4)

curl -O -J "http://localhost:3000${DOWNLOAD_URL}"
```

#### Using jq (if installed)

```bash
# More reliable parsing with jq
DOWNLOAD_URL=$(curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"mp3"}' \
  | jq -r '.downloadUrl')

curl -O -J "http://localhost:3000${DOWNLOAD_URL}"
```

### Response Format

**Success (from POST /api/download):**
```json
{
  "success": true,
  "filename": "Video_Title.mp3",
  "downloadUrl": "/api/stream?url=https://...&filename=Video_Title.mp3",
  "directUrl": "https://occooo.gammacloud.net/api/v1/download?sig=..."
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

### How It Works (API Response Usage)

- **Browser (Web UI)**:  
  - The frontend prefers the **`directUrl`** when available and triggers a download directly from the gammacloud host, so the file is downloaded straight to the user’s browser without proxying through this server.
  - The internal `downloadUrl` (`/api/stream?...`) is kept as a fallback and for advanced use cases.

- **cURL/Postman**: 
  - The POST request returns both a `downloadUrl` (local stream endpoint) and a `directUrl` (raw gammacloud URL).
  - You can either:
    - `GET` the `downloadUrl` via this server, **or**
    - `GET` the `directUrl` directly from gammacloud.
  - With `curl -O -J`, the file saves to your current directory with the correct filename (`-O` saves, `-J` uses the filename from the `Content-Disposition` header).

### Complete Flow Example

```bash
# 1. Start the server
node server.js

# 2. In another terminal, get download URL
RESPONSE=$(curl -s -X POST http://localhost:3000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","format":"mp3"}')

# 3. Extract download URL (using jq if available, or grep)
DOWNLOAD_URL=$(echo $RESPONSE | jq -r '.downloadUrl')
# OR without jq:
# DOWNLOAD_URL=$(echo $RESPONSE | grep -o '"downloadUrl":"[^"]*' | cut -d'"' -f4)

# 4. Download the file
curl -O -J "http://localhost:3000${DOWNLOAD_URL}"

# File will be saved in your current directory
```

## Important Disclaimer

**This project is created purely for educational purposes and better accessibility for developers.**

- **No Illegal Logic**: I have not written any logic that violates copyright laws or YouTube's Terms of Service. This application simply mimics the API calls that the public website ytmp3.as makes, which are already accessible through any web browser.

- **Educational Purpose**: This project serves as an educational resource to understand:
  - How web APIs work
  - Reverse engineering of public APIs
  - HTTP request/response handling
  - Node.js server development
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

