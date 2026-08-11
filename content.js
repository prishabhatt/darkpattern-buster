// content.js - Live DOM Listener for Dark Patterns

console.log("🛡️ [DarkPattern Buster] Content script active!");

// Simple heuristic check for newly added DOM elements
function scanNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  // Ignore safe script/style/svg tags
  if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'IFRAME'].includes(node.tagName)) return;

  const text = (node.innerText || '').toLowerCase();

  // Suspicious keywords common in dynamic popups
  const dynamicTraps = [
    'only few left',
    'someone just bought',
    'offer expires in',
    'hurry',
    'auto-renew',
    'added to cart'
  ];

  const matched = dynamicTraps.some(trap => text.includes(trap));

  if (matched) {
    console.warn("⚠️ [DarkPattern Buster] Dynamic trap detected:", node);
    
    // Highlight the trap directly on the webpage with a red border
    node.style.border = "3px solid #ef4444";
    node.style.boxShadow = "0 0 10px rgba(239, 68, 68, 0.5)";
  }
}

// Set up MutationObserver to listen for DOM changes
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => scanNode(node));
    }
  }
});

// Start observing the webpage
observer.observe(document.body, {
  childList: true,
  subtree: true
});

