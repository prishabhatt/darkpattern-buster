// content.js - Handles page interactions, scanning for multiple dark patterns, and multi-element highlighting

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "HIGHLIGHT_DARK_PATTERN" || request.action === "HIGHLIGHT_ALL_PATTERNS") {
        try {
            let targetElements = [];

            // 1. Try standard CSS selector first if provided
            if (request.selector) {
                try {
                    const found = document.querySelectorAll(request.selector);
                    if (found && found.length > 0) {
                        targetElements.push(...found);
                    }
                } catch (e) {
                    // Ignore invalid selector syntax errors
                }
            }

            // 2. Accumulate ALL matching elements using heuristics across the whole page
            const heuristicElements = findAllElementsBylHeuristics(request.selector || "");
            targetElements.push(...heuristicElements);

            // Remove duplicate elements if any were caught twice
            targetElements = [...new Set(targetElements)];

            if (targetElements.length > 0) {
                // Smoothly scroll the browser viewport to the first detected element
                targetElements[0].scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center', 
                    inline: 'nearest' 
                });

                // Apply the red highlight box to EVERY matching element simultaneously
                targetElements.forEach(el => {
                    const originalTransition = el.style.transition;
                    const originalOutline = el.style.getPropertyValue('outline');
                    const originalBoxShadow = el.style.getPropertyValue('box-shadow');
                    const originalBgColor = el.style.getPropertyValue('background-color');

                    // Apply high-priority styles
                    el.style.setProperty('transition', 'all 0.3s ease-in-out', 'important');
                    el.style.setProperty('outline', '4px solid #f43f5e', 'important');
                    el.style.setProperty('box-shadow', '0 0 25px rgba(244, 63, 94, 0.9)', 'important');
                    el.style.setProperty('background-color', 'rgba(244, 63, 94, 0.25)', 'important');

                    // Revert styles back to normal after 4.5 seconds
                    setTimeout(() => {
                        el.style.setProperty('outline', originalOutline, 'important');
                        el.style.setProperty('box-shadow', originalBoxShadow, 'important');
                        el.style.setProperty('background-color', originalBgColor, 'important');
                        el.style.setProperty('transition', originalTransition, 'important');
                    }, 4500);
                });

                sendResponse({ status: "success", count: targetElements.length });
            } else {
                sendResponse({ status: "not_found", message: "No elements could be located on the page." });
            }
        } catch (error) {
            console.error("Dark Pattern Highlighter Error:", error);
            sendResponse({ status: "error", message: error.message });
        }
    }
    return true;
});

// Helper function to scan and return ALL matching elements on the page
function findAllElementsBylHeuristics(selectorString) {
    const matchedElements = [];
    const allElements = document.querySelectorAll('span, div, p, b, strong, small');

    // 1. Find all urgency / scarcity / timer text elements
    for (const el of allElements) {
        const text = el.innerText.trim().toLowerCase();
        if (
            (text.includes('only') || text.includes('left') || text.includes('ends in') || text.includes('hurry') || text.includes('timer')) &&
            text.length < 60 &&
            el.childElementCount === 0
        ) {
            matchedElements.push(el);
        }
    }

    // 2. Find all pre-checked checkboxes
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
        if (checkbox.checked || checkbox.getAttribute('checked') !== null) {
            matchedElements.push(checkbox.closest('label') || checkbox);
        }
    }

    // 3. Find all fee / cost warning lines
    for (const el of allElements) {
        const text = el.innerText.trim().toLowerCase();
        if (
            (text.includes('fee') || text.includes('charge') || text.includes('surcharge')) &&
            text.length < 80 &&
            el.childElementCount === 0
        ) {
            matchedElements.push(el);
        }
    }

    // 4. Find all confirmshaming / manipulative buttons or links
    const buttons = document.querySelectorAll('button, a, input[type="button"]');
    for (const btn of buttons) {
        const text = btn.innerText.trim().toLowerCase();
        if (
            (text.includes('no thanks') || text.includes('hate saving') || text.includes('decline') || text.includes('full price')) &&
            btn.childElementCount < 2
        ) {
            matchedElements.push(btn);
        }
    }

    return matchedElements;
}