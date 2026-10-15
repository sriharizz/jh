import { createPeerlistContext } from '../scripts/peerlist/peerlist-session.mjs';

async function test() {
  const ctx = await createPeerlistContext({ headless: false });
  const p = await ctx.newPage();
  await p.goto('https://peerlist.io/jobs?q=AI', { waitUntil: 'commit' });
  await new Promise(r => setTimeout(r, 6000));
  console.log('Title:', await p.title());
  const count = await p.evaluate(() => document.querySelectorAll('a[href*="/careers/"]').length);
  console.log('Careers count:', count);
  await ctx.close();
}

test().catch(console.error);
