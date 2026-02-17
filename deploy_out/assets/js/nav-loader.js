// --- UPDATED: assets/js/nav-loader.js ---

document.addEventListener("DOMContentLoaded", function() {
    // 1. Find the placeholder element
    const navPlaceholder = document.getElementById('main-nav-placeholder');

    if (navPlaceholder) {
        // 2. Fetch the navigation HTML from the root
        fetch('/nav.html')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                }
                return response.text();
            })
            .then(data => {
                // 3. Inject the HTML into the placeholder
                navPlaceholder.innerHTML = data;

                // 4. Highlight the active page's link
                const currentPage = window.location.pathname;
                const navLinks = navPlaceholder.querySelectorAll('.nav-links a');
                
                navLinks.forEach(link => {
                    const linkPath = link.getAttribute('href');
                    // Special case for the homepage link ("/") to avoid matching every page
                    if (linkPath === '/' && (currentPage === '/' || currentPage === '/index.html')) {
                        link.classList.add('active');
                    } else if (linkPath !== '/' && currentPage.startsWith(linkPath)) {
                        // For other links, check if the current page path starts with the link's path
                        link.classList.add('active');
                    }
                });

                // 5. ACTIVATE THE HAMBURGER MENU
                // This code is now guaranteed to run AFTER the nav HTML exists.
                const navToggle = navPlaceholder.querySelector('.nav-toggle');
                const mainNav = navPlaceholder.querySelector('.main-nav');

                if (navToggle && mainNav) {
                    navToggle.addEventListener('click', () => {
                        mainNav.classList.toggle('active');
                        document.body.classList.toggle('nav-open');
                        const isActive = mainNav.classList.contains('active');
                        navToggle.setAttribute('aria-expanded', isActive);
                    });
                }
            })
            .catch(error => {
                console.error('Error fetching or processing navigation:', error);
                navPlaceholder.innerHTML = '<p style="color:red;">Error loading navigation.</p>';
            });
    }
});