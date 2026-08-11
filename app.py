import os
import json
import re
import requests
from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
CORS(app)

LLAMA_API_KEY = os.getenv("LLAMA_API_KEY", "")
LLAMA_BASE_URL = os.getenv("LLAMA_BASE_URL", "https://api.groq.com/openai/v1")
LLAMA_MODEL = os.getenv("LLAMA_MODEL", "llama-3.1-8b-instant")
PORT = int(os.getenv("PORT", 5001))

SYSTEM_PROMPT = """You are an expert web transparency auditor specializing in detecting Dark Patterns in HTML code.
Analyze the provided HTML and URL for deceptive design patterns such as:
- Basket Sneaking: Automatically adding extra products, protection plans, or warranties to cart.
- Hidden Costs: Undisclosed fees or price surges revealed only at late stages.
- Fake Urgency / Scarcity: Countdown timers, misleading stock warnings, or fake live viewer counts.
- Confirmshaming: Guilt-inducing or manipulative language on decline/cancel buttons.
- Pre-checked Opt-ins: Default selection boxes favoring merchant profits over user choice.
- Forced Continuity: Hard-to-cancel recurring subscriptions or hidden renewal clauses.

Respond strictly with a JSON object matching this schema:
{
  "honesty_score": <integer from 0 to 100>,
  "url_scanned": "<url_string>",
  "patterns_detected": [
    {
      "category": "<pattern_name>",
      "element_html_id": "<selector_or_id_or_snippet>",
      "description": "<detailed_explanation>"
    }
  ]
}
If no deceptive patterns are found, return honesty_score = 100 and patterns_detected = []."""

def clean_html(raw_html):
    soup = BeautifulSoup(raw_html, 'html.parser')
    for element in soup(['script', 'style', 'img', 'svg', 'meta', 'link', 'noscript']):
        element.decompose()
    return str(soup)

def fallback_dark_pattern_check(url, cleaned_html):
    soup = BeautifulSoup(cleaned_html, 'html.parser')
    text_content = soup.get_text().lower()
    patterns = []
    
    if re.search(r'ends in \d+|only \d+ left|hurry|timer|running out', text_content):
        patterns.append({
            "category": "Fake Urgency / Scarcity",
            "element_html_id": "countdown-timer",
            "description": "Urgency cue detected attempting to induce impulse purchasing decisions."
        })
        
    for checkbox in soup.find_all('input', {'type': 'checkbox'}):
        if checkbox.get('checked') is not None:
            patterns.append({
                "category": "Pre-checked Opt-in",
                "element_html_id": checkbox.get('id', 'checked-box'),
                "description": "Pre-selected checkbox detected automatically opting user into secondary options."
            })
            
    if re.search(r'no thanks|i hate saving|i prefer paying full', text_content):
        patterns.append({
            "category": "Confirmshaming",
            "element_html_id": "opt-out-btn",
            "description": "Manipulative decline choice phrasing designed to invoke shame or guilt."
        })
        
    if re.search(r'service fee|handling charge|convenience fee|processing fee', text_content):
        patterns.append({
            "category": "Hidden Costs",
            "element_html_id": "fee-row",
            "description": "Potential undisclosed handling or convenience surcharge detected."
        })

    score = max(20, 100 - (len(patterns) * 25))
    return {
        "honesty_score": score if patterns else 95,
        "url_scanned": url,
        "patterns_detected": patterns
    }

