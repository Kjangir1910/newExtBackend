const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const cheerio = require('cheerio');
const Spellchecker = require('hunspell-spellchecker');

const app = express();
const PORT = 3000;

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


app.post('/check-spelling', async (req, res) => {
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
