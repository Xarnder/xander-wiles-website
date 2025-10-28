document.addEventListener('DOMContentLoaded', () => {

    // --- Feature 1: Code Block Copy Button ---
    const allCodeBlocks = document.querySelectorAll('.code-block-wrapper');

    allCodeBlocks.forEach(wrapper => {
        const code = wrapper.querySelector('pre'); // Target pre directly
        const copyButton = wrapper.querySelector('.copy-btn');
        
        if (code && copyButton) {
            copyButton.addEventListener('click', () => {
                const codeText = code.innerText;
                navigator.clipboard.writeText(codeText).then(() => {
                    // Provide user feedback
                    copyButton.classList.add('copied');
                    const originalIcon = copyButton.innerHTML;
                    copyButton.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022z"/></svg>
                    `;
                    
                    setTimeout(() => {
                        copyButton.classList.remove('copied');
                        copyButton.innerHTML = originalIcon;
                    }, 2000);

                }).catch(err => {
                    console.error("Failed to copy text: ", err);
                });
            });
        }
    });

    // --- Feature 2: Active Navigation Link on Scroll ---
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const sections = document.querySelectorAll('.content section');
    
    const observer = new IntersectionObserver((entries) => {
        let lastVisibleSectionId = null;

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                lastVisibleSectionId = entry.target.getAttribute('id');
            }
        });
        
        if (lastVisibleSectionId) {
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${lastVisibleSectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    }, {
        root: null, // relative to the viewport
        threshold: 0.3, // trigger when 30% of the section is visible
        rootMargin: '0px'
    });

    // Observe each section
    sections.forEach(section => {
        observer.observe(section);
    });

});