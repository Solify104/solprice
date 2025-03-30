# Solana Price Converter

A Chrome extension that converts prices on webpages to SOL (Solana) using real-time Solana prices.

## Features
- Fetches the latest SOL price in USD every 5 minutes.
- Converts prices on webpages to their equivalent in SOL.
- Displays the current SOL price in a popup.
- Uses a proxy server to handle API requests and caching for better reliability.

## Installation
1. Install the extension from the Chrome Web Store (link will be added after publication).
2. Click the extension icon in the Chrome toolbar to open the popup and view the current SOL price.
3. Visit any webpage, and the extension will automatically convert prices to SOL (if configured to do so).

## How It Works
- The extension uses a background script (`background.js`) to fetch the SOL price every 5 minutes from a proxy server.
- The proxy server (`https://solify-it-proxy.onrender.com`) fetches the price from CoinGecko (with a Binance fallback) every 10 minutes and caches it to reduce API calls.
- A content script (`content.js`) runs on webpages to convert prices to SOL.
- The popup (`popup.html`) displays the current SOL price.

## Development
To run the extension locally:
1. Clone this repository: `git clone https://github.com/Solify104/solprice.git`
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top-right toggle).
4. Click "Load unpacked" and select the `solprice` folder.
5. The extension will load and be ready to use.

## Dependencies
The proxy server (in a separate repository: `https://github.com/Solify104/solify-it-proxy`) uses the following dependencies:
- `express`: Web framework for Node.js.
- `axios`: For making HTTP requests to CoinGecko and Binance APIs.
- `cors`: To enable CORS for the Chrome extension.

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact
For questions or feedback, please open an issue on this repository or contact the developer at [your-email@example.com] (replace with your email if desired).