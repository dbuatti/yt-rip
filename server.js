const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getDownloadUrl } = require('./index');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API endpoint for downloads - returns download URL for browser
    if (req.method === 'POST' && req.url === '/api/download') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const { url, format } = JSON.parse(body);
                
                if (!url) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'URL is required' }));
                    return;
                }

                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                });

                try {
                    // Get the download URL without actually downloading
                    const { downloadUrl, filename } = await getDownloadUrl(url, format || 'mp3');
                    
                    res.end(JSON.stringify({ 
                        success: true, 
                        filename: filename,
                        downloadUrl: `/api/stream?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}`
                    }));
                } catch (error) {
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: error.message 
                    }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request body' }));
            }
        });
        return;
    }

    // Stream endpoint - streams file directly to browser
    if (req.method === 'GET' && req.url.startsWith('/api/stream')) {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
        const streamUrl = urlObj.searchParams.get('url');
        let filename = urlObj.searchParams.get('filename') || 'download';
        
        // Sanitize filename to prevent header injection
        filename = filename.replace(/[^\w\s.-]/g, '_').replace(/\s+/g, '_');
        
        if (!streamUrl) {
            res.writeHead(400);
            res.end('Missing URL parameter');
            return;
        }

        // Stream the file directly from the source to the browser
        const sourceUrl = new URL(streamUrl);
        const protocol = sourceUrl.protocol === 'https:' ? https : http;
        
        const downloadReq = protocol.get(streamUrl, {
            headers: {
                'accept': '*/*',
                'referer': 'https://ytmp3.as/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (downloadRes) => {
            // Handle redirects
            if (downloadRes.statusCode === 302 || downloadRes.statusCode === 301) {
                res.writeHead(302, { 'Location': `/api/stream?url=${encodeURIComponent(downloadRes.headers.location)}&filename=${encodeURIComponent(filename)}` });
                res.end();
                return;
            }

            // Set headers for file download
            const contentType = filename.endsWith('.mp3') ? 'audio/mpeg' : 
                              filename.endsWith('.mp4') ? 'video/mp4' : 
                              'application/octet-stream';
            
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': downloadRes.headers['content-length'] || '',
                'Cache-Control': 'no-cache'
            });

            // Pipe the download stream directly to the browser
            downloadRes.pipe(res);
            
            downloadRes.on('error', (error) => {
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Download error');
                }
            });
        });

        downloadReq.on('error', (error) => {
            if (!res.headersSent) {
                res.writeHead(500);
                res.end('Request error');
            }
        });

        req.on('close', () => {
            downloadReq.destroy();
        });
        
        return;
    }

    // Serve static files
    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Check if file exists
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            // File not found, serve index.html for SPA routing
            filePath = path.join(PUBLIC_DIR, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Server Error');
                return;
            }

            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});

