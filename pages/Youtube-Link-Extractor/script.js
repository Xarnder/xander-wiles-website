document.addEventListener('DOMContentLoaded', () => {
    const extractBtn = document.getElementById('extractBtn');
    const statusDiv = document.getElementById('statusMessage');
    const playlistInput = document.getElementById('playlistUrl');

    // TODO: Replace with your actual API Key and restrict it in Google Cloud Console
    const API_KEY = 'AIzaSyAlNLhMAydCmqYjS2hAgh_uXYPeJqPaQnk';

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
            showStatus("Invalid YouTube Playlist URL.", "error");
            console.error("Validation Error: Could not parse Playlist ID from", playlistUrl);
            return;
        }

        // Start Process
        setLoading(true);
        console.log(`Starting fetch for Playlist ID: ${playlistId}`);

        try {
            const videos = await fetchAllPlaylistVideos(playlistId, apiKey);

            if (videos.length === 0) {
                showStatus("No videos found or playlist is private.", "error");
                console.warn("API returned 0 videos.");
            } else {
                console.log(`Successfully fetched ${videos.length} videos.`);
                generateAndDownloadCSV(videos);
                showStatus(`Success! Exported ${videos.length} videos.`, "success");
            }

        } catch (error) {
            console.error("Critical Error during execution:", error);
            showStatus(`Error: ${error.message}`, "error");
        } finally {
            setLoading(false);
        }
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
                // Exclude "Private video" or "Deleted video" entries usually lacking IDs
                if (videoId) {
                    videos.push({
                        title: title,
                        url: `https://www.youtube.com/watch?v=${videoId}`
                    });
                }
            });

            nextPageToken = data.nextPageToken || '';

        } while (nextPageToken);

        return videos;
    }

    // Helper: Generate CSV
    function generateAndDownloadCSV(videoList) {
        console.log("Generating CSV...");

        // CSV Header
        let csvContent = "Title,URL\n";

        videoList.forEach(video => {
            // Escape quotes in titles by doubling them, wrap title in quotes
            const safeTitle = `"${video.title.replace(/"/g, '""')}"`;
            csvContent += `${safeTitle},${video.url}\n`;
        });

        // Create Blob
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // Create download link
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `playlist_export_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log("CSV Download triggered.");
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
        } else {
            extractBtn.disabled = false;
            extractBtn.textContent = "Extract & Download CSV";
        }
    }
});