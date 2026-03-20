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
        
        // Simple CSV parser (assuming first row is header)
        const rows = text.split('\n').filter(row => row.trim() !== '');
        const headers = rows[0].split(',').map(h => h.trim());
        
        allSongs = rows.slice(1).map(row => {
            // Handle quoted fields if necessary (basic implementation)
            const values = parseCSVRow(row);
            const song = {};
            headers.forEach((h, i) => {
                song[h.toLowerCase()] = values[i] ? values[i].trim() : '';
            });
            return song;
        });

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

    filtered.forEach(song => {
        const card = document.createElement('div');
        card.className = 'song-card glass-card';
        
        // Extract video ID for thumbnail if possible (optional)
        // const videoId = song.url.split('v=')[1]?.split('&')[0];
        
        card.innerHTML = `
            <div class="card-icon">🎵</div>
            <h3 class="song-title">${song.title || 'Unknown Title'}</h3>
            <p class="song-artist">${song.channel || 'Unknown Channel'}</p>
            <p class="song-artist" style="font-size: 0.8rem; margin-top: -10px;">Published: ${song.published || 'N/A'}</p>
            <a href="${song.url}" target="_blank" class="play-link">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Listen on YouTube
            </a>
        `;
        songGrid.appendChild(card);
    });
}

// 4. Sidebar Logic
function populateSidebar(playlists, currentId) {
    const sidebarNav = document.getElementById('sidebar-nav');
    if (!sidebarNav) return;

    sidebarNav.innerHTML = '';
    playlists.forEach(p => {
        const item = document.createElement('a');
        item.href = `?id=${p.id}`;
        item.className = `sidebar-item ${p.id === currentId ? 'active' : ''}`;
        item.innerHTML = `
            <span class="sidebar-icon">${p.icon || '🎵'}</span>
            <span class="sidebar-name">${p.title}</span>
        `;
        sidebarNav.appendChild(item);
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
