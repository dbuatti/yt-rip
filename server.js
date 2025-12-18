const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const { getDownloadUrl } = require('./utils/converter');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();

// Middleware
app.use(express.json());

// CORS (simple, open)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve static assets
app.use(express.static(PUBLIC_DIR));

// API endpoint for downloads - returns download URL for browser
app.post('/api/download', async (req, res) => {
    try {
        const { url, format } = req.body || {};

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            const { downloadUrl, filename } = await getDownloadUrl(url, format || 'mp3');

            // Log the direct gammacloud URL for debugging / manual testing
            console.log('Direct download URL from gammacloud:', downloadUrl);

            return res.status(200).json({
                success: true,
                filename,
                // Internal stream endpoint (what the UI uses)
                downloadUrl: `/api/stream?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}`,
                // Raw direct URL (for manual testing with curl/browser)
                directUrl: downloadUrl
            });
        } catch (error) {
            return res.status(200).json({
                success: false,
                error: error.message
            });
        }
    } catch (error) {
        return res.status(400).json({ error: 'Invalid request body' });
    }
});

// Stream endpoint - streams file directly to browser
app.get('/api/stream', (req, res) => {
    const streamUrl = req.query.url;
    let filename = req.query.filename || 'download';

    // Sanitize filename to prevent header injection
    filename = filename.replace(/[^\w\s.-]/g, '_').replace(/\s+/g, '_');

    if (!streamUrl) {
        return res.status(400).send('Missing URL parameter');
    }

    try {
        const sourceUrl = new URL(streamUrl);
        const protocol = sourceUrl.protocol === 'https:' ? https : http;

        const downloadReq = protocol.get(streamUrl, {
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.8',
                'origin': 'https://ytmp3.as',
                'priority': 'u=1, i',
                'referer': 'https://ytmp3.as/',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'cross-site',
                'sec-gpc': '1',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
            }
        }, (downloadRes) => {
            // Handle redirects
            if (downloadRes.statusCode === 302 || downloadRes.statusCode === 301) {
                const location = downloadRes.headers.location;
                if (!location) {
                    return res.status(500).send('Missing redirect location');
                }
                return res.redirect(302, `/api/stream?url=${encodeURIComponent(location)}&filename=${encodeURIComponent(filename)}`);
            }

            const contentType = filename.endsWith('.mp3')
                ? 'audio/mpeg'
                : filename.endsWith('.mp4')
                ? 'video/mp4'
                : 'application/octet-stream';

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': downloadRes.headers['content-length'] || '',
                'Cache-Control': 'no-cache'
            });

            downloadRes.pipe(res);

            downloadRes.on('error', () => {
                if (!res.headersSent) {
                    res.status(500).send('Download error');
                }
            });
        });

        downloadReq.on('error', () => {
            if (!res.headersSent) {
                res.status(500).send('Request error');
            }
        });

        req.on('close', () => {
            downloadReq.destroy();
        });
    } catch (err) {
        return res.status(400).send('Invalid URL');
    }
});

// Fallback to index.html for any other route (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});
