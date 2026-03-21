/**
 * Music Playlist Viewer Logic
 */

const CONFIG_URL = '/assets/Music_CSV/playlists.json';

// DOM Elements
const songGrid = document.getElementById('song-grid');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const playlistTitle = document.getElementById('playlist-title');
const playlistDescription = document.getElementById('playlist-description');
const playlistIcon = document.getElementById('playlist-icon');
const playFullBtn = document.getElementById('play-full-playlist');
const errorMessage = document.getElementById('error-message');

let currentPlaylist = null;
let allSongs = [];
let unavailableCount = 0;

// 1. Initialize
async function init() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const playlistId = urlParams.get('id');

        if (!playlistId) {
            showError();
            return;
        }

        // Fetch config
        const response = await fetch(CONFIG_URL);
        const playlists = await response.json();
        currentPlaylist = playlists.find(p => p.id === playlistId);

        if (!currentPlaylist) {
            showError();
            return;
        }

        // Populate sidebar
        populateSidebar(playlists, playlistId);
        setupSidebarToggle();

        // Apply theme
        document.documentElement.style.setProperty('--playlist-theme', currentPlaylist.theme);
        document.documentElement.style.setProperty('--playlist-accent', currentPlaylist.accent);
        document.documentElement.style.setProperty('--playlist-bg', currentPlaylist.background || '#0a0a0c');
        document.documentElement.style.setProperty('--playlist-text', currentPlaylist.text || '#e2e8f0');
        
        // Update header
        playlistTitle.textContent = currentPlaylist.title;
        playlistDescription.textContent = currentPlaylist.description;
        playlistIcon.textContent = currentPlaylist.icon || '🎵';
        document.title = `${currentPlaylist.title} | Xander Wiles`;

        // Load CSV
        await loadCSV(currentPlaylist.csvPath);

    } catch (error) {
        console.error("Initialization error:", error);
        showError();
    }
}

// 2. Load and Parse CSV
async function loadCSV(path) {
    try {
        const response = await fetch(path);
        const text = await response.text();
        
        const rows = text.split('\n').filter(row => row.trim() !== '');
        
        // Extract Playlist Metadata (Lines 1 and 2)
        let extractedTitle = "";
        let masterLink = "";

        if (rows.length >= 2) {
            const titleRow = parseCSVRow(rows[0]);
            const urlRow = parseCSVRow(rows[1]);
            
            if (titleRow[0] === "Playlist Title") extractedTitle = titleRow[1];
            if (urlRow[0] === "Playlist URL") masterLink = urlRow[1];
        }

        // Update UI with extracted metadata
        if (extractedTitle) {
            const cleanTitle = stripEmojis(extractedTitle);
            playlistTitle.textContent = cleanTitle;
            document.title = `${cleanTitle} | Xander Wiles`;
        }

        if (masterLink && playFullBtn) {
            playFullBtn.href = masterLink;
            playFullBtn.style.display = 'flex';
        } else if (playFullBtn) {
            playFullBtn.style.display = 'none';
        }

        // Identify Headers (Line 4, index 3)
        // Note: index 2 is usually empty based on the CSV format
        const headerRowIndex = rows.findIndex(row => row.startsWith('Title,Channel'));
        if (headerRowIndex === -1) {
            throw new Error("Could not find CSV header row");
        }

        const headers = parseCSVRow(rows[headerRowIndex]).map(h => h.trim());
        
        const rawSongs = rows.slice(headerRowIndex + 1).map(row => {
            const values = parseCSVRow(row);
            const song = {};
            headers.forEach((h, i) => {
                song[h.toLowerCase()] = values[i] ? values[i].trim() : '';
            });
            return song;
        }).filter(song => song.title && song.title !== ""); // Filter out empty rows if any

        // Filter out Deleted and Private videos
        const availableSongs = rawSongs.filter(song => {
            const lowTitle = song.title.toLowerCase();
            return !lowTitle.includes('deleted video') && !lowTitle.includes('private video');
        });
        
        unavailableCount = rawSongs.length - availableSongs.length;
        allSongs = availableSongs;

        // Update song count in header
        if (playlistDescription) {
            const countText = `${allSongs.length} ${allSongs.length === 1 ? 'song' : 'songs'}`;
            const currentDesc = currentPlaylist.description || "";
            playlistDescription.textContent = currentDesc ? `${currentDesc} • ${countText}` : countText;
        }

        renderSongs();
    } catch (error) {
        console.error("Error loading CSV:", error);
        showError();
    }
}

// Helper to handle commas inside quotes
function parseCSVRow(row) {
    const result = [];
    let start = 0;
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
        if (row[i] === '"') {
            inQuotes = !inQuotes;
        } else if (row[i] === ',' && !inQuotes) {
            let val = row.substring(start, i).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1).replace(/""/g, '"');
            }
            result.push(val);
            start = i + 1;
        }
    }
    
    let val = row.substring(start).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1).replace(/""/g, '"');
    }
    result.push(val);
    
    return result;
}

