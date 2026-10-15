import { createNaukriContext } from '../scripts/naukri/naukri-session.mjs';

async function test() {
  const context = await createNaukriContext({ headless: true });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  // Set extra stealth headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-IN,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  });

  console.log('Navigating to Home first: https://www.naukri.com');
  await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Home title:', await page.title());
  console.log('Home url:', page.url());

  const testUrl = 'https://www.naukri.com/ai-engineer-jobs-in-bangalore?k=ai%20engineer&experience=0&jobAge=7';
  console.log('Navigating to Search:', testUrl);
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  
  console.log('Final URL:', page.url());
  console.log('Page Title:', await page.title());
  
  const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('Body preview:\n', text);

  await context.close();
}

test().catch(console.error);
