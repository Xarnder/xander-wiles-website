document.addEventListener('DOMContentLoaded', () => {
    console.log("App Initialized: Native Print version loaded.");

    const fileInput = document.getElementById('fileInput');
    const convertBtn = document.getElementById('convertBtn');
    const statusMessage = document.getElementById('statusMessage');

    const setStatus = (message, type) => {
        statusMessage.textContent = message;
        statusMessage.className = `status-message status-${type}`;
    };

    convertBtn.addEventListener('click', () => {
        console.group("Native PDF Print Process");
        console.log("1. 'Convert to PDF' button clicked.");

        setStatus("Preparing document...", "info");

        if (fileInput.files.length === 0) {
            console.error("Error: No file selected.");
            setStatus("Please select a file first.", "error");
            console.groupEnd();
            return;
        }

        const file = fileInput.files[0];
        console.info(`2. Reading: "${file.name}"`);

        const reader = new FileReader();

        reader.onload = function (e) {
            console.log("3. File read successfully. Creating hidden iframe.");
            const htmlContent = e.target.result;

            if (!htmlContent.trim()) {
                console.error("Error: File is empty.");
                setStatus("The selected file is empty.", "error");
                console.groupEnd();
                return;
            }

            // Remove any existing print iframes to keep things clean
            const existingFrame = document.getElementById('printFrame');
            if (existingFrame) {
                existingFrame.remove();
            }

            // Create a hidden iframe
            const iframe = document.createElement('iframe');
            iframe.id = 'printFrame';
            // Hide it completely from the user
            iframe.style.position = 'absolute';
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            console.log("4. Injecting HTML content into iframe.");

            // Write the uploaded HTML into the iframe
            const iframeDoc = iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();

            // Wait for any external resources inside the HTML (like images/fonts) to load
            iframe.onload = () => {
                console.info("5. Content loaded. Triggering native print dialog.");
                setStatus("Opening print dialog. Please choose 'Save as PDF'.", "success");

                // Focus and print the iframe content
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                console.groupEnd();
            };
        };

        reader.onerror = function (err) {
            console.error("Error reading file:", err);
            setStatus("Could not read the file.", "error");
            console.groupEnd();
        };

        reader.readAsText(file);
    });
});