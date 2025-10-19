const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/news', async (req, res) => {
  try {
    const { topic, language = 'en', category = '', dateRange = '7d' } = req.body;
    if (!topic?.trim()) return res.status(400).json({ error: 'Topic required' });

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    const newsApiKey = process.env.NEWS_API_KEY;
    if (!apiKey || !newsApiKey) return res.status(500).json({ error: 'Missing API keys' });

    const langMap = { 'tr': 'en', 'en': 'en', 'de': 'de' };
    const newsLang = langMap[language] || 'en';

    const now = new Date();
    let fromDate = new Date();
    if (dateRange === '1d') fromDate.setDate(fromDate.getDate() - 1);
    else if (dateRange === '7d') fromDate.setDate(fromDate.getDate() - 7);
    else if (dateRange === '30d') fromDate.setDate(fromDate.getDate() - 30);

    const fromDateStr = fromDate.toISOString().split('T')[0];
    let searchQuery = category ? `${topic} ${category}` : topic;

    const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(searchQuery)}&sortBy=publishedAt&language=${newsLang}&from=${fromDateStr}&pageSize=10&apiKey=${newsApiKey}`;
    const newsResponse = await fetch(newsUrl);
    if (!newsResponse.ok) throw new Error('NewsAPI error');

    const newsData = await newsResponse.json();
    const articles = newsData.articles.slice(0, 5);
    if (articles.length === 0) return res.json({ news: [], topic, language });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const langName = { 'tr': 'Türkçe', 'en': 'İngilizce', 'de': 'Almanca' };
    const lang = langName[language] || 'İngilizce';

    const news = [];
    for (const article of articles) {
      try {
        const summaryPrompt = `Bu haberi ${lang}'de 6-8 cümle ile özetle:\n\nBaşlık: ${article.title}\nÖzet: ${article.description || 'N/A'}\n\nSadece özeti yaz.`;
        const summaryResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: summaryPrompt }] }],
            generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
          })
        });

        let summary = article.description || 'No summary';
        if (summaryResponse.ok) {
          const data = await summaryResponse.json();
          summary = data.candidates[0].content.parts[0].text;
        }

        news.push({
          title: article.title,
          summary: summary,
          source: article.source.name,
          author: article.author || 'Unknown',
          url: article.url
        });
      } catch (err) {
        news.push({
          title: article.title,
          summary: article.description || 'No summary',
          source: article.source.name,
          author: article.author || 'Unknown',
          url: article.url
        });
      }
    }

    res.json({ news, topic, language });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));