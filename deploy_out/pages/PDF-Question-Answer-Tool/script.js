/* 
    PDF Question Extractor Script
    Requires pdf.js loaded in HTML
*/

// --- State Management ---
let questions = []; // Stores { id: 1, text: "...", answer: "..." }
let currentMode = 'list'; // 'list' or 'focus'
let currentFocusIndex = 0;

// --- DOM Elements ---
const fileInput = document.getElementById('file-upload');
const fileNameDisplay = document.getElementById('file-name');
const container = document.getElementById('questions-container');
const controls = document.getElementById('controls');
const focusNav = document.getElementById('focus-nav');
const progressIndicator = document.getElementById('progress-indicator');

// --- Event Listeners ---
fileInput.addEventListener('change', handleFileUpload);
document.getElementById('btn-list-view').addEventListener('click', () => switchMode('list'));
document.getElementById('btn-focus-view').addEventListener('click', () => switchMode('focus'));
document.getElementById('prev-btn').addEventListener('click', () => navigate(-1));
document.getElementById('next-btn').addEventListener('click', () => navigate(1));
document.getElementById('btn-download-pdf').addEventListener('click', downloadAnswersAsPDF);
document.getElementById('btn-download-txt').addEventListener('click', downloadAnswersAsText);

// Keyboard navigation for focused view
document.addEventListener('keydown', (e) => {
    if (currentMode === 'focus') {
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
    }
});

// --- Core Functions ---

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    console.log(`[System] File selected: ${file.name}`);

    if (file.type !== 'application/pdf') {
        alert('Please upload a valid PDF file.');
        return;
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        console.log('[System] File converted to ArrayBuffer');

        const extractedText = await extractTextFromPDF(arrayBuffer);
        console.log('[System] Raw text extraction complete');

        questions = parseQuestions(extractedText);
        console.log(`[System] Parsed ${questions.length} questions.`);

        if (questions.length === 0) {
            container.innerHTML = '<div class="placeholder-msg">No questions detected. The PDF might contain images instead of text, or the format is not recognized.</div>';
        } else {
            renderQuestions();
            controls.classList.remove('hidden');
            switchMode('list'); // Default to list view
        }

    } catch (error) {
        console.error('[Error] Processing failed:', error);
        container.innerHTML = `<div class="placeholder-msg" style="color: red;">Error processing PDF: ${error.message}</div>`;
    }
}

async function extractTextFromPDF(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";

    console.log(`[PDF] Document has ${pdf.numPages} pages.`);

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Simple heuristic: Join text items with space, add double newline at end of page
        // We rely on the Regex later to split by numbering
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + "\n\n";
    }
    return fullText;
}

function parseQuestions(text) {
    // Regex Logic:
    // 1. Look for patterns like "1. ", "2. ", or "• ", "- " at the start of a logical line.
    // 2. Capture the text until the next pattern starts.
    // Note: PDF extraction often removes newlines, so we look for the number pattern specifically.

    // Pattern: 
    // (\d+\.|[•-]) -> Capture group 1: A number followed by dot OR a bullet/dash
    // \s+ -> Followed by whitespace
    // (.*?) -> Capture group 2: The content (non-greedy)
    // (?=\s*(?:\d+\.|[•-])|\s*$|$) -> Lookahead: Stop before the next number/bullet OR end of text

    // We clean the text first to handle weird spacing from PDF extraction
    // This is a naive splitter. For very complex PDFs, this might need tuning.

    // Updated Regex Logic:
    // 1. Match numbers like "1."
    // 2. Match bullets "•"
    // 3. Match hyphens "-" ONLY IF they are NOT surrounded by letters on both sides.
    //    We use lookarounds: (?<![a-zA-Z]) and (?![a-zA-Z])
    //    Logic: A hyphen is a separator if:
    //           (No letter before) OR (No letter after)
    //    If both are letters (e.g. "i-l" in "multi-label"), it's skipped.

    // Note: We handle spaces flexibly (\s*).

    // Pattern parts:
    // \d+\.         -> Numbers
    // •             -> Bullet
    // (?:(?<![a-zA-Z]\s*)-|-(?!\s*[a-zA-Z])) -> Hyphen logic

    const regex = /(?:^|\s)(\d+\.|•|(?:(?<![a-zA-Z]\s*)-|-(?!\s*[a-zA-Z])))\s+(.*?)(?=\s(?:\d+\.|•|(?:(?<![a-zA-Z]\s*)-|-(?!\s*[a-zA-Z])))|$)/gs;

    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        matches.push({
            label: match[1], // e.g., "1."
            content: match[2].trim() // The question text
        });
    }

    // Map to our internal structure
    return matches.map((m, index) => ({
        id: index,
        displayLabel: m.label,
        text: m.content,
        answer: ""
    }));
}

