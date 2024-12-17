const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const cheerio = require('cheerio');
const Spellchecker = require('hunspell-spellchecker');

const app = express();
const PORT = 5000;


app.post('/check-links', async (req, res) => {
    const { url } = req.body;

    try {
        // Fetch the HTML of the page
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);

        // Extract all links and meta tags
        const links = [];
        $('a').each((_, el) => {
            const link = $(el).attr('href');
            if (link) links.push(link);
        });

        const metaTags = [];
        $('meta').each((_, el) => {
            metaTags.push({
                name: $(el).attr('name') || $(el).attr('property'),
                content: $(el).attr('content'),
            });
        });

        // Check each link's status, redirect loop, and HTTP/HTTPS
        const linkStatuses = await Promise.all(
            links.map(async (link) => {
                try {
                    const linkUrl = new URL(link, url).href; // Resolve relative links
                    const isHttps = linkUrl.startsWith('https://');
                    const redirectHistory = [];
                    let status;
                    let redirectLoop = false;

                    const response = await axios.get(linkUrl, {
                        maxRedirects: 5, // Limit redirects to detect loops
                        validateStatus: () => true, // Allow non-2xx statuses
                        onRedirect: (res) => {
                            if (redirectHistory.includes(res.headers.location)) {
                                redirectLoop = true;
                            } else {
                                redirectHistory.push(res.headers.location);
                            }
                        },
                    });
                    status = response.status;

                    return { link: linkUrl, status, isHttps, redirectLoop };
                } catch (error) {
                    return { link, status: error.response?.status || 'Error', isHttps: false, redirectLoop: false };
                }
            })
        );

        res.json({ linkStatuses, metaTags });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching page content' });
    }
});


// Initialize Hunspell Spellchecker
const spellchecker = new Spellchecker();
// const DICT = spellchecker.parse({
//   aff: fs.readFileSync(path.join(__dirname, 'dictionaries/en_US.aff')),
//   dic: fs.readFileSync(path.join(__dirname, 'dictionaries/en_US.dic')),
// });
// spellchecker.use(DICT);
const DICT = spellchecker.parse({
    aff: fs.readFileSync(path.join(__dirname, 'dictionaries/en_US.aff')),
    dic: fs.readFileSync(path.join(__dirname, 'dictionaries/en_US.dic')),
  });
  spellchecker.use(DICT);

// Middleware to parse JSON
app.use(express.json());

// Function to extract meaningful text using Cheerio
function extractVisibleText(html) {
  const $ = cheerio.load(html);
  const text = $('body')
    .find('p, h1, h2, h3, h4, h5, h6, li, span, a')
    .map((i, el) => $(el).text())
    .get()
    .join(' ');
  return text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
}

// Endpoint to check spelling errors from a URL
// app.post('/check-spelling', async (req, res) => {
//   const { url } = req.body;

//   if (!url) {
//     return res.status(400).json({ error: 'URL is required' });
//   }

//   try {
//     // Fetch the content of the URL
//     const response = await fetch(url);

//     if (!response.ok) {
//       return res.status(400).json({ error: `Failed to fetch URL: ${response.statusText}` });
//     }

//     const html = await response.text();
//     const plainText = extractVisibleText(html);

//     // Split text into words and check spelling
//     const words = plainText.split(/\s+/);
//     const errors = words.filter(word => !spellchecker.check(word));

//     res.json({
//       url,
//       errors: Array.from(new Set(errors)), // Remove duplicates
//     });
//   } catch (error) {
//     console.error('Error:', error);
//     res.status(500).json({ error: 'An error occurred while processing the URL.' });
//   }
// });


app.post('/check-links', async (req, res) => {
    const { url } = req.body;
  
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
  
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch URL: ${response.statusText}` });
      }
  
      const html = await response.text();
      const plainText = extractVisibleText(html);
    //   console.log('Extracted Text:', plainText); 
  
      
      const words = plainText
        .replace(/[^\w\s']/g, '') // Remove punctuation
        .split(/\s+/)
        .map(word => word.toLowerCase());
  
      const errors = words.filter(word => !spellchecker.check(word));
  
      res.json({
        url,
        errors: Array.from(new Set(errors)), // Unique errors
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'An error occurred while processing the URL.' });
    }
  });
  

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
