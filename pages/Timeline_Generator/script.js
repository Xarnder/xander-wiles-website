document.addEventListener('DOMContentLoaded', () => {
    // Get references to all the important HTML elements
    const textInput = document.getElementById('text-input');
    const generateButton = document.getElementById('generate-button');
    const timelineOutput = document.getElementById('timeline-output');
    const debugOutput = document.getElementById('debug-output');
    const timelineTitle = document.getElementById('timeline-title');

    // Attach the main function to the button's click event
    generateButton.addEventListener('click', generateTimeline);

    /**
     * NEW: Helper function to convert a "HH:MM" string to total minutes from midnight.
     * This makes duration calculations easy.
     * @param {string} timeStr - The time string, e.g., "14:30".
     * @returns {number|null} - Total minutes from midnight, or null if invalid.
     */
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) {
            console.error(`Invalid time format for conversion: "${timeStr}"`);
            return null;
        }
        return hours * 60 + minutes;
    }

    function generateTimeline() {
        console.log("--- Generating Timeline ---");

        // 1. Get and prepare the input text
        const rawText = textInput.value;
        if (!rawText.trim()) {
            console.warn("Input text is empty. Aborting.");
            updateDebug([{ type: 'warn', message: 'Input text is empty. Please paste your schedule.' }]);
            updateTimeline([], null);
            return;
        }

        const lines = rawText.split('\n');
        const events = [];
        const debugMessages = [];
        let potentialTitle = null;

        // 2. Define the Regular Expression for parsing times and descriptions
        const timeRegex = /^(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s*(.+)$/;

        // 3. Loop through each line and parse it
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue; // Skip empty lines

            const match = trimmedLine.match(timeRegex);

            if (match) {
                // We found a line with a time!
                const event = {
                    startTime: match[1],
                    endTime: match[2] || null, // End time is optional
                    description: match[3].trim(),
                    duration: null // NEW: Add a property to store duration in minutes
                };

                // NEW: Calculate duration if both start and end times exist
                if (event.startTime && event.endTime) {
                    let startMinutes = timeToMinutes(event.startTime);
                    let endMinutes = timeToMinutes(event.endTime);

                    if (startMinutes !== null && endMinutes !== null) {
                        // Handle overnight events (e.g., 23:00 - 01:00)
                        if (endMinutes < startMinutes) {
                            endMinutes += 24 * 60; // Add a full day's worth of minutes
                        }
                        event.duration = endMinutes - startMinutes;
                    }
                }
                
                events.push(event);
                console.log(`✅ Parsed Event:`, event); // The console log now includes duration
            } else {
                // This line does not look like a timed event
                if (!potentialTitle && events.length === 0) {
                    potentialTitle = trimmedLine;
                    console.log(`📌 Found Potential Title: "${potentialTitle}"`);
                } else {
                    console.warn(`⚠️ Could not parse line: "${trimmedLine}"`);
                    debugMessages.push({
                        type: 'warn',
                        message: `Skipped line: <strong>"${trimmedLine}"</strong> (Couldn't find a time at the start).`
                    });
                }
            }
        }
        
        // 4. Add a summary message
        if(events.length > 0) {
             debugMessages.unshift({ type: 'info', message: `Successfully parsed ${events.length} event(s).` });
        } else {
             debugMessages.unshift({ type: 'warn', message: 'Could not find any valid events in the text provided.' });
        }

        // 5. Render the results to the screen
        updateTimeline(events, potentialTitle);
        updateDebug(debugMessages);
        console.log("--- Timeline Generation Complete ---");
    }

    function updateTimeline(events, title) {
        timelineOutput.innerHTML = '';
        timelineTitle.textContent = title ? title : 'Your Timeline';
        
        if (events.length === 0) {
            timelineOutput.innerHTML = '<p class="placeholder-text">No events could be parsed from your text. Check the status below for details.</p>';
            return;
        }

        // --- NEW: Proportional Spacing Configuration ---
        const PIXELS_PER_MINUTE = 1.2; // How many pixels of space per minute of duration. Adjust this value to make spacing larger or smaller.
        const BASE_SPACING_PX = 24;    // The default minimum space (1.5rem in CSS).
        const MAX_SPACING_PX = 400;    // A cap to prevent huge gaps for very long events.

        const ul = document.createElement('ul');
        ul.className = 'timeline';

        for (const event of events) {
            const li = document.createElement('li');
            li.className = 'timeline-item';

            // --- NEW: Apply dynamic padding based on duration ---
            if (event.duration && event.duration > 0) {
                const calculatedPadding = event.duration * PIXELS_PER_MINUTE;
                // Use Math.max/min to ensure the padding is within our defined bounds
                const finalPadding = Math.max(BASE_SPACING_PX, Math.min(calculatedPadding, MAX_SPACING_PX));
                li.style.paddingBottom = `${finalPadding}px`;
            }

            let timeString = event.startTime;
            if (event.endTime) {
                timeString += ` - ${event.endTime}`;
            }
            // Add duration to the display for clarity
            if (event.duration) {
                timeString += ` <span style="color: var(--text-secondary); font-weight: 400;">(${event.duration} min)</span>`;
            }

            li.innerHTML = `
                <div class="timeline-time">${timeString}</div>
                <p class="timeline-description">${event.description}</p>
            `;
            ul.appendChild(li);
        }
        
        timelineOutput.appendChild(ul);
    }

    function updateDebug(messages) {
        debugOutput.innerHTML = '';
        
        if (messages.length === 0) {
            debugOutput.innerHTML = '<p>No issues found.</p>';
            return;
        }

        for (const msg of messages) {
            const p = document.createElement('p');
            p.classList.add(msg.type); // 'info' or 'warn'
            p.innerHTML = msg.message;
            debugOutput.appendChild(p);
        }
    }
});