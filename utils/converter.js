const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { ensureConfigLoaded, gC_d, authorization, getTimestamp, decodeHex } = require('./config');
const { makeRequest } = require('./http');
const { extractVideoId } = require('./youtube');

// Initialize API call
async function initialize(videoId, format) {
    await ensureConfigLoaded();
    const paramName = decodeHex(gC_d(3)[1]); // dynamic param: p, r, etc.
    const auth = authorization();
    const timestamp = getTimestamp();
    const initUrl = `https://gamma.gammacloud.net/api/v1/init?${paramName}=${encodeURIComponent(auth)}&t=${timestamp}`;

    console.log('Initializing...');
    const response = await makeRequest(initUrl);

    if (response.status !== 200) {
        throw new Error(`Init failed with status ${response.status}`);
    }

    if (response.data.error && response.data.error !== '0' && response.data.error !== 0) {
        throw new Error(`Init error: ${response.data.error}`);
    }

    return response.data.convertURL;
}

// Convert API call
async function convert(convertUrl, videoId, format, isRedirect = false) {
    // Remove existing v= parameter if present
    if (convertUrl.includes('&v=')) {
        convertUrl = convertUrl.split('&v=')[0];
    }

    const timestamp = getTimestamp();
    const url = `${convertUrl}&v=${videoId}&f=${format}&t=${timestamp}`;

    console.log('Converting...');
    const response = await makeRequest(url);

    if (response.status !== 200) {
        throw new Error(`Convert failed with status ${response.status}`);
    }

    if (response.data.error && response.data.error !== 0) {
        const errorCode = response.data.error;
        if (/^215|243|244|245$/.test(errorCode.toString())) {
            throw new Error(`Conversion error: ${errorCode}`);
        }
        throw new Error(`Convert error: ${errorCode}`);
    }

    // Handle redirect
    if (response.data.redirect === 1 && response.data.redirectURL) {
        console.log('Following redirect...');
        return convert(response.data.redirectURL, videoId, format, true);
    }

    return {
        progressURL: response.data.progressURL,
        downloadURL: response.data.downloadURL,
        title: response.data.title
    };
}

// Poll progress
async function pollProgress(progressUrl, downloadUrl, videoId, format) {
    const timestamp = getTimestamp();
    const url = `${progressUrl}&t=${timestamp}`;

    const response = await makeRequest(url);

    if (response.status !== 200) {
        throw new Error(`Progress check failed with status ${response.status}`);
    }

    if (response.data.error && response.data.error > 0) {
        throw new Error(`Progress error: ${response.data.error}`);
    }

    // Progress values: 0 = checking, 1 = extracting, 2 = converting, 3 = completed
    const progress = response.data.progress;
    const statuses = ['checking video', 'extracting video', 'converting video', 'completed'];

    if (progress < 3) {
        console.log(`Status: ${statuses[progress] || 'processing'}...`);
        // Wait 3 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 3000));
        return pollProgress(progressUrl, downloadUrl, videoId, format);
    }

    return downloadUrl;
}

// Download file to local filesystem (CLI usage)
async function downloadFile(downloadUrl, videoId, format, title) {
    const finalUrl = `${downloadUrl}&s=1&v=${videoId}&f=${format}`;

    console.log('Downloading file...');

    return new Promise((resolve, reject) => {
        const urlObj = new URL(finalUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const filename = title
            ? `${title.replace(/[^a-z0-9]/gi, '_')}.${format}`
            : `${videoId}.${format}`;

        const filepath = path.join(process.cwd(), filename);
        const file = fs.createWriteStream(filepath);

        const req = protocol.get(finalUrl, {
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
        }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                // Follow redirect
                file.close();
                fs.unlinkSync(filepath);
                return downloadFile(res.headers.location, videoId, format, title)
                    .then(resolve)
                    .catch(reject);
            }

            res.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`\nDownload complete: ${filename}`);
                resolve(filepath);
            });
        });

        req.on('error', (error) => {
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(error);
        });

        file.on('error', (error) => {
            file.close();
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
            reject(error);
        });
    });
}

// Main function for CLI usage
async function downloadYouTubeVideo(youtubeUrl, format = 'mp3') {
    try {
        // Extract video ID
        const videoId = extractVideoId(youtubeUrl);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        console.log(`Video ID: ${videoId}`);
        console.log(`Format: ${format}\n`);

        // Initialize
        const convertUrl = await initialize(videoId, format);

        // Convert
        const { progressURL, downloadURL, title } = await convert(convertUrl, videoId, format);

        if (title) {
            console.log(`Title: ${title}\n`);
        }

        // Poll progress if progressURL exists
        let finalDownloadUrl = downloadURL;
        if (progressURL) {
            finalDownloadUrl = await pollProgress(progressURL, downloadURL, videoId, format);
        }

        // Download
        const filepath = await downloadFile(finalDownloadUrl, videoId, format, title);

        return filepath;
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

// Get download URL without downloading (for web UI)
async function getDownloadUrl(youtubeUrl, format = 'mp3') {
    try {
        const videoId = extractVideoId(youtubeUrl);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        const convertUrl = await initialize(videoId, format);

        const { progressURL, downloadURL, title } = await convert(convertUrl, videoId, format);

        let finalDownloadUrl = downloadURL;
        if (progressURL) {
            finalDownloadUrl = await pollProgress(progressURL, downloadURL, videoId, format);
        }

        const finalUrl = `${finalDownloadUrl}&s=1&v=${videoId}&f=${format}`;

        const filename = title
            ? `${title.replace(/[^a-z0-9]/gi, '_')}.${format}`
            : `${videoId}.${format}`;

        return { downloadUrl: finalUrl, filename, title };
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

module.exports = {
    downloadYouTubeVideo,
    getDownloadUrl,
    extractVideoId
};