// Helper to strip emojis from text
function stripEmojis(text) {
    // Unicode-aware regex for emojis
    return text.replace(/\p{Extended_Pictographic}/gu, '').trim();
}

// 3. Render
function renderSongs() {
    const filter = searchInput.value.toLowerCase();
    const sort = sortSelect.value;

    let filtered = allSongs.filter(song => {
        return (song.title && song.title.toLowerCase().includes(filter)) ||
               (song.channel && song.channel.toLowerCase().includes(filter));
    });

    // Sorting
    if (sort === 'title-asc') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sort === 'artist-asc') {
        filtered.sort((a, b) => (a.channel || '').localeCompare(b.channel || ''));
    } else if (sort === 'date-desc') {
        filtered.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
    }

    songGrid.innerHTML = '';
    
    if (filtered.length === 0) {
        songGrid.innerHTML = '<p class="no-results">No songs found matching your search.</p>';
        return;
    }

    // Add unavailable notice if applicable
    if (unavailableCount > 0 && !filter) {
        const notice = document.createElement('div');
        notice.className = 'unavailable-notice glass-card';
        notice.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.6;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            <span>${unavailableCount} video${unavailableCount === 1 ? ' is' : 's are'} currently unavailable (deleted or private)</span>
        `;
        songGrid.appendChild(notice);
    }

    filtered.forEach(song => {
        const card = document.createElement('a');
        card.className = 'song-card glass-card';
        card.href = song.url;
        card.target = '_blank';
        
        // Extract video ID for thumbnail
        let videoId = '';
        if (song.url) {
            if (song.url.includes('v=')) {
                videoId = song.url.split('v=')[1]?.split('&')[0];
            } else if (song.url.includes('youtu.be/')) {
                videoId = song.url.split('youtu.be/')[1]?.split('?')[0];
            }
        }
        
        const thumbnailHtml = videoId 
            ? `<div class="song-thumbnail">
                 <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="${song.title}" loading="lazy">
               </div>`
            : '';
        
        card.innerHTML = `
            ${thumbnailHtml}
            <div class="song-info">
                <h3 class="song-title">${song.title || 'Unknown Title'}</h3>
                <p class="song-artist">${song.channel || 'Unknown Channel'}</p>
                <p class="song-artist" style="font-size: 0.8rem; margin-top: -10px;">Published: ${song.published || 'N/A'}</p>
            </div>
        `;
        songGrid.appendChild(card);
    });
}

// 4. Sidebar Logic
async function populateSidebar(playlists, currentId) {
    const sidebarNav = document.getElementById('sidebar-nav');
    if (!sidebarNav) return;

    sidebarNav.innerHTML = '';
    
    // Create all items first with placeholders or JSON titles
    playlists.forEach(p => {
        const item = document.createElement('a');
        item.id = `sidebar-item-${p.id}`;
        item.href = `./?id=${p.id}`;
        item.className = `sidebar-item ${p.id === currentId ? 'active' : ''}`;
        item.innerHTML = `
            <span class="sidebar-icon">${p.icon || '🎵'}</span>
            <span class="sidebar-name">${p.title || 'Loading...'}</span>
        `;
        sidebarNav.appendChild(item);

        // Fetch real title from CSV asynchronously
        fetch(p.csvPath)
            .then(response => response.text())
            .then(text => {
                const firstLine = text.split('\n')[0];
                const titleRow = parseCSVRow(firstLine);
                if (titleRow[0] === "Playlist Title" && titleRow[1]) {
                    const nameSpan = item.querySelector('.sidebar-name');
                    if (nameSpan) nameSpan.textContent = stripEmojis(titleRow[1]);
                }
            })
            .catch(err => console.warn(`Could not load title for ${p.id}:`, err));
    });
}

function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggle-sidebar');
    const closeBtn = document.getElementById('close-sidebar');
    
    // Open by default on wide screens
    if (window.innerWidth > 1024) {
        document.body.classList.add('sidebar-open');
    }

    toggleBtn?.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-open');
    });

    closeBtn?.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
    });

    // Close on mobile when clicking a link
    if (window.innerWidth <= 1024) {
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                document.body.classList.remove('sidebar-open');
            });
        });
    }
}

function showError() {
    songGrid.style.display = 'none';
    errorMessage.style.display = 'block';
    playlistTitle.textContent = "Error";
    playlistDescription.textContent = "Playlist missing or broken.";
}

// 4. Events
searchInput.addEventListener('input', renderSongs);
sortSelect.addEventListener('change', renderSongs);

// Init
init();
