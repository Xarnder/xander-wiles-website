document.addEventListener('DOMContentLoaded', () => {
    
    // --- OS Toggle Logic ---
    const osButtons = document.querySelectorAll('.os-btn');
    const osContents = document.querySelectorAll('.os-content');

    osButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // 1. Update Buttons
            osButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 2. Show Correct Content
            const targetOS = btn.getAttribute('data-target'); // 'mac' or 'windows'
            
            osContents.forEach(content => {
                // If content ID contains the target (e.g. 'mac-install' contains 'mac')
                if (content.id.includes(targetOS)) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });

    // --- Copy Button Logic ---
    const copyBtns = document.querySelectorAll('.copy-btn');

    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const codeBlock = btn.parentElement.querySelector('code');
            
            if (codeBlock) {
                const textToCopy = codeBlock.textContent;
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    btn.classList.add('copied');

                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.classList.remove('copied');
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            }
        });
    });

    console.log("Guide Loaded. Default OS: macOS");
});