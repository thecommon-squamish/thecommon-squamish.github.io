const clientId = process.env.OFFICERND_CLIENT_ID;
const clientSecret = process.env.OFFICERND_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Missing OfficeRnD credentials');

const scope = 'flex.space.resources.read flex.space.assignments.read';
const tokenResponse = await fetch('https://identity.officernd.com/oauth/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope }),
});
if (!tokenResponse.ok) throw new Error(`OfficeRnD authentication failed (${tokenResponse.status})`);
const token = (await tokenResponse.json()).access_token;
if (!token) throw new Error('OfficeRnD returned no access token');

const root = 'https://app.officernd.com/api/v2/organizations/thecommon';
let cursor;
let count = 0;
do {
  const url = new URL(`${root}/resources`);
  url.searchParams.set('$limit', '50');
  if (cursor) url.searchParams.set('$cursorNext', cursor);
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`OfficeRnD resource lookup failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const page = await response.json();
  if (!Array.isArray(page.results)) throw new Error('Invalid OfficeRnD resource response');
  for (const resource of page.results) {
    if (!/office|pod|container/i.test(resource.name ?? '')) continue;
    count++;
    const id = resource._id;
    const statusResponse = await fetch(`${root}/resources/${id}/status`, { headers: { authorization: `Bearer ${token}` } });
    if (!statusResponse.ok) throw new Error(`OfficeRnD status lookup failed for ${id} (${statusResponse.status})`);
    const status = await statusResponse.json();
    console.log(JSON.stringify({ id, name: resource.name, type: resource.type, status, location: resource.location }));
  }
  cursor = page.cursorNext || undefined;
} while (cursor);
console.log(`Matched ${count} office-related resources`);