@app.route('/fetch-html', methods=['POST'])
def fetch_html():
    data = request.json or {}
    target_url = data.get('url', '')
    
    if not target_url:
        return jsonify({"error": "No URL provided"}), 400
        
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        resp = requests.get(target_url, headers=headers, timeout=8)
        return jsonify({"html": resp.text}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to fetch page: {str(e)}"}), 500

@app.route('/analyze', methods=['POST'])
def analyze_page():
    import time
    start_time = time.time()
    
    data = request.json or {}
    url = data.get('url', 'Unknown URL')
    raw_html = data.get('html', '')
    
    if not raw_html:
        return jsonify({"error": "No HTML provided"}), 400

    # Count raw elements before cleaning
    soup = BeautifulSoup(raw_html, 'html.parser')
    dom_count = len(soup.find_all())

    cleaned_html = clean_html(raw_html)

    if LLAMA_API_KEY and not LLAMA_API_KEY.startswith("gsk_mock"):
        try:
            client = OpenAI(api_key=LLAMA_API_KEY, base_url=LLAMA_BASE_URL)
            response = client.chat.completions.create(
                model=LLAMA_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"URL: {url}\n\nHTML Code:\n{cleaned_html[:10000]}"}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            content = response.choices[0].message.content
            result = json.loads(content)
            result["url_scanned"] = url
            result["dom_count"] = dom_count
            result["latency_ms"] = int((time.time() - start_time) * 1000)
            return jsonify(result), 200
        except Exception as e:
            fallback = fallback_dark_pattern_check(url, cleaned_html)
            fallback["api_notice"] = f"Llama API fallback engaged: {str(e)}"
            fallback["dom_count"] = dom_count
            fallback["latency_ms"] = int((time.time() - start_time) * 1000)
            return jsonify(fallback), 200

    fallback = fallback_dark_pattern_check(url, cleaned_html)
    fallback["dom_count"] = dom_count
    fallback["latency_ms"] = int((time.time() - start_time) * 1000)
    return jsonify(fallback), 200

TEST_PAGE_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>DarkPattern Buster - Standalone Llama 3.1 Tester</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background: #0f172a; color: #f8fafc; margin: 0; padding: 30px; }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { color: #38bdf8; font-size: 28px; margin-bottom: 5px; }
        p.subtitle { color: #94a3b8; margin-top: 0; margin-bottom: 25px; }
        .card { background: #1e293b; border-radius: 12px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); margin-bottom: 24px; border: 1px solid #334155; }
        label { display: block; margin-bottom: 8px; font-weight: 600; color: #cbd5e1; }
        input, textarea { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #f8fafc; font-size: 14px; margin-bottom: 16px; }
        textarea { height: 160px; font-family: monospace; resize: vertical; }
        .preset-btns { margin-bottom: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
        .btn-preset { background: #334155; border: none; color: #e2e8f0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: 0.2s; }
        .btn-preset:hover { background: #475569; color: #fff; }
        .btn-submit { background: #0284c7; border: none; color: #fff; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 15px; width: 100%; transition: 0.2s; }
        .btn-submit:hover { background: #0369a1; }
        #results { display: none; }
        .score-box { text-align: center; padding: 20px; border-radius: 12px; margin-bottom: 20px; background: #0f172a; border: 2px solid #334155; }
        .score-number { font-size: 54px; font-weight: 800; }
        .status-badge { text-transform: uppercase; font-weight: 700; letter-spacing: 1px; margin-top: 8px; }
        .pill-list { display: flex; flex-direction: column; gap: 10px; padding: 0; list-style: none; margin-top: 15px; }
        .pill-item { background: #0f172a; padding: 14px 18px; border-radius: 8px; border-left: 4px solid #ef4444; }
        .pill-category { font-weight: 700; color: #f87171; display: block; margin-bottom: 4px; }
        .pill-desc { color: #cbd5e1; font-size: 13px; }
        .theme-green { color: #4ade80; border-color: #22c55e; }
        .theme-yellow { color: #facc15; border-color: #eab308; }
        .theme-red { color: #f87171; border-color: #ef4444; }
    </style>
</head>
<body>
    <div class="container">
        <h1>DarkPattern Buster</h1>
        <p class="subtitle">Standalone Llama 3.1 Web Audit Tester (No Browser Extension Required)</p>
        
        <div class="card">
            <label for="target-url">Target Webpage URL</label>
            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                <input type="text" id="target-url" placeholder="https://example.com" style="margin-bottom:0;">
                <button type="button" class="btn-preset" onclick="fetchLiveHtml()" style="white-space: nowrap; background: #0284c7; color: white;">Fetch HTML</button>
            </div>
            
            <label>Load Preset Test Scenarios</label>
            <div class="preset-btns">
                <button class="btn-preset" onclick="loadPreset('urgency')">Fake Urgency & Scarcity</button>
                <button class="btn-preset" onclick="loadPreset('hidden')">Hidden Costs & Pre-checked Opt-in</button>
                <button class="btn-preset" onclick="loadPreset('confirmshaming')">Confirmshaming</button>
                <button class="btn-preset" onclick="loadPreset('honest')">Honest Webpage</button>
            </div>

            <label for="html-code">Webpage HTML Content</label>
            <textarea id="html-code" placeholder="Paste webpage HTML snippet here..."></textarea>
            
            <button class="btn-submit" onclick="runAnalysis()">Run Llama 3.1 Audit</button>
        </div>

        <div id="results" class="card">
            <div class="score-box" id="score-card">
                <div class="score-number" id="score-val">--</div>
                <div class="status-badge" id="status-txt">--</div>
            </div>
            
            <h3>Detected Patterns (<span id="count-val">0</span>)</h3>
            <ul class="pill-list" id="pattern-list"></ul>
        </div>
    </div>

    <script>
        const PRESETS = {
            urgency: `<div class="checkout-banner">
  <h2>Order Summary</h2>
  <div class="timer">Hurry! Offer ends in 04:59 minutes!</div>
  <p class="stock">Only 2 items left in stock - 14 people viewing this!</p>
  <button>Complete Purchase</button>
</div>`,
            hidden: `<div class="cart-totals">
  <p>Subtotal: $49.99</p>
  <p>Mandatory Processing Fee: $8.50</p>
  <label><input type="checkbox" id="warranty" checked> Automatically add 2-year warranty ($14.99)</label>
</div>`,
            confirmshaming: `<div class="popup-offer">
  <h3>Claim 20% Discount Now</h3>
  <button>Yes, Save Money</button>
  <button id="decline">No thanks, I hate saving money and prefer paying full price</button>
</div>`,
            honest: `<div class="product-page">
  <h1>Standard Wireless Mouse</h1>
  <p>Price: $25.00</p>
  <p>In stock. Ships standard in 3 business days.</p>
  <button>Add to Cart</button>
</div>`
        };

        function loadPreset(key) {
            document.getElementById('html-code').value = PRESETS[key] || '';
        }

        loadPreset('urgency');

        async function fetchLiveHtml() {
            const url = document.getElementById('target-url').value;
            const textarea = document.getElementById('html-code');
            
            if (!url) return alert('Please enter a target URL');
            
            textarea.value = 'Fetching live HTML from target URL...';
            
            try {
                const res = await fetch('/fetch-html', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const data = await res.json();
                
                if (data.html) {
                    textarea.value = data.html;
                } else {
                    textarea.value = '';
                    alert('Fetch Error: ' + (data.error || 'Failed to fetch HTML'));
                }
            } catch (err) {
                textarea.value = '';
                alert('Fetch Error: ' + err.message);
            }
        }

        async function runAnalysis() {
            const url = document.getElementById('target-url').value;
            const html = document.getElementById('html-code').value;
            const resultsDiv = document.getElementById('results');
            
            if (!html.trim()) {
                alert('Please enter or fetch HTML code to analyze.');
                return;
            }

            resultsDiv.style.display = 'block';
            document.getElementById('score-val').innerText = '...';
            document.getElementById('status-txt').innerText = 'ANALYZING WITH LLAMA 3.1...';
            document.getElementById('pattern-list').innerHTML = '';

            try {
                const res = await fetch('/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, html })
                });
                const data = await res.json();

                const score = data.honesty_score;
                const scoreVal = document.getElementById('score-val');
                const statusTxt = document.getElementById('status-txt');
                const scoreCard = document.getElementById('score-card');
                const patternList = document.getElementById('pattern-list');
                const countVal = document.getElementById('count-val');

                scoreVal.innerText = score;
                scoreCard.className = 'score-box';

                if (score >= 80) {
                    scoreCard.classList.add('theme-green');
                    statusTxt.innerText = 'LOOKS HONEST';
                } else if (score >= 50) {
                    scoreCard.classList.add('theme-yellow');
                    statusTxt.innerText = 'SOME DECEPTIVE PATTERNS';
                } else {
                    scoreCard.classList.add('theme-red');
                    statusTxt.innerText = 'HIGHLY MANIPULATIVE';
                }

                const patterns = data.patterns_detected || [];
                countVal.innerText = patterns.length;
                patternList.innerHTML = '';

                if (patterns.length === 0) {
                    patternList.innerHTML = '<li class="pill-item" style="border-left-color:#22c55e;"><span class="pill-category" style="color:#4ade80;">No Dark Patterns Detected</span><span class="pill-desc">Page appears transparent and user-friendly.</span></li>';
                } else {
                    patterns.forEach(p => {
                        const li = document.createElement('li');
                        li.className = 'pill-item';
                        li.innerHTML = '<span class="pill-category">' + p.category + '</span>' +
                                       '<span class="pill-desc">' + p.description + ' (' + p.element_html_id + ')</span>';
                        patternList.appendChild(li);
                    });
                }
            } catch (err) {
                alert('Analysis failed: ' + err.message);
            }
        }
    </script>
</body>
</html>"""

@app.route('/test', methods=['GET'])
def test_page():
    return render_template_string(TEST_PAGE_TEMPLATE)

if __name__ == '__main__':
    print(f"DarkPattern Buster API running on http://localhost:{PORT}")
    print(f"Access standalone web tester at: http://localhost:{PORT}/test")
    app.run(debug=True, port=PORT)
