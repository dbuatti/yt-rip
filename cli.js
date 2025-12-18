const { downloadYouTubeVideo, getDownloadUrl, extractVideoId } = require('./utils/converter');

// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node cli.js <youtube-url> [format]');
        console.log('Example: node cli.js https://www.youtube.com/watch?v=dQw4w9WgXcQ mp3');
        console.log('Formats: mp3, mp4');
        process.exit(1);
    }

    const youtubeUrl = args[0];
    const format = args[1] || 'mp3';

    if (!['mp3', 'mp4'].includes(format.toLowerCase())) {
        console.error('Invalid format. Use mp3 or mp4');
        process.exit(1);
    }

    downloadYouTubeVideo(youtubeUrl, format.toLowerCase())
        .then(filepath => {
            console.log(`\nSuccess! File saved to: ${filepath}`);
            process.exit(0);
        })
        .catch(error => {
            console.error(`\nFailed: ${error.message}`);
            process.exit(1);
        });
}

module.exports = {
    downloadYouTubeVideo,
    extractVideoId,
    getDownloadUrl
};


