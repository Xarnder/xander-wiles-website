function formatFeatureDateSlug(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${year}/${month}-${day}`;
}

function applyFeatureDatePaths() {
    const slug = formatFeatureDateSlug();
    document.querySelectorAll('[data-feature-date]').forEach((element) => {
        element.textContent = slug;
    });
    return slug;
}

function fieldValue(field) {
    const value = field.value.trim();
    if (value) return value;
    return field.dataset.default || '';
}

function getPromptText(root) {
    let text = '';

    root.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            if (child.matches('.prompt-field')) {
                text += fieldValue(child);
            } else if (child.tagName === 'BR') {
                text += '\n';
            } else {
                text += getPromptText(child);
            }
        }
    });

    return text;
}

document.addEventListener('DOMContentLoaded', () => {
    applyFeatureDatePaths();

    const copyButtons = document.querySelectorAll('.copy-btn');

    copyButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            const block = button.closest('.prompt-block');
            if (!block) return;

            const editableBody = block.querySelector('.prompt-body');
            const staticBody = block.querySelector('pre');
            const promptText = editableBody
                ? getPromptText(editableBody)
                : staticBody
                    ? getPromptText(staticBody)
                    : '';

            try {
                await navigator.clipboard.writeText(promptText);
                button.classList.add('copied');
                const label = button.querySelector('.copy-label');
                const original = label?.textContent;
                if (label) label.textContent = 'Copied';

                setTimeout(() => {
                    button.classList.remove('copied');
                    if (label && original) label.textContent = original;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy prompt:', err);
            }
        });
    });

    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const sections = document.querySelectorAll('.page-shell section[id]');

    const observer = new IntersectionObserver((entries) => {
        let activeId = null;

        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                activeId = entry.target.id;
            }
        });

        if (activeId) {
            navLinks.forEach((link) => {
                link.classList.toggle('active', link.getAttribute('href') === `#${activeId}`);
            });
        }
    }, {
        root: null,
        threshold: 0.25,
        rootMargin: '-10% 0px -55% 0px'
    });

    sections.forEach((section) => observer.observe(section));

    navLinks.forEach((link) => {
        link.addEventListener('click', () => {
            navLinks.forEach((navLink) => navLink.classList.remove('active'));
            link.classList.add('active');
        });
    });
});
