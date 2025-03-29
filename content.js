console.log("Content script is running! Frame ID:", window.frameElement ? window.frameElement.id : "main document");

let isEnabled = false;
let solPriceInUsd = 0; // Changed from solPriceInGbp to solPriceInUsd
const originalPrices = new Map();

// Function to generate a unique ID for each price element
let priceCounter = 0;
function generatePriceId() {
  return `price-${priceCounter++}`;
}

// Debounce function to limit how often convertPrices runs
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Function to collect text nodes, including those in shadow DOM and iframes
function collectTextNodes(root) {
  const textNodes = [];
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push({ node, parent: node.parentNode });
    }
    const elements = root.querySelectorAll("*");
    elements.forEach((element) => {
      if (element.shadowRoot) {
        console.log("Found shadow DOM, traversing...");
        textNodes.push(...collectTextNodes(element.shadowRoot));
      }
    });
    const iframes = root.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        if (iframe.contentDocument) {
          console.log("Found iframe, traversing contentDocument...");
          console.log("Iframe sandbox attribute:", iframe.getAttribute("sandbox"));
          textNodes.push(...collectTextNodes(iframe.contentDocument));
        } else {
          console.log("Cannot access iframe contentDocument (cross-origin or sandboxed).");
        }
      } catch (error) {
        console.error("Error accessing iframe contentDocument:", error);
      }
    });
  } catch (error) {
    console.error("Error collecting text nodes from DOM, shadow DOM, or iframes:", error);
  }
  return textNodes;
}

// Function to collect elements with price-like attributes
function collectPriceAttributes(root) {
  const elementsWithPrices = [];
  const priceRegex = /[£\$]\s*\d{1,3}(,\d{3})*(\.\d{1,2})?\b/;
  try {
    const elements = root.querySelectorAll("*");
    elements.forEach((element) => {
      for (const attr of element.attributes) {
        const attrValue = attr.value;
        if (priceRegex.test(attrValue)) {
          console.log(`Found price in attribute: ${attr.name}="${attrValue}" on element:`, element);
          elementsWithPrices.push({ element, attrName: attr.name, attrValue });
        } else if (attrValue.includes("$") || attrValue.includes("£")) {
          console.log(`Potential price in attribute not matched by regex: ${attr.name}="${attrValue}" on element:`, element);
        }
      }
      if (element.shadowRoot) {
        elementsWithPrices.push(...collectPriceAttributes(element.shadowRoot));
      }
      const iframes = root.querySelectorAll("iframe");
      iframes.forEach((iframe) => {
        try {
          if (iframe.contentDocument) {
            console.log("Found iframe, traversing contentDocument for attributes...");
            console.log("Iframe sandbox attribute:", iframe.getAttribute("sandbox"));
            elementsWithPrices.push(...collectPriceAttributes(iframe.contentDocument));
          }
        } catch (error) {
          console.error("Error accessing iframe contentDocument for attributes:", error);
        }
      });
    });
  } catch (error) {
    console.error("Error collecting price attributes:", error);
  }
  return elementsWithPrices;
}

// Function to collect Amazon price elements (e.g., class="a-price")
function collectAmazonPriceElements(root) {
  const priceElements = [];
  try {
    const elements = root.querySelectorAll(".a-price, .a-offscreen, [data-a-price]");
    elements.forEach((element) => {
      let priceText = "";
      const symbol = element.querySelector(".a-price-symbol")?.textContent || "";
      const whole = element.querySelector(".a-price-whole")?.textContent || "";
      const decimal = element.querySelector(".a-price-decimal")?.textContent || "";
      const fraction = element.querySelector(".a-price-fraction")?.textContent || "";
      priceText = `${symbol}${whole}${decimal}${fraction}`.trim();
      if (element.classList.contains("a-offscreen")) {
        priceText = element.textContent.trim();
      }
      if (priceText && /[£\$]\s*\d{1,3}(,\d{3})*(\.\d{1,2})?\b/.test(priceText)) {
        console.log(`Found Amazon price element: ${priceText}`, element);
        priceElements.push({ element, priceText });
      } else if (priceText.includes("$") || priceText.includes("£")) {
        console.log(`Potential Amazon price not matched by regex: ${priceText}`, element);
      }
    });
    const elementsWithShadow = root.querySelectorAll("*");
    elementsWithShadow.forEach((element) => {
      if (element.shadowRoot) {
        priceElements.push(...collectAmazonPriceElements(element.shadowRoot));
      }
    });
    const iframes = root.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      try {
        if (iframe.contentDocument) {
          priceElements.push(...collectAmazonPriceElements(iframe.contentDocument));
        }
      } catch (error) {
        console.error("Error accessing iframe contentDocument for Amazon prices:", error);
      }
    });
  } catch (error) {
    console.error("Error collecting Amazon price elements:", error);
  }
  return priceElements;
}

