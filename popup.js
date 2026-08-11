document.addEventListener('DOMContentLoaded', async () => {
    const loadingState = document.getElementById('loading-state');
    const scoreboardSlot = document.getElementById('scoreboard-slot');
    const detailsSection = document.getElementById('details-section');
    const tricksList = document.getElementById('tricks-list');
    const modelBadge = document.getElementById('model-badge');

    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
            showError("No active tab found.");
            return;
        }

        // Fetch DOM content from the active tab
        const pageHtml = await getPageHtml(tab.id);

        // Send request to Flask backend for dark pattern analysis
        const response = await fetch('http://127.0.0.1:5001/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: tab.url, html: pageHtml })
        });

        const data = await response.json();
        renderResults(data);

    } catch (err) {
        console.error("Error fetching analysis:", err);
        showError("Could not connect to analysis server.");
    }
});

async function getPageHtml(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => document.documentElement.outerHTML
        });
        return results[0]?.result || "";
    } catch (e) {
        return "";
    }
}

function renderResults(data) {
    const loadingState = document.getElementById('loading-state');
    const scoreboardSlot = document.getElementById('scoreboard-slot');
    const detailsSection = document.getElementById('details-section');
    const tricksList = document.getElementById('tricks-list');
    const modelBadge = document.getElementById('model-badge');

    if (loadingState) loadingState.classList.add('hidden');
    if (scoreboardSlot) scoreboardSlot.classList.remove('hidden');
    if (detailsSection) detailsSection.classList.remove('hidden');

    // Update model badge text if provided by backend
    if (modelBadge && data.model) {
        modelBadge.textContent = data.model;
    }

    const score = data.honesty_score ?? 100;
    const container = document.querySelector('.dark-card');
    
    container.classList.remove('theme-green', 'theme-yellow', 'theme-red');
    
    let themeClass = 'theme-green';
    if (score < 50) themeClass = 'theme-red';
    else if (score < 80) themeClass = 'theme-yellow';
    container.classList.add(themeClass);

    // Update scoreboard data fields
    const scoreCircle = container.querySelector('.score-circle');
    const statusBadge = container.querySelector('.status-badge');
    const primaryMsg = container.querySelector('.primary-msg');

    if (scoreCircle) scoreCircle.textContent = score;
    
    let statusText = "LOOKS HONEST";
    if (score < 50) statusText = "HIGHLY MANIPULATIVE";
    else if (score < 80) statusText = "SOME DECEPTIVE PATTERNS";

    if (statusBadge) statusBadge.textContent = statusText;
    if (primaryMsg) primaryMsg.textContent = data.api_notice || "Dark pattern scan finished.";

    const patterns = data.patterns_detected || [];
    if (tricksList && patterns.length > 0) {
        tricksList.innerHTML = '';
        patterns.forEach(pattern => {
            const li = document.createElement('li');
            li.className = 'trick-item';
            
            // Map element_html_id to a selector fallback for highlighters
            if (pattern.element_html_id) {
                li.dataset.selector = `#${pattern.element_html_id}, [id*="${pattern.element_html_id}"], [name="${pattern.element_html_id}"]`;
            }

            li.innerHTML = `
                <div class="trick-type">${escapeHtml(pattern.category || 'Dark Pattern')}</div>
                <p class="trick-reason">${escapeHtml(pattern.description || '')}</p>
            `;
            tricksList.appendChild(li);
        });
        tricksList.classList.remove('hidden');
    } else if (tricksList) {
        tricksList.innerHTML = '<li class="trick-item"><p class="trick-reason" style="text-align:center;">No dark patterns detected on this page!</p></li>';
        tricksList.classList.remove('hidden');
    }
}

function showError(msg) {
    const loadingState = document.getElementById('loading-state');
    if (loadingState) {
        loadingState.innerHTML = `<p class="loading-text" style="color: #f43f5e;">${msg}</p>`;
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Global click listener for list items to trigger auto-scroll and highlight on the webpage
document.addEventListener('click', async (e) => {
    const trickItem = e.target.closest('.trick-item');
    if (!trickItem) return;

    const selector = trickItem.dataset.selector;
    if (selector) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                // Programmatically inject content.js right before sending message to ensure script is active
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                } catch (injectionErr) {
                    // Script might already be injected or page doesn't allow injection; safely ignore
                }

                // Send message to content script to highlight the element
                chrome.tabs.sendMessage(tab.id, {
                    action: "HIGHLIGHT_DARK_PATTERN",
                    selector: selector
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("Could not send highlight message:", chrome.runtime.lastError.message);
                    }
                });
            }
        } catch (err) {
            console.error("Error sending highlight message:", err);
        }
    }
});