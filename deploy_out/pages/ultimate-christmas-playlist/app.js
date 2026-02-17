console.log("Ultimate Christmas Playlist: Initializing...");

const songGrid = document.getElementById('song-grid');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const downloadBtn = document.getElementById('downloadBtn');

// 1. Data Source (from songs.js)
const songs = window.playlistData || [];

if (songs.length === 0) {
    console.error("Error: Songs not found. Make sure songs.js is linked in index.html before app.js");
}

// 2. Helper to remove 'The' for better sorting
function stripThe(text) {
    if (!text) return "";
    return text.toLowerCase().replace(/^the\s+/, '');
}

// 3. Render Function with Sorting & Link Logic
function renderSongs() {
    try {
        const filterText = searchInput.value.toLowerCase();
        const sortMode = sortSelect.value;

        console.log(`Rendering songs. Filter: "${filterText}", Sort: "${sortMode}"`);
        songGrid.innerHTML = ''; 

        // Step A: Filter
        let displaySongs = songs.filter(song => 
            song.title.toLowerCase().includes(filterText) || 
            song.artist.toLowerCase().includes(filterText)
        );

        // Step B: Sort
        displaySongs.sort((a, b) => {
            if (sortMode === 'title-asc') {
                return stripThe(a.title).localeCompare(stripThe(b.title));
            } else if (sortMode === 'title-desc') {
                return stripThe(b.title).localeCompare(stripThe(a.title));
            } else if (sortMode === 'artist-asc') {
                return stripThe(a.artist).localeCompare(stripThe(b.artist));
            } else if (sortMode === 'artist-desc') {
                return stripThe(b.artist).localeCompare(stripThe(a.artist));
            }
            return 0;
        });

        // Step C: Display
        if (displaySongs.length === 0) {
            songGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #94a3b8; font-size: 1.2rem;">No festive tunes found matching that name!</p>';
            return;
        }

        displaySongs.forEach(song => {
            const card = document.createElement('div');
            card.className = 'song-card';

            // Link Logic
            let finalUrl = "";
            let linkText = "";

            if (song.url && song.url.trim() !== "") {
                finalUrl = song.url;
                linkText = "Play Song"; 
            } else {
                const searchQuery = encodeURIComponent(`${song.title} ${song.artist} audio`);
                finalUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
                linkText = "Search YouTube";
            }

            card.innerHTML = `
                <div>
                    <div class="card-icon">🎵</div>
                    <h3 class="song-title">${song.title}</h3>
                    <p class="song-artist">${song.artist}</p>
                </div>
                <a href="${finalUrl}" target="_blank" class="play-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    ${linkText}
                </a>
            `;
            songGrid.appendChild(card);
        });
    } catch (error) {
        console.error("Error rendering songs:", error);
    }
}

// 4. Download CSV Function
function downloadCSV() {
    console.log("Downloading CSV...");
    
    // Create CSV Header
    let csvContent = "Song Title,Artist,YouTube Link\n";

    // Loop through songs and add to CSV
    songs.forEach(song => {
        // Handle commas in titles by wrapping in quotes
        const title = `"${song.title.replace(/"/g, '""')}"`; 
        const artist = `"${song.artist.replace(/"/g, '""')}"`;
        
        let link = song.url;
        if (!link) {
            const searchQuery = encodeURIComponent(`${song.title} ${song.artist} audio`);
            link = `https://www.youtube.com/results?search_query=${searchQuery}`;
        }
        
        csvContent += `${title},${artist},${link}\n`;
    });

    // Create a Blob from the CSV string
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create a download link and click it
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Christmas_Playlist.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 5. Event Listeners
searchInput.addEventListener('input', renderSongs);
sortSelect.addEventListener('change', renderSongs);
if(downloadBtn) {
    downloadBtn.addEventListener('click', downloadCSV);
}

// 6. Initial Render
renderSongs();

// 7. Snow Effect
function createSnow() {
    try {
        const snowContainer = document.getElementById('snow-container');
        if(!snowContainer) return;

        const snowflake = document.createElement('div');
        snowflake.classList.add('snowflake');
        snowflake.innerHTML = '❄';
        
        snowflake.style.left = Math.random() * 100 + 'vw';
        snowflake.style.fontSize = (Math.random() * 10 + 10) + 'px';
        snowflake.style.animationDuration = (Math.random() * 3 + 2) + 's';
        snowflake.style.opacity = Math.random() * 0.7 + 0.3;

        snowContainer.appendChild(snowflake);

        setTimeout(() => {
            snowflake.remove();
        }, 5000);
    } catch (e) {
        console.warn("Snow error", e);
    }
}

setInterval(createSnow, 150);