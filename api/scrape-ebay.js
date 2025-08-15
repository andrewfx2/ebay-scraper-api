// api/scrape-ebay.js - Vercel Serverless Function
const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

// Decodo proxy configuration - Updated for US region
const DECODO_PROXY = 'http://sp4c5esam0:j1w8CnMf2ktsLz=m8A@us.decodo.com:10001';
const proxyAgent = new HttpsProxyAgent(DECODO_PROXY);

// Helper function to build eBay URL
function buildEbayUrl(searchTerm, pageNumber = 1) {
  // Add randomization to avoid caching
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  
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
    '_pgn': pageNumber.toString(),
    'rt': 'nc', // No cache
    '_fcid': '1', // Force US site
    'LH_PrefLoc': '1', // Prefer US/North America locations
    '_t': timestamp, // Timestamp to bust cache
    '_r': random // Random number for uniqueness
  });

  const url = `https://www.ebay.com/sch/i.html?${params.toString()}`;
  console.log(`Built URL for page ${pageNumber}: ${url}`);
  return url;
}

// Helper function to extract listing data - UPDATED FOR NEW EBAY LAYOUT
function extractListingData(html) {
  console.log('Starting data extraction...');
  
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const listings = [];

  // Updated selectors for current eBay layout
  const itemSelectors = ['.s-item', '[data-testid="item-cell"]', '.srp-item'];
  let items = [];
  
  for (const selector of itemSelectors) {
    items = doc.querySelectorAll(selector);
    console.log(`Selector "${selector}" found ${items.length} items`);
    if (items.length > 0) break;
  }

  console.log(`Total items found: ${items.length}`);

  Array.from(items).forEach((item, index) => {
    if (index === 0) return; // Skip first item (usually ad)

    try {
      // UPDATED: Get item name from new eBay structure
      let itemName = '';
      
      // Primary selector for new layout
      const titleEl = item.querySelector('.s-item_title span[role="heading"]');
      if (titleEl) {
        itemName = titleEl.textContent.trim();
      } else {
        // Fallback selectors
        const fallbackSelectors = [
          '.s-item__title', 
          '[data-testid="item-title"]', 
          '.it-ttl a', 
          'h3 a',
          '.s-item_title'
        ];
        
        for (const selector of fallbackSelectors) {
          const nameEl = item.querySelector(selector);
          if (nameEl) {
            itemName = nameEl.textContent.trim();
            break;
          }
        }
      }

      if (index === 1) {
        console.log(`Sample item name: "${itemName}"`);
      }

      // Filter out promotional/ad items
      const adKeywords = [
        'shop on ebay', 'click to view', 'see more like this',
        'browse similar', 'view more', 'find similar', 'shop now', 'ebay store'
      ];
      
      const isAdItem = adKeywords.some(keyword => 
        itemName.toLowerCase().includes(keyword)
      );
      
      if (isAdItem) {
        console.log(`Skipping ad: ${itemName}`);
        return; // Skip this item
      }

      // Clean up the title - remove eBay interface elements
      itemName = itemName
        .replace(/^New Listing/i, '')
        .replace(/Opens in a new window or tab.*$/i, '')
        .replace(/Pre-Owned.*$/i, 'Pre-Owned')
        .replace(/View similar active items.*$/i, '')
        .replace(/Sell one like this.*$/i, '')
        .replace(/Buy It Now.*$/i, '')
        .replace(/\$[\d,]+\.?\d*.*$/i, '') // Remove price info mixed in title
        .replace(/Located in.*$/i, '')
        .replace(/\d+% positive.*$/i, '')
        .trim();
      
      if (itemName.length > 100) {
        itemName = itemName.substring(0, 100) + '...';
      }

      // UPDATED: Get sold price from new eBay structure
      let soldPrice = '';
      
      // Primary selector for new layout - look for POSITIVE ITALIC span
      const priceEl = item.querySelector('.s-item_price .POSITIVE.ITALIC');
      if (priceEl) {
        soldPrice = priceEl.textContent.trim();
      } else {
        // Fallback selectors
        const priceSelectors = [
          '.s-item_price .POSITIVE',
          '.s-item__price .notranslate', 
          '.s-item__price', 
          '[data-testid="item-price"]',
          '.s-item_price'
        ];
        
        for (const selector of priceSelectors) {
          const fallbackPriceEl = item.querySelector(selector);
          if (fallbackPriceEl) {
            soldPrice = fallbackPriceEl.textContent.trim();
            break;
          }
        }
      }
      
      // Clean up price
      soldPrice = soldPrice.replace(/\s*to\s*\$.*$/i, ''); // Remove price ranges

      if (index === 1) {
        console.log(`Sample price: "${soldPrice}"`);
      }

      // UPDATED: Get sold date from new eBay structure
      let soldDate = '';
      
      // Primary selector for sold date in caption area
      const dateEl = item.querySelector('.s-item_caption span');
      if (dateEl) {
        const dateText = dateEl.textContent.trim();
        if (dateText.toLowerCase().includes('sold')) {
          soldDate = dateText;
        }
      }
      
      // Fallback selectors
      if (!soldDate) {
        const dateSelectors = [
          '.s-item__title--tag .POSITIVE', 
          '.s-item__ended-date',
          '.s-item_caption'
        ];
        
        for (const selector of dateSelectors) {
          const fallbackDateEl = item.querySelector(selector);
          if (fallbackDateEl) {
            const text = fallbackDateEl.textContent.trim();
            if (text.toLowerCase().includes('sold')) {
              soldDate = text;
              break;
            }
          }
        }
      }

      // Final fallback - search all text for sold date
      if (!soldDate) {
        const titleText = item.textContent;
        const soldMatch = titleText.match(/Sold\s+([^$]+)/i);
        if (soldMatch) {
          soldDate = soldMatch[1].trim();
          // Clean up any extra characters
          soldDate = soldDate.split('==')[0].trim();
        }
      }

      if (index === 1) {
        console.log(`Sample date: "${soldDate}"`);
      }

      // Get image
      const imageSelectors = ['.s-item__image img', '.s-item__wrapper img', '.s-item_image img'];
      let imageUrl = '';
      for (const selector of imageSelectors) {
        const imgEl = item.querySelector(selector);
        if (imgEl && imgEl.src) {
          imageUrl = imgEl.src;
          imageUrl = imageUrl.replace(/s-l\d+/, 's-l300').replace(/\$_\d+/, '$_57');
          break;
        }
      }

      // Get URL - look for main item link
      let itemUrl = '';
      const linkEl = item.querySelector('a[href*="/itm/"], a[href*="ebay.com"]');
      if (linkEl) {
        itemUrl = linkEl.href;
        if (itemUrl.includes('ebay.')) {
          itemUrl = itemUrl.split('?')[0]; // Remove tracking parameters
        }
      }

      // Only add items that have both name and price
      if (itemName && soldPrice && itemName.length > 5) {
        listings.push({
          itemName: itemName,
          soldPrice: soldPrice,
          soldDate: soldDate || '',
          imageUrl: imageUrl || '',
          url: itemUrl
        });
        
        if (listings.length === 1) {
          console.log(`First valid item added: ${itemName} - ${soldPrice} - ${soldDate}`);
        }
      } else {
        if (index <= 3) {
          console.log(`Item ${index} skipped - Name: "${itemName}" (${itemName.length} chars), Price: "${soldPrice}"`);
        }
      }
    } catch (error) {
      console.warn(`Error extracting item ${index}:`, error.message);
    }
  });

  console.log(`Extraction complete: ${listings.length} valid items found`);
  return listings;
}

