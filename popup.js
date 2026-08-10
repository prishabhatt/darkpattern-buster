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

    // NEW: pre-reveal animation element ref (see runPreRevealThenReveal below)
    const prerevealOverlay = document.getElementById('prereveal-overlay');

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
        } else if (score >= 50) {
            resultState.classList.add('theme-yellow');
            statusBadge.innerText = "SOME TRICKS FOUND";
            primaryMsg.innerText = "This page uses a few tactics that are worth a second look before you buy.";
            statusIcon.innerText = "⚠️";
            secondaryTitle.innerText = "A few things to watch for";
            secondaryMsg.innerText = "We found some patterns that nudge you to decide faster than you might want to. Take a moment before checking out.";
            if (data.patterns && data.patterns.length > 0) {
                renderTricks(data.patterns, "We found some patterns that nudge you to decide faster than you might want to. Take a moment before checking out.");
            } else {
                tricksList.classList.add('hidden');
            }
        } else {
            resultState.classList.add('theme-red');
            statusBadge.innerText = "HIGH RISK";
            primaryMsg.innerText = "This page relies heavily on manipulative design to rush your decision.";
            statusIcon.innerText = "🚨";
            secondaryTitle.innerText = "This page uses aggressive tactics";
            secondaryMsg.innerText = "We found several manipulative patterns here, like fake urgency or hidden costs. Read carefully before you buy.";
            if (data.patterns && data.patterns.length > 0) {
                renderTricks(data.patterns, "We found several manipulative patterns here, like fake urgency or hidden costs. Read carefully before you buy.");
            } else {
                tricksList.classList.add('hidden');
            }
        }

        // NEW: play the full-screen pre-reveal animation, then fade it out
        // to reveal the scoreboard underneath (already populated above).
        // Replaces the old direct hand-off
        // (loadingState.hidden -> resultState.visible) with a staged one:
        // loadingState -> prereveal-overlay (full-screen) -> resultState.
        loadingState.classList.add('hidden');
        runPreRevealThenReveal(score, prerevealOverlay, resultState);

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


/* ================================================================
   NEW: Pre-reveal animation module
   Self-contained — does not read or modify any variable declared
   inside the DOMContentLoaded handler above. Called once, from the
   single line inside that handler where the old code used to hand
   off directly from #loading-state to #result-state.

   Flow (all timings driven by CSS animation-delay/duration on the
   overlay's own elements — these JS constants only control when the
   *overlay itself* starts fading and gets swapped for the scoreboard):
     Phase 1 (0.15s -> 1.45s):  the receipt slides down out of the
                                 printer slot (.receipt slide-down).
     Phase 2 (1.35s -> 1.85s):  the risk label + icon fade in on the
                                 receipt (.prereveal-scene fade-in).
     Phase 3 (green only,
              1.55s -> 2.15s):  the thumbs-up pops up out of the
                                 portal on the receipt, then idles.
     Phase 4 (PREREVEAL_HOLD_MS after overlay shown): the whole
                                 overlay fades out over PREREVEAL_FADE_MS,
                                 then #result-state (already populated
                                 by the caller) is revealed underneath.

   PREREVEAL_HOLD_MS is set conservatively so it always waits until
   *after* Phase 3 (the slowest path, ~2.15s) plus a short pause before
   fading — this keeps all three risk levels on one shared timer while
   still respecting each scene's own internal choreography.
   ================================================================ */

const PREREVEAL_HOLD_MS = 2700; // must stay >= ~2.15s (thumb-pop finish) + a brief pause
const PREREVEAL_FADE_MS = 400; // keep in sync with the CSS transition duration

/**
 * Maps a 0-100 honesty score to a pre-reveal theme key.
 * 0-49  -> "red"    (High risk)
 * 50-79 -> "yellow" (Medium risk)
 * 80-100-> "green"  (Low risk)
 */
function getPrerevealTheme(score) {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

/**
 * Shows the full-screen pre-reveal overlay for PREREVEAL_HOLD_MS, fades
 * it out, then reveals the existing #result-state scoreboard underneath.
 * Does not touch any scoreboard content (score value, badge text, theme
 * classes, tricks list) — that remains entirely the job of the existing
 * code that runs right before this is called.
 *
 * @param {number} score
 * @param {HTMLElement} overlayEl - #prereveal-overlay
 * @param {HTMLElement} resultEl - #result-state
 */
function runPreRevealThenReveal(score, overlayEl, resultEl) {
  if (!overlayEl || !resultEl) {
    // Defensive fallback: if the overlay markup isn't present for some
    // reason, don't block the scoreboard from ever appearing.
    if (resultEl) resultEl.classList.remove('hidden');
    return;
  }

  const theme = getPrerevealTheme(score);

  // Reset any theme/fade classes left over from a previous run.
  overlayEl.classList.remove('prereveal-red', 'prereveal-yellow', 'prereveal-green', 'prereveal-fade-out');
  resultEl.classList.remove('result-fade-in');

  // The receipt slide, scene fade-in, and thumb-pop all use
  // "animation: ... forwards", so on a second run (e.g. re-scanning the
  // same tab) their end state would otherwise stick and the animation
  // wouldn't replay. Force a reflow-based restart by briefly clearing
  // and reapplying each element's animation.
  const receiptEl = document.getElementById('prereveal-receipt');
  const animatedEls = [
    receiptEl,
    ...(receiptEl ? receiptEl.querySelectorAll('.prereveal-scene, .thumb-rig, .portal-star') : []),
  ].filter(Boolean);

  animatedEls.forEach((el) => {
    el.style.animation = 'none';
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight; // force reflow so the 'none' actually takes effect
    el.style.animation = '';
  });

  overlayEl.classList.add(`prereveal-${theme}`);
  overlayEl.classList.remove('hidden');

  window.setTimeout(() => {
    // Trigger the CSS fade-out (opacity only, no layout thrash).
    overlayEl.classList.add('prereveal-fade-out');

    window.setTimeout(() => {
      overlayEl.classList.add('hidden');
      overlayEl.classList.remove('prereveal-fade-out', 'prereveal-red', 'prereveal-yellow', 'prereveal-green');

      resultEl.classList.remove('hidden');
      resultEl.classList.add('result-fade-in');
    }, PREREVEAL_FADE_MS);
  }, PREREVEAL_HOLD_MS);
}
