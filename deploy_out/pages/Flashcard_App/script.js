document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const appContainer = document.querySelector('.app-container');
    const uploadSection = document.querySelector('.upload-section');
    const fileInput = document.getElementById('fileInput');
    const pasteArea = document.getElementById('pasteArea');
    const loadPastedDataButton = document.getElementById('loadPastedData');
    const flashcard = document.getElementById('flashcard');
    const questionText = document.getElementById('questionText');
    const answerText = document.getElementById('answerText');
    const correctButton = document.getElementById('correctButton');
    const nextButton = document.getElementById('nextButton');
    const scoreDisplay = document.getElementById('score');
    const currentCardNumberDisplay = document.getElementById('currentCardNumber');
    const totalCardsDisplay = document.getElementById('totalCards');
    const progressFill = document.getElementById('progressFill');

    // Sound elements
    const flipSound = document.getElementById('flipSound');
    const correctSound = document.getElementById('correctSound');
    const nextSound = document.getElementById('nextSound');
    const clickSound = document.getElementById('clickSound');

    // Game State
    let allCards = [];
    let currentDeck = [];
    let reviseLaterDeck = [];
    let currentIndex = 0;
    let score = 0;
    let currentCardMarkedCorrect = false;
    let isFlipped = false; // Track flip state

    // Initialize
    correctButton.disabled = true;
    nextButton.disabled = true;

    // Utility Functions
    function playSound(soundElement) {
        if (soundElement) {
            soundElement.currentTime = 0;
            soundElement.play().catch(error => console.error("Error playing sound:", error));
        }
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function updateProgressBar() {
        if (allCards.length === 0) {
            progressFill.style.width = '0%';
            return;
        }
        
        let totalCompleted = score;
        let totalCardsInQuiz = allCards.length; // Use allCards.length for overall progress
        let progressPercentage = (totalCompleted / totalCardsInQuiz) * 100;
        progressFill.style.width = `${progressPercentage}%`;
    }

    function addSuccessGlow(element) {
        element.classList.add('success-glow');
        setTimeout(() => {
            element.classList.remove('success-glow');
        }, 600);
    }

    function createRippleEffect(button, event) {
        // Check if a ripple element already exists and remove it to avoid buildup
        let existingRipple = button.querySelector('.button-ripple-effect');
        if (existingRipple) {
            existingRipple.remove();
        }
    
        const ripple = document.createElement('span');
        ripple.classList.add('button-ripple-effect'); // Use a different class if '.button-ripple' is structural
    
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = `${size}px`;
    
        // Calculate position relative to the button
        // The event object 'e' passed to createRippleEffect might be from the button click handler
        // 'event' inside createRippleEffect should be the click event
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    
        button.appendChild(ripple);
    
        // Clean up the ripple element after animation
        ripple.addEventListener('animationend', () => {
            ripple.remove();
        });
    }
    
    // Add CSS for .button-ripple-effect dynamically or ensure it's in style.css
    // This is a simple version, you might need more sophisticated CSS for the effect
    if (!document.querySelector('#ripple-effect-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'ripple-effect-styles';
        styleSheet.textContent = `
            .modern-button { /* Ensure modern-button has position: relative; or overflow: hidden; */
                position: relative;
                overflow: hidden;
            }
            .button-ripple-effect {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                animation: ripple-animation 0.6s linear;
            }
            @keyframes ripple-animation {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(styleSheet);
    }


    // Event Listeners
    fileInput.addEventListener('change', handleFile);
    loadPastedDataButton.addEventListener('click', (e) => {
        playSound(clickSound);
        createRippleEffect(loadPastedDataButton, e);
        handlePastedData();
    });

    function handleFile(event) {
        playSound(clickSound);
        const file = event.target.files[0];
        if (file && file.type === "text/plain") {
            const reader = new FileReader();
            reader.onload = (e) => {
                processData(e.target.result);
            };
            reader.readAsText(file);
            fileInput.value = '';
        } else {
            showNotification("Please upload a valid .txt file.", 'error');
            fileInput.value = '';
        }
    }

    function handlePastedData() {
        const textData = pasteArea.value;
        if (textData.trim() === "") {
            showNotification("Please paste some data.", 'error');
            return;
        }
        processData(textData);
        pasteArea.value = "";
    }

    function processData(textData) {
        const lines = textData.split('\n').filter(line => line.trim() !== '');
        allCards = lines.map((line, index) => {
            const parts = line.split(' ::: ');
            if (parts.length === 2) {
                return { 
                    id: index, 
                    question: parts[0].trim(), 
                    answer: parts[1].trim() 
                };
            }
            return null;
        }).filter(card => card !== null);

        if (allCards.length > 0) {
            appContainer.classList.add('quiz-started');
            resetQuiz();
            showNotification(`Loaded ${allCards.length} flashcards successfully!`, 'success');
        } else {
            showNotification("No valid flashcards found. Ensure format is 'Question ::: Answer' per line.", 'error');
            questionText.textContent = "Error loading cards. Check format.";
            answerText.textContent = ""; // Clear answer text too
            appContainer.classList.remove('quiz-started');
            // Ensure quiz-related UI elements are hidden or disabled
            flashcard.style.display = 'block'; // Keep flashcard visible for error message
            document.querySelector('.controls').style.display = 'none';
            document.querySelector('.progress-section').style.display = 'none';

        }
    }

    function resetQuiz() {
        currentDeck = [...allCards];
        shuffleArray(currentDeck);
        reviseLaterDeck = [];
        currentIndex = 0;
        score = 0;
        isFlipped = false;
        updateScoreDisplay();
        updateProgressBar(); // Call this after score is reset
        displayCard();
        correctButton.disabled = false;
        nextButton.disabled = false;
        flashcard.style.display = ''; // Make sure it's visible
        document.querySelector('.controls').style.display = 'flex';
        document.querySelector('.progress-section').style.display = 'block';
    }

    function displayCard() {
        flashcard.style.boxShadow = '';
        flashcard.classList.remove('success-glow');
        
        if (flashcard.classList.contains('is-flipped')) {
            flashcard.classList.remove('is-flipped');
        }
        isFlipped = false;
        
        currentCardMarkedCorrect = false;
        correctButton.disabled = false;
        correctButton.style.opacity = "1";
        
        if (currentDeck.length > 0 && currentIndex < currentDeck.length) {
            const card = currentDeck[currentIndex];
            questionText.textContent = card.question;
            answerText.textContent = card.answer;
            updateProgressIndicator();
        } else if (reviseLaterDeck.length > 0) {
            currentDeck = [...reviseLaterDeck];
            shuffleArray(currentDeck);
            reviseLaterDeck = [];
            currentIndex = 0;
            if (currentDeck.length > 0) {
                showNotification("Starting revision round for cards to review!", 'info');
                displayCard(); // Recursive call, careful with stack depth if many revisions
            } else {
                // This case should ideally not be reached if logic is correct,
                // as reviseLaterDeck being > 0 implies currentDeck will be populated
                endQuiz();
            }
        } else {
            endQuiz();
        }
    }

    function endQuiz() {
        const percentage = allCards.length > 0 ? Math.round((score / allCards.length) * 100) : 0;
        questionText.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 2rem; margin-bottom: 1rem;">🎉</div>
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">Quiz Complete!</div>
                <div style="font-size: 1.2rem; color: var(--accent-emerald);">
                    Score: ${score}/${allCards.length} (${percentage}%)
                </div>
            </div>
        `;
        answerText.textContent = "Refresh the page or upload new data to start again.";
        correctButton.disabled = true;
        nextButton.disabled = true;
        updateProgressIndicator(true); // Indicate quiz finished
        
        if (allCards.length > 0) { // Only show celebration if cards were loaded
            if (percentage >= 80) {
                addSuccessGlow(flashcard);
                showNotification("Excellent work! Outstanding performance! 🌟", 'success');
            } else if (percentage >= 60) {
                showNotification("Good job! Keep practicing to improve! 👍", 'success');
            } else {
                showNotification("Keep studying! Practice makes perfect! 📚", 'info');
            }
        }
         // Option to reset and start over or load new data
        // Potentially offer a "Start Over" button that calls a full reset function
    }

    function updateScoreDisplay() {
        scoreDisplay.textContent = score;
        updateProgressBar(); // Update progress bar whenever score changes
    }

    function updateProgressIndicator(finished = false) {
        const totalInCurrentRound = currentDeck.length;
        const totalOverall = allCards.length;
    
        if (finished || totalOverall === 0) {
            currentCardNumberDisplay.textContent = totalOverall.toString();
            totalCardsDisplay.textContent = totalOverall.toString();
        } else {
            if (totalInCurrentRound > 0 && currentIndex < totalInCurrentRound) {
                // Calculate number based on original deck size if in revision round for clarity
                // This might be complex; simpler is current card in current deck
                currentCardNumberDisplay.textContent = (currentIndex + 1).toString();
                totalCardsDisplay.textContent = totalInCurrentRound.toString();
            } else if (reviseLaterDeck.length > 0 && currentDeck.length === 0) {
                // This state means we are about to switch to reviseLaterDeck
                currentCardNumberDisplay.textContent = "1"; // For the upcoming revision round
                totalCardsDisplay.textContent = reviseLaterDeck.length.toString();
            }
            // If quiz ended and no cards, it's handled by the finished || totalOverall === 0 case
        }
    }


    flashcard.addEventListener('click', () => {
        if (questionText.textContent === "Upload or paste data to start your learning journey!" ||
            questionText.textContent.includes("Quiz Complete!") ||
            questionText.textContent.includes("Error loading cards.") ||
            !(currentDeck.length > 0 && currentIndex < currentDeck.length)) {
            return; // Do not flip if no active card or quiz is over/not started
        }
            
        playSound(flipSound);
        
        if (isFlipped) {
            flashcard.classList.remove('is-flipped');
            isFlipped = false;
        } else {
            flashcard.classList.add('is-flipped');
            isFlipped = true;
        }
    });

    correctButton.addEventListener('click', (e) => {
        if (currentDeck.length === 0 || currentIndex >= currentDeck.length || currentCardMarkedCorrect) return;
        
        playSound(correctSound);
        createRippleEffect(correctButton, e);
        
        score++;
        updateScoreDisplay();
        currentCardMarkedCorrect = true;
        correctButton.style.opacity = "0.7";
        correctButton.disabled = true;

        addSuccessGlow(flashcard);
        showNotification("Correct! Well done! ✓", 'success');
    });

    nextButton.addEventListener('click', (e) => {
        if (currentDeck.length === 0) return; // Or if currentIndex is out of bounds already
        
        playSound(nextSound);
        createRippleEffect(nextButton, e);

        if (!currentCardMarkedCorrect && currentDeck.length > 0 && currentIndex < currentDeck.length) {
            const cardToRevise = currentDeck[currentIndex];
            // Ensure not to add duplicates if user somehow clicks next multiple times on same incorrect card
            if (!reviseLaterDeck.some(card => card.id === cardToRevise.id)) {
                 reviseLaterDeck.push(cardToRevise);
            }
        }
        
        currentIndex++;
        displayCard();
    });

    function showNotification(message, type = 'info') {
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">
                    ${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}
                </span>
                <span class="notification-message">${message}</span>
            </div>
        `;

        const notificationStyles = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 1rem 1.5rem;
                border-radius: var(--radius-md);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--glass-border);
                z-index: 1000;
                transform: translateX(120%); /* Start further off-screen */
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
                max-width: 400px;
                box-shadow: var(--shadow-lg);
            }
            .notification-success {
                background: rgba(16, 185, 129, 0.15); /* Slightly more opaque */
                border-color: rgba(16, 185, 129, 0.4);
                color: var(--accent-emerald);
            }
            .notification-error {
                background: rgba(239, 68, 68, 0.15);
                border-color: rgba(239, 68, 68, 0.4);
                color: var(--accent-red);
            }
            .notification-info {
                background: rgba(139, 92, 246, 0.15);
                border-color: rgba(139, 92, 246, 0.4);
                color: var(--accent-purple);
            }
            .notification-content {
                display: flex;
                align-items: center;
                gap: 0.75rem; /* Slightly increased gap */
            }
            .notification-icon {
                font-weight: bold;
                font-size: 1.2rem; /* Slightly larger icon */
            }
            .notification-message {
                font-size: 0.9rem; /* Slightly larger message */
                font-weight: 500;
            }
        `;

        if (!document.querySelector('#notification-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'notification-styles';
            styleSheet.textContent = notificationStyles;
            document.head.appendChild(styleSheet);
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 50); // Reduced delay for animation start

        setTimeout(() => {
            notification.style.transform = 'translateX(120%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 400); // Match transition duration
        }, 3000);
    }

    document.addEventListener('keydown', (e) => {
        if (appContainer.classList.contains('quiz-started')) {
            // Check if focus is on an input/textarea to avoid hijacking typing
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
                // Allow default behavior for Enter in pasteArea, for example
                if (e.key === 'Enter' && activeElement.id === 'pasteArea') {
                    return; 
                }
                 // If other specific inputs need to be excluded, add conditions here
            }

            switch(e.key) {
                case ' ':
                    e.preventDefault(); // Prevent space from scrolling
                    // Ensure flashcard click is only triggered if a card is active
                    if (flashcard && !flashcard.querySelector('.quiz-complete-message') && 
                        currentDeck.length > 0 && currentIndex < currentDeck.length) {
                        flashcard.click();
                    }
                    break;
                case 'ArrowRight':
                case 'Enter': // Be cautious with Enter if text inputs are focusable
                    e.preventDefault();
                    if (!nextButton.disabled) {
                        nextButton.click();
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (!correctButton.disabled) {
                        correctButton.click();
                    }
                    break;
            }
        }
    });

    correctButton.setAttribute('title', 'Mark as correct (↑ Arrow Up)');
    nextButton.setAttribute('title', 'Next card (→ Arrow Right or Enter)');
    flashcard.setAttribute('title', 'Flip card (Spacebar)');
});