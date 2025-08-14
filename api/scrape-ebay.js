// api/scrape-ebay.js - Vercel Serverless Function
const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

// Decodo proxy configuration
const DECODO_PROXY = 'http://sp4c5esam0:j1w8CnMf2ktsLz=m8A@gate.decodo.com:10001';
const proxyAgent = new HttpsProxyAgent(DECODO_PROXY);

// Helper function to build eBay URL
function buildEbayUrl(searchTerm, pageNumber = 1) {
  const params = new URLSearchParams({
    '_nkw': searchTerm,
    '_in_kw': '1',
    '_ex_kw': '',
    '_sacat': '0',
    'LH_Sold': '1',
    'LH_Complete': '1',
    '_udlo': '',
    '_udhi': '',
    '_samilow': '',
    '_samihi': '',
    '_sadis': '15',
    '_stpos': '',
    '_sargn': '-1',
    '_salic': '1',
    '_sop': '13',
    '_dmd': '1',
    '_ipg': '60',
    '_pgn': pageNumber.toString()
  });

  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

// Helper function to extract listing data
function extractListingData(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const listings = [];

  const itemSelectors = ['.s-item', '[data-testid="item-cell"]', '.srp-item'];
  let items = [];
  
  for (const selector of itemSelectors) {
    items = doc.querySelectorAll(selector);
    if (items.length > 0) break;
  }

  Array.from(items).forEach((item, index) => {
    if (index === 0) return; // Skip first item (usually ad)

    try {
      // Get item name
      const nameSelectors = ['.s-item__title', '[data-testid="item-title"]', '.it-ttl a', 'h3 a'];
      let itemName = '';
      for (const selector of nameSelectors) {
        const nameEl = item.querySelector(selector);
        if (nameEl) {
          itemName = nameEl.textContent.trim();
          // Clean up the title
          itemName = itemName
            .replace(/^New Listing/i, '')
            .replace(/Opens in a new window or tab.*$/i, '')
            .replace(/Pre-Owned.*$/i, 'Pre-Owned')
            .replace(/View similar active items.*$/i, '')
            .replace(/Sell one like this.*$/i, '')
            .trim();
          
          if (itemName.length > 80) {
            itemName = itemName.substring(0, 80) + '...';
          }
          break;
        }
      }

      // Filter out promotional/ad items
      const adKeywords = [
        'shop on ebay', 'click to view', 'see more like this',
        'browse similar', 'view more', 'find similar', 'shop now', 'ebay store'
      ];
      
      const isAdItem = adKeywords.some(keyword => 
        itemName.toLowerCase().includes(keyword)
      );
      
      if (isAdItem) return; // Skip this item

      // Get sold price
      const priceSelectors = ['.s-item__price .notranslate', '.s-item__price', '[data-testid="item-price"]'];
      let soldPrice = '';
      for (const selector of priceSelectors) {
        const priceEl = item.querySelector(selector);
        if (priceEl) {
          soldPrice = priceEl.textContent.trim();
          soldPrice = soldPrice.replace(/\s*to\s*\$.*$/i, ''); // Remove price ranges
          break;
        }
      }

      // Get sold date
      const dateSelectors = ['.s-item__title--tag .POSITIVE', '.s-item__ended-date'];
      let soldDate = '';
      for (const selector of dateSelectors) {
        const dateEl = item.querySelector(selector);
        if (dateEl) {
          soldDate = dateEl.textContent.trim();
          break;
        }
      }

      // Fallback date extraction
      if (!soldDate) {
        const titleText = item.textContent;
        const soldMatch = titleText.match(/Sold\s+(.+)/i);
        if (soldMatch) {
          soldDate = soldMatch[1].trim();
        }
      }

      // Get image
      const imageSelectors = ['.s-item__image img', '.s-item__wrapper img'];
      let imageUrl = '';
      for (const selector of imageSelectors) {
        const imgEl = item.querySelector(selector);
        if (imgEl && imgEl.src) {
          imageUrl = imgEl.src;
          imageUrl = imageUrl.replace(/s-l\d+/, 's-l300').replace(/\$_\d+/, '$_57');
          break;
        }
      }

      // Get URL
      let itemUrl = '';
      const linkEl = item.querySelector('a[href]');
      if (linkEl) {
        itemUrl = linkEl.href;
        if (itemUrl.includes('ebay.')) {
          itemUrl = itemUrl.split('?')[0]; // Remove tracking parameters
        }
      }

      if (itemName && soldPrice) {
        listings.push({
          itemName: itemName,
          soldPrice: soldPrice,
          soldDate: soldDate || '',
          imageUrl: imageUrl || '',
          url: itemUrl
        });
      }
    } catch (error) {
      console.warn('Error extracting item data:', error);
    }
  });

  return listings;
}

// Helper function to scrape a single page
async function scrapePage(searchTerm, page) {
  const url = buildEbayUrl(searchTerm, page);
  
  try {
    const response = await fetch(url, {
      agent: proxyAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const listings = extractListingData(html);
    
    console.log(`✅ Page ${page}: Found ${listings.length} items`);
    return listings;
    
  } catch (error) {
    console.error(`❌ Page ${page} failed:`, error.message);
    return [];
  }
}

// Main serverless function handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { searchTerm, pages = 3 } = req.body;
  
  if (!searchTerm) {
    res.status(400).json({ error: 'Search term is required' });
    return;
  }

  console.log(`🚀 Starting scrape for "${searchTerm}" - ${pages} pages`);
  const startTime = Date.now();
  
  try {
    const allResults = [];
    
    // Process pages in parallel for maximum speed
    const pagePromises = [];
    for (let page = 1; page <= pages; page++) {
      pagePromises.push(scrapePage(searchTerm, page));
    }
    
    const pageResults = await Promise.all(pagePromises);
    
    // Combine all results
    pageResults.forEach(results => {
      allResults.push(...results);
    });
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Completed in ${duration}s - Found ${allResults.length} items`);
    
    res.status(200).json({
      success: true,
      searchTerm,
      totalItems: allResults.length,
      pages,
      duration,
      data: allResults
    });
    
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
