// api/scrape-ebay.js - Vercel Serverless Function - WITH PROGRESSIVE LOADING SUPPORT
const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

// Decodo proxy configuration - Updated for US region
const DECODO_PROXY = 'http://sp4c5esam0:j1w8CnMf2ktsLz=m8A@us.decodo.com:10001';
const proxyAgent = new HttpsProxyAgent(DECODO_PROXY);

// Helper function to build eBay URL - UPDATED TO SUPPORT SPECIFIC PAGE
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

// Helper function to extract listing data - USING WORKING LOGIC
function extractListingData(html) {
  console.log('Starting data extraction...');
  
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const listings = [];

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
      // Get clean item name using WORKING selectors
      const nameSelectors = ['.s-item__title', '[data-testid="item-title"]', '.it-ttl a', 'h3 a'];
      let itemName = '';
      for (const selector of nameSelectors) {
        const nameEl = item.querySelector(selector);
        if (nameEl) {
          itemName = nameEl.textContent.trim();
          // Clean up the title - USING PROVEN LOGIC
          itemName = itemName
            .replace(/^New Listing/i, '')
            .replace(/Opens in a new window or tab.*$/i, '')
            .replace(/Pre-Owned.*$/i, 'Pre-Owned')
            .replace(/View similar active items.*$/i, '')
            .replace(/Sell one like this.*$/i, '')
            .trim();
          
          // Limit title length to avoid super long descriptions
          if (itemName.length > 80) {
            itemName = itemName.substring(0, 80) + '...';
          }
          
          break;
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

      // Get clean sold price using WORKING selectors
      const priceSelectors = ['.s-item__price .notranslate', '.s-item__price', '[data-testid="item-price"]'];
      let soldPrice = '';
      for (const selector of priceSelectors) {
        const priceEl = item.querySelector(selector);
        if (priceEl) {
          soldPrice = priceEl.textContent.trim();
          // Clean up price - keep only the price part
          soldPrice = soldPrice.replace(/\s*to\s*\$.*$/i, ''); // Remove price ranges
          break;
        }
      }

      if (index === 1) {
        console.log(`Sample price: "${soldPrice}"`);
      }

      // Get sold date using COMPREHENSIVE WORKING LOGIC
      let soldDate = '';
      
      // First try specific date selectors
      const dateSelectors = [
        '.s-item__title--tag .POSITIVE', 
        '.s-item__ended-date',
        '.s-item__detail--secondary',
        '.s-item__caption--signal',
        '.s-item__subtitle',
        '.s-item__watchheart-label'
      ];
      
      for (const selector of dateSelectors) {
        const dateEl = item.querySelector(selector);
        if (dateEl && dateEl.textContent.toLowerCase().includes('sold')) {
          soldDate = dateEl.textContent.trim();
          break;
        }
      }
      
      // If no date found, do comprehensive text search - PROVEN WORKING METHOD
      if (!soldDate) {
        // Get all text content from the item
        const allTextElements = item.querySelectorAll('*');
        for (const element of allTextElements) {
          const text = element.textContent || '';
          
          // Look for various sold date patterns - WORKING REGEX PATTERNS
          const soldPatterns = [
            /Sold\s+(\d{1,2}\s+\w{3}\s+\d{4})/i,           // "Sold 13 Aug 2025"
            /Sold\s+(\w{3}\s+\d{1,2},?\s+\d{4})/i,         // "Sold Aug 13, 2025" or "Sold Aug 13 2025"
            /Sold\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,           // "Sold 8/13/2025"
            /Sold\s+(\d{1,2}-\w{3}-\d{2})/i,               // "Sold 13-Aug-25"
            /Sold\s+(.{1,15}ago)/i,                        // "Sold 2 days ago"
            /(\d{1,2}\s+\w{3}\s+\d{4}).*sold/i,            // "13 Aug 2025 sold"
            /sold.*(\d{1,2}\s+\w{3}\s+\d{4})/i             // "sold 13 Aug 2025"
          ];
          
          for (const pattern of soldPatterns) {
            const match = text.match(pattern);
            if (match) {
              soldDate = match[1].trim();
              break;
            }
          }
          
          if (soldDate) break;
        }
      }
      
      // Also check if there's a date in a data attribute - WORKING METHOD
      if (!soldDate) {
        const dateAttrs = ['data-sold-date', 'data-end-date', 'data-listing-date'];
        for (const attr of dateAttrs) {
          const attrValue = item.getAttribute(attr);
          if (attrValue) {
            soldDate = attrValue;
            break;
          }
        }
      }
      
      // Clean up the date - WORKING CLEANUP
      if (soldDate) {
        soldDate = soldDate
          .replace(/^\s*Sold\s*/i, '')
          .replace(/\s*•.*$/, '')
          .replace(/\s*\(.*\)/, '')
          .trim();
      }
      
      console.log(`Item: ${itemName.substring(0, 50)}... - Found date: "${soldDate}"`);  // Debug log

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

      // Get URL - WORKING METHOD
      let itemUrl = '';
      const linkEl = item.querySelector('a[href]');
      if (linkEl) {
        itemUrl = linkEl.href;
        // Clean up eBay URLs
        if (itemUrl.includes('ebay.')) {
          itemUrl = itemUrl.split('?')[0]; // Remove tracking parameters
        }
      }

      // Only add items with clean data - WORKING VALIDATION
      if (itemName && soldPrice && itemName.length > 10) {
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
    // Reduced delay for progressive loading
    const randomDelay = Math.floor(Math.random() * 500) + 200; // 200-700ms delay
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

// Main serverless function handler - UPDATED FOR PROGRESSIVE LOADING
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

  const { searchTerm, pages = 1, startPage = 1 } = req.body;
  
  if (!searchTerm) {
    res.status(400).json({ error: 'Search term is required' });
    return;
  }

  console.log(`🚀 Starting scrape for "${searchTerm}" - ${pages} pages (starting from page ${startPage})`);
  const startTime = Date.now();
  
  try {
    const allResults = [];
    
    // PROGRESSIVE LOADING: Support single page requests
    if (pages === 1 && startPage > 1) {
      // Progressive mode: scrape specific single page
      console.log(`Progressive mode: Scraping page ${startPage} only`);
      const pageResult = await scrapePage(searchTerm, startPage);
      allResults.push(...pageResult);
    } else {
      // Normal mode: scrape multiple pages or page 1
      console.log(`Normal mode: Scraping ${pages} pages starting from page ${startPage}`);
      
      // Process pages - support both modes
      const pagePromises = [];
      for (let page = startPage; page < startPage + pages; page++) {
        pagePromises.push(scrapePage(searchTerm, page));
      }
      
      const pageResults = await Promise.all(pagePromises);
      
      // Combine all results
      pageResults.forEach((results, index) => {
        console.log(`Page ${startPage + index} returned ${results.length} items`);
        allResults.push(...results);
      });
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Completed in ${duration}s - Total items found: ${allResults.length}`);
    
    // Return results
    res.status(200).json({
      success: true,
      searchTerm,
      totalItems: allResults.length,
      pages,
      startPage,
      duration,
      data: allResults,
      progressiveMode: pages === 1 && startPage > 1,
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
