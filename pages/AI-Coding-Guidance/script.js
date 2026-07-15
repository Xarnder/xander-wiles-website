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

function detectPromptLineClass(line) {
    const trimmed = line.trim();
    if (!trimmed) return 'blank';
    if (/^\d+\.\s/.test(trimmed)) return 'numbered';
    if (/^-\s/.test(trimmed)) {
        return /^\s{2,}-/.test(line) ? 'bullet-nested' : 'bullet';
    }
    return 'text';
}

function createPromptLine(line, lineClass) {
    const element = document.createElement('span');
    element.className = lineClass === 'blank'
        ? 'prompt-line prompt-line--blank'
        : `prompt-line prompt-line--${lineClass}`;
    if (lineClass !== 'blank') {
        element.textContent = line.trim();
    }
    return element;
}

function shouldPreservePromptNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    return node.matches('.prompt-field, textarea, input, select, button')
        || node.id === 'dynamic-update-list';
}

function formatPromptTextContent(text) {
    const fragment = document.createDocumentFragment();
    const lines = text.split('\n');

    lines.forEach((line) => {
        const lineClass = detectPromptLineClass(line);
        fragment.appendChild(createPromptLine(line, lineClass));
    });

    return fragment;
}

function formatPromptInlineContainer(container) {
    if (container.dataset.promptInlineFormatted) return;

    const fragment = document.createDocumentFragment();
    Array.from(container.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            fragment.appendChild(formatPromptTextContent(child.textContent));
        } else {
            fragment.appendChild(child);
        }
    });

    container.replaceChildren(fragment);
    container.dataset.promptInlineFormatted = 'true';
}

function formatPromptContainer(container) {
    if (container.dataset.promptFormatted) return;

    const fragment = document.createDocumentFragment();
    Array.from(container.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            fragment.appendChild(formatPromptTextContent(child.textContent));
        } else if (shouldPreservePromptNode(child)) {
            fragment.appendChild(child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            if (child.matches('[data-file-toggle]') && child.textContent.trim().startsWith('-')) {
                const line = document.createElement('span');
                line.className = 'prompt-line prompt-line--bullet';
                line.appendChild(child);
                fragment.appendChild(line);
            } else if (child.matches('[data-file-toggle]') && child.textContent.includes('\n')) {
                formatPromptInlineContainer(child);
                fragment.appendChild(child);
            } else if (child.matches('.prompt-line')) {
                fragment.appendChild(child);
            } else {
                fragment.appendChild(child);
            }
        }
    });

    container.replaceChildren(fragment);
    container.dataset.promptFormatted = 'true';
}

function initPromptFormatting() {
    document.querySelectorAll('.prompt-body, .prompt-block > pre').forEach((container) => {
        formatPromptContainer(container);
    });
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
            } else if (child.classList.contains('prompt-line')) {
                if (child.classList.contains('prompt-line--blank')) {
                    text += '\n';
                } else {
                    const lineText = getPromptText(child);
                    if (lineText.trim()) {
                        text += lineText;
                        text += '\n';
                    }
                }
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
    initPromptFormatting();

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

    // Workflow mode toggle
    const modeToggleButtons = document.querySelectorAll('.mode-toggle-btn');
    const sidebarPhase3Label = document.getElementById('sidebar-phase-3-label');
    const WORKFLOW_MODES = {
        'step-by-step': 'Implementation (Small Steps)',
        'all-in-one': 'Implementation (All in One)',
    };

    function applyWorkflowMode(mode) {
        document.querySelectorAll('[data-workflow-mode]').forEach((element) => {
            const isActive = element.dataset.workflowMode === mode;
            element.classList.toggle('hidden', !isActive);
        });

        modeToggleButtons.forEach((button) => {
            const isActive = button.dataset.mode === mode;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (sidebarPhase3Label) {
            sidebarPhase3Label.textContent = WORKFLOW_MODES[mode] || WORKFLOW_MODES['step-by-step'];
        }
    }

    if (modeToggleButtons.length > 0) {
        const savedMode = localStorage.getItem('setting-workflow-mode') || 'step-by-step';
        applyWorkflowMode(savedMode);

        modeToggleButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.mode;
                applyWorkflowMode(mode);
                localStorage.setItem('setting-workflow-mode', mode);
            });
        });
    }

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
            const toggleTarget = el.closest('.prompt-line') || el;
            if (isChecked) {
                toggleTarget.classList.remove('hidden');
            } else {
                toggleTarget.classList.add('hidden');
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
