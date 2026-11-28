(() => {
    const button = document.getElementById('hx-copy-email');
    const label = document.getElementById('hx-copy-email-label');
    const email = document.getElementById('hx-contact-email');
    const status = document.getElementById('hx-contact-status');
    if (!button || !label || !email || !status) return;

    let resetTimer;

    button.addEventListener('click', async () => {
        clearTimeout(resetTimer);
        status.textContent = '';
        status.classList.add('hx-visually-hidden');

        try {
            await navigator.clipboard.writeText(email.textContent.trim());
            label.textContent = 'Copied!';
            status.textContent = 'Email address copied to clipboard.';
            resetTimer = setTimeout(() => {
                label.textContent = 'Copy email';
                status.textContent = '';
            }, 2500);
        } catch {
            label.textContent = 'Copy email';
            status.classList.remove('hx-visually-hidden');
            status.textContent = 'Couldn’t copy automatically. Select the email address above to copy it, or choose Send email.';
        }
    });
})();
