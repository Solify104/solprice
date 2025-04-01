// Check if the page is a restricted URL before running the content script
const currentUrl = window.location.href;
if (
  currentUrl.startsWith("chrome://") ||
  currentUrl.startsWith("chrome-extension://") ||
  currentUrl.startsWith("about:") ||
  currentUrl.startsWith("file://") ||
  currentUrl === "" ||
  currentUrl === "about:blank" ||
  currentUrl.includes("chrome-extension://") ||
  currentUrl.includes("chrome.google.com/webstore") ||
  currentUrl.includes("edge://")
) {
  console.log("Content script cannot run on this page:", currentUrl);
  return;
}

let isEnabled = false;
let solPriceInUsd = 0;
const originalPrices = new Map();

function generatePriceId() {
  return "price-" + Math.random().toString(36).substr(2, 9);
}

function collectTextNodes(node, textNodes = []) {
  if (!node) return textNodes;

  if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
    textNodes.push({ node, parent: node.parentNode });
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.tagName === "SCRIPT" || node.tagName === "STYLE") {
      return textNodes;
    }

    if (node.shadowRoot) {
      collectTextNodes(node.shadowRoot, textNodes);
    }

    for (let child of node.childNodes) {
      collectTextNodes(child, textNodes);
    }

    if (node.tagName === "IFRAME" && node.contentDocument) {
      collectTextNodes(node.contentDocument.body, textNodes);
    }
  }
  return textNodes;
}

function collectPriceAttributes(node, elements = []) {
  if (!node) return elements;

  if (node.nodeType === Node.ELEMENT_NODE) {
    const attrs = node.attributes;
    for (let attr of attrs) {
      const attrValue = attr.value;
      if (attrValue && /[£\$€C\$¥CN¥]\s*\d{1,3}(,\d{3})*(\.\d{1,2})?\b/.test(attrValue)) {
        elements.push({ element: node, attrName: attr.name, attrValue });
      }
    }

    if (node.shadowRoot) {
      collectPriceAttributes(node.shadowRoot, elements);
    }

    for (let child of node.childNodes) {
      collectPriceAttributes(child, elements);
    }

    if (node.tagName === "IFRAME" && node.contentDocument) {
      collectPriceAttributes(node.contentDocument.body, elements);
    }
  }
  return elements;
}

function collectAmazonPriceElements(node, elements = []) {
  if (!node) return elements;

  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.classList.contains("a-price")) {
      const priceElement = node.querySelector(".a-offscreen");
      if (priceElement) {
        const priceText = priceElement.textContent.trim();
        if (/[£\$€C\$¥CN¥]\s*\d{1,3}(,\d{3})*(\.\d{1,2})?\b/.test(priceText)) {
          elements.push({ element: priceElement, priceText });
        }
      }
    }

    if (node.shadowRoot) {
      collectAmazonPriceElements(node.shadowRoot, elements);
    }

    for (let child of node.childNodes) {
      collectAmazonPriceElements(child, elements);
    }

    if (node.tagName === "IFRAME" && node.contentDocument) {
      collectAmazonPriceElements(node.contentDocument.body, elements);
    }
  }
  return elements;
}

