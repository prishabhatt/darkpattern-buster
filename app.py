from flask import Flask, request, jsonify
from flask_cors import CORS
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app) 

def clean_html(raw_html):
    
    soup = BeautifulSoup(raw_html, 'html.parser')
    
    
    for element in soup(['script', 'style', 'img', 'svg', 'meta', 'link', 'noscript']):
        element.decompose()
        
    return str(soup)

@app.route('/analyze', methods=['POST'])
def analyze_page():
    data = request.json
    url = data.get('url', 'Unknown URL')
    raw_html = data.get('html', '')
    
    if not raw_html:
        return jsonify({"error": "No HTML provided"}), 400

    
    print(f"\n📥 Received request for: {url}", flush=True)
    print(f"📦 Raw HTML length: {len(raw_html)} characters", flush=True)

    cleaned_html = clean_html(raw_html)
    print(f"🧹 Cleaned HTML length: {len(cleaned_html)} characters\n", flush=True)

    mock_response = {
        "honesty_score": 85,
        "url_scanned": url,
        "patterns_detected": [
            {
                "category": "System Connected",
                "element_html_id": "none",
                "description": "The Flask API Gateway and HTML Sanitizer are successfully running."
            }
        ]
    }
    
    return jsonify(mock_response), 200

if __name__ == '__main__':
    print("🚀 DarkPattern Buster API Gateway running on http://localhost:5001...")
    app.run(debug=True, port=5001)