// Function to convert prices
function convertPrices(pricesData) {
  if (!isEnabled) {
    console.log("Extension is disabled, skipping price conversion.");
    return;
  }

  solPriceInUsd = pricesData.solPriceInGbp; // Using the USD price directly
  console.log("convertPrices called with SOL price (in USD):", solPriceInUsd);

  if (solPriceInUsd === 0) {
    console.log("SOL price is 0, cannot convert prices.");
    return;
  }

  const priceRegex = /[£\$]\s*\d{1,3}(,\d{3})*(\.\d{1,2})?\b/g;
  console.log("Testing priceRegex on $19.99:", priceRegex.test("$19.99"));
  console.log("Testing priceRegex on £29.99:", priceRegex.test("£29.99"));
  console.log("Testing priceRegex on $1,000:", priceRegex.test("$1,000"));
  console.log("Testing priceRegex on £1,000:", priceRegex.test("£1,000"));
  console.log("Testing priceRegex on $25.49:", priceRegex.test("$25.49"));
  console.log("Testing priceRegex on $29.99:", priceRegex.test("$29.99"));

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

      const currency = priceText.startsWith("£") ? "GBP" : "USD";
      let priceValue = parseFloat(priceText.replace(/[£$,\s]/g, ""));

      // Since we're using USD price directly, assume all prices are in USD for simplicity
      // If the price is in GBP, we'll need to fetch the GBP/USD rate in the future
      const solValue = (priceValue / solPriceInUsd).toFixed(2);
      console.log(`Converted ${priceText} (${currency}) to ${solValue} SOL (Amazon price)`);

      const priceSpan = document.createElement("span");
      priceSpan.setAttribute("data-price-id", priceId);

      // Replace SVG with the Solana icon
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
        if (text.includes("$") || text.includes("£")) {
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

      const currency = match.startsWith("£") ? "GBP" : "USD";
      let priceValue = parseFloat(match.replace(/[£$,\s]/g, ""));

      const solValue = (priceValue / solPriceInUsd).toFixed(2);
      console.log(`Converted ${match} (${currency}) to ${solValue} SOL`);

      const priceSpan = document.createElement("span");
      priceSpan.setAttribute("data-price-id", priceId);

      // Replace SVG with the solsana icon
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

      const currency = match.startsWith("£") ? "GBP" : "USD";
      let priceValue = parseFloat(match.replace(/[£$,\s]/g, ""));

      const solValue = (priceValue / solPriceInUsd).toFixed(2);
      console.log(`Converted ${match} (${currency}) to ${solValue} SOL (from attribute)`);

      const priceSpan = document.createElement("span");
      priceSpan.setAttribute("data-price-id", priceId);

      // Replace SVG with the Solana icon
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

// Function to revert prices to their original values
function revertPrices() {
  console.log("Reverting prices to original values...");
  console.log("originalPrices Map size:", originalPrices.size);

  originalPrices.forEach((data, priceId) => {
    try {
      if (data.type === "text") {
        const { text, parent } = data;
        console.log("Attempting to revert price with priceId:", priceId);
        const priceSpan = parent.querySelector(`span[data-price-id="${priceId}"]`);
        if (!priceSpan || !document.body.contains(parent)) {
          console.log("Skipping price: span or parent no longer in the DOM, priceId:", priceId);
          return;
        }
        const newTextNode = document.createTextNode(text);
        parent.replaceChild(newTextNode, priceSpan);
        console.log("Reverted price for priceId:", priceId, "to:", text);
      } else if (data.type === "attribute") {
        const { text, element, attrName } = data;
        console.log("Attempting to revert attribute price with priceId:", priceId);
        const priceSpan = element.querySelector(`span[data-price-id="${priceId}"]`);
        if (priceSpan && document.body.contains(element)) {
          element.removeChild(priceSpan);
        }
        element.setAttribute(attrName, text);
        console.log("Reverted attribute price for priceId:", priceId, "to:", text);
      } else if (data.type === "amazon-price") {
        const { text, element } = data;
        console.log("Attempting to revert Amazon price with priceId:", priceId);
        const priceSpan = document.querySelector(`span[data-price-id="${priceId}"]`);
        if (!priceSpan || !document.body.contains(priceSpan)) {
          console.log("Skipping Amazon price: span no longer in the DOM, priceId:", priceId);
          return;
        }
        const originalPriceSpan = document.createElement("span");
        originalPriceSpan.className = "a-price";
        originalPriceSpan.textContent = text;
        priceSpan.parentNode.replaceChild(originalPriceSpan, priceSpan);
        console.log("Reverted Amazon price for priceId:", priceId, "to:", text);
      }
    } catch (error) {
      console.error("Error reverting price for priceId:", priceId, error);
    }
  });

  originalPrices.clear();
  console.log("Finished reverting prices. originalPrices Map size after clear:", originalPrices.size);
}

// Function to request SOL price with retry
function requestSolPrice(attempts = 5, delay = 2000) {
  console.log("Requesting SOL price, attempts left:", attempts);
  chrome.runtime.sendMessage({ type: "getSolPrice" }, (response) => {
    console.log("Received response from background script:", response);
    if (response && response.solPriceInGbp > 0) {
      solPriceInUsd = response.solPriceInGbp; // Using the USD price directly
      convertPrices({ solPriceInGbp: solPriceInUsd });
    } else if (attempts > 0) {
      console.log("SOL price not ready, retrying...");
      setTimeout(() => requestSolPrice(attempts - 1, delay), delay);
    } else {
      console.log("Failed to fetch SOL price after retries");
    }
  });
}

// Set up a MutationObserver to handle dynamic content
const debouncedConvertPrices = debounce(convertPrices, 300);

const observer = new MutationObserver((mutations) => {
  if (isEnabled && solPriceInUsd > 0) {
    console.log("DOM changed, scheduling price conversion...");
    console.log("Mutations observed:", mutations.length);
    debouncedConvertPrices({ solPriceInGbp: solPriceInUsd });
  }
});

try {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  console.log("MutationObserver set up successfully.");
} catch (error) {
  console.error("Error setting up MutationObserver:", error);
}

// Load the initial state and run the conversion if enabled
try {
  chrome.storage.local.get("isEnabled", (data) => {
    isEnabled = data.isEnabled || false;
    console.log("Initial isEnabled state:", isEnabled);
    if (isEnabled) {
      requestSolPrice();
    } else {
      console.log("Extension is disabled on page load.");
    }
  });
} catch (error) {
  console.error("Error accessing chrome.storage.local:", error);
}

// Listen for toggle messages from the popup
console.log("Setting up message listener...");
try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message listener triggered, message received:", message);
    if (message.type === "toggleState") {
      console.log("Toggle state message received, isEnabled:", message.isEnabled);
      isEnabled = message.isEnabled;
      console.log("Toggle state changed, isEnabled:", isEnabled);

      sendResponse({ status: "Toggle received" });
      console.log("Response sent to popup: { status: 'Toggle received' }");

      if (isEnabled) {
        requestSolPrice();
      } else {
        revertPrices();
      }
    } else {
      console.log("Unknown message type received:", message.type);
    }
    return true;
  });
  console.log("Message listener set up successfully.");
} catch (error) {
  console.error("Error setting up message listener:", error);
}

// Force multiple re-runs of convertPrices to catch late-loaded content
const reRunIntervals = [2000, 5000, 10000, 15000, 20000];
reRunIntervals.forEach((delay) => {
  setTimeout(() => {
    if (isEnabled && solPriceInUsd > 0) {
      console.log(`Running delayed price conversion after ${delay}ms to catch late-loaded content...`);
      convertPrices({ solPriceInGbp: solPriceInUsd });
    }
  }, delay);
});

console.log("Content script loaded completely.");