function convertPrices(pricesData) {
  if (!isEnabled) {
    console.log("Extension is disabled, skipping price conversion.");
    return;
  }

  solPriceInUsd = pricesData.solPriceInUsd;
  const exchangeRates = pricesData.exchangeRates || {};
  const gbpToUsdRate = exchangeRates.gbpToUsdRate || 1;
  const eurToUsdRate = exchangeRates.eurToUsdRate || 1;
  const cadToUsdRate = exchangeRates.cadToUsdRate || 1;
  const jpyToUsdRate = exchangeRates.jpyToUsdRate || 1;
  const cnyToUsdRate = exchangeRates.cnyToUsdRate || 1;

  console.log("convertPrices called with SOL price (in USD):", solPriceInUsd, "Exchange rates:", exchangeRates);

  if (solPriceInUsd === 0) {
    console.log("SOL price is 0, cannot convert prices.");
    return;
  }

  const priceRegex = /[£\$€C\$¥CN¥]\s*\d{1,3}(,\d{3})*(\.\d{1,2})?\b/g;
  console.log("Testing priceRegex on $19.99:", priceRegex.test("$19.99"));
  console.log("Testing priceRegex on £29.99:", priceRegex.test("£29.99"));
  console.log("Testing priceRegex on €39.99:", priceRegex.test("€39.99"));
  console.log("Testing priceRegex on C$49.99:", priceRegex.test("C$49.99"));
  console.log("Testing priceRegex on ¥5999:", priceRegex.test("¥5999"));
  console.log("Testing priceRegex on CN¥6999:", priceRegex.test("CN¥6999"));

  const textNodes = collectTextNodes(document.body);
  console.log("Collected text nodes:", textNodes.length);

  const elementsWithPriceAttrs = collectPriceAttributes(document.body);
  console.log("Collected elements with price attributes:", elementsWithPriceAttrs.length);

  const amazonPriceElements = collectAmazonPriceElements(document.body);
  console.log("Collected Amazon price elements:", amazonPriceElements.length);

  amazonPriceElements.forEach(({ element, priceText }) => {
    try {
      if (!document.body.contains(element)) {
        console.log("Skipping Amazon price element: no longer in the DOM");
        return;
      }

      const priceId = generatePriceId();
      originalPrices.set(priceId, { text: priceText, element, type: "amazon-price" });

      let currency = "USD";
      let exchangeRate = 1;
      if (priceText.startsWith("£")) {
        currency = "GBP";
        exchangeRate = gbpToUsdRate;
      } else if (priceText.startsWith("€")) {
        currency = "EUR";
        exchangeRate = eurToUsdRate;
      } else if (priceText.startsWith("C$")) {
        currency = "CAD";
        exchangeRate = cadToUsdRate;
      } else if (priceText.startsWith("¥") || priceText.startsWith("CN¥")) {
        currency = priceText.startsWith("CN¥") ? "CNY" : "JPY";
        exchangeRate = currency === "CNY" ? cnyToUsdRate : jpyToUsdRate;
      }

      let priceValue = parseFloat(priceText.replace(/[£\$€C\$¥CN¥,\s]/g, ""));
      priceValue *= exchangeRate; // Convert to USD
      const solValue = (priceValue / solPriceInUsd).toFixed(2);
      console.log(`Converted ${priceText} (${currency}) to ${solValue} SOL (Amazon price)`);

      const priceSpan = document.createElement("span");
      priceSpan.setAttribute("data-price-id", priceId);

      const icon = document.createElement("img");
      icon.src = chrome.runtime.getURL("solana-icon.png");
      icon.setAttribute("width", "20");
      icon.setAttribute("height", "20");
      icon.setAttribute("style", "vertical-align: -4px; margin-right: 4px; display: inline-block;");
      priceSpan.appendChild(icon);

      priceSpan.appendChild(document.createTextNode(solValue));
      element.parentNode.replaceChild(priceSpan, element);
      console.log("Amazon price element replaced successfully with icon and price, priceId:", priceId);
    } catch (error) {
      console.error("Error processing Amazon price element:", error);
    }
  });

  console.log("Starting to process text nodes...");
  textNodes.forEach(({ node, parent }) => {
    try {
      if (!parent || !document.body.contains(node)) {
        console.log("Skipping node: no longer in the DOM");
        return;
      }

      const text = node.nodeValue;
      console.log("Original text node value:", text, "Parent element:", parent);

      if (!priceRegex.test(text)) {
        console.log("No price found in text, skipping:", text);
        if (text.match(/[£\$€C\$¥CN¥]/)) {
          console.log("Potential price not matched by regex:", text, "Parent element:", parent);
        }
        return;
      }

      const priceId = generatePriceId();
      originalPrices.set(priceId, { text, parent, type: "text" });

      const fragment = document.createDocumentFragment();
      const match = text.match(priceRegex)[0];
      const beforePrice = text.substring(0, text.indexOf(match));
      const afterPrice = text.substring(text.indexOf(match) + match.length);

      console.log("Before price:", beforePrice);
      console.log("Matched price:", match);
      console.log("After price:", afterPrice);

      if (beforePrice) {
        fragment.appendChild(document.createTextNode(beforePrice));
      }

      let currency = "USD";
      let exchangeRate = 1;
      if (match.startsWith("£")) {
        currency = "GBP";
        exchangeRate = gbpToUsdRate;
      } else if (match.startsWith("€")) {
        currency = "EUR";
        exchangeRate = eurToUsdRate;
      } else if (match.startsWith("C$")) {
        currency = "CAD";
        exchangeRate = cadToUsdRate;
      } else if (match.startsWith("¥") || match.startsWith("CN¥")) {
        currency = match.startsWith("CN¥") ? "CNY" : "JPY";
        exchangeRate = currency === "CNY" ? cnyToUsdRate : jpyToUsdRate;
      }

      let priceValue = parseFloat(match.replace(/[£\$€C\$¥CN¥,\s]/g, ""));
      priceValue *= exchangeRate; // Convert to USD
      const solValue = (priceValue / solPriceInUsd).toFixed(2);
      console.log(`Converted ${match} (${currency}) to ${solValue} SOL`);

      const priceSpan = document.createElement("span");
      priceSpan.setAttribute("data-price-id", priceId);

      const icon = document.createElement("img");
      icon.src = chrome.runtime.getURL("solana-icon.png");
      icon.setAttribute("width", "14");
      icon.setAttribute("height", "14");
      icon.setAttribute("style", "vertical-align: -2px; margin-right: 2px; display: inline-block;");
      priceSpan.appendChild(icon);

      priceSpan.appendChild(document.createTextNode(solValue));
      fragment.appendChild(priceSpan);

      if (afterPrice) {
        fragment.appendChild(document.createTextNode(afterPrice));
      }

      parent.insertBefore(fragment, node);
      parent.removeChild(node);
      console.log("Node replaced successfully with icon and price, priceId:", priceId);
    } catch (error) {
      console.error("Error processing text node:", error);
    }
  });

  console.log("Starting to process elements with price attributes...");
  elementsWithPriceAttrs.forEach(({ element, attrName, attrValue }) => {
    try {
      const match = attrValue.match(priceRegex)[0];
      if (!match) {
        console.log("No price found in attribute, skipping:", attrValue);
        return;
      }

      const priceId = generatePriceId();
      originalPrices.set(priceId, { text: attrValue, element, attrName, type: "attribute" });

      let currency = "USD";
      let exchangeRate = 1;
      if (match.startsWith("£")) {
        currency = "GBP";
        exchangeRate = gbpToUsdRate;
      } else if (match.startsWith("€")) {
        currency = "EUR";
        exchangeRate = eurToUsdRate;
      } else if (match.startsWith("C$")) {
        currency = "CAD";
        exchangeRate = cadToUsdRate;
      } else if (match.startsWith("¥") || match.startsWith("CN¥")) {
        currency = match.startsWith("CN¥") ? "CNY" : "JPY";
        exchangeRate = currency === "CNY" ? cnyToUsdRate : jpyToUsdRate;
      }

      let priceValue = parseFloat(match.replace(/[£\$€C\$¥CN¥,\s]/g, ""));
      priceValue *= exchangeRate; // Convert to USD
      const solValue = (priceValue / solPriceInUsd).toFixed(2);
      console.log(`Converted ${match} (${currency}) to ${solValue} SOL (from attribute)`);

      const priceSpan = document.createElement("span");
      priceSpan.setAttribute("data-price-id", priceId);

      const icon = document.createElement("img");
      icon.src = chrome.runtime.getURL("solana-icon.png");
      icon.setAttribute("width", "14");
      icon.setAttribute("height", "14");
      icon.setAttribute("style", "vertical-align: -2px; margin-right: 2px; display: inline-block;");
      priceSpan.appendChild(icon);

      priceSpan.appendChild(document.createTextNode(solValue));
      element.setAttribute(attrName, solValue);
      element.appendChild(priceSpan);
      console.log("Attribute replaced successfully with icon and price, priceId:", priceId);
    } catch (error) {
      console.error("Error processing price attribute:", error);
    }
  });

  console.log("Finished processing text nodes, attributes, and Amazon prices.");
  console.log("Current state of originalPrices Map:", originalPrices.size);
}