function renderQuestions() {
    container.innerHTML = '';

    questions.forEach((q, index) => {
        const card = document.createElement('div');
        card.className = 'question-card';
        card.dataset.index = index;

        // Add active class if this is the first one (for logic purposes, though CSS handles visibility)
        if (index === 0) card.classList.add('active-card');

        const label = document.createElement('div');
        label.className = 'question-text';
        label.innerHTML = `<strong>${q.displayLabel}</strong> ${q.text}`;

        const input = document.createElement('textarea');
        input.placeholder = "Type your answer here...";
        input.addEventListener('input', (e) => {
            questions[index].answer = e.target.value;
        });

        card.appendChild(label);
        card.appendChild(input);
        container.appendChild(card);
    });
}

function switchMode(mode) {
    currentMode = mode;
    console.log(`[UI] Switched to ${mode} mode`);

    // Toggle Button Styles
    document.getElementById('btn-list-view').classList.toggle('active', mode === 'list');
    document.getElementById('btn-focus-view').classList.toggle('active', mode === 'focus');

    // Toggle Container Classes
    container.classList.remove('questions-list-view', 'questions-focus-view');
    container.classList.add(mode === 'list' ? 'questions-list-view' : 'questions-focus-view');

    // Toggle Navigation Bar
    if (mode === 'focus') {
        focusNav.classList.remove('hidden');
        updateFocusView();
    } else {
        focusNav.classList.add('hidden');
        // In list mode, ensure all are visible (handled by CSS, but good to reset logic)
    }
}

function navigate(direction) {
    if (currentMode !== 'focus') return;

    const newIndex = currentFocusIndex + direction;
    if (newIndex >= 0 && newIndex < questions.length) {
        currentFocusIndex = newIndex;
        updateFocusView();
    }
}

function updateFocusView() {
    const cards = document.querySelectorAll('.question-card');

    cards.forEach((card, index) => {
        if (index === currentFocusIndex) {
            card.classList.add('active-card');
        } else {
            card.classList.remove('active-card');
        }
    });

    progressIndicator.innerText = `${currentFocusIndex + 1} / ${questions.length}`;
}

function downloadAnswersAsText() {
    console.log('[System] Generating text download...');

    let content = "REVISION ANSWERS\nGenerated by PDF Question Extractor\n\n";
    content += "====================================\n\n";

    questions.forEach(q => {
        content += `${q.displayLabel} ${q.text}\n`;
        content += `ANSWER:\n${q.answer ? q.answer : "[No answer provided]"}\n`;
        content += "\n------------------------------------\n\n";
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'revision-answers.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function downloadAnswersAsPDF() {
    console.log('[System] Generating PDF download...');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const margin = 20;
    const maxLineWidth = pageWidth - (margin * 2);

    let y = 20; // Start Y position

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Revision Answers", margin, y);
    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Generated by PDF Question Extractor", margin, y);
    y += 15;

    questions.forEach((q, index) => {
        // Question Label & Text
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);

        // Combine label and text for wrapping calculation
        const questionText = `${q.displayLabel} ${q.text}`;
        const splitQuestion = doc.splitTextToSize(questionText, maxLineWidth);

        // Check for page break
        if (y + (splitQuestion.length * 7) > 280) {
            doc.addPage();
            y = 20;
        }

        doc.text(splitQuestion, margin, y);
        y += (splitQuestion.length * 5) + 5;

        // Answer
        doc.setFont("helvetica", "normal");
        const answerText = q.answer ? q.answer : "[No answer provided]";
        const splitAnswer = doc.splitTextToSize(answerText, maxLineWidth);

        // Check for page break for answer
        if (y + (splitAnswer.length * 7) > 280) {
            doc.addPage();
            y = 20;
        }

        doc.setTextColor(50, 50, 50); // Dark Gray
        doc.text(splitAnswer, margin, y);
        doc.setTextColor(0, 0, 0); // Reset to Black

        y += (splitAnswer.length * 5) + 10; // Space between questions
    });

    doc.save("revision-answers.pdf");
}