// Helper function to scrape a single page
async function scrapePage(searchTerm, page) {
  const url = buildEbayUrl(searchTerm, page);
  
  try {
    // Add randomization to avoid detection
    const randomDelay = Math.floor(Math.random() * 1000) + 500; // 500-1500ms delay
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    const response = await fetch(url, {
      agent: proxyAgent,
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.${Math.floor(Math.random() * 9999)}.0 Safari/537.36`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'X-Forwarded-For': `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        'CF-IPCountry': 'US'
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
    
    console.log(`Debug: Starting scrape for "${searchTerm}" with ${pages} pages`);
    
    // Process pages in parallel for maximum speed
    const pagePromises = [];
    for (let page = 1; page <= pages; page++) {
      pagePromises.push(scrapePage(searchTerm, page));
    }
    
    const pageResults = await Promise.all(pagePromises);
    
    // Combine all results
    pageResults.forEach((results, index) => {
      console.log(`Page ${index + 1} returned ${results.length} items`);
      allResults.push(...results);
    });
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Completed in ${duration}s - Total items found: ${allResults.length}`);
    
    // Return results even if empty for debugging
    res.status(200).json({
      success: true,
      searchTerm,
      totalItems: allResults.length,
      pages,
      duration,
      data: allResults,
      debug: allResults.length === 0 ? 'Check Vercel function logs for parsing details' : undefined
    });
    
  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
