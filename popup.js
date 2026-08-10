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
        const patterns = data.patterns_detected || []; // Corrected key match

        scoreValue.innerText = score;

        resultState.classList.remove('theme-green', 'theme-yellow', 'theme-red');

        // 2. Set Score Card Status and Theme
        if (score >= 80) {
            resultState.classList.add('theme-green');
            statusBadge.innerText = "LOOKS HONEST";
            statusIcon.innerText = "✅";
            primaryMsg.innerText = "This page looks honest. We didn't find any manipulative design tricks.";
            secondaryTitle.innerText = "This page looks honest";
            secondaryMsg.innerText = "We didn't find any countdown pressure, sneaky checkboxes, or hidden fees on this page.";
            renderTricks(patterns, "No deceptive patterns detected.");
        } else if (score >= 50) {
            resultState.classList.add('theme-yellow');
            statusBadge.innerText = "SOME TRICKS FOUND";
            statusIcon.innerText = "⚠️";
            primaryMsg.innerText = "This page uses a few tactics that are worth a second look before you buy.";
            secondaryTitle.innerText = "A few things to watch for";
            renderTricks(patterns, "We found some patterns that nudge you to decide faster than you might want to:");
        } else {
            resultState.classList.add('theme-red');
            statusBadge.innerText = "HIGH RISK";
            statusIcon.innerText = "🚨";
            primaryMsg.innerText = "This page relies heavily on manipulative design to rush your decision.";
            secondaryTitle.innerText = "This page uses aggressive tactics";
            renderTricks(patterns, "We found several manipulative patterns here. Read carefully before checking out:");
        }

        // 3. Trigger receipt animation and reveal results
        loadingState.classList.add('hidden');
        runPreRevealThenReveal(score, prerevealOverlay, resultState);

    } catch (error) {
        console.error('Extraction/Network Error:', error);
        loadingState.innerHTML = `<p>Error: Is your Python Backend running?</p><p style="font-size:10px; color:#999;">${error.message}</p>`;
    }

    // 4. Render array items into DOM pill lists
    function renderTricks(patterns, message) {
        if (secondaryMsg) secondaryMsg.innerText = message;
        if (!tricksList) return;

        tricksList.innerHTML = "";

        if (patterns && patterns.length > 0) {
            tricksList.classList.remove('hidden');
            patterns.forEach(trick => {
                const li = document.createElement('li');
                // Displays category alongside the explanation/element
                li.innerHTML = `<strong>${trick.category}</strong>: ${trick.description}`;
                tricksList.appendChild(li);
            });
        } else {
            tricksList.classList.add('hidden');
        }
    }
});