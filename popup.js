document.addEventListener('DOMContentLoaded', async () => {
    const loadingState = document.getElementById('loading-state');
    const resultState = document.getElementById('result-state');


    const scoreValue = document.getElementById('score-value');
    const scoreCircle = document.getElementById('score-circle');
    const statusBadge = document.getElementById('status-badge');
    const primaryMsg = document.getElementById('primary-msg');
    const statusIcon = document.getElementById('status-icon');
    const secondaryTitle = document.getElementById('secondary-title');
    const secondaryMsg = document.getElementById('secondary-msg');
    const tricksList = document.getElementById('tricks-list');

    try {

        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // GUARDRAIL: Prevent scraping Chrome internal pages
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
            loadingState.innerHTML = "<p>Cannot scan internal browser pages.<br>Please open a real e-commerce website.</p>";
            return; // Stop execution here
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(livePayload)
        });


        if (!response.ok) {
            throw new Error(`Server returned status: ${response.status}`);
        }

        const data = await response.json();


        loadingState.classList.add('hidden');
        resultState.classList.remove('hidden');

        const score = data.honesty_score;
        scoreValue.innerText = score;


        resultState.classList.remove('theme-green', 'theme-yellow', 'theme-red');

        if (score >= 80) {
            resultState.classList.add('theme-green');
            statusBadge.innerText = "LOOKS HONEST";
            primaryMsg.innerText = "This page looks honest. We didn't find any manipulative design tricks.";
            statusIcon.innerText = "✅";
            secondaryTitle.innerText = "This page looks honest";
            secondaryMsg.innerText = "We didn't find any countdown pressure, sneaky checkboxes, or hidden fees on this page. Nice.";
            tricksList.classList.add('hidden');
        }

    } catch (error) {
        console.error('Extraction/Network Error:', error);
        loadingState.innerHTML = `<p>Error: Is your Python Backend running?</p><p style="font-size:10px; color:#999;">${error.message}</p>`;
    }

    function renderTricks(patterns, message) {
        if (secondaryMsg) secondaryMsg.innerText = message;
        if (tricksList) {
            tricksList.innerHTML = "";

            if (patterns && patterns.length > 0) {
                tricksList.classList.remove('hidden');
                patterns.forEach(trick => {
                    const li = document.createElement('li');
                    li.innerText = trick.category;
                    tricksList.appendChild(li);
                });
            }
        }
    }
});
