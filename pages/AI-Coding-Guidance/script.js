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

function applyParentPath(value) {
    let path = value.trim();
    if (path && !path.endsWith('/')) {
        path += '/';
    }
    document.querySelectorAll('[data-parent-path]').forEach((element) => {
        element.textContent = path;
    });
}

function applyFeatureName(value) {
    let name = value.trim();
    if (name && !name.endsWith('/')) {
        name += '/';
    }
    document.querySelectorAll('[data-feature-name]').forEach((element) => {
        element.textContent = name;
    });
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
            if (child.classList.contains('hidden') || child.closest('.hidden')) {
                return;
            }
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

    const parentPathInput = document.getElementById('parent-path-input');
    if (parentPathInput) {
        const savedParentPath = localStorage.getItem('setting-parent-path');
        if (savedParentPath !== null) {
            parentPathInput.value = savedParentPath;
        }
        parentPathInput.addEventListener('input', (e) => {
            applyParentPath(e.target.value);
            localStorage.setItem('setting-parent-path', e.target.value);
        });
        applyParentPath(parentPathInput.value);
    }

    const featureNameInput = document.getElementById('feature-name-input');
    if (featureNameInput) {
        const savedFeatureName = localStorage.getItem('setting-feature-name');
        if (savedFeatureName !== null) {
            featureNameInput.value = savedFeatureName;
        }
        featureNameInput.addEventListener('input', (e) => {
            applyFeatureName(e.target.value);
            localStorage.setItem('setting-feature-name', e.target.value);
        });
        applyFeatureName(featureNameInput.value);
    }

    // File visibility toggles
    const fileToggles = document.querySelectorAll('.file-toggle-item input[type="checkbox"]');

    function formatList(items) {
        if (items.length === 0) return '';
        if (items.length === 1) return items[0];
        if (items.length === 2) return `${items[0]} and ${items[1]}`;
        return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
    }

    function updateDynamicUpdateList() {
        const listEl = document.getElementById('dynamic-update-list');
        if (!listEl) return;

        const items = [];
        if (document.getElementById('toggle-technical')?.checked) {
            items.push('technical plan');
        }
        if (document.getElementById('toggle-risk')?.checked) {
            items.push('risk review');
        }
        if (document.getElementById('toggle-test')?.checked) {
            items.push('test plan');
        }
        if (document.getElementById('toggle-release')?.checked) {
            items.push('release checklist');
        }

        if (items.length > 0) {
            listEl.textContent = `Then update the ${formatList(items)} based on my answers.`;
            listEl.classList.remove('hidden');
        } else {
            listEl.textContent = '';
            listEl.classList.add('hidden');
        }
    }

    function updateFileVisibility(fileKey, isChecked) {
        const targetElements = document.querySelectorAll(`[data-file-toggle="${fileKey}"]`);
        targetElements.forEach((el) => {
            if (isChecked) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
        updateDynamicUpdateList();
    }

    fileToggles.forEach((checkbox) => {
        const fileKey = checkbox.dataset.file;
        const savedState = localStorage.getItem(`toggle-file-${fileKey}`);
        
        if (savedState !== null) {
            checkbox.checked = savedState === 'true';
        }
        
        updateFileVisibility(fileKey, checkbox.checked);

        checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            updateFileVisibility(fileKey, isChecked);
            localStorage.setItem(`toggle-file-${fileKey}`, isChecked);
        });
    });

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

    // Junior Developer Explainer Drawer
    const juniorTrigger = document.getElementById('junior-dev-trigger');
    const juniorClose = document.getElementById('junior-dev-close');
    const juniorDrawer = document.getElementById('junior-dev-drawer');

    if (juniorTrigger && juniorDrawer) {
        juniorTrigger.addEventListener('click', () => {
            juniorDrawer.classList.toggle('open');
        });
    }

    if (juniorClose && juniorDrawer) {
        juniorClose.addEventListener('click', () => {
            juniorDrawer.classList.remove('open');
        });
    }

    // Close drawer when clicking outside of it
    document.addEventListener('click', (e) => {
        if (juniorDrawer && juniorDrawer.classList.contains('open')) {
            if (!juniorDrawer.contains(e.target) && e.target !== juniorTrigger && !juniorTrigger.contains(e.target)) {
                juniorDrawer.classList.remove('open');
            }
        }
    });

    // Core Rule Section Collapsible Toggle
    const coreRuleToggle = document.getElementById('core-rule-toggle');
    const coreRuleContent = document.getElementById('core-rule-content');

    if (coreRuleToggle && coreRuleContent) {
        coreRuleToggle.addEventListener('click', () => {
            const isHidden = coreRuleContent.classList.toggle('hidden');
            coreRuleToggle.textContent = isHidden ? 'Show Details' : 'Hide Details';
        });
    }

    // Initialize particle background if element and function exist
    const particleCanvas = document.getElementById('particle-canvas');
    if (particleCanvas && typeof initParticleBackground === 'function') {
        initParticleBackground(particleCanvas, { hue: 280 }); // Match the violet theme
    }
});