function revertPrices() {
  console.log("Reverting prices...");
  for (const [priceId, { text, element, parent, attrName, type }] of originalPrices) {
    try {
      if (type === "text") {
        const priceSpan = document.querySelector(`span[data-price-id="${priceId}"]`);
        if (priceSpan && parent && document.body.contains(priceSpan)) {
          parent.insertBefore(document.createTextNode(text), priceSpan);
          parent.removeChild(priceSpan);
          console.log("Reverted text node, priceId:", priceId);
        }
      } else if (type === "attribute") {
        const priceSpan = document.querySelector(`span[data-price-id="${priceId}"]`);
        if (priceSpan && element && document.body.contains(element)) {
          element.setAttribute(attrName, text);
          element.removeChild(priceSpan);
          console.log("Reverted attribute, priceId:", priceId);
        }
      } else if (type === "amazon-price") {
        const priceSpan = document.querySelector(`span[data-price-id="${priceId}"]`);
        if (priceSpan && element && document.body.contains(priceSpan)) {
          element.textContent = text;
          priceSpan.parentNode.replaceChild(element, priceSpan);
          console.log("Reverted Amazon price element, priceId:", priceId);
        }
      }
    } catch (error) {
      console.error("Error reverting price, priceId:", priceId, error);
    }
  }
  originalPrices.clear();
  console.log("All prices reverted, originalPrices cleared.");
}

