document.addEventListener('DOMContentLoaded', () => {
    const extractBtn = document.getElementById('extractBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusDiv = document.getElementById('statusMessage');
    const playlistInput = document.getElementById('playlistUrl');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsTableBody = document.querySelector('#resultsTable tbody');
    const bigQRBtn = document.getElementById('showBigQRBtn');
    const bigQRModal = document.getElementById('bigQRModal');
    const downloadBigQRBtn = document.getElementById('downloadBigQRBtn');
    const exportAllQRsBtn = document.getElementById('exportAllQRsBtn');
    const closeModal = document.querySelector('.close-modal');
    const bigQRContainer = document.getElementById('bigQRCode');

    // TODO: Replace with your actual API Key and restrict it in Google Cloud Console
    const API_KEY = 'AIzaSyAlNLhMAydCmqYjS2hAgh_uXYPeJqPaQnk';

    let extractedVideos = []; // Store videos for download
    let playlistTitle = 'youtube_playlist'; // Default title

    console.log("App Initialized. Waiting for user input.");

    extractBtn.addEventListener('click', async () => {
        const apiKey = API_KEY;
        const playlistUrl = playlistInput.value.trim();

        // Basic Validation
        if (!playlistUrl) {
            showStatus("Please enter a Playlist URL.", "error");
            console.warn("Validation Error: Missing URL");
            return;
        }

        const playlistId = extractPlaylistId(playlistUrl);
        if (!playlistId) {
            // Specific check for video URLs to give better feedback
            if (playlistUrl.includes('youtu.be') || playlistUrl.includes('watch?v=')) {
                showStatus("It looks like you pasted a video link. Please use a Playlist URL (must contain 'list=').", "error");
                console.warn("Validation Error: User pasted a video link URL.");
            } else {
                showStatus("Invalid YouTube Playlist URL.", "error");
                console.error("Validation Error: Could not parse Playlist ID from", playlistUrl);
            }
            return;
        }

        // Start Process
        setLoading(true);
        console.log(`Starting fetch for Playlist ID: ${playlistId}`);

        try {
            // Fetch playlist metadata (title)
            playlistTitle = await fetchPlaylistMetadata(playlistId, apiKey);
            console.log(`Playlist Title: ${playlistTitle}`);

            const videos = await fetchAllPlaylistVideos(playlistId, apiKey);

            if (videos.length === 0) {
                showStatus("No videos found or playlist is private.", "error");
                console.warn("API returned 0 videos.");
            } else {
                console.log(`Successfully fetched ${videos.length} videos.`);

                // Store for download
                extractedVideos = videos;

                // Display Table
                displayResults(videos);

                showStatus(`Success! Found ${videos.length} videos. Click 'Download CSV' to save.`, "success");
            }

        } catch (error) {
            console.error("Critical Error during execution:", error);
            showStatus(`Error: ${error.message}`, "error");
        } finally {
            setLoading(false);
        }
    });

    downloadBtn.addEventListener('click', () => {
        if (!extractedVideos || extractedVideos.length === 0) {
            showStatus("No videos to download. Please extract first.", "error");
            return;
        }
        downloadCSV(extractedVideos);
    });

    exportAllQRsBtn.addEventListener('click', () => {
        if (!extractedVideos || extractedVideos.length === 0) {
            showStatus("No videos to export. Please extract first.", "error");
            return;
        }
        exportAllQRs();
    });

    // Helper: Extract ID from URL
    function extractPlaylistId(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.searchParams.get("list");
        } catch (e) {
            console.error("URL Parsing failed:", e);
            return null;
        }
    }

    // Helper: Fetch Loop (Handles Pagination)
    async function fetchAllPlaylistVideos(playlistId, apiKey) {
        let videos = [];
        let nextPageToken = '';
        let baseUrl = 'https://www.googleapis.com/youtube/v3/playlistItems';

        do {
            const params = new URLSearchParams({
                part: 'snippet',
                maxResults: '50',
                playlistId: playlistId,
                key: apiKey,
                pageToken: nextPageToken
            });

            console.log(`Fetching page... Token: ${nextPageToken || 'First Page'}`);

            const response = await fetch(`${baseUrl}?${params}`);
            const data = await response.json();

            if (!response.ok) {
                console.error("API Response Error:", data);
                throw new Error(data.error.message || "Failed to fetch data from YouTube");
            }

            // Extract relevant data
            data.items.forEach(item => {
                const title = item.snippet.title;
                const videoId = item.snippet.resourceId.videoId;
                const channel = item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || 'Unknown';
                const publishedAt = item.snippet.publishedAt;
                // Exclude "Private video" or "Deleted video" entries usually lacking IDs
                if (videoId) {
                    videos.push({
                        title: title,
                        channel: channel,
                        publishedAt: publishedAt,
                        url: `https://www.youtube.com/watch?v=${videoId}`
                    });
                }
            });

            nextPageToken = data.nextPageToken || '';

        } while (nextPageToken);

        return videos;
    }

    // Helper: Fetch Playlist Metadata (Title)
    async function fetchPlaylistMetadata(playlistId, apiKey) {
        const url = 'https://www.googleapis.com/youtube/v3/playlists';
        const params = new URLSearchParams({
            part: 'snippet',
            id: playlistId,
            key: apiKey
        });

        const response = await fetch(`${url}?${params}`);
        const data = await response.json();

        if (response.ok && data.items && data.items.length > 0) {
            return data.items[0].snippet.title;
        }
        return 'youtube_playlist';
    }

    // Helper: Generate and Download CSV
    async function downloadCSV(videoList) {
        console.log("Generating CSV...");

        // CSV Header
        let csvContent = "Title,Channel,Published,URL\n";

        videoList.forEach(video => {
            // Escape quotes in titles by doubling them, wrap title in quotes
            const safeTitle = `"${video.title.replace(/"/g, '""')}"`;
            const safeChannel = `"${video.channel.replace(/"/g, '""')}"`;
            const safeDate = `"${new Date(video.publishedAt).toLocaleDateString()}"`;
            csvContent += `${safeTitle},${safeChannel},${safeDate},${video.url}\n`;
        });

        const filename = `playlist_export_${new Date().toISOString().slice(0, 10)}.csv`;
        const fileType = 'text/csv;charset=utf-8;';

        // Try using navigator.share for iOS/Mobile support
        // We create a File object instead of just a Blob for sharing
        try {
            // Check if Web Share API is supported and can share files
            if (navigator.canShare && navigator.share) {
                const file = new File([csvContent], filename, { type: 'text/csv' });
                const shareData = {
                    files: [file],
                    title: 'YouTube Playlist Export',
                    text: 'Here is your exported YouTube playlist CSV.'
                };

                if (navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    console.log("Shared successfully via Web Share API");
                    return; // Exit if share was successful
                }
            }
        } catch (err) {
            console.warn("Web Share API failed or closed, falling back to legacy download:", err);
            // Fallthrough to legacy method
        }

        // Legacy Download Method (Desktop / Non-supported browsers)
        const blob = new Blob([csvContent], { type: fileType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log("Legacy CSV Download triggered.");
    }

    // Helper: Display Results Table
    function displayResults(videoList) {
        // Clear previous
        resultsTableBody.innerHTML = '';

        if (videoList.length === 0) {
            resultsContainer.classList.add('hidden');
            return;
        }

        // Populate
        videoList.forEach(video => {
            const row = document.createElement('tr');

            const titleCell = document.createElement('td');
            titleCell.textContent = video.title;

            const channelCell = document.createElement('td');
            channelCell.textContent = video.channel;

            const dateCell = document.createElement('td');
            dateCell.textContent = new Date(video.publishedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const linkCell = document.createElement('td');
            const link = document.createElement('a');
            link.href = video.url;
            link.textContent = "Watch"; // Or "Link" or SVG icon
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            linkCell.appendChild(link);

            const qrCell = document.createElement('td');
            qrCell.className = 'qr-cell';
            const qrDiv = document.createElement('div');
            qrDiv.className = 'qr-container-small';
            qrCell.appendChild(qrDiv);

            row.appendChild(titleCell);
            row.appendChild(channelCell);
            row.appendChild(dateCell);
            row.appendChild(linkCell);
            row.appendChild(qrCell);

            resultsTableBody.appendChild(row);

            // Generate small QR
            new QRCode(qrDiv, {
                text: video.url,
                width: 120,
                height: 120,
                colorDark: "#ffffff",
                colorLight: "rgba(0,0,0,0)",
                correctLevel: QRCode.CorrectLevel.M // Medium correction for slightly faster scanning
            });
        });

        // Show container
        resultsContainer.classList.remove('hidden');
    }

    // UI Helpers
    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = `status-box ${type}`; // Removes 'hidden'
    }

    function setLoading(isLoading) {
        if (isLoading) {
            extractBtn.disabled = true;
            extractBtn.textContent = "Extracting...";
            showStatus("Fetching data from YouTube... This might take a moment.", "loading");
            // Hide previous results while loading new ones
            resultsContainer.classList.add('hidden');
            extractedVideos = []; // Clear previous data
        } else {
            extractBtn.disabled = false;
            extractBtn.textContent = "Extract Videos"; // Changed text to reflect action
        }
    }

    // Modal Logic
    bigQRBtn.addEventListener('click', () => {
        generateBigQRCode();
        bigQRModal.classList.remove('hidden');
    });

    closeModal.addEventListener('click', () => {
        bigQRModal.classList.add('hidden');
    });

    window.addEventListener('click', (event) => {
        if (event.target === bigQRModal) {
            bigQRModal.classList.add('hidden');
        }
    });

    function generateBigQRCode() {
        bigQRContainer.innerHTML = ''; // Clear previous

        const playlistUrl = playlistInput.value.trim();

        if (!playlistUrl) {
            bigQRContainer.innerHTML = '<p class="error-text">No Playlist URL found.</p>';
            return;
        }

        try {
            new QRCode(bigQRContainer, {
                text: playlistUrl,
                width: 400,
                height: 400,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H // High correction for maximum scannability
            });
        } catch (e) {
            console.error("Big QR Generation Error:", e);
            bigQRContainer.innerHTML = '<p class="error-text">Failed to generate QR code.</p>';
        }
    }

    downloadBigQRBtn.addEventListener('click', () => {
        // Try finding the image first (QRCode.js generates an <img>)
        const qrImage = bigQRContainer.querySelector('img');
        if (qrImage && qrImage.src) {
            const link = document.createElement('a');
            link.download = 'youtube_playlist_qr.png';
            link.href = qrImage.src;
            link.click();
        } else {
            // Fallback for canvas if <img> isn't ready or used
            const qrCanvas = bigQRContainer.querySelector('canvas');
            if (qrCanvas) {
                const link = document.createElement('a');
                link.download = 'youtube_playlist_qr.png';
                link.href = qrCanvas.toDataURL('image/png');
                link.click();
            }
        }
    });

    // Helper: Sanitize Filename (Strict)
    function sanitizeFilename(name, maxLength = 50) {
        if (!name) return 'file';
        // Remove emojis and special symbols
        let sanitized = name.replace(/\p{Extended_Pictographic}/ug, '');
        // Remove illegal characters for files
        sanitized = sanitized.replace(/[/\\?%*:|"<>]/g, '-');
        // Replace multiple spaces/dashes with single ones
        sanitized = sanitized.replace(/[\s-]+/g, ' ').trim();
        return sanitized.substring(0, maxLength);
    }

    async function exportAllQRs() {
        const zip = new JSZip();
        // Remove emojis and other non-standard characters from playlist title for safer filenames
        const safePlaylistTitle = sanitizeFilename(playlistTitle, 100) || 'youtube_playlist';
        const folderName = `${safePlaylistTitle}_qr_codes`;
        const qrFolder = zip.folder(folderName);

        showStatus(`Generating QR ZIP... Progress: 0/${extractedVideos.length}`, "loading");
        exportAllQRsBtn.disabled = true;

        // Hidden container for temporary QR generation
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        document.body.appendChild(tempContainer);

        // Include the Playlist (Big) QR Code as JPG
        const playlistUrl = playlistInput.value.trim();
        if (playlistUrl) {
            const bigQrDiv = document.createElement('div');
            tempContainer.appendChild(bigQrDiv);

            new QRCode(bigQrDiv, {
                text: playlistUrl,
                width: 1000,
                height: 1000,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            // Wait for render
            await new Promise(r => setTimeout(r, 200));

            const bigQrImg = bigQrDiv.querySelector('img');
            const bigQrCanvas = bigQrDiv.querySelector('canvas');
            const bigSource = (bigQrImg && bigQrImg.src) ? bigQrImg : bigQrCanvas;

            // Final Canvas for Big QR (Adding Title Label)
            const finalBigCanvas = document.createElement('canvas');
            const fbcCtx = finalBigCanvas.getContext('2d');
            const bigMargin = 60;
            const bigTextHeight = 120;
            finalBigCanvas.width = 1000 + (bigMargin * 2);
            finalBigCanvas.height = 1000 + bigTextHeight + (bigMargin * 2);

            fbcCtx.fillStyle = "#ffffff";
            fbcCtx.fillRect(0, 0, finalBigCanvas.width, finalBigCanvas.height);

            fbcCtx.fillStyle = "#000000";
            fbcCtx.textAlign = "center";
            fbcCtx.font = "bold 48px Segoe UI, Arial";
            fbcCtx.fillText(playlistTitle, finalBigCanvas.width / 2, bigMargin + 60);

            fbcCtx.drawImage(bigSource, bigMargin, bigMargin + bigTextHeight, 1000, 1000);

            // Export as JPG (quality 0.9)
            const bigBlob = await new Promise(resolve => finalBigCanvas.toBlob(resolve, 'image/jpeg', 0.9));
            if (bigBlob) {
                qrFolder.file("00_PLAYLIST_QR_CODE.jpg", bigBlob);
            }
            tempContainer.removeChild(bigQrDiv);
        }

        for (let i = 0; i < extractedVideos.length; i++) {
            const video = extractedVideos[i];

            // Generate QR in temp container
            const qrDiv = document.createElement('div');
            tempContainer.appendChild(qrDiv);

            new QRCode(qrDiv, {
                text: video.url,
                width: 400,
                height: 400,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });

            // Wait a tiny bit for QRCode.js to render
            await new Promise(r => setTimeout(r, 100));

            const qrImg = qrDiv.querySelector('img');
            const qrCanvas = qrDiv.querySelector('canvas');
            const source = (qrImg && qrImg.src) ? qrImg : qrCanvas;

            // Create canvas with metadata
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Dimensions for the final image (QR + Text above)
            const margin = 40;
            const textHeight = 100;
            canvas.width = 400 + (margin * 2);
            canvas.height = 400 + textHeight + (margin * 2);

            // Background
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Metadata (Song & Artist/Channel)
            ctx.fillStyle = "#000000";
            ctx.textAlign = "center";

            // Title
            ctx.font = "bold 20px Segoe UI, Arial";
            const titleText = sanitizeFilename(video.title, 35);
            ctx.fillText(titleText, canvas.width / 2, margin + 40);

            // Channel/Artist
            ctx.font = "16px Segoe UI, Arial";
            const channelText = sanitizeFilename(video.channel, 40);
            ctx.fillText(channelText, canvas.width / 2, margin + 70);

            // Draw QR Code
            ctx.drawImage(source, margin, margin + textHeight);

            // Convert to blob and add to zip
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (blob) {
                const safeTitle = sanitizeFilename(video.title, 50);
                const filename = `${i + 1}_${safeTitle}.png`;
                qrFolder.file(filename, blob);
            }

            tempContainer.removeChild(qrDiv);
            showStatus(`Generating QR ZIP... Progress: ${i + 1}/${extractedVideos.length}`, "loading");
        }

        document.body.removeChild(tempContainer);

        // Add CSV metadata to the ZIP
        let csvContent = "Title,Channel,Published,URL\n";
        extractedVideos.forEach(video => {
            const safeTitle = `"${video.title.replace(/"/g, '""')}"`;
            const safeChannel = `"${video.channel.replace(/"/g, '""')}"`;
            const safeDate = `"${new Date(video.publishedAt).toLocaleDateString()}"`;
            csvContent += `${safeTitle},${safeChannel},${safeDate},${video.url}\n`;
        });
        zip.file("playlist_metadata_complete.csv", csvContent);

        try {
            // macOS Archive Utility is picky. Using DEFLATE compression often helps.
            const content = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
            });

            // Re-calculate sanitized title for the zip filename itself
            const safeZipTitle = sanitizeFilename(playlistTitle, 100) || 'youtube_playlist';
            const zipFilename = `${safeZipTitle}_qrs.zip`;

            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = zipFilename;
            link.click();
            showStatus(`Success! Exported ${extractedVideos.length} QR codes in a ZIP.`, "success");
        } catch (err) {
            console.error("ZIP Generation Error:", err);
            showStatus("Failed to generate ZIP file.", "error");
        } finally {
            exportAllQRsBtn.disabled = false;
        }
    }

    // UI Helpers
    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = `status-box ${type}`; // Removes 'hidden'
    }

    function setLoading(isLoading) {
        if (isLoading) {
            extractBtn.disabled = true;
            extractBtn.textContent = "Extracting...";
            showStatus("Fetching data from YouTube... This might take a moment.", "loading");
            // Hide previous results while loading new ones
            resultsContainer.classList.add('hidden');
            extractedVideos = []; // Clear previous data
        } else {
            extractBtn.disabled = false;
            extractBtn.textContent = "Extract Videos"; // Changed text to reflect action
        }
    }
});