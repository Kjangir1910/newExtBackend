
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const Spellchecker = require('hunspell-spellchecker');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize Hunspell Spellchecker
const spellchecker = new Spellchecker();
const DICT = spellchecker.parse({
  aff: fs.readFileSync(path.join(__dirname, 'dictionaries/en_US.aff')),
  dic: fs.readFileSync(path.join(__dirname, 'dictionaries/en_US.dic')),
});
spellchecker.use(DICT);

// Function to extract visible text using Cheerio
function extractVisibleText(html) {
  const $ = cheerio.load(html);
  const text = $('body')
    .find('p, h1, h2, h3, h4, h5, h6, li, span, a')
    .map((i, el) => $(el).text())
    .get()
    .join(' ');
  return text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
}

// Combined API: Check Links, Metadata, and Spelling
app.post('/check-links', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Fetch the HTML of the page
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // Extract Metadata
    const title = $('title').text();
    const description = $('meta[name="description"]').attr('content');

    // Extract all links
    const links = [];
    $('a').each((_, el) => {
      const link = $(el).attr('href');
      if (link) links.push(link);
    });

    // Extract visible text for spelling check
    const plainText = extractVisibleText(data);
    const words = plainText
      .replace(/[^\w\s']/g, '') // Remove punctuation
      .split(/\s+/)
      .map(word => word.toLowerCase());
    const spellingErrors = Array.from(new Set(words.filter(word => !spellchecker.check(word))));

    // Check each link's status, redirect loop, and HTTPS
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

    res.json({
  
      linkStatuses,
          metadata: {
        title: title || 'No title found',
        description: description || 'No description found',
      },
      spellingErrors
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'An error occurred while processing the URL.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