function requestSolPrice() {
  return new Promise((resolve, reject) => {
    // Check if the extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
      console.error("Extension context invalidated, cannot send message.");
      reject(new Error("Extension context invalidated"));
      return;
    }

    let attempts = 3;
    const delay = 5000;

    const trySendMessage = (attempt) => {
      chrome.runtime.sendMessage({ type: "getSolPrice" }, (response) => {
        // Check for runtime errors (e.g., context invalidated)
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError.message);
          if (attempt > 1) {
            console.log(`Retrying in ${delay / 1000} seconds... (${attempt - 1} attempts left)`);
            setTimeout(() => trySendMessage(attempt - 1), delay);
          } else {
            console.error("All attempts to send message failed.");
            reject(new Error("Failed to communicate with background script"));
          }
          return;
        }

        if (response && response.solPriceInUsd) {
          console.log("Received SOL price from background:", response);
          resolve(response);
        } else {
          console.error("Failed to get SOL price, response:", response);
          if (attempt > 1) {
            console.log(`Retrying in ${delay / 1000} seconds... (${attempt - 1} attempts left)`);
            setTimeout(() => trySendMessage(attempt - 1), delay);
          } else {
            console.error("All attempts to fetch SOL price failed.");
            reject(new Error("Failed to fetch SOL price"));
          }
        }
      });
    };

    trySendMessage(attempts);
  });
}

const debouncedConvertPrices = debounce(async () => {
  if (!chrome.runtime || !chrome.runtime.id) {
    console.error("Extension context invalidated, skipping price conversion.");
    return;
  }

  try {
    const pricesData = await requestSolPrice();
    convertPrices(pricesData);
  } catch (error) {
    console.error("Error in debouncedConvertPrices:", error.message);
  }
}, 500);

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (!chrome.runtime || !chrome.runtime.id) {
        console.error("Extension context invalidated, cancelling debounced function.");
        return;
      }
      func.apply(this, args);
    }, wait);
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in content script:", message);
  if (message.type === "toggleState") {
    isEnabled = message.isEnabled;
    console.log("Toggled state to:", isEnabled);
    if (isEnabled) {
      debouncedConvertPrices();
    } else {
      revertPrices();
    }
    sendResponse({ status: "success" });
  } else if (message.type === "ping") {
    sendResponse({ status: "pong" });
  }
});

const observer = new MutationObserver((mutations) => {
  console.log("DOM mutations observed:", mutations.length);
  if (isEnabled) {
    debouncedConvertPrices();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

// Simplified initial calls: one initial call after 2 seconds
const initialTimeout = setTimeout(debouncedConvertPrices, 2000);

// Clean up on extension unload
chrome.runtime.onSuspend.addListener(() => {
  console.log("Extension is being unloaded, cleaning up...");
  observer.disconnect();
  clearTimeout(initialTimeout);
  revertPrices();
});

chrome.storage.local.get("isEnabled", (data) => {
  isEnabled = data.isEnabled || false;
  console.log("Initial state loaded:", isEnabled);
  if (isEnabled) {
    debouncedConvertPrices();
  }
});