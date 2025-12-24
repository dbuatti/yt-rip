require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const { getDownloadUrl } = require('./utils/converter');

const app = express();
const PORT = process.env.PORT || 10000;
const TEST_MODE = process.env.TEST_MODE === 'true';

// --- 1. Hardened CORS Configuration ---
// This fixes the "No Access-Control-Allow-Origin" error in your logs
app.use(cors({
    origin: '*', // Allows localhost and your deployed frontend
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// Explicitly handle OPTIONS preflight requests
app.options('*', cors());

// --- 2. Routes ---

// Health Check
app.get('/', (req, res) => res.status(200).send('Audio Extraction Engine: ONLINE'));

// Extraction Endpoint
app.post('/api/download', async (req, res) => {
    try {
        const { url, format = 'mp3' } = req.body;

        if (!url) {
            return res.status(400).json({ success: false, error: 'YouTube URL is required' });
        }

        if (TEST_MODE) {
            return res.status(200).json({
                success: false,
                testMode: true,
                error: 'Engine in TEST_MODE. Real conversions disabled.'
            });
        }

        console.log(`🚀 Processing: ${url}`);
        const result = await getDownloadUrl(url, format);

        // We return the directUrl for debugging and the proxied downloadUrl for the UI
        return res.status(200).json({
            success: true,
            filename: result.filename,
            downloadUrl: `/api/stream?url=${encodeURIComponent(result.downloadUrl)}&filename=${encodeURIComponent(result.filename)}`,
            directUrl: result.downloadUrl
        });

    } catch (error) {
        console.error('❌ Extraction Failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Streaming Proxy Endpoint
// This bypasses browser security blocks by streaming the file through your server
app.get('/api/stream', (req, res) => {
    const streamUrl = req.query.url;
    let filename = req.query.filename || 'audio.mp3';

    if (!streamUrl) return res.status(400).send('Missing stream URL');

    try {
        const sourceUrl = new URL(streamUrl);
        const protocol = sourceUrl.protocol === 'https:' ? https : http;

        const downloadReq = protocol.get(streamUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                'Referer': 'https://ytmp3.as/',
                'Origin': 'https://ytmp3.as'
            }
        }, (downloadRes) => {
            // Handle Redirects (Common in gammacloud nodes)
            if ([301, 302].includes(downloadRes.statusCode)) {
                return res.redirect(`/api/stream?url=${encodeURIComponent(downloadRes.headers.location)}&filename=${encodeURIComponent(filename)}`);
            }

            res.writeHead(200, {
                'Content-Type': filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': downloadRes.headers['content-length'] || '',
                'Cache-Control': 'no-cache'
            });

            downloadRes.pipe(res);
        });

        downloadReq.on('error', (err) => res.status(500).send('Stream Error'));
    } catch (err) {
        res.status(400).send('Invalid Stream URL');
    }
});

// --- 3. Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Node Engine Live on Port ${PORT}`);
    console.log(`🛠 Mode: ${TEST_MODE ? 'TEST' : 'PRODUCTION'}`);
});
