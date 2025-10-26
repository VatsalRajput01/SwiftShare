//* assets/main.js - v27 (Toastify Fixed Width, 5s Duration & Single Message) */

document.addEventListener("DOMContentLoaded", () => {
    /* ---------- THEME / TOGGLE ---------- */
    const themeSwitch = document.getElementById("themeSwitch");
    const body = document.body;
    const themeText = document.getElementById("themeText");
    const LIGHT_MODE_TEXT = "Turn On Light Mode";
    const DARK_MODE_TEXT = "Turn On Dark Mode";

    // Applies theme preference saved in localStorage
    function applyThemeFromStorage() {
        const t = localStorage.getItem("theme") || "dark";
        if (t === "light") {
            body.classList.add("light");
            if (themeSwitch) themeSwitch.checked = true;
            if (themeText) themeText.textContent = DARK_MODE_TEXT;
        } else {
            body.classList.remove("light");
            if (themeSwitch) themeSwitch.checked = false;
            if (themeText) themeText.textContent = LIGHT_MODE_TEXT;
        }
    }
    applyThemeFromStorage();

    if (themeSwitch) {
        themeSwitch.addEventListener("change", () => {
            if (themeSwitch.checked) {
                body.classList.add("light");
                localStorage.setItem("theme", "light");
                if (themeText) themeText.textContent = DARK_MODE_TEXT;
            } else {
                body.classList.remove("light");
                localStorage.setItem("theme", "dark");
                if (themeText) themeText.textContent = LIGHT_MODE_TEXT;
            }
        });
    }

    /* ---------- UPLOAD PAGE LOGIC ---------- */
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");
    const uploadBtn = document.getElementById("uploadBtn");
    const extraOptions = document.getElementById("extraOptions");
    // uploadMessage element is now primarily used for the progress bar text (though deprecated by Toastify)
    const uploadMessage = document.getElementById("uploadMessage");
    const progressContainer = document.querySelector(".progress-container");
    const progressBar = document.getElementById("progressBar");
    const progressPercent = document.querySelector(".progress-percent");
    const isOneTimeCheckbox = document.getElementById("isOneTime");
    const uploadForm = document.getElementById("uploadForm");

    // --- ✅ UPDATED: Toastify Wrapper Function (Fixed Width, 5s Duration, Single Message) ---
    let currentToast = null; // Variable to track the currently displayed Toastify message

    function showToast(text, type = 'info') {
        // Immediately dismiss the previous toast (Ensures only one message is visible)
        if (currentToast) {
            currentToast.hideToast();
        }

        let backgroundColor = 'linear-gradient(to right, #38bdf8, #0ea5e9)'; // Blue/Info Default

        if (type === 'error') {
            backgroundColor = 'linear-gradient(to right, #f87171, #ef4444)'; // Red for Error/Copy Failed
        } else if (type === 'success') {
            backgroundColor = 'linear-gradient(to right, #4ade80, #22c55e)'; // Green for Success
        } else if (type === 'password') {
            backgroundColor = 'linear-gradient(to right, #fbbf24, #f59e0b)'; // Yellow/Warning for Password Prompt
        } else if (type === 'neutral') {
            backgroundColor = 'linear-gradient(to right, #94a3b8, #64748b)'; // Light Blue-Gray for non-critical prompts
        }

        const toastInstance = Toastify({
            text: text,
            duration: 5000, // 5 seconds duration
            newWindow: true,
            close: true,
            gravity: "top", // Top of the screen
            position: "center", // Center horizontally
            stopOnFocus: true,
            style: {
                background: backgroundColor,
                color: "#04243a",
                borderRadius: "999px",
                padding: "10px 18px",
                fontWeight: "600",
                fontSize: "0.9rem",
                boxShadow: "0 8px 30px rgba(2,6,23,0.5)",
                maxWidth: '400px', // Fixed Max Width for better UI consistency
                textAlign: 'center',
            },
            offset: {
                y: 20 // Move down a bit from the top edge
            },
            callback: function () {
                // Clear the tracker when the toast is hidden naturally
                if (currentToast === toastInstance) {
                    currentToast = null;
                }
            }
        });

        currentToast = toastInstance; // Track the new toast instance
        currentToast.showToast();
    }
    // --- END Toastify Wrapper Function ---

    // --- ✅ UPDATED: Upload Message Helper (Uses Toastify) ---
    function showUploadMessage(message, type = 'info') {
        if (!message || message.trim() === "") return;

        // Clear the legacy message area (uploadMessage) if it's not an 'info' type (to show only progress bar status there)
        const uploadMessage = document.getElementById("uploadMessage");
        if (uploadMessage && type !== 'info') {
            uploadMessage.textContent = '';
        }

        showToast(message, type);
    }
    // --- END Upload Message Helper ---

    if (uploadForm && dropZone && fileInput) {
        let isUploading = false;
        let selectedFilesCount = 0;
        let selectedFilesTotalSize = 0;
        const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB limit in bytes

        function showExtras(show) {
            if (!extraOptions) return;
            extraOptions.style.display = show ? "block" : "none";
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function truncateFilename(filename, maxLength = 30) {
            if (filename.length <= maxLength) return filename;
            const lastDotIndex = filename.lastIndexOf('.');
            // Handle files with no extension or very short names
            if (lastDotIndex === -1 || lastDotIndex < 5)
                return filename.substring(0, maxLength - 3) + '...';
            const extension = filename.substring(lastDotIndex);
            const nameWithoutExt = filename.substring(0, lastDotIndex);
            const charsToShow = maxLength - extension.length - 4;
            if (charsToShow < 1) return '...' + extension;
            const truncatedName = nameWithoutExt.substring(0, charsToShow);
            return truncatedName + '... ' + extension;
        }

        /* === FILE SIZE VALIDATION + SELECTION HANDLER === */
        function handleFilesChosen(fileList) {
            if (fileList.length === 0) {
                // Reset file input and state
                fileInput.files = new DataTransfer().files;
                selectedFilesCount = 0;
                selectedFilesTotalSize = 0;
                const dropText = document.getElementById("dropText");
                if (dropText)
                    dropText.innerHTML = `<span class="muted">📁</span> Drag & Drop Your File Here<strong style="color:#60a5fa;"></strong>`;
                showExtras(false);
                if (uploadBtn) uploadBtn.textContent = "Select File to Send";
                return;
            }

            // Client-side 500 MB Check
            const tooLarge = Array.from(fileList).find(f => f.size > MAX_FILE_SIZE);
            if (tooLarge) {
                showUploadMessage(`❌ "${tooLarge.name}" exceeds 500 MB limit. Please choose smaller file.`, "error");
                fileInput.value = "";
                handleFilesChosen([]); // Reset state
                return;
            }

            selectedFilesCount = fileList.length;
            selectedFilesTotalSize = Array.from(fileList).reduce((acc, file) => acc + file.size, 0);

            const dropText = document.getElementById("dropText");
            let fileDisplayText = '';

            if (selectedFilesCount === 1) {
                const truncatedName = truncateFilename(fileList[0].name, 40);
                fileDisplayText = `📄 ${truncatedName}`;
            } else {
                fileDisplayText = `📦 ${selectedFilesCount} files selected`;
            }

            if (dropText)
                dropText.innerHTML = `${fileDisplayText} (<span class="muted">${formatFileSize(selectedFilesTotalSize)} total</span>)`;

            showExtras(true);
            if (uploadBtn) uploadBtn.textContent = `Upload ${selectedFilesCount} File(s)`;
            // Clear message area
            if (uploadMessage) uploadMessage.textContent = "";
        }

        // Drop Zone Event Listeners
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("dragover");
        });
        dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                fileInput.files = files;
                handleFilesChosen(files);
            }
        });

        // Trigger file input click when drop zone is clicked
        dropZone.addEventListener("click", () => fileInput.click());

        // Handle file selection via input dialog
        fileInput.addEventListener("change", (e) => {
            handleFilesChosen(e.target.files);
        });

        if (uploadBtn) {
            uploadBtn.addEventListener("click", () => {
                if (fileInput.files.length === 0) {
                    // Show message for file selection
                    showUploadMessage("Select one or more files.", "neutral");
                    fileInput.click();
                } else if (!isUploading) {
                    // Manually trigger form submission if files are selected
                    uploadForm.dispatchEvent(new Event('submit', { cancelable: true }));
                }
            });
        }

        // --- Form Submission Logic ---
        uploadForm.addEventListener("submit", (ev) => {
            ev.preventDefault();
            const files = fileInput.files;
            if (files.length === 0) {
                // Show message for file selection
                showUploadMessage("Select one or more files.", "neutral");
                return;
            }

            // Final size check before sending
            const tooLarge = Array.from(files).find(f => f.size > MAX_FILE_SIZE);
            if (tooLarge) {
                showUploadMessage(`❌ "${tooLarge.name}" exceeds 500 MB limit.`, "error");
                return;
            }

            if (isUploading) return;
            isUploading = true;

            // Show and reset progress bar
            if (progressContainer) progressContainer.style.display = "block";
            if (progressBar) progressBar.style.width = `0%`;
            if (progressPercent) progressPercent.textContent = `0%`;

            // Display initial progress message (for zipping/uploading) using Toastify
            showUploadMessage("⏳ Zipping and Uploading... Please do not Close this Page.", "info");

            if (uploadBtn) uploadBtn.disabled = true;

            // Prepare form data
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) formData.append('file', files[i]);
            formData.append('password', document.getElementById('password').value);
            formData.append('maxDownloads', document.getElementById('maxDownloads').value);
            formData.append('expiryHours', document.getElementById('expiryHours').value);
            if (isOneTimeCheckbox && isOneTimeCheckbox.checked)
                formData.append('isOneTime', 'on');

            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/upload");

            // Progress event listener
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    if (progressPercent) progressPercent.textContent = `${percent}%`;
                }
            });

            // Load complete handler
            xhr.onload = () => {
                isUploading = false;
                if (uploadBtn) uploadBtn.disabled = false;

                try {
                    const data = JSON.parse(xhr.responseText);

                    if (data.downloadCode) {
                        // Success: Show the modal with the download code
                        showUploadModal(data.downloadCode, data.expiresIn || "24 hours");
                    } else if (data.message) {
                        // Server Error (4xx, 5xx with JSON body)
                        showUploadMessage(`❌ Upload failed: ${data.message}`, "error");
                    } else {
                        // Fallback for unknown error
                        showUploadMessage(`❌ Upload failed: Unknown server error.`, "error");
                    }

                } catch {
                    // Non-JSON response (e.g., 502 Bad Gateway)
                    showUploadMessage("❌ Server error. Could not read response. Check console.", "error");
                } finally {
                    // Reset progress bar display after a short delay
                    setTimeout(() => {
                        if (progressBar) progressBar.style.width = `0%`;
                        if (progressContainer) progressContainer.style.display = "none";
                        if (progressPercent) progressPercent.textContent = "";
                    }, 900);
                    // Reset form and file selection
                    uploadForm.reset();
                    fileInput.files = new DataTransfer().files;
                    handleFilesChosen([]);
                }
            };

            // Network error handler
            xhr.onerror = () => {
                isUploading = false;
                showUploadMessage("❌ Upload failed (network). Please check your internet connection.", "error");
                if (uploadBtn) uploadBtn.disabled = false;
            };

            xhr.send(formData);
        });
    }

    /* ---------- SUCCESS MODAL ---------- */
    // Creates and displays the modal after successful upload
    function showUploadModal(code, expiresIn) {
        const existing = document.querySelector(".upload-modal");
        if (existing) existing.remove(); // Remove any existing modal
        const downloadLink = `${window.location.origin}/download.html?code=${code}`;
        const modalWrap = document.createElement("div");
        modalWrap.className = "upload-modal show";
        modalWrap.innerHTML = `
            <div class="modal-inner" role="dialog" aria-modal="true">
                <div class="modal-title">File Uploaded Successfully</div>
                <div style="color:#9fb7c7; font-size:0.95rem; margin-bottom:8px;">Your file is ready. Share using the code or link below.</div>
                <div class="code-row">
                    <button id="modalCopyCode" class="small-btn primary-btn" style="min-width:90px;">Copy Code</button>
                    <div class="code-pill" id="modalCode">${code}</div>
                </div>
                <div style="margin-top:10px; color:#9fb7c7;">Expires in ${expiresIn}</div>
                <div class="modal-actions">
                    <button id="modalCopyLink" class="small-btn secondary-btn">Copy Link</button>
                    <button id="modalShareLink" class="small-btn secondary-btn">Share Link</button>
                    <button id="modalDone" class="small-btn primary-btn">Done</button>
                </div>
            </div>`;
        document.body.appendChild(modalWrap);

        // Event listener for Copy Code
        document.getElementById("modalCopyCode").addEventListener("click", () => {
            navigator.clipboard.writeText(code).then(() => showToast("Code copied to clipboard", 'info'))
                .catch(() => showToast("Copy failed", 'error'));
        });

        // Event listener for Copy Link
        document.getElementById("modalCopyLink").addEventListener("click", () => {
            navigator.clipboard.writeText(downloadLink)
                .then(() => showToast("Link copied", 'info'))
                .catch(() => showToast("Copy failed", 'error'));
        });

        // === Share Link (Native Web Share API) ===
        modalShareLink.addEventListener('click', async () => {
            const message = `Hey! You've got a file to download.

🔗 Link :- ${downloadLink}
🧩 Code :- ${code}

Open the link and enter the code to access your file.
Shared via *SwiftShare*`;

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'SwiftShare File',
                        text: message
                    });
                    showToast("Shared successfully!", "success");
                } catch (err) {
                    // Ignore "AbortError" (user cancels the share dialog)
                    if (err.name !== 'AbortError') {
                        showToast("Sharing canceled or failed.", "error");
                    }
                }
            } else {
                // Fallback if browser doesn’t support Web Share API
                navigator.clipboard.writeText(message).then(() => {
                    showToast("Share message copied to clipboard!", "success");
                });
            }
        });


        // Event listener for Done button
        document.getElementById("modalDone").addEventListener("click", () => modalWrap.remove());
    }

    /* ---------- DOWNLOAD PAGE LOGIC ---------- */
    const downloadForm = document.getElementById("downloadForm");
    const passwordField = document.getElementById("passwordField");
    // downloadMsg element is kept for clarity but its functionality is replaced by Toastify
    const downloadMsg = document.getElementById("downloadMessage");
    const downloadBtn = document.getElementById("downloadBtn");
    const codeInput = document.getElementById("downloadCode"); // This is the HIDDEN input storing the full 8-char code

    // --- ✅ UPDATED: Download Message Helper (Uses Toastify) ---
    function showDownloadMessage(message, type = 'info') {
        if (!message || message.trim() === "") return;

        // Clear the legacy message area
        if (downloadMsg) downloadMsg.textContent = '';

        showToast(message, type);
    }
    // --- END Download Message Helper ---

    // This block executes only on the download page
    if (downloadForm) {
        // 1. Initial State Check (Check URL for code)
        const urlParams = new URLSearchParams(window.location.search);
        const urlCode = urlParams.get('code');
        const codeBoxes = document.querySelectorAll('.code-input');

        // PRE-FILL 8 BOXES if code is present in the URL
        if (urlCode && codeInput && codeBoxes.length === 8) {
            const cleanCode = urlCode.toUpperCase().replace(/-/g, '');
            if (cleanCode.length === 8) {
                codeBoxes.forEach((box, idx) => { box.value = cleanCode[idx] || ''; });
                codeInput.value = cleanCode; // Update hidden input
            }
        }

        /* --- 8-BOX INPUT LOGIC (FIXED CURSOR + ORDERED ENTRY) --- */
        const codeGroup = document.querySelector('.code-input-group');
        if (codeGroup) {

            // Disable manual cursor placement and force focus on the next empty box
            codeGroup.addEventListener('mousedown', (e) => {
                if (e.target.matches('input.code-input')) {
                    e.preventDefault();
                    const firstEmpty = [...codeBoxes].find(inp => inp.value === "");
                    (firstEmpty || codeBoxes[0]).focus();
                }
            });

            // Handle typing and auto-advance
            codeGroup.addEventListener('input', (e) => {
                const target = e.target;
                if (!target.matches('input.code-input')) return;
                // Clean and capitalize input
                let value = target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                target.value = value;
                if (value && target.nextElementSibling) {
                    // Check for the dash span between inputs
                    if (target.nextElementSibling.matches('span.code-dash')) { target.nextElementSibling.nextElementSibling?.focus(); }
                    else { target.nextElementSibling.focus(); }
                }
                // Update the hidden input field with the combined code
                let combinedValue = ''; codeBoxes.forEach(b => combinedValue += b.value); codeInput.value = combinedValue;
            });

            // Backspace logic: Clear current and move focus to previous input
            codeGroup.addEventListener('keydown', (e) => {
                const target = e.target;
                if (!target.matches('input.code-input')) return;
                if (e.key === 'Backspace' && target.value === '') {
                    let prev = target.previousElementSibling;
                    // Skip the dash span if present
                    if (prev && prev.matches('span.code-dash')) { prev = prev.previousElementSibling; }
                    if (prev && prev.matches('input.code-input')) { prev.value = ''; prev.focus(); }
                }
            });

            // Prevent cursor jump when clicking inside a box that is not the next empty one
            codeBoxes.forEach((box, i) => {
                box.addEventListener('focus', (e) => {
                    const firstEmpty = [...codeBoxes].findIndex(inp => inp.value === "");
                    if (firstEmpty !== -1 && i > firstEmpty) {
                        e.preventDefault();
                        codeBoxes[firstEmpty].focus();
                    }
                    else {
                        // Select the current content for easy replacement if not jumping
                        box.select();
                    }
                });
            });

            // Handle paste event
            codeGroup.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasteData = e.clipboardData.getData('text').replace(/-/g, '').trim().toUpperCase();
                if (pasteData.length === 8) {
                    // Distribute pasted characters across the input boxes
                    codeBoxes.forEach((b, i) => b.value = pasteData[i] || '');
                    codeBoxes[7].focus();
                }
                // Update the hidden input field
                let combinedValue = ''; codeBoxes.forEach(b => combinedValue += b.value); codeInput.value = combinedValue;
            });
        }
        /* --- END 8-BOX LOGIC --- */

        // 2. Form Submit Logic (Performs file check and initiates download stream)
        downloadForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const code = codeInput.value.trim().toUpperCase();
            const password = document.getElementById("downloadPassword").value.trim();

            // Client-side code validation
            if (code.length !== 8) { showDownloadMessage("❌ Please enter a valid 8-character code.", "error"); return; }

            downloadBtn.disabled = true; showDownloadMessage("⏳ Checking file availability...", "info");

            try {
                // First, check the file status on the server
                const res = await fetch(`/download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, password })
                });

                // Always attempt to parse the response body (even on error status codes)
                let resData = {};
                try {
                    resData = await res.json();
                } catch { }

                downloadBtn.disabled = false;

                if (res.status === 200) {
                    // Success: File verified, redirect to start the download stream
                    showDownloadMessage(`✅ ${resData.message}`, "success");
                    window.location.assign(`/download-stream?code=${code}`);
                }
                else if (res.status === 401) {
                    // Password required or incorrect
                    passwordField.style.display = 'block'; // Show password input
                    // Use 'password' type for yellow toast
                    showDownloadMessage(`🔑 ${resData.message}`, "password");
                    downloadBtn.textContent = "Verify & Download";
                    downloadBtn.disabled = false;
                }
                else {
                    // All other server errors (404 Not Found, 410 Gone, 500 etc.)
                    // Use the message from the server or a generic fallback
                    const errorMessage = resData.message || 'An unexpected server error occurred. Please try again later.';
                    showDownloadMessage(`❌ ${errorMessage}`, "error");
                }

            } catch (err) {
                // Network Error
                downloadBtn.disabled = false;
                showDownloadMessage("❌ Network error. Please check your connection.", "error");
            }
        });
    }

}); // DOMContentLoaded end