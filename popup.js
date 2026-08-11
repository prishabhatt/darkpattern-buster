document.addEventListener('DOMContentLoaded', async () => {
    const loadingState = document.getElementById('loading-state');
    const resultState = document.getElementById('result-state');
    
    const scoreValue = document.getElementById('score-value');
    const statusBadge = document.getElementById('status-badge');
    const primaryMsg = document.getElementById('primary-msg');
    const statusIcon = document.getElementById('status-icon');
    const secondaryTitle = document.getElementById('secondary-title');
    const secondaryMsg = document.getElementById('secondary-msg');
    const tricksList = document.getElementById('tricks-list');
    const prerevealOverlay = document.getElementById('prereveal-overlay');

    let allDetectedPatterns = [];

    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
            loadingState.innerHTML = "<p>Cannot scan internal browser pages.<br>Please open a real e-commerce website.</p>";
            return;
        }

        let extractionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.documentElement.outerHTML,
        });

        const kbSize = (extractionResults[0].result.length / 1024).toFixed(1);
        document.getElementById('payload-size').innerText = `${kbSize} KB`;

        const livePayload = {
            url: tab.url,
            html: extractionResults[0].result
        };

        const response = await fetch('http://localhost:5001/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(livePayload)
        });

        if (!response.ok) {
            throw new Error(`Server returned status: ${response.status}`);
        }

        const data = await response.json();

        // 1. Extract values from backend JSON output
        const score = data.honesty_score ?? 100;
        allDetectedPatterns = data.patterns_detected || [];

        // 2. Fetch any dynamic traps stored by content.js
        chrome.storage.local.get(['dynamicTraps'], (result) => {
            if (result.dynamicTraps && result.dynamicTraps.length > 0) {
                allDetectedPatterns = [...allDetectedPatterns, ...result.dynamicTraps];
            }
            updateUI(score, allDetectedPatterns);
        });

        loadingState.classList.add('hidden');
        runPreRevealThenReveal(score, prerevealOverlay, resultState);

    } catch (error) {
        console.error('Extraction/Network Error:', error);
        loadingState.innerHTML = `<p>Error: Is your Python Backend running?</p><p style="font-size:10px; color:#999;">${error.message}</p>`;
    }

    // 3. Listen for live updates sent from content.js while popup is open
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "DYNAMIC_TRAP_DETECTED") {
            allDetectedPatterns.push(message.trap);
            const currentScore = parseInt(scoreValue.innerText) || 70;
            const adjustedScore = Math.max(10, currentScore - 15);
            updateUI(adjustedScore, allDetectedPatterns);
        }
    });

    function updateUI(score, patterns) {
        scoreValue.innerText = score;
        resultState.classList.remove('theme-green', 'theme-yellow', 'theme-red');

        if (score >= 80 && patterns.length === 0) {
            resultState.classList.add('theme-green');
            statusBadge.innerText = "LOOKS HONEST";
            statusIcon.innerText = "✅";
            primaryMsg.innerText = "This page looks honest. We didn't find any manipulative design tricks.";
            secondaryTitle.innerText = "This page looks honest";
            renderTricks(patterns, "We didn't find any countdown pressure, sneaky checkboxes, or hidden fees on this page.");
        } else if (score >= 50) {
            resultState.classList.add('theme-yellow');
            statusBadge.innerText = "SOME TRICKS FOUND";
            statusIcon.innerText = "⚠️";
            primaryMsg.innerText = "This page uses a few tactics that are worth a second look before you buy.";
            secondaryTitle.innerText = "A few things to watch for";
            renderTricks(patterns, "We found patterns nudging you to decide faster:");
        } else {
            resultState.classList.add('theme-red');
            statusBadge.innerText = "HIGH RISK";
            statusIcon.innerText = "🚨";
            primaryMsg.innerText = "This page relies heavily on manipulative design to rush your decision.";
            secondaryTitle.innerText = "Aggressive tactics detected";
            renderTricks(patterns, "We found several manipulative patterns here:");
        }
    }

    function renderTricks(patterns, message) {
        if (secondaryMsg) secondaryMsg.innerText = message;
        if (!tricksList) return;

        tricksList.innerHTML = "";

        if (patterns && patterns.length > 0) {
            tricksList.classList.remove('hidden');
            patterns.forEach(trick => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${trick.category}</strong>: ${trick.description}`;
                tricksList.appendChild(li);
            });
        } else {
            tricksList.classList.add('hidden');
        }
    }
});

// Function to handle the receipt animation overlay before revealing the final score
function runPreRevealThenReveal(score, prerevealOverlay, resultState) {
    if (!prerevealOverlay || !resultState) {
        if (resultState) resultState.classList.remove('hidden');
        return;
    }

    // 1. Remove previous risk classes from the overlay
    prerevealOverlay.classList.remove('prereveal-red', 'prereveal-yellow', 'prereveal-green', 'hidden');

    // 2. Set the overlay theme based on the score
    if (score >= 80) {
        prerevealOverlay.classList.add('prereveal-green');
    } else if (score >= 50) {
        prerevealOverlay.classList.add('prereveal-yellow');
    } else {
        prerevealOverlay.classList.add('prereveal-red');
    }

    // 3. Show receipt animation for 2.2 seconds, then transition to final result
    setTimeout(() => {
        prerevealOverlay.classList.add('prereveal-fade-out');

        setTimeout(() => {
            prerevealOverlay.classList.add('hidden');
            prerevealOverlay.classList.remove('prereveal-fade-out');
            
            // Unhide result card and trigger entrance animation
            resultState.classList.remove('hidden');
            resultState.classList.add('result-fade-in');
        }, 400); // 400ms fade transition
    }, 2200); // 2.2s receipt animation duration
}