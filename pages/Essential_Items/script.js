// Global helper for image fallbacks
function createImageFallback(imageElement, isListThumb = false) {
    const altText = imageElement.alt;
    
    // prevent infinite loop if fallback generation fails
    imageElement.onerror = null;

    if (isListThumb) {
        const fallback = document.createElement('div');
        fallback.className = 'list-item-thumb';
        fallback.style.display = 'flex';
        fallback.style.alignItems = 'center';
        fallback.style.justifyContent = 'center';
        fallback.style.backgroundColor = 'rgba(125,125,125,0.2)';
        fallback.style.color = 'var(--text-secondary)';
        fallback.textContent = '?'; 
        if (imageElement.parentElement) {
            imageElement.parentElement.replaceChild(fallback, imageElement);
        }
        return;
    }

    // Carousel Fallback
    console.log(`Debug: Image source failed for "${altText}". Displaying fallback text.`);
    const fallback = document.createElement('div');
    fallback.className = 'carousel-item-image'; 
    fallback.style.display = 'flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.backgroundColor = 'rgba(0,0,0,0.1)';
    fallback.style.border = '1px dashed var(--text-secondary)';
    fallback.style.color = 'var(--text-secondary)';
    fallback.style.height = '200px'; 
    fallback.style.width = '100%';
    fallback.innerHTML = `<p>Image not found for<br><strong>${altText}</strong></p>`;
    
    if (imageElement.parentElement) {
        imageElement.parentElement.replaceChild(fallback, imageElement);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("Debug: DOM fully loaded. Initializing App...");

    // Element references
    const checklistContainer = document.getElementById('checklist-container');
    const categoryFilter = document.getElementById('filter-category');
    const statusFilter = document.getElementById('filter-status'); 
    const sortOrder = document.getElementById('sort-order');
    const imageToggle = document.getElementById('toggle-has-image'); 
    const themeBtn = document.getElementById('theme-toggle'); 
    const clearAllButton = document.getElementById('clear-all-button');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    const scaleSlider = document.getElementById('scale-slider');
    const carouselView = document.getElementById('carousel-view');
    const prevButton = document.getElementById('prev-item');
    const nextButton = document.getElementById('next-item');
    
    // Loading Screen Elements
    const loadingOverlay = document.getElementById('app-loading-overlay');
    const loadingBar = document.getElementById('loading-progress-bar');
    const loadingText = document.getElementById('loading-status-text');

    let allItems = []; 
    let itemsToRender = []; 
    let checkedItems = new Set();
    let currentIndex = 0; 
    
    // Cache for preloaded images to prevent garbage collection
    const preloadCache = new Map();

    // --- Loading Screen Logic ---
    function updateLoadingStatus(message, percent) {
        if(loadingText) loadingText.textContent = message;
        if(loadingBar) loadingBar.style.width = `${percent}%`;
    }

    function hideLoadingScreen() {
        console.log("Debug: Hiding loading screen.");
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
    }

    // --- Theme Management ---
    function toggleTheme() {
        const body = document.body;
        const isLight = body.getAttribute('data-theme') === 'light';
        const newTheme = isLight ? 'dark' : 'light';
        body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    function loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
    }

    // --- Data Fetching ---
    async function loadChecklistData() {
        try {
            updateLoadingStatus("Fetching Item List...", 10);
            const response = await fetch('Item_List.csv');
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const csvText = await response.text();
            updateLoadingStatus("Parsing Data...", 20);
            
            allItems = parseCSV(csvText);
            loadState(); 
            populateCategories(allItems);
            
            await verifyImages(allItems);

            console.log("Debug: All operations complete. Rendering.");
            updateAndRenderAll();
            hideLoadingScreen();

        } catch (error) {
            console.error("Debug: Error loading data:", error);
            updateLoadingStatus("Error loading data. Check console.", 0);
            carouselView.innerHTML = `<div class="carousel-placeholder"><p>Error: Could not load data. check console.</p></div>`;
        }
    }

    function parseCSV(text) {
        return text.split('\n').slice(1).map((row, index) => {
            const columns = row.split(',');
            if (columns.length >= 3 && columns[1]) {
                const itemName = columns[1].trim();
                const itemID = `item-${itemName.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`;
                
                return { 
                    id: itemID, 
                    name: itemName, 
                    category: columns[2].trim(),
                    imageVerified: false 
                };
            }
            return null;
        }).filter(item => item !== null);
    }

    // --- Image Verification & Progress ---
    async function verifyImages(items) {
        const totalItems = items.length;
        let processedCount = 0;
        
        updateLoadingStatus("Checking Assets...", 25);

        const checkPromises = items.map(item => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = `assets/objects_webp/${item.name}.webp`;
                
                img.onload = () => {
                    item.imageVerified = true;
                    processedCount++;
                    updateProgressUI(processedCount, totalItems);
                    resolve();
                };
                
                img.onerror = () => {
                    item.imageVerified = false;
                    processedCount++;
                    updateProgressUI(processedCount, totalItems);
                    resolve(); 
                };
            });
        });

        await Promise.all(checkPromises);
    }

    function updateProgressUI(current, total) {
        const percentage = Math.round((current / total) * 100);
        const visualPercent = 25 + (percentage * 0.75);
        requestAnimationFrame(() => {
            updateLoadingStatus(`Loading Images... ${percentage}%`, visualPercent);
        });
    }

    // --- Preloading Logic (Fixes Lag) ---
    function preloadNeighbors() {
        if (itemsToRender.length === 0) return;

        // Calculate indices (wrapping around)
        const nextIndex = (currentIndex + 1) % itemsToRender.length;
        const prevIndex = (currentIndex - 1 + itemsToRender.length) % itemsToRender.length;
        
        const indicesToPreload = [nextIndex, prevIndex];

        indicesToPreload.forEach(idx => {
            const item = itemsToRender[idx];
            if (item && item.imageVerified && !preloadCache.has(item.id)) {
                // console.log(`Debug: Preloading image for ${item.name}`);
                const img = new Image();
                img.src = `assets/objects_webp/${item.name}.webp`;
                preloadCache.set(item.id, img);
            }
        });

        // Optional: Clear old items from cache to save memory if cache gets too big
        if (preloadCache.size > 10) {
            const iterator = preloadCache.keys();
            preloadCache.delete(iterator.next().value); // Remove oldest
        }
    }

    // --- Core Rendering Logic ---
    function updateAndRenderAll() {
        updateItemsToRender();
        renderListView();
        renderCarouselView();
        updateProgress();
    }

    function updateItemsToRender() {
        const category = categoryFilter.value;
        const sort = sortOrder.value;
        const status = statusFilter.value;
        const onlyImages = imageToggle.checked;

        let tempItems = category === 'all' 
            ? [...allItems] 
            : allItems.filter(item => item.category === category);

        if (status === 'checked') {
            tempItems = tempItems.filter(item => checkedItems.has(item.id));
        } else if (status === 'unchecked') {
            tempItems = tempItems.filter(item => !checkedItems.has(item.id));
        }

        if (onlyImages) {
            tempItems = tempItems.filter(item => item.imageVerified === true);
        }

        if (sort === 'alphabetical') {
            tempItems.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            tempItems.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        }

        itemsToRender = tempItems;

        if (currentIndex >= itemsToRender.length) {
            currentIndex = 0;
        }
    }

    function renderListView() {
        checklistContainer.innerHTML = '';
        if (itemsToRender.length === 0) {
            checklistContainer.innerHTML = `<p style="text-align: center; padding: 1rem; color: var(--text-secondary);">No items match filters.</p>`;
            return;
        }
        
        const fragment = document.createDocumentFragment();
        itemsToRender.forEach((item, index) => {
            const itemElement = createListItemElement(item, index);
            fragment.appendChild(itemElement);
        });
        checklistContainer.appendChild(fragment);
        updateListHighlight();
    }

    function renderCarouselView() {
        if (itemsToRender.length === 0) {
            carouselView.innerHTML = `<div class="carousel-placeholder"><p>No items to display.</p></div>`;
            return;
        }

        const item = itemsToRender[currentIndex];
        const isChecked = checkedItems.has(item.id);
        const webpPath = `assets/objects_webp/${item.name}.webp`;

        carouselView.innerHTML = `
            <img src="${webpPath}" class="carousel-item-image" alt="${item.name}" 
                onerror="createImageFallback(this);">
            <h2 class="carousel-item-title">${item.name}</h2>
            <p class="carousel-item-category">${item.category}</p>
            <label class="carousel-item-checkbox-label">
                <input type="checkbox" class="carousel-item-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''}>
                <span>${isChecked ? 'Completed' : 'Mark as Complete'}</span>
            </label>
        `;

        carouselView.querySelector('.carousel-item-checkbox').addEventListener('change', () => {
            toggleItemCheck(item.id);
        });

        // --- TRIGGER PRELOAD ---
        preloadNeighbors();
        
        updateListHighlight();
    }

    function createListItemElement(item, index) {
        const div = document.createElement('div');
        div.className = 'checklist-item';
        div.dataset.id = item.id;
        div.dataset.index = index;

        const isChecked = checkedItems.has(item.id);
        if (isChecked) div.classList.add('checked');

        const webpPath = `assets/objects_webp/${item.name}.webp`;

        div.innerHTML = `
            <img src="${webpPath}" class="list-item-thumb" alt="${item.name}" loading="lazy"
                 onerror="createImageFallback(this, true);">
            <div class="item-details">
                <h3>${item.name}</h3>
                <p>${item.category}</p>
            </div>
            <input type="checkbox" class="checkbox" ${isChecked ? 'checked' : ''} data-id="${item.id}">
        `;

        div.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                currentIndex = index;
                renderCarouselView();
            }
        });
        
        div.querySelector('.checkbox').addEventListener('change', () => {
            toggleItemCheck(item.id);
        });

        return div;
    }

    function updateListHighlight() {
        const listItems = document.querySelectorAll('.checklist-item');
        const prevActive = document.querySelector('.checklist-item.active');
        if(prevActive) prevActive.classList.remove('active');

        if(itemsToRender[currentIndex]) {
            const currentId = itemsToRender[currentIndex].id;
            const currentEl = document.querySelector(`.checklist-item[data-id="${currentId}"]`);
            if(currentEl) {
                currentEl.classList.add('active');
                currentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    function toggleItemCheck(itemId) {
        if (checkedItems.has(itemId)) {
            checkedItems.delete(itemId);
        } else {
            checkedItems.add(itemId);
        }
        saveState();
        
        if (statusFilter.value !== 'all') {
            updateAndRenderAll();
        } else {
            const listItem = document.querySelector(`.checklist-item[data-id="${itemId}"]`);
            if(listItem) {
                listItem.classList.toggle('checked');
                const cb = listItem.querySelector('.checkbox');
                if(cb) cb.checked = checkedItems.has(itemId);
            }
            renderCarouselView();
            updateProgress();
        }
    }

    function updateProgress() {
        if (allItems.length === 0) return;
        const percentage = Math.round((checkedItems.size / allItems.length) * 100);
        progressBarFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}% Complete`;
    }

    function saveState() {
        localStorage.setItem('checkedItems', JSON.stringify(Array.from(checkedItems)));
    }
    function loadState() {
        const savedState = localStorage.getItem('checkedItems');
        if (savedState) checkedItems = new Set(JSON.parse(savedState));
    }
    function applyScale(scale) { document.documentElement.style.setProperty('--item-scale', scale); }
    function saveScale(scale) { localStorage.setItem('uiScale', scale); }
    function loadScale() {
        const savedScale = localStorage.getItem('uiScale') || '4';
        scaleSlider.value = savedScale;
        applyScale(savedScale);
    }
    
    prevButton.addEventListener('click', () => {
        if (itemsToRender.length === 0) return;
        currentIndex = (currentIndex - 1 + itemsToRender.length) % itemsToRender.length;
        renderCarouselView();
    });

    nextButton.addEventListener('click', () => {
        if (itemsToRender.length === 0) return;
        currentIndex = (currentIndex + 1) % itemsToRender.length;
        renderCarouselView();
    });

    categoryFilter.addEventListener('change', () => { currentIndex = 0; updateAndRenderAll(); });
    statusFilter.addEventListener('change', () => { currentIndex = 0; updateAndRenderAll(); });
    imageToggle.addEventListener('change', () => { currentIndex = 0; updateAndRenderAll(); });
    sortOrder.addEventListener('change', updateAndRenderAll);
    scaleSlider.addEventListener('input', () => applyScale(scaleSlider.value));
    scaleSlider.addEventListener('change', () => saveScale(scaleSlider.value));
    themeBtn.addEventListener('click', toggleTheme);

    clearAllButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all selections?")) {
            checkedItems.clear();
            saveState();
            updateAndRenderAll();
        }
    });

    function populateCategories(items) {
        const categories = [...new Set(items.map(item => item.category))].sort();
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    }

    loadTheme();
    loadScale();
    loadChecklistData();
});