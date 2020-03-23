require('dotenv').config();

const fs = require('fs');
const Telegraf = require('telegraf');
const Parser = require('rss-parser');

const { CHAT_ID, RSS_URLS, TELEGRAM_BOT_TOKEN, USER_AGENT } = process.env;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': USER_AGENT },
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getLastTimestamp = () => {
  const lastItem = fs.readFileSync('LASTITEM', 'utf8');
  const lastTimestamp = parseInt(lastItem || '0', 10);
  console.log(`Read timestamp: ${lastTimestamp}`);
  return lastTimestamp;
};

const saveLastTimestamp = ts => {
  fs.writeFileSync('LASTITEM', `${ts}`, 'utf8');
  console.log(`Wrote timestamp: ${ts}`);
};

const fetchRSS = async () => {
  console.log('Fetching RSS items');

  const urls = RSS_URLS.split(',').map(url => url.trim());
  const feeds = await Promise.all(urls.map(url => parser.parseURL(url)));

  const items = feeds.reduce((items, feed) => {
    const { items: feedItems } = feed;
    return [...items, ...feedItems];
  }, []);

  console.log(`Found ${items.length} items`);
  return items;
};

const filterItems = async items => {

  console.log('Filtering items');

  const lastTimestamp = getLastTimestamp();
  const filtered = items
    .reverse()
    .map(item => ({ ts: Date.parse(item.isoDate), ...item }))
    .filter(({ ts }) => ts > lastTimestamp);

  const newestTimestamp = filtered.reduce((ts, item) => Math.max(ts, item.ts), lastTimestamp);

  if (newestTimestamp > lastTimestamp) {
    saveLastTimestamp(newestTimestamp);
  }

  console.log(`New items: ${filtered.length}`);

  return filtered;
};

const e = text => {
  const escaped = text
    .replace('_', '\\_')
    .replace('*', '\\*')
    .replace('[', '\\[')
    .replace('`', '\\`');
  return escaped;
};

const sendMessage = async item => {
  const { content, guid, link, title } = item;
  const text = `*${e(title)}*\n\n${e(content)}\n\n${e(link)}`;
  console.log(`Sending ${guid}: ${title}`);
  await bot.telegram.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
  await sleep(100);
};

const main = async () => {
  setInterval(() => {
    fetchRSS()
      .then(filterItems)
      .then(items => Promise.all(items.map(sendMessage)))
      .catch(e => {
        console.error('An error has occured:', e);
      });
  }, 60 * 1000);
};

main()
  .then(() => {
    console.log('Covid info bot started');
  })
  .catch(e => {
    console.error('A critical error has occured:', e);
    process.exit(1);
  });
