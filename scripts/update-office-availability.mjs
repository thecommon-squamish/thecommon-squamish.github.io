import { writeFile } from 'node:fs/promises';

const clientId = process.env.OFFICERND_CLIENT_ID;
const clientSecret = process.env.OFFICERND_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Missing OfficeRnD credentials');

const offices = [
  {
    id: '63d8492c3751e703d70c3aba',
    resourceName: 'Micro Office',
    name: 'Micro Office',
    planUrl: 'https://e-commerce.officernd.com/thecommon/plans/685a4f6aeefbc2e8fa8b62c4',
  },
  {
    id: '63d84e349cf082ae33576eb9',
    resourceName: '3 Person Office (Container)',
    name: 'Small Office Container',
    planUrl: 'https://e-commerce.officernd.com/thecommon/plans/685a4f6aeefbc2e8fa8b6294',
  },
];
const root = 'https://app.officernd.com/api/v2/organizations/thecommon';
const tokenResponse = await fetch('https://identity.officernd.com/oauth/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'flex.space.resources.read flex.space.assignments.read',
  }),
});
if (!tokenResponse.ok) throw new Error(`OfficeRnD authentication failed (${tokenResponse.status})`);
const token = (await tokenResponse.json()).access_token;
if (!token) throw new Error('OfficeRnD returned no access token');

async function get(path, params = {}) {
  const url = new URL(`${root}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`OfficeRnD lookup failed: ${path} (${response.status})`);
  return response.json();
}

async function hasCurrentOrFutureAssignment(resourceId, now) {
  let cursor;
  do {
    const page = await get('/assignments', {
      resource: resourceId,
      '$limit': '50',
      ...(cursor ? { '$cursorNext': cursor } : {}),
    });
    if (!Array.isArray(page.results)) throw new Error(`Invalid assignments for ${resourceId}`);
    if (page.results.some(assignment => {
      const end = assignment.endDate ? Date.parse(assignment.endDate) : Infinity;
      return !Number.isNaN(end) && end >= now;
    })) return true;
    cursor = page.cursorNext;
  } while (cursor);
  return false;
}

const now = Date.now();
const results = [];
for (const office of offices) {
  const [resourcePage, status, assigned] = await Promise.all([
    get('/resources', { _id: office.id }),
    get(`/resources/${office.id}/status`),
    hasCurrentOrFutureAssignment(office.id, now),
  ]);
  const resource = resourcePage.results?.[0];
  if (resource?._id !== office.id || resource.name !== office.resourceName || resource.type !== 'meeting_room') {
    throw new Error(`OfficeRnD resource changed: ${office.name}`);
  }
  results.push({
    name: office.name,
    planUrl: office.planUrl,
    available: status.status === 'available' && status.ownStatus === 'available' && !assigned,
  });
}

await writeFile('office-availability.json', `${JSON.stringify({ generatedAt: new Date(now).toISOString(), offices: results }, null, 2)}\n`);
console.log(`Checked ${results.length} monthly offices: ${results.filter(office => office.available).length} available.`);
