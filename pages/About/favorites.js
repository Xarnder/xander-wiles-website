/**
 * favorites.js
 * Dynamically loads and displays favorite things from a CSV file.
 */

document.addEventListener('DOMContentLoaded', () => {
    const favoritesGrid = document.getElementById('favorites-grid');
    const csvPath = '../../assets/csv/Favorite Things Categorized Table - Favorite Things Categorized Table.csv';

    // Fetch and process the CSV
    fetch(csvPath)
        .then(response => response.text())
        .then(csvText => {
            const data = parseCSV(csvText);
            const groupedData = groupByCategory(data);
            renderFavorites(groupedData, favoritesGrid);
        })
        .catch(error => {
            console.error('Error loading favorites CSV:', error);
            favoritesGrid.innerHTML = '<p style="grid-column: span 12; text-align: center; opacity: 0.6;">Unable to load favorites at this time.</p>';
        });
});

/**
 * Simple CSV parser that handles quoted values with commas
 */
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Matches comma-separated values, correctly handling quoted strings
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());

        if (values.length === headers.length) {
            const entry = {};
            headers.forEach((header, index) => {
                // Remove surrounding quotes if they exist
                let val = values[index];
                if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.substring(1, val.length - 1);
                }
                entry[header] = val;
            });
            results.push(entry);
        }
    }
    return results;
}

/**
 * Groups items by their category
 */
function groupByCategory(data) {
    return data.reduce((acc, item) => {
        const category = item.Category || 'Other';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(item.Item);
        return acc;
    }, {});
}

/**
 * Renders the grouped favorites into the DOM using a dual-column masonry approach
 */
function renderFavorites(groupedData, container) {
    const col1 = document.getElementById('fav-col-1');
    const col2 = document.getElementById('fav-col-2');
    
    if (!col1 || !col2) return;

    col1.innerHTML = ''; 
    col2.innerHTML = '';

    // 1. Manually add Education to Column 1
    const eduCard = createEducationCard();
    col1.appendChild(eduCard);

    // 2. Identify Food & Drink
    const categories = Object.keys(groupedData).sort();
    const foodDrinkKey = categories.find(c => c.toLowerCase().includes('food') && c.toLowerCase().includes('drink'));
    
    if (foodDrinkKey) {
        const foodDrinkCard = createCategoryCard(foodDrinkKey, groupedData[foodDrinkKey]);
        col2.appendChild(foodDrinkCard);
    }

    // 3. Distribute remaining categories
    let toggle = false;
    categories.forEach(category => {
        if (category === foodDrinkKey) return; // Already handled

        const card = createCategoryCard(category, groupedData[category]);
        
        // Simple alternating distribution
        if (toggle) {
            col1.appendChild(card);
        } else {
            col2.appendChild(card);
        }
        toggle = !toggle;
    });
}

/**
 * Creates the Education card HTML
 */
function createEducationCard() {
    const card = document.createElement('div');
    card.className = 'glass-panel dynamic-fav-card';
    card.innerHTML = `
        <div class="card-image-container">
            <img src="../../assets/images/About-Me-Images/Surrey%20University.webp" alt="Surrey University" loading="lazy">
        </div>
        <div class="card-content-wrapper">
            <h2>Education</h2>
            <p>My academic background bridges the gap between structured algorithms and boundless imagination.</p>
            <ul class="list-items">
                <li><strong>MSc Artificial Intelligence</strong> <span style="opacity: 0.6; margin-left: 8px;">(Current/Recent)</span></li>
                <li><strong>BA Computer Animation</strong> <span style="opacity: 0.6; margin-left: 8px;">(Graduated)</span></li>
            </ul>
        </div>
    `;
    return card;
}

/**
 * Creates a standard category card
 */
function createCategoryCard(category, items) {
    const card = document.createElement('div');
    card.className = 'glass-panel dynamic-fav-card';
    
    // Add Image Container
    const imgContainer = document.createElement('div');
    imgContainer.className = 'card-image-container';
    
    const imageUrl = getCategoryImage(category);
    
    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = category;
        img.loading = 'lazy';
        imgContainer.appendChild(img);
    } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'card-image-placeholder';
        placeholder.textContent = getCategoryIcon(category);
        imgContainer.appendChild(placeholder);
    }
    
    card.appendChild(imgContainer);

    // Content Wrapper
    const content = document.createElement('div');
    content.className = 'card-content-wrapper';

    const title = document.createElement('h2');
    title.textContent = category;
    content.appendChild(title);

    const tagsWrapper = document.createElement('div');
    tagsWrapper.className = 'tags-wrapper';

    items.forEach(item => {
        const tag = document.createElement('span');
        tag.className = 'tag-pill';
        tag.textContent = item;
        tagsWrapper.appendChild(tag);
    });

    content.appendChild(tagsWrapper);
    card.appendChild(content);
    return card;
}

/**
 * Returns a relevant emoji icon for the category
 */
function getCategoryIcon(category) {
    const cat = category.toLowerCase();
    if (cat.includes('food') || cat.includes('drink')) return '🍕';
    if (cat.includes('animal')) return '🐾';
    if (cat.includes('art') || cat.includes('design')) return '🎨';
    if (cat.includes('movie') || cat.includes('tv')) return '🎬';
    if (cat.includes('game')) return '🎮';
    if (cat.includes('tech') || cat.includes('platform')) return '💻';
    if (cat.includes('vehicle') || cat.includes('transport')) return '🚀';
    if (cat.includes('place') || cat.includes('hobby')) return '🌍';
    if (cat.includes('space') || cat.includes('astronomy')) return '🌌';
    if (cat.includes('cloth') || cat.includes('fashion')) return '👕';
    if (cat.includes('color') || cat.includes('misc')) return '🌈';
    if (cat.includes('creator') || cat.includes('influencer')) return '✨';
    return '⭐';
}

/**
 * Returns the path to a category image if it exists
 */
function getCategoryImage(category) {
    const basePath = '../../assets/images/About-Me-Images/';
    const mapping = {
        'Activities, Hobbies & Places': 'Rock Climbing.webp',
        'Animals': 'Panda.webp',
        'Art & Design': 'Great Wave.webp',
        'Colors & Miscellaneous': 'Paint.webp',
        'Clothing & Fashion': 'T Shirt.webp',
        'Movies & TV Shows': 'Movie.webp',
        'Space & Astronomy': 'Space.webp',
        'Technology & Platforms': 'MacBook.webp',
        'Vehicles & Transportation': 'Car.webp',
        'Food & Drink': 'Cookie.webp',
        'Video Games': 'Minecraft.webp',
        'Creators & Influencers': 'YouTube.webp'
    };

    return mapping[category] ? basePath + mapping[category] : null;
}
